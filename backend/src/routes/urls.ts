import { authenticated, base } from "../middleware/auth";
import { db } from "../../lib/db";
import { ORPCError } from "@orpc/server";
import {z} from "zod";
import { emails, projects, urls } from "../../lib/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { getEmailsFromPage, getUrlsFromPage, initializeCrawler } from "../../lib/crawler";
import { Deque } from "../../lib/structures";
import { determineUrlInterest } from "../../lib/ai";

type UrlSchema = {
  id?: string | null
  parentUrlId?: string | null
  url: string
  level: number
  interest: number
  type: "image" | "page" | "pdf" | "video" | "audio" | "document"
  projectId: string
}

export default {
  crawlWebsiteUrls: authenticated
    .input(z.object({
      projectId: z.string(),
      withAi: z.boolean().default(false),
    }))
    .handler(async function* ({input, context}){
      try {
        const projectUrls = await db
          .select({
            id: urls.id,
            parentUrlId: urls.parentUrlId,
            url: urls.url,
            level: urls.level,
            interest: urls.interest,
            type: urls.type,
            projectId: urls.projectId
          })
          .from(urls)
          .innerJoin(projects, eq(projects.id, urls.projectId))
          .where(and(
            eq(projects.id, input.projectId),
            eq(projects.userId, context.user.id),
            eq(urls.crawled, false)
          ))
          .orderBy(asc(urls.level));

        const visitedUrls = new Deque<UrlSchema>();
        const queuedUrls = new Deque<UrlSchema>(projectUrls);

        const browser = await initializeCrawler();

        while(queuedUrls.size > 0){
          const currentUrl = queuedUrls.popFront();
          if(!currentUrl) break;

          const links = await getUrlsFromPage(browser, currentUrl.url);

          for(const link of links){
            queuedUrls.pushBack({
              interest: 5,
              level: currentUrl.level + 1,
              parentUrlId: currentUrl.id,
              type: "page",
              url: link,
              projectId: currentUrl.projectId
            })
          }

          if(input.withAi){
            currentUrl.interest = await determineUrlInterest(currentUrl.url);
          }

          const pageEmails = await getEmailsFromPage(browser, currentUrl.url);
          db
            .insert(emails)
            .values(pageEmails.map(email => ({
              projectId: input.projectId,
              email,
              url: currentUrl.url
            })))

          //do the database call in the loop in case the user cancels midway
          db
            .insert(urls)
            .values({
              ...currentUrl,
              id: currentUrl.id ?? undefined,
              crawled: true
            })
            .onConflictDoUpdate({
              target: urls.id,
              set: {
                ...currentUrl,
                id: currentUrl.id!,
                crawled: true
              }
            });
          visitedUrls.pushBack(currentUrl);
          yield currentUrl;
        }

      } catch (error) {
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  
}