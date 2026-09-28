import { REVIEW_RESULT_SCHEMA, REVIEW_RESULT_SCHEMA_ID, validateReviewResult } from "./review-result.js";

// Output contracts a process can name in `output.schema`. Each pairs the JSON
// Schema given to the runtime with Agister's own validator: the runtime's
// structured-output support is not trusted to have enforced it.

export interface OutputSchema {
  readonly id: string;
  readonly jsonSchema: object;
  validate(value: unknown): unknown;
}

export const OUTPUT_SCHEMAS: ReadonlyMap<string, OutputSchema> = new Map([
  [REVIEW_RESULT_SCHEMA_ID, { id: REVIEW_RESULT_SCHEMA_ID, jsonSchema: REVIEW_RESULT_SCHEMA, validate: validateReviewResult }],
]);
