---
date: 2026-02-21
inspiration: >
  https://habr.com/ru/articles/1000816/
  https://ai-fire.ru/ru
---

# Am I done?

Toy app: one-shot quiz for specific questions like “I’m a software developer, is AI taking my job? What time is left for me?” - and names a profession.

## Front
Text input form for profession.
Multilingual for v2

### State
- idle
- queried: sent query to backend
- failed on timeout
- backend response

### Event
- Send non-empty query
- Receive response (Result)

### Effect
- Query

### Reducer
Quite straightforward

### Effect Handler
HTTPS with timeout

## Backend
Composition of components

### Guard
Prompt injection guardian
Fast failure
Simple regex for v1

### Cache
Fast answer for similar queries (professions)
Fuzzy match, cheap LLM
Increment counter
Caches responses with counter 1

### Query Service // or better name
Compose system prompt / use from config
Compose user prompt / use from config
Simple async response for v1 (no partial streaming)
Queries async API (protocol!)

### Cache decorator
Composition
Wraps Query Service with caching on success preserving same interface

### OpenRouter Adapter
Composition
Adapts OpenRouterAPI for Query Service

## OpenRouterAPI
Config to select model
