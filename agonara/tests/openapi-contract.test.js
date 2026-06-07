import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseDocument } from "yaml";

const openApiPath = fileURLToPath(new URL("../docs/api/openapi.yml", import.meta.url));
const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));

test("openApiContract_shouldResolveLocalRefs_onHandEditedContract", () => {
  const document = parseDocument(readFileSync(openApiPath, "utf8"), { prettyErrors: false });
  const parseErrors = document.errors.map($0 => $0.message);
  const contract = parseErrors.length === 0 ? document.toJS() : {};
  const refs = collectRefs(contract);
  const externalRefs = refs.filter($0 => !$0.ref.startsWith("#/")).map(formatRefFailure);
  const unresolvedRefs = refs
    .filter($0 => $0.ref.startsWith("#/"))
    .filter($0 => !hasLocalRef(contract, $0.ref))
    .map(formatRefFailure);

  assert.deepEqual(
    { externalRefs, parseErrors, unresolvedRefs },
    { externalRefs: [], parseErrors: [], unresolvedRefs: [] },
  );
});

test("openApiContract_shouldMatchHttpStatusRejectionReasons_onHandEditedContract", () => {
  const contract = readOpenApiContract();
  const apiRejectionReasons = contract.components.schemas.ApiRejectionReason.enum;
  const httpStatusReasons = collectHttpStatusReasons(readFileSync(serverPath, "utf8"));

  assert.deepEqual(
    {
      undocumentedHttpStatusReasons: httpStatusReasons.filter($0 => !apiRejectionReasons.includes($0)),
      unmappedApiRejectionReasons: apiRejectionReasons.filter($0 => !httpStatusReasons.includes($0)),
    },
    {
      undocumentedHttpStatusReasons: [],
      unmappedApiRejectionReasons: [],
    },
  );
});

function readOpenApiContract() {
  const document = parseDocument(readFileSync(openApiPath, "utf8"), { prettyErrors: false });
  return document.toJS();
}

function collectHttpStatusReasons(serverSource) {
  const httpStatusFunction = serverSource.match(/function httpStatusFor\(reason\) \{(?<body>[\s\S]*?)\n\}/)?.groups.body;

  assert.notEqual(httpStatusFunction, undefined);

  return [...httpStatusFunction.matchAll(/case "([^"]+)":/g)]
    .map($0 => $0[1])
    .sort();
}

function collectRefs(value, path = []) {
  if (Array.isArray(value)) {
    return value.flatMap(($0, index) => collectRefs($0, [...path, String(index)]));
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, child]) => {
      const childPath = [...path, key];

      if (key === "$ref" && typeof child === "string") {
        return [{ path: childPath, ref: child }];
      }

      return collectRefs(child, childPath);
    });
  }

  return [];
}

function hasLocalRef(contract, ref) {
  let current = contract;
  const segments = ref
    .slice(2)
    .split("/")
    .map(decodePointerSegment);

  for (const segment of segments) {
    if (!isRecord(current) && !Array.isArray(current)) {
      return false;
    }

    if (!Object.hasOwn(current, segment)) {
      return false;
    }

    current = current[segment];
  }

  return true;
}

function formatRefFailure({ path, ref }) {
  return `#/${path.map(escapePointerSegment).join("/")}: ${ref}`;
}

function escapePointerSegment(segment) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function decodePointerSegment(segment) {
  return decodeURIComponent(segment).replaceAll("~1", "/").replaceAll("~0", "~");
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
