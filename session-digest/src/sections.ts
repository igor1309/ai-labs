export const SECTION_NAMES = [
  "Session summary",
  "Outcome",
  "Useful decisions",
  "Failure or friction points",
  "Next-session improvements",
  "Evidence notes",
] as const;

export type SectionName = typeof SECTION_NAMES[number];
