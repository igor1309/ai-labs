// Flat TOML subset for agent profiles: `key = value` lines where a value is a
// basic string, integer, boolean or array of strings. Tables and other TOML
// features are rejected rather than half-parsed.

export type FlatValue = string | number | boolean | string[];
export type FlatTable = Record<string, FlatValue>;

const KEY = /^[A-Za-z0-9_-]+$/;

export function parseFlatToml(text: string, source = "<toml>"): FlatTable {
  const table: FlatTable = {};
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = stripComment(raw).trim();
    if (line === "") return;

    const fail = (message: string): never => {
      throw new Error(`${source}:${index + 1}: ${message}`);
    };

    const equals = line.indexOf("=");
    if (equals < 0) fail("expected `key = value`");

    const key = line.slice(0, equals).trim();
    if (!KEY.test(key)) fail(`unsupported key: ${key}`);
    if (Object.hasOwn(table, key)) fail(`duplicate key: ${key}`);

    table[key] = parseValue(line.slice(equals + 1).trim(), fail);
  });

  return table;
}

export function stringifyFlatToml(table: FlatTable): string {
  return Object.entries(table)
    .map(([key, value]) => `${key} = ${stringifyValue(value)}`)
    .join("\n") + "\n";
}

function parseValue(text: string, fail: (message: string) => never): FlatValue {
  if (text.startsWith('"')) return parseString(text, fail);
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+$/.test(text)) return Number(text);
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    if (inner === "") return [];
    return splitArray(inner).map((item) => parseString(item.trim(), fail));
  }
  return fail(`unsupported value: ${text}`);
}

function parseString(text: string, fail: (message: string) => never): string {
  if (!/^"(?:[^"\\]|\\.)*"$/.test(text)) fail(`expected a basic string: ${text}`);
  try {
    return JSON.parse(text) as string;
  } catch {
    return fail(`invalid string escape: ${text}`);
  }
}

function stringifyValue(value: FlatValue): string {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function splitArray(inner: string): string[] {
  const items: string[] = [];
  let current = "";
  let inString = false;

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i]!;
    if (inString && char === "\\") {
      current += char + (inner[++i] ?? "");
      continue;
    }
    if (char === '"') inString = !inString;
    if (char === "," && !inString) {
      items.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() !== "") items.push(current);
  return items;
}

function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inString && char === "\\") {
      i++;
      continue;
    }
    if (char === '"') inString = !inString;
    if (char === "#" && !inString) return line.slice(0, i);
  }
  return line;
}
