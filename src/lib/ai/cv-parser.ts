import { getOpenAIClient, CHAT_MODEL } from "./openai-client";
import type { ParsedCvData } from "@/lib/types/database";

const KNOWN_SKILLS = [
  "JavaScript", "TypeScript", "Python", "Java", "C#", "C++", "Go", "Rust", "PHP", "Ruby",
  "React", "React Native", "Angular", "Vue", "Node.js", "Next.js", "Express",
  "HTML", "CSS", "Tailwind", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD",
  "Excel", "PowerPoint", "Word", "Salesforce", "SAP", "QuickBooks",
  "Digital Marketing", "SEO", "SEM", "Content Marketing", "Google Analytics",
  "Project Management", "Scrum", "Agile", "Jira",
  "Customer Service", "Sales", "Negotiation", "Accounting", "Bookkeeping",
  "Financial Analysis", "Fund Accounting", "Compliance", "AML", "Risk Management",
  "HR", "Recruitment", "Payroll", "Employee Relations",
  "Nursing", "Patient Care", "Clinical Documentation",
  "Hospitality", "Culinary Arts", "Mixology", "Housekeeping",
  "Warehouse Operations", "Forklift", "Logistics", "Inventory Management",
  "Figma", "Adobe Photoshop", "Adobe Illustrator", "UX Research", "UI Design",
];

const KNOWN_LANGUAGES = [
  "English", "Maltese", "Italian", "French", "German", "Spanish", "Arabic",
  "Portuguese", "Russian", "Mandarin", "Dutch", "Polish", "Swedish",
];

const DEGREE_KEYWORDS = [
  "Bachelor", "Master", "MBA", "PhD", "BSc", "MSc", "BA", "MA", "Diploma",
  "Higher National Diploma", "Associate Degree", "ACCA", "CIMA",
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(\+356\s?)?\d{4}\s?\d{4}|\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}/;
const YEARS_EXPERIENCE_RE = /(\d{1,2})\+?\s*years?\s*(of)?\s*experience/i;

/**
 * Deterministic, no-AI fallback parser. Extracts only what it can find
 * verbatim in the CV text — it never invents skills, employers, or
 * qualifications. Used automatically when OPENAI_API_KEY is not set.
 */
export function heuristicParseCv(text: string): ParsedCvData {
  const warnings: string[] = [];
  if (!text.trim()) {
    warnings.push("No text could be extracted from this file — please review and fill in your details manually.");
    return {
      skills: [], jobTitles: [], employers: [], education: [], certifications: [],
      languages: [], industries: [], aiAssisted: false, warnings,
    };
  }

  const email = text.match(EMAIL_RE)?.[0];
  const phone = text.match(PHONE_RE)?.[0];
  const yearsMatch = text.match(YEARS_EXPERIENCE_RE);
  const yearsExperience = yearsMatch ? Number(yearsMatch[1]) : undefined;

  const skills = KNOWN_SKILLS.filter((skill) =>
    new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
  );
  const languages = KNOWN_LANGUAGES.filter((lang) => new RegExp(`\\b${lang}\\b`, "i").test(text));
  const certifications = DEGREE_KEYWORDS
    .filter((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text))
    .map((name) => ({ name }));

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fullName = lines.length > 0 && lines[0].length < 60 && !EMAIL_RE.test(lines[0]) ? lines[0] : undefined;

  warnings.push(
    "Parsed without AI assistance (OPENAI_API_KEY not configured) — this is a best-effort keyword match. Please review every field carefully."
  );

  return {
    fullName,
    email,
    phone,
    skills,
    jobTitles: [],
    employers: [],
    yearsExperience,
    education: [],
    certifications,
    languages,
    industries: [],
    aiAssisted: false,
    warnings,
  };
}

const CV_PARSE_SYSTEM_PROMPT = `You extract structured information from a CV/resume. Only extract information that is explicitly present in the text. Never invent, guess, or embellish any employer, job title, skill, degree, certification, or dates that are not written in the CV. If a field cannot be determined, omit it or leave the array empty. Respond with strict JSON matching the given schema.`;

/**
 * AI-assisted parser (spec §6). Falls back to the heuristic parser if the
 * API call fails for any reason, so CV upload never blocks on an AI outage.
 */
export async function parseCvWithAi(text: string): Promise<ParsedCvData> {
  const client = getOpenAIClient();
  if (!client) return heuristicParseCv(text);
  if (!text.trim()) return heuristicParseCv(text);

  try {
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CV_PARSE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract the following fields as JSON: fullName, email, phone, location, skills (string array), jobTitles (string array, past/current roles held), employers (string array), yearsExperience (number, total professional experience), education (array of {institution, degree, field, startYear, endYear}), certifications (array of {name, issuer, year}), languages (string array), industries (string array).\n\nCV TEXT:\n"""\n${text.slice(0, 12000)}\n"""`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return heuristicParseCv(text);
    const parsed = JSON.parse(raw);

    return {
      fullName: typeof parsed.fullName === "string" ? parsed.fullName : undefined,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      phone: typeof parsed.phone === "string" ? parsed.phone : undefined,
      location: typeof parsed.location === "string" ? parsed.location : undefined,
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s: unknown) => typeof s === "string") : [],
      jobTitles: Array.isArray(parsed.jobTitles) ? parsed.jobTitles.filter((s: unknown) => typeof s === "string") : [],
      employers: Array.isArray(parsed.employers) ? parsed.employers.filter((s: unknown) => typeof s === "string") : [],
      yearsExperience: typeof parsed.yearsExperience === "number" ? parsed.yearsExperience : undefined,
      education: Array.isArray(parsed.education) ? parsed.education : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
      languages: Array.isArray(parsed.languages) ? parsed.languages.filter((s: unknown) => typeof s === "string") : [],
      industries: Array.isArray(parsed.industries) ? parsed.industries.filter((s: unknown) => typeof s === "string") : [],
      aiAssisted: true,
      warnings: ["Parsed with AI assistance — please review every field for accuracy before continuing."],
    };
  } catch (error) {
    console.error("[cv-parser] AI parsing failed, falling back to heuristic parser", error);
    const fallback = heuristicParseCv(text);
    fallback.warnings.unshift("AI parsing failed, so a best-effort keyword match was used instead.");
    return fallback;
  }
}
