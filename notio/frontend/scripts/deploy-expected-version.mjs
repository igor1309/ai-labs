import { readFileSync } from "node:fs";

const FRONTEND_TAG_PATTERN = /^notio-frontend_(v.+)$/;

const refName = process.env.GITHUB_REF_NAME;
const refType = process.env.GITHUB_REF_TYPE;
const frontendTagMatch = refName?.match(FRONTEND_TAG_PATTERN);

if (frontendTagMatch) {
  console.log(frontendTagMatch[1]);
} else if (refType === "tag") {
  throw new Error(`Unsupported frontend release tag: ${refName}`);
} else {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  console.log(`v${packageJson.version}`);
}
