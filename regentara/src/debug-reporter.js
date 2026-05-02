export function createDebugReporter(options = {}) {
  const enabled = options.enabled === true;
  const stderr = options.stderr;
  const settings = {};

  return {
    rememberSettings: (fields = {}) => {
      Object.assign(settings, compact(fields));
    },
    report: (event, fields = {}) => {
      if (!enabled) return;
      stderr.write(formatDebugLine(event, fields));
    },
    reportSettings: () => {
      if (!enabled || Object.keys(settings).length === 0) return;
      stderr.write(formatDebugLine("settings", settings));
    },
  };
}

export function formatDebugLine(event, fields = {}) {
  const fieldText = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${encodeScalar(key, value)}`);
  return [
    "regentara debug:",
    event,
    ...fieldText,
  ].join(" ") + "\n";
}

function encodeScalar(key, value) {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  throw new TypeError(`debug field ${key} must be a scalar`);
}

function compact(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}
