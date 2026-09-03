import type { AnswerLibraryEntry } from "@/lib/types/database";
import { getOpenAIClient, CHAT_MODEL } from "./openai-client";

export interface QuestionAnswer {
  answer: string | null;
  manualRequired: boolean;
  sourceEntryId?: string;
}

const COMMON_QUESTION_KEYS: Record<string, RegExp> = {
  work_authorization: /work (permit|authoriz|authoris)|eligible to work|right to work/i,
  notice_period: /notice period/i,
  salary_expectation: /salary expectation|expected salary|desired salary/i,
  years_experience: /years of experience|how many years/i,
  relocation: /relocat/i,
  remote_preference: /remote|hybrid|on-?site preference/i,
  languages: /which languages|language(s)? do you speak/i,
  linkedin_url: /linkedin/i,
  portfolio_url: /portfolio|personal website|github/i,
  sponsorship_requirement: /sponsorship/i,
};

function keyForQuestion(questionText: string): string | null {
  for (const [key, pattern] of Object.entries(COMMON_QUESTION_KEYS)) {
    if (pattern.test(questionText)) return key;
  }
  return null;
}

/**
 * Answers an application screening question using only verified library
 * entries (spec §21). Never guesses — a question the system can't
 * confidently map to a verified answer comes back with manualRequired=true
 * so the application is routed to a human instead of submitted with a
 * fabricated answer.
 */
export async function answerQuestion(questionText: string, library: AnswerLibraryEntry[]): Promise<QuestionAnswer> {
  const key = keyForQuestion(questionText);
  if (key) {
    const entry = library.find((e) => e.question_key === key && e.verified);
    if (entry) return { answer: entry.answer_text, manualRequired: false, sourceEntryId: entry.id };
  }

  const exact = library.find(
    (e) => e.verified && e.question_text.trim().toLowerCase() === questionText.trim().toLowerCase()
  );
  if (exact) return { answer: exact.answer_text, manualRequired: false, sourceEntryId: exact.id };

  const client = getOpenAIClient();
  if (client && library.length > 0) {
    try {
      const completion = await client.chat.completions.create({
        model: CHAT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Given an application question and a list of the candidate\'s verified pre-written answers, decide if one of them clearly answers the question. Respond as JSON: {"matchId": "<id or null>"}. Only match if truly the same question in substance — otherwise return null. Never fabricate an answer.',
          },
          {
            role: "user",
            content: `Question: "${questionText}"\n\nVerified answers:\n${library
              .filter((e) => e.verified)
              .map((e) => `id=${e.id}: "${e.question_text}" -> "${e.answer_text}"`)
              .join("\n")}`,
          },
        ],
      });
      const raw = completion.choices[0]?.message?.content;
      const parsed = raw ? JSON.parse(raw) : null;
      const matchId = parsed?.matchId;
      if (matchId) {
        const matched = library.find((e) => e.id === matchId);
        if (matched) return { answer: matched.answer_text, manualRequired: false, sourceEntryId: matched.id };
      }
    } catch (error) {
      console.error("[answer-questions] AI matching failed", error);
    }
  }

  return { answer: null, manualRequired: true };
}
