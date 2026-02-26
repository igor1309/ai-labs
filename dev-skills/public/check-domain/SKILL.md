---
name: check-domain
version: "0.1.0"
description: >
  Check domain name availability. Use when the user asks to check if a domain
  is available, find alternative domain names, or verify domain registration
  status. Triggers on "check domain", "is domain available", "domain availability",
  "find domain name", "/check-domain".
argument-hint: [domain]
context: fork
agent: check-domain
---

# Check Domain Availability

Check whether a domain name is available for registration and suggest
alternatives if it's taken.

## Workflow

1. **Bulk availability check** — use `mcp__instant-domain-search__search_domains`
   to check the requested domain across common TLDs (.com, .io, .dev, .app,
   .co, .net, .org). Start here for any domain query.

2. **If taken — generate alternatives** — use
   `mcp__instant-domain-search__generate_domain_variations` for semantic
   variations (prefixes, suffixes, brandable modifications — not random strings).

3. **Definitive verification** — use
   `mcp__instant-domain-search__check_domain_availability` to confirm
   availability against authoritative registries before the user acts on results.

## Presenting Results

- Lead with a clear available/taken verdict for the primary domain
- Group results by TLD in a table: domain, status, price if known
- For alternatives, present only the top 5-10 most relevant suggestions
- Flag premium or high-price domains explicitly
- End with the definitive verification result if the user picks a domain

## Fallback

If Instant Domain Search MCP is not available:
- Use `whois` command via Bash to check domain registration
- Use web search to find availability and pricing
- Note that results may be less comprehensive

## Input

The user provides one or more domain names to check. Accept:
- Bare names: `example` (check across TLDs)
- Full domains: `example.com` (check specific domain + suggest TLD alternatives)
- Multiple domains: `example.com coolsite.io` (check each)

$ARGUMENTS
