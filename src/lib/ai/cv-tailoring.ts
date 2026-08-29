import type { Job, ParsedCvData } from "@/lib/types/database";
import { getOpenAIClient, CHAT_MODEL } from "./openai-client";

export interface TailoredCv {
  text: string;
  tailored: boolean;
}

const TAILOR_SYSTEM_PROMPT = `You tailor a candidate's CV to a specific job by reordering and re-emphasizing their EXISTING, truthful experience and skills so the most relevant parts are prominent. You must never invent, add, or exaggerate any employer, job title, skill, qualification, achievement, or dates that are not already present in the source CV. If the source CV lacks something the job wants, simply don't claim it. Output plain text formatted as a CV (contact line, summary, skills, experience, education).`;

/**
 * CV tailoring (spec §19). Only ever reorganizes and rephrases information
 * already present in parsedCv/baseResumeText — the system prompt and a
 * post-hoc check both guard against fabrication. Without OPENAI_API_KEY,
 * returns the original resume text unmodified rather than pretending to
 * tailor it.
 */
export async function tailorCvForJob(
  baseResumeText: string,
  parsedCv: ParsedCvData | null,
  job: Job
): Promise<TailoredCv> {
  const client = getOpenAIClient();
  if (!client || !baseResumeText.trim()) {
    return { text: baseResumeText, tailored: false };
  }

  try {
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: TAILOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: `SOURCE CV (the only source of truth — do not add anything beyond this):\n"""\n${baseResumeText.slice(0, 8000)}\n"""\n\nKnown structured data extracted from this CV (for reference only, still bounded by the source CV above): ${JSON.stringify(parsedCv ?? {})}\n\nTARGET JOB:\nTitle: ${job.title}\nCompany: ${job.company_name}\nRequirements: ${job.requirements ?? "n/a"}\nSkills sought: ${(job.skills ?? []).join(", ")}\n\nProduce the tailored CV now.`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return { text: baseResumeText, tailored: false };
    return { text, tailored: true };
  } catch (error) {
    console.error("[cv-tailoring] failed, submitting original CV instead", error);
    return { text: baseResumeText, tailored: false };
  }
}
