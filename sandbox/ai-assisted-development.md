---
date: 2026-02-03
description: AI-assisted engineering: real-life cases
source: https://t.me/nobilix/215
---

# AI-Assisted Development

[quoted] Vibecoding ≠ AI-assisted engineering

• [Block — AI-Assisted Development at Block](https://engineering.block.xyz/blog/ai-assisted-development-at-block) как перевести 12 тыс. инженеров на AI-assisted разработку и не утонуть. Block запустил программу AI Champions (50 инженеров, 30% времени на enablement), геймифицировал подготовку репозиториев через "Repo Quest" с уровнями, и внедрил подход Research → Plan → Implement с чистым контекстом на каждой фазе. Результат за 3 месяца: AI-authored code +69%, automated PRs выросли в 21 раз. Внутри - детальная диаграмма AI-ready монорепо на 40K+ файлов.

• [OpenAI — Building an AI-Native Engineering Team](https://developers.openai.com/codex/guides/build-ai-native-engineering-team) - cамый полный SDLC-гайд из всей подборки. Для каждой фазы (Plan, Design, Build, Test, Review, Deploy) — четкая таблица: что делегировать агенту, что ревьювить, что остается за человеком. Фреймворк Delegate → Review → Own.

• Anthropiс - [Исследование “How AI Is Transforming Work”](https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic) про "парадокс контроля", стратегии делегирования. [Свежий 2026 Agentic Coding Trends Report](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf), и Борис (создатель СС) много [пишет в twitter](https://x.com/bcherny/status/2007179832300581177) про свои workflow.

• [Spotify — Background Coding Agent](https://engineering.atspotify.com/2025/11/spotifys-background-coding-agent-part-1) - Spotify не дал каждому инженеру Cursor, они надстроили AI поверх существующей системы массовых миграций по тысячам репозиториев. Мульти-агентный pipeline: planning agent → coding agent → pull requests.

• [Uber — uReview: AI-Powered Code Review](https://www.uber.com/blog/ureview/) - Uber покрывает AI-ревью 90%+ из ~65,000 еженедельных дифов по шести монорепозиториям.  Детальнейший публичный разбор AI code review в production: от pipeline архитектуры до выбора моделей.

• [Addy Osmani — My LLM Coding Workflow Going into 2026](https://addyosmani.com/blog/ai-coding-workflow/) - личный workflow ведущего инженера Google Chrome. Spec before code, ultra-granular version control (коммиты как save points), AI-on-AI review. Главный тезис: "AI amplifies your expertise" - без фундамента AI просто усиливает хаос.

For NotebookLM:
https://engineering.block.xyz/blog/ai-assisted-development-at-block
https://developers.openai.com/codex/guides/build-ai-native-engineering-team
https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic
https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf
https://x.com/bcherny/status/2007179832300581177
https://engineering.atspotify.com/2025/11/spotifys-background-coding-agent-part-1
https://www.uber.com/blog/ureview/
https://addyosmani.com/blog/ai-coding-workflow/