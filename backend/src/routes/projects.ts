import { ORPCError } from "@orpc/server";
import { authenticated } from "../middleware/auth";
import {z} from "zod";
import { db } from "../../lib/db";
import { projectMessages, projects } from "../../lib/db/schema";
import { eq } from "drizzle-orm";
import puppeteer from "puppeteer";
import { getTitleFromPage } from "../../lib/crawler";

export default {
  getProjects: authenticated
    .handler(async ({context}) => {
      try {
        const userProjects = await db
          .select()
          .from(projects)
          .where(eq(projects.userId, context.user.id));

        return userProjects;
      } catch (error) {
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  createProject: authenticated
    .input(z.object({
      url: z.url()
    }))
    .handler(async ({input, context}) => {
      try {
        const browser = await puppeteer.launch();
        const pageTitle = await getTitleFromPage(browser, input.url);
        browser.close();

        const [project] = await db.insert(projects).values({
          url: input.url,
          userId: context.user.id,
          title: pageTitle ?? (new URL(input.url)).hostname,
        }).returning();

        return project;
      } catch (error) {
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  getProjectMessages: authenticated
    .input(z.object({
      projectId: z.string()
    }))
    .handler(async ({input}) => {
      try {
        const messages = await db.select()
          .from(projectMessages)
          .where(eq(projectMessages.projectId, input.projectId));

        return messages;
      } catch (error) {
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  clearProjectMessages: authenticated
    .input(z.object({
      projectId: z.string()
    }))
    .handler(async ({input}) => {
      try {
        await db.delete(projectMessages).where(eq(projectMessages.projectId, input.projectId));
      } catch (error) {
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    })
}