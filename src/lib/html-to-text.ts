/**
 * Converts ATS-authored rich-text HTML (e.g. a Greenhouse job's `content`
 * field, which comes from the employer's WYSIWYG description editor) into
 * clean, readable plain text. Used only at ingestion time to normalize what
 * gets stored in `jobs.description` — nothing in the app renders job
 * descriptions as HTML (no dangerouslySetInnerHTML anywhere), so this must
 * produce genuine plain text, not sanitized-but-still-HTML.
 */

/** Named entities that actually show up in practice in ATS-authored text. Not exhaustive by design — an entity this doesn't recognize is left as-is rather than risk mangling real text. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  cent: "¢",
  yen: "¥",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isNaN(code)) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Strips HTML tags, decodes entities, and preserves sensible paragraph/line
 * spacing by turning block-level boundaries and <br> into real newlines
 * before stripping — so the result reads like the original formatted text,
 * not a run-on wall of words.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";

  let text = html;

  // Drop script/style blocks entirely — their content isn't text either.
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Turn structural boundaries into line breaks before stripping tags.
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "\n• ");
  text = text.replace(/<\/li>/gi, "");
  text = text.replace(/<\/(p|div|h[1-6]|blockquote|tr|ul|ol|table)>/gi, "\n\n");

  // Strip every remaining tag.
  text = text.replace(/<[^>]+>/g, "");

  // Entities can't form tag boundaries, so decode after stripping tags.
  text = decodeHtmlEntities(text);

  // Collapse whitespace: trim each line, then collapse runs of 2+ blank
  // lines down to exactly one (a single blank line between paragraphs).
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}
