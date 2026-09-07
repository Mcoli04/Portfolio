import OpenAI from "openai";
import { env, isOpenAIConfigured } from "@/lib/config";

let client: OpenAI | null = null;

/** Returns null when OPENAI_API_KEY is not set — callers must fall back to heuristics. */
export function getOpenAIClient(): OpenAI | null {
  if (!isOpenAIConfigured) return null;
  if (!client) client = new OpenAI({ apiKey: env.openaiApiKey });
  return client;
}

export const CHAT_MODEL = "gpt-4o-mini";
