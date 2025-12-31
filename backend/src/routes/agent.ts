import { authenticated } from "../middleware/auth";
import { db } from "../../lib/db";
import {z} from "zod";
import { ORPCError } from "@orpc/server";
import { projectMessages } from "../../lib/db/schema";
import { eq } from "drizzle-orm";
import { streamAgentResponse } from "../../lib/ai";

async function saveProjectMessage(projectId: string, role: "user" | "assistant" | "tool", text: string){
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
    .handler(async function*({context, input}){
      try {
        const messageList = await db.select()
          .from(projectMessages)
          .where(eq(projectMessages.projectId, input.projectId));

        const formattedMessageList = messageList.map(message => ({
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

        const agentStream = streamAgentResponse(formattedMessageList);

        let currentResponseType;
        let responseBuffer = "";

        for await(const agentResponse of agentStream){
          if(agentResponse.type === "text" || agentResponse.type === "reasoning"){
            yield agentResponse;
          
            if(!currentResponseType){
              currentResponseType = agentResponse.type;
            }

            if(currentResponseType !== agentResponse.type){
              await saveProjectMessage(input.projectId, "assistant", responseBuffer);
              currentResponseType = agentResponse.type;
              responseBuffer = "";
            }

            responseBuffer += agentResponse.content;
          }else if(agentResponse.type === "tool"){
            currentResponseType = "tool";
            responseBuffer = "";
            await saveProjectMessage(input.projectId, "tool", `Agent called ${agentResponse.content}`);
          }
        }

        return;
      } catch (error) {
        if(error instanceof ORPCError) throw error;

        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
    })
}