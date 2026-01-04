import { authenticated } from "../middleware/auth";
import { db } from "../../lib/db";
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { projectMessages, projects } from "../../lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { streamAgentResponse } from "../../lib/ai";

async function saveProjectMessage(projectId: string, role: "user" | "assistant" | "tool", text: string) {
  await db.insert(projectMessages)
    .values({
      projectId,
      role,
      text
    });
}

export default {
  getAgentResponse: authenticated
    .input(z.object({
      prompt: z.string(),
      projectId: z.string()
    }))
    .handler(async function* ({ context, input }) {
      try {
        const [project] = await db.select()
          .from(projects)
          .where(eq(projects.id, input.projectId));

        const messageList = await db.select()
          .from(projectMessages)
          .where(eq(projectMessages.projectId, input.projectId))
          .orderBy(asc(projectMessages.createdAt));

        const formattedMessageList = messageList
          .filter(message => message.role !== "tool")
          .map(message => ({
          role: message.role!,
          text: message.text,
          content: message.content
        }));

        formattedMessageList.push({
          role: "user",
          text: input.prompt,
          content: null
        });

        await saveProjectMessage(input.projectId, "user", input.prompt);

        const agentStream = streamAgentResponse(formattedMessageList, project.url, input.projectId, project.cookies ?? undefined);

        let currentResponseType;
        let responseBuffer = "";

        for await (const agentResponse of agentStream) {
          if (agentResponse.type === "text" || agentResponse.type === "reasoning") {
            yield agentResponse;

            // Save buffer if type is changing and buffer has content
            if (currentResponseType && currentResponseType !== agentResponse.type && responseBuffer.length > 0) {
              await saveProjectMessage(input.projectId, "assistant", responseBuffer);
              responseBuffer = "";
            }

            // Update the current type
            currentResponseType = agentResponse.type;

            responseBuffer += agentResponse.content;
          } else if (agentResponse.type === "tool") {
            yield agentResponse;
            
            // Save buffer before switching to tool
            if (responseBuffer.length > 0) {
              await saveProjectMessage(input.projectId, "assistant", responseBuffer);
              responseBuffer = "";
            }
            
            currentResponseType = "tool";
          }
        }

        // Save the final assistant response if there's any content in the buffer
        if (responseBuffer.length > 0) {
          await saveProjectMessage(input.projectId, "assistant", responseBuffer);
        }

        return;
      } catch (error) {
        if (error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    })
}