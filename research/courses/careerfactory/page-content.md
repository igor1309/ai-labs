---
date: 2026-05-28
model: claude-opus-4-8
description: "Structured extraction of the CareerFactory 'Вайб-кодинг на максималках' AI course landing page"
source_url: "https://ai.careerfactory.ru/"
---

# CareerFactory Vibe-Coding Course Page Content

## Source

- Page: [Вайб-кодинг на максималках. IT архитектура с AI](https://ai.careerfactory.ru/)
- Author/instructor: Глеб Михеев (Gleb Mikheev), Ex-CPO Skyeng.
- Extraction scope: text content only. The site is a Vue single-page app; text was recovered from the rendered route and bundled section chunks (landing, tariffs, reviews, public lectures, footer). Decorative images, screenshots, review images, and purely visual elements are omitted.

## Source Discrepancies

These inconsistencies exist in the source itself and are preserved here rather than silently corrected:

- The instructor is named **Глеб Михеев** in the hero, structured data, and bios, but one heading in the public-lectures section reads **Глеб Кудрявцев** (apparent template leftover).
- The legal seller in the footer is a third party: **ИП Федоров Егор Павлович**, not the instructor.
- The embedded structured data (JSON-LD) carries stale price validity dates (`priceValidUntil: 2025-10-13`), and a banner states the discount runs "until 30 April" — both predate this extraction (2026-05-28) and read as evergreen marketing copy.

## Positioning

The course is positioned as a fast, practical path for **non-developers** to build real, production-style applications using AI ("vibe coding"), without spending a year learning a programming language.

Core promise:

- "Become a real programmer in 8 weeks, not a year."
- You have probably heard that anyone can now write programs and sites with vibe coding, but you lack the IT knowledge to get a real result. After the course you can build sites and services with a clear understanding of how everything works.
- The author frames his method as "vibe coding for a healthy person" — neither the oversimplified "just install Cursor" pitch nor the "you must be a programmer" gatekeeping.

Three hero bullets:

- It is real programming.
- You do not need to learn a language.
- It is much faster.

## Basic Course Facts

- Duration: 8 weeks.
- Object of practice: each participant builds their own working Telegram bot.
- Format: live webinars twice a week plus recordings, with a practical homework assignment each week.
- Schedule: Mondays and Wednesdays at 18:00 MSK, lectures about 2 hours, with live Q&A.
- Start: June for the "Вместе с группой" and "Лично с Глебом" tariffs. The "Только посмотреть" and "В сообществе" tariffs can be paid at any time with immediate access to recordings.
- Stack/tools introduced: Git, GitHub, Cursor, Docker, tunnels, hot reload, logs, frontend/backend/database/API concepts, LLM integration, VPS deployment, domains.
- No prior programming experience required.

## Target Audience

The course targets non-developers and aspiring builders. The "Узнаёте себя?" (Do you recognize yourself?) section frames the buyer through three questions:

- You have a great startup idea but no money for a prototype — build it yourself.
- You are afraid your skills will become obsolete as AI and neural networks advance rapidly.
- You feel frustration and dependence on technical specialists and want to control the process yourself and see results quickly.

If the reader answers "yes" to at least one, the course is presented as being for them.

Stated reassurances for this audience:

- The hardest part of vibe coding is starting, so a starter template and graded assignments (simple to complex) are provided.
- Participants can chat and help each other with assignments.
- An LLM is the best helper for learning vibe coding; the author shows how to use models effectively so code stops being intimidating.

## Market Context: "Vibe Coding Is the New Excel"

The page argues that working with AI product-building tools is becoming a required skill, not only for developers, and lists market signals:

- Product-manager interviews now include real-time tasks where candidates build applications with AI.
- Some companies allow candidates to use AI assistants during technical coding interviews.
- A share of startups in a recent cohort use AI to write 95% of their code, letting them grow ~10% per week.
- Companies post vacancies requiring vibe-coding experience or familiarity with AI coding tools.
- Prototype-building homework with AI has been added to PM interview processes.

Conclusion stated on the page: within 1-2 years this skill will be on every second résumé; learn it now to stay ahead.

## The Author's Approach (Differentiation)

The page contrasts the course with two failure modes in the market: pitches that are "too simple" ("just install the cursor") and pitches that say it is "too complex, you must be a programmer." The author claims his own path: teaching how to be a real programmer, but without a year of study, by teaching real programming concepts.

Three value cards:

### Real Programming Concepts

Work happens with real development tools used by professionals, not app constructors or toys. The course deliberately skips language syntax and minor details (which take years and which neural networks already handle). Participants can build working applications within a month.

### Security and Independence

Teaches deploying projects on inexpensive VPS instead of getting locked into constructors that drain money monthly. Emphasizes digital hygiene: not leaking passwords and API keys when working with AI tools.

### Real Development, Not Toys

Shows practices from real IT companies — the foundation for serious, scalable, production-ready products. "Production, deploy, and other scary words" become understandable everyday concepts.

Stated result: participants do not just assemble apps in a constructor — they understand how developers think and how to build real, scalable applications.

## Program

The 8-week program is organized into four two-week blocks, each anchored on building the Telegram bot.

### Weeks 1-2: Git and Launching the First Project

- Work with Git like a real developer — commits, branches, GitHub.
- Set up professional tools: Cursor, Docker, tunnels.
- Launch a first project with hot reload and learn to read logs.
- Result: a fully configured development environment and a first working project in the participant's GitHub profile.

### Weeks 3-4: Architecture and the First Telegram Bot

- Understand the building blocks of all IT products: frontend, backend, database, API.
- Create a first working bot with an admin panel.
- Learn digital security — protecting API keys and passwords.
- Result: a working Telegram bot with an admin panel that safely stores user data.

### Weeks 5-6: AI Integrations and Smart Functionality

- Connect a large language model (LLM) to the bot.
- Learn to write effective prompts and control token spending.
- Add memory and tool-calling so the bot can work with databases and execute complex commands.
- Result: an intelligent AI bot that remembers context and can automate real tasks.

### Weeks 7-8: Deploy and Scaling

- Deploy the bot to a real server (VPS), set up a domain, and run it 24/7.
- Learn advanced vibe-coding techniques and how to maintain a project like real IT companies do.
- Result: a finished product running on the internet 24/7 and the skills to build new projects.

The page summarizes: every participant builds their own Telegram bot in 8 weeks. The author states he does not believe in theory — each week has a webinar and a practical homework assignment moving toward a finished, self-built application.

## Outcomes Promised ("Your New Reality")

What participants should feel after 8 weeks:

- Freedom: an idea can be realized over a weekend, without depending on developers and budgets.
- Confidence: possession of an in-demand skill that sets the participant above other candidates.
- Speed: test hypotheses and launch projects in days, not months.
- Surprise: the realization that they can build an app themselves, without a programmer.

Concrete end states described:

- You know how to make your product and can build a prototype yourself.
- Your portfolio is made of links to live, working projects, not ideas.
- You receive an offer from a dream company because you easily handled the vibe-coding task in the interview.

## Comparison Table (Сравните сами)

The page compares three options across cost, term, and result:

| Your choice | Cost | Term | Result |
|---|---|---|---|
| Hire developers | from 500,000 ₽ | per month | 90% take the money without delivering a result; full dependence on the contractor. |
| Learn to program (Python/JS) | from 150,000 ₽ | per year | Long and hard — a marathon, not a sprint; and developers themselves are now switching to neural networks. |
| Our course | from 19,900 ₽ | weeks | You can now build any product yourself in a couple of weeks. (highlighted) |

## Tariffs

Four tariffs are offered. Amounts below are the current prices, with the struck-through original amount in parentheses. A promo code grants an additional 10% discount; installment payment ("частями без переплат") and single-payment options are shown.

### Только посмотреть (Watch only)

- Price: 19,900 ₽ (original 24,875 ₽).
- Start: any time.
- Included: video lessons + homework; recordings available for 3 months after the course ends.
- Not included: group chat; networking / peer help; live webinars; personal answers from Gleb during the course; completion certificate.

### В сообществе (In the community)

- Price: 29,900 ₽ (original 37,375 ₽).
- Start: any time.
- Included: everything in "Только посмотреть"; recordings available for 6 months; group chat; networking and peer help with tasks.
- Not included: live webinars; personal answers from Gleb; completion certificate.

### Вместе с группой (Together with the group)

- Price: 44,000 ₽ (original 54,000 ₽).
- Start: June stream.
- Included: permanent access to recordings after the course; live webinars; personal answers from Gleb during the course; completion certificate.

### Лично с Глебом (One-on-one with Gleb)

- Price: 154,000 ₽ (original 164,000 ₽).
- Included: everything in "Вместе с группой"; a personal session on the participant's requests; unlimited questions to the author in Telegram.

## Promo and Discounts

- A 10% discount is advertised, with a banner: "Discount valid until 30 April" and "Stream starts in June — lock in the price."
- A promo code field grants an additional 10% on all tariffs.
- (See discrepancy note: these dates are evergreen marketing copy and predate this extraction.)

## Additional Page Sections

- A "Видео о курсе" (video about the course) block.
- "Демо материалы лекций" (demo lecture materials).
- "Публичные лекции" — a carousel of recorded live streams and talks.
- "Отзывы о курсе" — a slider of student reviews, presented as screenshot images (text not extractable).
- A quiz: "Проверь свои знания в LLM" (Test your LLM knowledge).

## Author

Глеб Михеев is presented as:

- Ex-CPO of Skyeng.
- A serial entrepreneur who has launched several of his own businesses, taking them from 0 to 1.
- A self-described "100x developer" who replaces a whole team by himself.
- The author of a popular agentic-coding program.
- Someone who claims deep understanding of neural networks and how to make them produce exactly what is needed.

His narrative: building products used to be long, expensive, and hard; vibe coding was a turning point that removed the need for expensive developers.

## FAQ

### Do I need to know how to program?

No. But the course will look at code, so be ready not to faint at the sight of it. Code is not written by hand — the neural network writes it.

### Who is the course for?

Those with the desire and persistence to figure out unclear things by asking the neural network or fellow students. No formal IT education or experience is required.

### When can I start?

The stream starts in June for the "Вместе с группой" and "Лично с Глебом" tariffs — classes twice a week, Mondays and Wednesdays at 18:00. The "Только посмотреть" and "В сообществе" tariffs can be paid at any time with immediate access to recordings.

### If I do not like it, will you refund my money?

By law, money can be refunded minus services actually rendered. For "Только посмотреть," the service is considered rendered at the moment recordings are provided. For tariffs with lecture attendance, refunds are proportional to the number of lectures attended.

### Do you guarantee a result?

No. Learning success depends more than half on the student, so without getting to know the student the author cannot guarantee it. He guarantees maximum effort and engagement to teach, plus access to all recordings and course materials.

## Legal Information

Seller information shown in the footer:

- Individual entrepreneur: ИП Федоров Егор Павлович.
- INN: 532008901966.
- OGRN: 317532100001264.

Documents linked from the page:

- Privacy / data-processing policy ("Политика обработки данных").
- Public offer ("Публичная оферта").
