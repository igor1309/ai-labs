/// Returns the scope ids declared in a parsed scope registry, in declaration order.
export function loadScopeIds(registry) {
  return Object.keys(registry.scopes);
}
