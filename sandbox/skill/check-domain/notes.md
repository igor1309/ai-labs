---
date: 2026-02-26
model: claude-opus-4-6
description: "Check Domain skill — research notes and future ideas"
---

# Check Domain — Notes

## Design

Skill + subagent pair pattern:
- **Skill** (`check-domain/SKILL.md`): knowledge — how to check domains, which tools, how to present
- **Agent** (`agents/check-domain.md`): cheap executor — `model: haiku`, inherits all tools
- **Wiring**: skill has `context: fork` + `agent: check-domain`, so `/check-domain example.com` forks directly to haiku without Opus involvement

## MCP Servers

### Instant Domain Search MCP (primary)

Three tools:
- `search_domains` — bulk availability check across TLDs
- `generate_domain_variations` — semantic name alternatives when first choice is taken
- `check_domain_availability` — definitive yes/no against authoritative registries

Free. https://instantdomainsearch.com/mcp

### SebastianBoehler/domain-check-mcp

- `check_domain_availability`, `get_domain_recommendations`, `get_sedo_offers`
- Uses IONOS endpoints (undocumented, TOS risk)
- Install: `npx -y domain-check-mcp`

### ajot-domain-checker-mcp-server

- WHOIS + DNS resolve
- FastMCP Python implementation

## API Services (future)

| Service | What | Free tier |
|---------|------|-----------|
| Abstract Domain Reputation API | Reputation, risk score, blacklists | Free tier |
| FreeWebApi WHOIS API | WHOIS, SSL, NS/DNS | Free, no registration |
| DomScan | Availability, DNS/WHOIS, security | 10K credits/month |
| WhoisXML Domain Reputation API | Reputation scoring (120+ params) | Free trial |
| APIVoid | Domain reputation checker | Free tier with limits |
| DomainOptic | SSL/HTTPS, SPF/DKIM/DMARC, headers, blacklists | Basic scan free |

## Future Ideas

- [ ] Add granular search support (reputation, DNS, WHOIS details)
- [ ] Support multiple MCP servers with priority/fallback
- [ ] Sonnet agent variant for richer analysis (reputation, SEO, branding advice)
- [ ] Batch mode for checking domain lists from file
- [ ] Price comparison across registrars
