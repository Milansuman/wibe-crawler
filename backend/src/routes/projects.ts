import { authenticated } from "../middleware/auth";
import { db } from "../../lib/db";
import { ORPCError } from "@orpc/server";
import { projects, urls, emails, cookies } from "../../lib/db/schema";
import { and, eq, count, sql } from "drizzle-orm";
import {z} from "zod";

export default {
  getProjectsForUser: authenticated
    .handler(async ({input, context}) => {
      try {
        const userProjects = await db
          .select()
          .from(projects)
          .where(eq(projects.userId, context.user.id));

        return userProjects;
      } catch (error) {
        console.error(error);
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  getProjectById: authenticated
    .input(z.object({
      projectId: z.string()
    }))
    .handler(async ({input, context}) => {
      try {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, input.projectId),
            eq(projects.userId, context.user.id)
          ));

        if(!project){
          throw new ORPCError("NOT_FOUND");
        }

        return project;
      } catch (error) {
        console.error(error);
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  createProject: authenticated
    .input(z.object({
      url: z.string(),
      cookieHeader: z.string().optional(),
      localStorage: z.string().optional()
    }))
    .handler(async ({input, context}) => {
      try {
        const [project] = await db
          .insert(projects)
          .values({
            url: input.url,
            cookieHeader: input.cookieHeader,
            localStorage: input.localStorage,
            userId: context.user.id
          })
          .returning();

        await db
          .insert(urls)
          .values({
            projectId: project.id,
            url: input.url,
            type: "page"
          });

        return project;
      } catch (error) {
        console.error(error);
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  updateProject: authenticated
    .input(z.object({
      projectId: z.string(),
      url: z.string().optional(),
      cookieHeader: z.string().optional(),
      localStorage: z.string().optional()
    }))
    .handler(async ({input, context}) => {
      try {
        const [project] = await db
          .update(projects)
          .set({
            url: input.url,
            cookieHeader: input.cookieHeader,
            localStorage: input.localStorage
          })
          .where(and(
            eq(projects.id, input.projectId),
            eq(projects.userId, context.user.id)
          ))
          .returning();

        if (!project) {
          throw new ORPCError("NOT_FOUND");
        }

        return project;
      } catch (error) {
        console.error(error);
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  deleteProject: authenticated
    .input(z.object({
      projectId: z.string()
    }))
    .handler(async ({input, context}) => {
      try {
        const [project] = await db
          .delete(projects)
          .where(and(
            eq(projects.id, input.projectId),
            eq(projects.userId, context.user.id)
          ))
          .returning();

        if (!project) {
          throw new ORPCError("NOT_FOUND");
        }

        return project;
      } catch (error) {
        console.error(error);
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    }),
  getProjectStatistics: authenticated
    .input(z.object({
      projectId: z.string()
    }))
    .handler(async ({input, context}) => {
      try {
        // Verify project ownership
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

        // Get URL statistics
        const [urlStats] = await db
          .select({
            total: count(),
            crawled: sql<number>`count(*) filter (where ${urls.crawled} = true)`,
            uncrawled: sql<number>`count(*) filter (where ${urls.crawled} = false or ${urls.crawled} is null)`
          })
          .from(urls)
          .where(eq(urls.projectId, input.projectId));

        // Get interest distribution
        const interestDistribution = await db
          .select({
            interest: urls.interest,
            count: count()
          })
          .from(urls)
          .where(eq(urls.projectId, input.projectId))
          .groupBy(urls.interest);

        // Get type distribution
        const typeDistribution = await db
          .select({
            type: urls.type,
            count: count()
          })
          .from(urls)
          .where(eq(urls.projectId, input.projectId))
          .groupBy(urls.type);

        // Get level distribution
        const levelDistribution = await db
          .select({
            level: urls.level,
            count: count()
          })
          .from(urls)
          .where(eq(urls.projectId, input.projectId))
          .groupBy(urls.level);

        // Get email count
        const [emailStats] = await db
          .select({
            total: count()
          })
          .from(emails)
          .where(eq(emails.projectId, input.projectId));

        // Get cookie count
        const [cookieStats] = await db
          .select({
            total: count()
          })
          .from(cookies)
          .where(eq(cookies.projectId, input.projectId));

        return {
          urls: {
            total: urlStats.total,
            crawled: urlStats.crawled,
            uncrawled: urlStats.uncrawled
          },
          emails: {
            total: emailStats.total
          },
          cookies: {
            total: cookieStats.total
          },
          interestDistribution,
          typeDistribution,
          levelDistribution
        };
      } catch (error) {
        console.error(error);
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    })
}