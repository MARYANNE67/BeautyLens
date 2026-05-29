// To swap AI provider, update this file only. No other files need to change.
import Anthropic from "@anthropic-ai/sdk"
import { anthropic as anthropicProvider } from "@ai-sdk/anthropic"
import { streamText } from "ai"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = "claude-sonnet-4-20250514"

export async function generateCompletion(
  prompt: string,
  systemPrompt: string
): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    })
    const block = response.content[0]
    if (block.type !== "text") throw new Error("Unexpected response type")
    return block.text
  } catch (error) {
    console.error("[AI] generateCompletion error:", error)
    throw new Error("AI completion failed")
  }
}

export function generateStream(prompt: string, systemPrompt: string) {
  try {
    return streamText({
      model: anthropicProvider(MODEL),
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    })
  } catch (error) {
    console.error("[AI] generateStream error:", error)
    throw new Error("AI stream failed")
  }
}
