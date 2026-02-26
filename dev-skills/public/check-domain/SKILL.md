---
name: check-domain
version: "0.2.1"
description: >
  Check domain name availability and find alternatives.
argument-hint: [domain]
model: haiku
disable-model-invocation: true
context: fork
agent: check-domain
allowed-tools:
  - "mcp__plugin_dev-skills_instant-domain-search__*"
  - "mcp__instant-domain-search__*"
---

**Announce:** "I'm using the check-domain skill to check domain availability."

# Check Domain Availability

Check whether a domain name is available for registration and suggest
alternatives if it's taken.

## Required: Instant Domain Search MCP

This skill requires the `instant-domain-search` MCP server. If the MCP tools
(`mcp__instant-domain-search__*`) are not available, **stop immediately** and
tell the user:

> Instant Domain Search MCP is not configured. Install it from
> https://instantdomainsearch.com/mcp and add it to your MCP settings.

Do not fall back to whois, web search, or any other method.

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

1. Use `search_domains` with the user's name and desired TLDs
2. Present results as a table: domain, available (yes/no), notes
3. If primary choice is taken, automatically call
   `generate_domain_variations` and present alternatives
4. Verify with `check_domain_availability` before telling
   the user a domain is definitively available

## Guidelines

- Present results in tables for easy scanning.
- Queries go to authoritative registries — no front-running risk.
  Mention this to the user if they express concern about privacy.

## Input

The user provides one or more domain names to check. Accept:
- Bare names: `example` (check across TLDs)
- Full domains: `example.com` (check specific domain + suggest TLD alternatives)
- Multiple domains: `example.com coolsite.io` (check each)

$ARGUMENTS
