export const SECTION_NAMES = [
  "Session summary",
  "Outcome",
  "Useful decisions",
  "Failure or friction points",
  "Next-session improvements",
  "Evidence notes",
] as const;

export type SectionName = typeof SECTION_NAMES[number];

export const AGENT_ROLES = [
  "Extractor",
  "Improver",
  "Evidence checker",
] as const;

export type AgentRole = typeof AGENT_ROLES[number];

export const SECTION_OWNERS: Record<AgentRole, readonly SectionName[]> = {
  "Extractor": [
    "Session summary",
    "Outcome",
    "Useful decisions",
    "Failure or friction points",
  ],
  "Improver": [
    "Next-session improvements",
  ],
  "Evidence checker": [
    "Evidence notes",
  ],
};
