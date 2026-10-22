/**
 * Minimal TOML parser/writer for the release-unit config and manifest subset.
 *
 * Supports:
 *   - Comments (# ...)
 *   - Key/value: key = "string" | true | false | integer
 *   - Arrays: single- or multi-line, including inline-table arrays
 *   - Array of tables: [[name]]
 *   - Blank lines
 *
 * Does NOT support:
 *   - Nested tables, multi-line strings, dotted keys, etc.
 */

/**
 * Parse a TOML string into a plain object.
 *
 * Top-level key/value pairs become properties of the returned object.
 * [[name]] sections become arrays of objects under the key `name`.
 *
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parse(text) {
  const result = {};
  let currentObj = null;

  for (const raw of logicalLines(text)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    // Array-of-tables header: [[name]]
    const aotMatch = line.match(/^\[\[(\w[\w-]*)\]\]$/);
    if (aotMatch) {
      const name = aotMatch[1];
      if (!result[name]) result[name] = [];
      currentObj = {};
      result[name].push(currentObj);
      continue;
    }

    // Key = Value
    const kvMatch = line.match(/^(\w[\w-]*)\s*=\s*(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    const valRaw = kvMatch[2].trim();
    const value = parseValue(valRaw);

    if (currentObj) {
      currentObj[key] = value;
    } else {
      result[key] = value;
    }
  }

  return result;
}

// Comments and newlines may occur between array entries, but not inside a
// basic string. Keep that distinction before parsing the value itself.
function logicalLines(text) {
  const lines = [];
  let pending = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const raw of text.split('\n')) {
    let line = '';
    for (const char of raw) {
      if (!inString && char === '#') break;
      line += char;
      if (inString && escaped) {
        escaped = false;
        continue;
      }
      if (inString && char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') inString = !inString;
      if (!inString && (char === '[' || char === '{')) depth += 1;
      if (!inString && (char === ']' || char === '}')) depth -= 1;
    }
    if (inString) throw new Error('Unterminated TOML string');
    pending += ` ${line.trim()}`;
    if (depth === 0) {
      lines.push(pending.trim());
      pending = '';
    }
    if (depth < 0) throw new Error('Unexpected TOML closing bracket');
  }
  if (depth !== 0) throw new Error('Unterminated TOML array or inline table');
  return lines;
}

/**
 * @param {string} raw
 * @returns {unknown}
 */
function parseValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);

  // Quoted string
  const strMatch = raw.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (strMatch) return strMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

  // Array: ["a", "b", ...]
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevel(inner).map(s => parseValue(s.trim()));
  }

  // Inline table: { path = "notio/backend", basename = "notio-backend" }
  if (raw.startsWith('{') && raw.endsWith('}')) {
    const inner = raw.slice(1, -1).trim();
    if (inner === '') return {};
    return Object.fromEntries(
      splitTopLevel(inner).map(entry => {
        const match = entry.match(/^(\w[\w-]*)\s*=\s*(.+)$/);
        if (!match) return [entry, undefined];
        return [match[1], parseValue(match[2].trim())];
      }),
    );
  }

  return raw;
}

/**
 * Split a comma-separated TOML subset value without splitting inside strings,
 * arrays, or inline tables.
 *
 * @param {string} value
 * @returns {string[]}
 */
function splitTopLevel(value) {
  const parts = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (inString && escaped) {
      escaped = false;
      current += char;
      continue;
    }
    if (inString && char === '\\') {
      escaped = true;
      current += char;
      continue;
    }
    if (char === '"') {
      inString = !inString;
    }

    if (!inString && (char === '[' || char === '{')) {
      depth += 1;
    }
    if (!inString && (char === ']' || char === '}')) {
      depth -= 1;
    }

    if (char === ',' && depth === 0 && !inString) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Stringify a manifest object into deterministic TOML.
 *
 * Handles top-level scalars/arrays and [[units]] array-of-tables.
 *
 * @param {Record<string, unknown>} obj
 * @param {{ header?: string }} options
 * @returns {string}
 */
export function stringify(obj, options = {}) {
  const lines = [];
  if (options.header) {
    for (const h of options.header.split('\n')) {
      lines.push(`# ${h}`);
    }
    lines.push('');
  }

  // Top-level scalars / arrays first
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      continue; // array-of-tables handled below
    }
    lines.push(`${key} = ${formatValue(value)}`);
  }

  // Array-of-tables
  for (const [key, value] of Object.entries(obj)) {
    if (!Array.isArray(value) || value.length === 0 || typeof value[0] !== 'object') {
      continue;
    }
    for (const entry of value) {
      lines.push('');
      lines.push(`[[${key}]]`);
      for (const [k, v] of Object.entries(entry)) {
        lines.push(`${k} = ${formatValue(v)}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatValue(value) {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (Array.isArray(value)) {
    return `[${value.map(v => formatValue(v)).join(', ')}]`;
  }
  return String(value);
}
