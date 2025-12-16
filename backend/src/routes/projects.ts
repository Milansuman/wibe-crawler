import { authenticated } from "../middleware/auth";
import { db } from "../../lib/db";
import { ORPCError } from "@orpc/server";
import { projects, urls } from "../../lib/db/schema";
import { and, eq } from "drizzle-orm";
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
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    })
}