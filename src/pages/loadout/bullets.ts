// Rules text → bullets (RichText.tsx). Thai lines carry "\n" in th.ts where Thai has no full stops.

/** Split a filled rules line into bullets: on "\n", on ". " between sentences, and on "; ". */
export function bullets(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[^a-z\d\s(])|;\s+/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter(Boolean)
}
