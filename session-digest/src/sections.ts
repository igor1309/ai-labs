import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type DigestSection = {
  description: string;
  heading: string;
  id: string;
  required: boolean;
};

export type DigestSchema = {
  sections: DigestSection[];
  version: number;
};

export type SectionName = string;

export const DEFAULT_DIGEST_SCHEMA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "digest-schema.yaml",
);

export const DEFAULT_DIGEST_SCHEMA = parseDigestSchemaYaml(
  fs.readFileSync(DEFAULT_DIGEST_SCHEMA_PATH, "utf8"),
);

export const SECTION_IDS = DEFAULT_DIGEST_SCHEMA.sections.map(($0) => $0.id);
export const SECTION_NAMES = DEFAULT_DIGEST_SCHEMA.sections.map(($0) => $0.heading);

export function parseDigestSchemaYaml(body: string): DigestSchema {
  const lines = body.split(/\r?\n/);
  const version = parseVersion(lines);
  const sections: DigestSection[] = [];
  let currentSection: Partial<DigestSection> | undefined;

  for (const line of lines) {
    const sectionStart = /^  - ([^:]+):\s*(.*)$/.exec(line);

    if (sectionStart) {
      if (currentSection) {
        sections.push(requireCompleteSection(currentSection));
      }

      currentSection = {};
      setSectionValue(currentSection, sectionStart[1], sectionStart[2]);
      continue;
    }

    const sectionProperty = /^    ([^:]+):\s*(.*)$/.exec(line);

    if (sectionProperty && currentSection) {
      setSectionValue(currentSection, sectionProperty[1], sectionProperty[2]);
    }
  }

  if (currentSection) {
    sections.push(requireCompleteSection(currentSection));
  }

  if (sections.length === 0) {
    throw new Error("Digest schema must define at least one section.");
  }

  const sectionIds = new Set<string>();

  for (const section of sections) {
    if (sectionIds.has(section.id)) {
      throw new Error(`Duplicate digest section id: ${section.id}`);
    }

    sectionIds.add(section.id);
  }

  return { sections, version };
}

function parseVersion(lines: string[]): number {
  const versionLine = lines.find(($0) => $0.startsWith("version:"));
  const version = Number(versionLine?.replace("version:", "").trim());

  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Digest schema version must be a positive integer.");
  }

  return version;
}

function setSectionValue(section: Partial<DigestSection>, key: string, value: string): void {
  const scalar = parseScalar(value);

  switch (key) {
    case "description":
      section.description = scalar;
      return;
    case "heading":
      section.heading = scalar;
      return;
    case "id":
      section.id = scalar;
      return;
    case "required":
      section.required = scalar === "true";
      return;
  }
}

function requireCompleteSection(section: Partial<DigestSection>): DigestSection {
  if (
    !section.description
    || !section.heading
    || !section.id
    || section.required !== true
  ) {
    throw new Error("Digest schema section must define id, heading, required: true, and description.");
  }

  return {
    description: section.description,
    heading: section.heading,
    id: section.id,
    required: section.required,
  };
}

function parseScalar(value: string): string {
  return value.trim().replace(/^"(.*)"$/, "$1");
}
