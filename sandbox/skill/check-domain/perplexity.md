---
source: https://www.perplexity.ai/search/naidi-mcp-dlia-proverki-domena-yPb7mXDcTj67rSbQx.Fl1w#0
---

Нашёл несколько MCP и дам подборку API‑сервисов.

## MCP для проверки домена

1. **SebastianBoehler/domain-check-mcp** – MCP‑сервер для проверки доступности домена и получения рекомендаций, использует IONOS эндпоинты (недокументированные, TOS‑риск). [github](https://github.com/SebastianBoehler/domain-check-mcp)
   - Инструменты: `check_domain_availability`, `get_domain_recommendations`, `get_sedo_offers`. [github](https://github.com/SebastianBoehler/domain-check-mcp)
   - Установка: `npx -y domain-check-mcp`. [github](https://github.com/SebastianBoehler/domain-check-mcp)

2. **ajot-domain-checker-mcp-server** – MCP‑сервер, который проверяет доступность домена через WHOIS и DNS‑резолв. [lobehub](https://lobehub.com/mcp/ajot-domain-checker-mcp-server)
   - Реализация на FastMCP, запуск обычным Python‑скриптом, конфиг в `mcpServers` через `command` + `args`. [lobehub](https://lobehub.com/mcp/ajot-domain-checker-mcp-server)

3. **Instant Domain Search MCP** – официальный MCP от InstantDomainSearch, даёт реальный поиск доменов, генерацию и валидацию списков. [instantdomainsearch](https://instantdomainsearch.com/mcp)
   - Позиционируется как бесплатный MCP для Claude / ChatGPT / Cursor, поверх их доменного API. [instantdomainsearch](https://instantdomainsearch.com/mcp)

Если надо «качественный» и без серых эндпоинтов – логичнее смотреть на Instant Domain Search MCP и ajot‑сервер (WHOIS/DNS). [lobehub](https://lobehub.com/mcp/ajot-domain-checker-mcp-server)

## Бесплатные сервисы проверки домена с API

Ниже – именно API/HTTP‑сервисы, которые можно дергать из своего кода (условно бесплатные с лимитами):

| Сервис | Что проверяет | Бесплатность/лимиты | Ссылка |
| --- | --- | --- | --- |
| Abstract Domain Reputation API | Репутация домена, риск‑скор, блэклисты, WHOIS/DNS сигналы | Есть бесплатный тариф, позиционируется как free reputation checker + API |  [abstractapi](https://www.abstractapi.com/domain-reputation-checker) |
| FreeWebApi WHOIS API | WHOIS, SSL‑сертификат, NS/DNS lookup | Бесплатный WHOIS/SSL/NSLookup API, без явной регистрации, построен на прокси‑инфре |  [freewebapi](https://freewebapi.com/data-apis/whois-api/) |
| DomScan Domain Intelligence API | Доступность домена, DNS/WHOIS, security‑чеки, оценка | Даёт до 10 000 бесплатных кредов/месяц |  [domscan](https://domscan.net) |
| EasyDMARC Reputation Check | Репутация и блэклисты домена/IP | Веб‑инструмент без регистрации, можно обернуть в свой слой (официальный API не акцентируется как free, но сами проверки free) |  [easydmarc](https://easydmarc.com/tools/ip-domain-reputation-check) |
| DomainOptic | SSL/HTTPS конфигурация, SPF/DKIM/DMARC/DNSSEC, хедеры, блэклисты, утечки API‑ключей в JS | Базовый скан домена бесплатен, без карты, подходит как external security‑audit API (scraping/обёртка) |  [domainoptic](https://domainoptic.com) |
| WhoisXML Domain Reputation API | Репутация домена и IP, скоринг по 120+ параметрам | Есть бесплатный trial, далее платно, но технически полноценный API |  [domain-reputation.whoisxmlapi](https://domain-reputation.whoisxmlapi.com) |
| APIVoid Domain Reputation | Онлайновый репутационный чекер домена | Есть веб‑tool, у APIVoid также есть domain reputation API (free tier с лимитами) |  [apivoid](https://www.apivoid.com/tools/domain-reputation-check/) |

Если нужно строго «по API и без scraping»:

- Абсолютно API‑ориентированные: **Abstract**, **FreeWebApi WHOIS**, **DomScan**, **WhoisXML**, **APIVoid**. [abstractapi](https://www.abstractapi.com/domain-reputation-checker)
- Для «security posture» домена: **DomainOptic** (SSL, SPF/DKIM/DMARC, headers, blacklist, JS‑keys). [domainoptic](https://domainoptic.com)

Могу дальше:  
- подобрать под твой стек (Node/Swift/Go) с примером запросов,  
- или собрать минимальный свой MCP‑сервер поверх выбранного API (например, DomScan + Abstract).