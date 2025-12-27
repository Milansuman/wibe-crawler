import { authenticated, base } from "../middleware/auth";
import { db } from "../../lib/db";
import { ORPCError } from "@orpc/server";
import {z} from "zod";
import { cookies, emails, projects, urls } from "../../lib/db/schema";
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
  crawled: boolean | null
}

export default {
  crawlWebsiteUrls: authenticated
    .input(z.object({
      projectId: z.string(),
      withAi: z.boolean().default(false),
      maxDepth: z.number().default(3),
      maxUrls: z.number().default(100),
    }))
    .handler(async function* ({input, context}){
      let browser;
      try {
        // Get the project to extract the base domain
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, input.projectId),
            eq(projects.userId, context.user.id)
          ));

        if (!project) {
          throw new ORPCError("NOT_FOUND");
        }

        // Extract the domain from the project URL
        let projectDomain: string;
        try {
          const projectUrl = new URL(project.url);
          projectDomain = projectUrl.hostname;
        } catch (e) {
          throw new ORPCError("BAD_REQUEST");
        }

        const projectUrlsResult = await db
          .select({
            id: urls.id,
            parentUrlId: urls.parentUrlId,
            url: urls.url,
            level: urls.level,
            interest: urls.interest,
            type: urls.type,
            projectId: urls.projectId,
            crawled: urls.crawled
          })
          .from(urls)
          .innerJoin(projects, eq(projects.id, urls.projectId))
          .where(and(
            eq(projects.id, input.projectId),
            eq(projects.userId, context.user.id),
            eq(urls.crawled, false)
          ))
          .orderBy(asc(urls.level));

        // Map to UrlSchema type
        const projectUrls: UrlSchema[] = projectUrlsResult.map(u => ({
          id: u.id,
          parentUrlId: u.parentUrlId,
          url: u.url,
          level: u.level,
          interest: u.interest,
          type: u.type,
          projectId: u.projectId,
          crawled: u.crawled
        }));

        const visitedUrls = new Deque<UrlSchema>();
        const queuedUrls = new Deque<UrlSchema>(projectUrls);
        const seenUrls = new Set<string>(projectUrls.map(u => u.url));
        let processedCount = 0;

        browser = await initializeCrawler();

        while(queuedUrls.size > 0 && processedCount < input.maxUrls){
          const currentUrl = queuedUrls.popFront();
          console.log("visiting ", currentUrl?.url);
          if(!currentUrl) break;

          // Skip if exceeds max depth
          if(currentUrl.level > input.maxDepth) {
            console.log(`Skipping ${currentUrl.url} - exceeds max depth ${input.maxDepth}`);
            continue;
          }

          // Ensure currentUrl has an ID before processing its children
          // This is needed so child URLs can have a valid parentUrlId
          if (!currentUrl.id) {
            try {
              const [storedUrl] = await db
                .insert(urls)
                .values({
                  parentUrlId: currentUrl.parentUrlId ?? null,
                  url: currentUrl.url,
                  level: currentUrl.level,
                  interest: currentUrl.interest,
                  type: currentUrl.type,
                  projectId: currentUrl.projectId,
                  crawled: false
                })
                .returning();
              currentUrl.id = storedUrl.id;
              currentUrl.parentUrlId = storedUrl.parentUrlId;
            } catch (dbError) {
              console.error(`Failed to store current URL ${currentUrl.url}:`, dbError);
              continue;
            }
          }

          const links = await getUrlsFromPage(browser, currentUrl.url);

          for(const link of links){
            // Skip if already seen or invalid
            if(seenUrls.has(link)) {
              continue;
            }

            // Validate URL format and check domain
            let linkUrl: URL;
            try {
              linkUrl = new URL(link);
            } catch (e) {
              console.warn(`Invalid URL skipped: ${link}`);
              continue;
            }

            // Only add URLs from the same domain as the project
            if (linkUrl.hostname !== projectDomain) {
              console.log(`Skipping ${link} - different domain (${linkUrl.hostname} !== ${projectDomain})`);
              continue;
            }

            seenUrls.add(link);

            const newUrl: UrlSchema = {
              interest: 5,
              level: currentUrl.level + 1,
              parentUrlId: currentUrl.id ?? null, // Now guaranteed to be defined
              type: "page",
              url: link,
              projectId: currentUrl.projectId,
              crawled: false
            };

            queuedUrls.pushBack(newUrl);

            try {
              await db
                .insert(urls)
                .values({
                  parentUrlId: newUrl.parentUrlId,
                  url: newUrl.url,
                  level: newUrl.level,
                  interest: newUrl.interest,
                  type: newUrl.type,
                  projectId: newUrl.projectId,
                  crawled: newUrl.crawled
                })
                .onConflictDoNothing();
            } catch (dbError) {
              console.error(`Failed to insert URL ${link}:`, dbError);
              // Continue processing other URLs
            }
          }

          if(input.withAi){
            try {
              currentUrl.interest = await determineUrlInterest(currentUrl.url);
            } catch (aiError) {
              console.error(`AI interest determination failed for ${currentUrl.url}:`, aiError);
              // Keep default interest value
            }
          }

          try {
            const pageEmails = await getEmailsFromPage(browser, currentUrl.url);
            if(pageEmails.length > 0){
              await db
                .insert(emails)
                .values(pageEmails.map(email => ({
                  projectId: input.projectId,
                  email,
                  url: currentUrl.url
                })))
                .onConflictDoNothing();
            }
          } catch (emailError) {
            console.error(`Failed to extract emails from ${currentUrl.url}:`, emailError);
            // Continue processing
          }

          //do the database call in the loop in case the user cancels midway
          try {
            const [currentStoredUrl] = await db
              .insert(urls)
              .values({
                id: currentUrl.id ?? undefined,
                parentUrlId: currentUrl.parentUrlId ?? null,
                url: currentUrl.url,
                level: currentUrl.level,
                interest: currentUrl.interest,
                type: currentUrl.type,
                projectId: currentUrl.projectId,
                crawled: true
              })
              .onConflictDoUpdate({
                target: urls.id,
                set: {
                  parentUrlId: currentUrl.parentUrlId ?? null,
                  url: currentUrl.url,
                  level: currentUrl.level,
                  interest: currentUrl.interest,
                  type: currentUrl.type,
                  crawled: true
                }
              }).returning();

            visitedUrls.pushBack(currentStoredUrl);
            console.log(currentStoredUrl);
            yield currentStoredUrl;
            processedCount++;
          } catch (dbError) {
            console.error(`Failed to update URL ${currentUrl.url}:`, dbError);
            // Continue processing other URLs
          }
        }

        return;
      } catch (error) {
        console.error("Crawl error:", error);
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      } finally {
        // Always close browser
        if(browser) {
          try {
            await browser.close();
            console.log("Browser closed successfully");
          } catch (closeError) {
            console.error("Failed to close browser:", closeError);
          }
        }
      }
    }),
  getUrlsForProject: authenticated
    .input(z.object({
      projectId: z.string()
    }))
    .handler(async ({input, context}) => {
      try {
        const projectUrls = await db
          .select()
          .from(urls)
          .innerJoin(projects, eq(projects.id, urls.projectId))
          .where(and(
            eq(urls.projectId, input.projectId),
            eq(projects.userId, context.user.id)
          ))
          .orderBy(asc(urls.level));

        return projectUrls.map(row => row.urls);
      } catch (error) {
        console.error(error);
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  getEmailsForProject: authenticated
    .input(z.object({
      projectId: z.string()
    }))
    .handler(async ({input, context}) => {
      try {
        const projectEmails = await db
          .select()
          .from(emails)
          .innerJoin(projects, eq(projects.id, emails.projectId))
          .where(and(
            eq(emails.projectId, input.projectId),
            eq(projects.userId, context.user.id)
          ));

        return projectEmails.map(row => row.emails);
      } catch (error) {
        console.error(error);
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  getCookiesForProject: authenticated
    .input(z.object({
      projectId: z.string()
    }))
    .handler(async ({input, context}) => {
      try {
        const projectCookies = await db
          .select()
          .from(cookies)
          .innerJoin(projects, eq(projects.id, cookies.projectId))
          .where(and(
            eq(cookies.projectId, input.projectId),
            eq(projects.userId, context.user.id)
          ));

        return projectCookies.map(row => row.cookies);
      } catch (error) {
        console.error(error);
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  getAssetUrlsForProject: authenticated
    .input(z.object({
      projectId: z.string()
    }))
    .handler(async ({input, context}) => {
      try {
        const assetUrls = await db
          .select()
          .from(urls)
          .innerJoin(projects, eq(projects.id, urls.projectId))
          .where(and(
            eq(urls.projectId, input.projectId),
            eq(projects.userId, context.user.id),
            eq(urls.type, "image")
          ))
          .orderBy(asc(urls.url));

        return assetUrls.map(row => row.urls);
      } catch (error) {
        console.error(error);
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
}
