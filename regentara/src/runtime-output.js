import Ajv from "ajv";

import { RuntimeFailure } from "./errors.js";

export function parseRuntimeOutput(rawOutput) {
  if (rawOutput !== undefined && rawOutput !== null && typeof rawOutput === "object") {
    return rawOutput;
  }

  try {
    return JSON.parse(rawOutput);
  } catch (error) {
    throw new RuntimeFailure("agent runtime output is not valid JSON", { cause: error });
  }
}

export function validateRuntimeOutput(agentId, rawOutput, schema, options = {}) {
  const output = parseRuntimeOutput(rawOutput);
  const ajv = options.ajv ?? new Ajv();
  const validate = ajv.compile(schema);

  if (!validate(output)) {
    throw new RuntimeFailure(`agent runtime output failed schema validation: ${agentId}`);
  }

  return output;
}
