// Shared operator-skill contract logic, imported by both the in-repo parity test
// (tests/operator-skill-contract.test.js) and the publish projector's R9 checks so
// the route-citation and item-quality rules have a single implementation.

export function routeKey(method, path) {
  return `${method.toUpperCase()} ${path}`;
}

// Route keys ("GET /path") declared in an OpenAPI document's `paths:` block.
export function openApiRoutes(openApiText) {
  const routes = new Set();
  let currentPath;

  for (const line of openApiText.split("\n")) {
    const pathMatch = line.match(/^  (\/[^:]+):$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = line.match(/^    (get|post|put|patch|delete):$/);
    if (currentPath && methodMatch) {
      routes.add(routeKey(methodMatch[1], currentPath));
    }
  }

  return routes;
}

// Route citations ("GET /path") referenced in a skill body.
export function routeCitations(skillText) {
  return [...skillText.matchAll(/\b(GET|POST|PUT|PATCH|DELETE) (\/[A-Za-z0-9][^\s`),.;]*)/g)].map(
    $0 => ({ method: $0[1], path: $0[2] }),
  );
}

// The guarded shared item-quality block (the four item-writing subsections, from
// "#### The stem" through the line ending "another across the set."), or null.
export function itemQualityBlock(skillText) {
  const lines = skillText.split("\n");
  const start = lines.findIndex($0 => $0 === "#### The stem");
  if (start === -1) {
    return null;
  }
  const end = lines.findIndex(
    ($0, index) => index >= start && $0.endsWith("another across the set."),
  );
  if (end === -1) {
    return null;
  }
  return lines.slice(start, end + 1).join("\n");
}
