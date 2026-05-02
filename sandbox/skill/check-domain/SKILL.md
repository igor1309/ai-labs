---
name: domain-search
description: >
  This skill should be used when the user asks to "find a domain",
  "check domain availability", "search for domain names",
  "suggest domain names", "brainstorm domains for my project",
  "is example.com available", or mentions finding/buying/registering
  a domain name.
---

# Domain Name Search

Search, validate, and brainstorm domain names using the
Instant Domain Search MCP — sub-10ms responses, no API key required.

## Available Tools

Three MCP tools are available from the `instant-domain-search` server:

- **`mcp__instant-domain-search__search_domains`** — Bulk availability
  check across chosen TLDs. Start here for any domain query.
- **`mcp__instant-domain-search__generate_domain_variations`** —
  Semantic name alternatives when first choice is taken (prefixes,
  suffixes, brandable modifications — not random strings).
- **`mcp__instant-domain-search__check_domain_availability`** —
  Definitive yes/no verification against authoritative registries.

## Workflow

### Quick availability check

1. Use `search_domains` with the user's name and desired TLDs
2. Present results as a table: domain, available (yes/no), notes
3. If primary choice is taken, automatically call
   `generate_domain_variations` and present alternatives

### Brainstorming session

1. Gather project context: name, industry, keywords
2. Use `generate_domain_variations` with the core concept
3. Batch-verify top candidates with `check_domain_availability`
4. Present a ranked shortlist with availability status

### Bulk validation

1. Accept a list of domains (array, CSV, or newline-separated)
2. Use `check_domain_availability` for authoritative verification
3. Return structured results

## Guidelines

- Always verify with `check_domain_availability` before telling
  the user a domain is definitively available.
- Present results in tables for easy scanning.
- When a domain is taken, proactively suggest alternatives —
  don't wait for the user to ask.
- Queries go to authoritative registries (Verisign, PIR),
  not retail registrars — no front-running risk.

## Additional Resources

- **`references/workflow-patterns.md`** — Advanced patterns:
  competitor analysis, TLD strategy, brand-safe filtering
