import type { Job, Profile } from "@/lib/types/database";
import { getOpenAIClient, CHAT_MODEL } from "./openai-client";

export interface GeneratedCoverLetter {
  text: string;
  aiAssisted: boolean;
}

const COVER_LETTER_SYSTEM_PROMPT = `You write a concise, professional cover letter (250-350 words) for a job application. Use ONLY the candidate facts provided — never invent employers, titles, achievements, or skills the candidate doesn't have. If information is thin, keep the letter shorter and more general rather than fabricating detail.`;

/**
 * Cover letter generation (spec §20). Falls back to a plain, templated
 * letter built only from verified profile fields when OpenAI isn't
 * configured or the call fails — still truthful, just less eloquent.
 */
export async function generateCoverLetter(profile: Profile, job: Job): Promise<GeneratedCoverLetter> {
  const client = getOpenAIClient();
  const candidateName = profile.full_name ?? "Candidate";

  if (!client) {
    return { text: templateCoverLetter(profile, job), aiAssisted: false };
  }

  try {
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.5,
      messages: [
        { role: "system", content: COVER_LETTER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Candidate name: ${candidateName}\nCandidate skills: ${profile.skills.join(", ") || "not specified"}\nCandidate years of experience: ${profile.years_experience ?? "not specified"}\nCandidate past job titles: ${profile.job_titles.join(", ") || "not specified"}\nCandidate headline/summary: ${profile.headline ?? "not specified"}\n\nJob title: ${job.title}\nCompany: ${job.company_name}\nJob description: ${job.description.slice(0, 2000)}\n\nWrite the cover letter now, addressed to the hiring team at ${job.company_name}.`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return { text: templateCoverLetter(profile, job), aiAssisted: false };
    return { text, aiAssisted: true };
  } catch (error) {
    console.error("[cover-letter] AI generation failed, using template", error);
    return { text: templateCoverLetter(profile, job), aiAssisted: false };
  }
}

function templateCoverLetter(profile: Profile, job: Job): string {
  const name = profile.full_name ?? "Candidate";
  const skills = profile.skills.slice(0, 5).join(", ");
  return `Dear Hiring Team at ${job.company_name},

I am writing to apply for the ${job.title} position. ${
    skills ? `My experience includes ${skills}, which I believe aligns well with this role. ` : ""
  }${
    profile.years_experience ? `I have ${profile.years_experience} years of professional experience` + (profile.job_titles.length ? ` as a ${profile.job_titles[0]}` : "") + ". " : ""
  }I would welcome the opportunity to discuss how my background could contribute to your team.

Thank you for your consideration.

Kind regards,
${name}`;
}
