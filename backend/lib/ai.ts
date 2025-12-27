import { createGroq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import {z} from "zod";

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY!
});

const urlInterestPrompt = `
INSTRUCTIONS TO DETERMINE INTEREST URLS:
1. If a url seems like it may have vulnerabilities, give it a high interest score
2. Admin panels, dashboard, login forms are considered interesting urls
3. Landing pages or pages that seem like they won't contain much user controlled inputs are less interesting
`

export async function determineUrlInterest(url: string){
  const {object} = await generateObject({
    model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
    schema: z.object({
      interest: z.number().describe("A number from 1 to 10")
    }),
    system: urlInterestPrompt,
    prompt: url
  })

  return object.interest
}
