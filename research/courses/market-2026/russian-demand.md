# Audience Demand & Pain Points — Russian-Speaking / CIS Market

_Research run July 2026 in Russian-language sources (Habr, VC.ru, DTF, T-J, Kommersant, aggregators). Most portals 403 to direct fetch; verbatim quotes drawn from search snippets and article headlines (which in RU media are themselves sharp verbatim sentiment)._

## 1. Non-Tech Cohort (не-технические новички)

### Top pain points & confusions
- **«С чего начать?»** — the single most repeated entry-point question. Overwhelmed by number of tools; don't know which нейросеть for which task.
- **Prompting doesn't produce usable output.** «Секрет в том, чтобы научиться правильно ставить задачи — это называется «промпт-инжиниринг».» "Не получается результат" is the implicit complaint the whole genre answers.
- **Outdated / mismatched instruction.** «интерфейсы сервисов были устаревшими, что критично для новичка.»
- **Fear of the technology / low digital literacy** among older learners. «об опасностях ИИ пишет 71% пользователей старше 40 лет»; older users «используют нейросеть как поисковик» (under-use). Root cause: «не столько возраст, сколько более низкий уровень осведомлённости.»

### Objections & fears (verbatim)
- **«Заменят ли нейросети копирайтеров, дизайнеров и SMM-щиков?»** — defining fear-headline of the creative/non-tech segment.
- **«Замени меня, нейросеть, замени меня полностью»** — anxious-ironic register.
- **Hype fatigue:** «Бесит, что искусственный интеллект теперь везде» (T-J); «В сети назревает тренд «Анти-ИИ»» (4PDA). Real among non-tech too.
- **Safety/harm fears amplified by press:** «Нейросеть довела пенсионера до психбольницы» — feeds a "это опасно" narrative.
- **«Поздно / не для меня»** — countered in copy: «люди 50+ и гуманитарии успешно овладевают навыками, избавляясь от страха.»

### Desired outcomes (their language)
- «Хватит работать вручную» — automate drudgery.
- «Сэкономить время и деньги на рутине»; «Экономия уже в первый месяц»; «тратить 15–20 минут в день.»
- Concrete JTBD: «анализ целевой аудитории, маркетинговый план, контент-план для соцсетей, холодные письма»; «посты, статьи, письма, скрипты; баннеры, логотипы, обложки; аналитика/таблицы.»
- Earnings angle: «навык работы с ИИ — базовая компетенция... полезно тем, кто хочет работать на фрилансе.»

## 2. Tech Cohort (технари, ещё не освоившие AI)

### Top pain points & objections (verbatim)
- **«Сам напишу быстрее»** — the canonical developer objection; a whole Habr genre («от «сам быстрее напишу» до своего фреймворка для агентной разработки»).
- **«Меня бесит использование ИИ в разработке. И я наконец понял почему»** (Habr) — flagship of the skeptic camp.
- **Garbage / hallucinated code:** «выдаёт ерунду»; «заливают целые книги в промпт и на выходе получают «кашу»»; «Поддерживаемый контекст ≠ рабочий контекст.» Anchored by «48% AI-generated code contains vulnerabilities.»
- **De-skilling:** «Как бездумное использование AI убивает экспертизу и превращает разработку в vibe coding»; «потерял базовые навыки... жду, пока ИИ напишет реализацию функции.»
- **"Writing is thinking":** «когда пишешь медленно сам — ловишь ошибки; ИИ генерирует тонны кода → скоростной технический долг.»
- **Hype rejection:** «Я задолбался читать про АИ»; «AGI математически невозможен, но хайп уже не остановить»; «нейросети — это тупик.»
- **Model-degradation distrust:** «почему ваш ИИ тупеет ровно перед выходом новой модели.»

### The fears that block adoption
- **«Заменят ли программистов / джунов?»** — huge genre. Consensus: «ИИ не заменит программистов, он их изменит»; but juniors feel exposed: «ИИ вытеснил джуниоров.» "Вайбкодинг" = слово года.
- **Privacy / commercial-secret leakage** (top enterprise-dev blocker): «Прогонять корпоративную документацию через ИИ — одна из самых серьёзных ошибок»; concept of **«теневой ИИ»** (shadow AI). Distinct RU friction — interacts with data-localization law.

### What converts skeptics (course angle)
- Reframe: «новый навык — делегирование без потери контроля: объяснить, проверить, заметить, если ИИ ушёл не туда»; «конкуренция сместилась с «кто быстрее пишет код» на «кто заставит ИИ писать правильный код»»; «лучшие с ИИ — те, кто отлично работает и без него.»
- Recommended on-ramp order: **start with Cursor or Copilot, not Claude Code** («более доступные точки входа»), then agentic tools.

## 3. Access & Payment Friction (RU-specific)

> **Note (per author, mid-2026):** treat access/VPN/payment logistics as a **webinar topic, not lecture content**. Chinese models (DeepSeek, Qwen) are accessible from RU without VPN, and local models cover the no-friction path — so lectures should center on real work, not access plumbing.

- **ChatGPT not directly usable from Russia** (sanctions + IP blocks → VPN needed). An entire cottage industry of "как оплатить ChatGPT из России" guides exists — a demand signal in itself.
- **Workarounds users employ:** VPN + foreign virtual card (KZ/UAE/TR); Apple ID / Google Play abroad; **Telegram посредники**; foreign friend/relative; RU aggregator resellers (MashaGPT, MTS tools).
- **Local models positioned on the no-VPN/no-foreign-card advantage:**
  - **YandexGPT** — «понимает русский на уровне носителя... российский контекст: законы, культуру, географию»; free in Alisa.
  - **GigaChat (Sber)** — free tier «1000 запросов в месяц», multimodal.
  - **DeepSeek** (Chinese) — «полностью бесплатна и работает из России без VPN» — a real default for cost-sensitive users.
  - Popularity (CNews, Nov 2025): **YandexGPT 60%, GigaChat 56%, Шедеврум 19%**; «YandexGPT и GigaChat обогнали ChatGPT по популярности в России»; «80% оценивают качество отечественных решений как приемлемое.»

## 4. Willingness-to-Pay

- **Mid-market pricing:** ₽40 000–118 900, avg ~₽79 450, 2–3 months. Skillbox flagship ₽74 900; "для бизнеса" ₽94 991.
- **Budget/entry tier growing:** «9 990 ₽ для практического обучения»; a whole Habr genre of «Бюджетные курсы.» Strong price sensitivity, large sub-15k ₽ appetite.
- **ML retraining understood as separate, expensive tier:** «полноценные программы... стартуют от 100 000 ₽.»
- **Value-for-money is the #1 review complaint:** «за эти деньги — развод»; «компиляция публично доступной информации.» Refund-window lock-in noted.
- **Free tools cannibalize low-end WTP** — paid pitch must be transformation/outcome, not tool access.
- **B2B / small-business is the higher-WTP pocket** — "для бизнеса" priced ~20–30% above general.

## 5. Highest-Demand Topics

**Non-tech:** 1) промпт-инжиниринг / «правильно ставить задачи»; 2) тексты (posts, emails, sales scripts); 3) изображения (Midjourney/Шедеврум/Kandinsky); 4) автоматизация рутины; 5) нейросети для бизнеса/ИП; 6) заработок/фриланс; 7) which tool + how to access from RU.

**Tech:** 1) Cursor / Copilot hands-on; 2) agentic dev / Claude Code; 3) «делегирование без потери контроля»; 4) spec/requirements-driven AI dev; 5) not losing skills; 6) enterprise-safe usage (avoiding «теневой ИИ»).

## 6. Russian Marketing-Phrase Bank (verbatim)

**Pain / hook (non-tech):** «С чего начать?» · «Хватит работать вручную» · «Не нужно быть программистом или технарём» · «Промпты не получаются» → «Научитесь правильно ставить задачи» · «Сэкономить время и деньги на рутине» · «Экономия уже в первый месяц / 15–20 минут в день» · «Без VPN и зарубежных карт» · «Гуманитарии и 50+ успешно осваивают.»

**Fear-to-reframe (non-tech):** «Заменят ли нейросети копирайтеров?» → «Нейросети не заменят вас — они дают новые возможности» · «Главный секрет — прокачанный навык работы с ними.»

**Pain / hook (tech):** «Сам напишу быстрее» (the objection to name and dismantle) · «Будь на правильной стороне прогресса» · «Конкуренция сместилась на «кто заставит ИИ писать правильный код»» · «Делегирование без потери контроля» · «Как использовать ИИ и не потерять навыки.»

**Fear-to-reframe (tech):** «ИИ не заменит программистов — он их изменит» · anti-«скоростной технический долг» · «Как безопасно пользоваться ИИ и не слить коммерческую тайну» (B2B).

**Skeptic vocabulary to acknowledge:** «хайп», «пузырь», «выдаёт ерунду / кашу», «галлюцинации», «нейросеть врёт», «задолбался читать про АИ», «Анти-ИИ», «теневой ИИ».

## 7. Sources
- Non-tech: https://netology.ru/programs/chat-gpt , https://practicum.yandex.ru/blog/gajd-po-nejrosetyam/ , https://t-j.ru/short/neuro-to-use/ , https://habr.com/ru/articles/886440/
- Fears/hype: https://habr.com/ru/companies/alfa/articles/807353/ , https://t-j.ru/iskusstvennyi-intellekt-hate/ , https://4pda.to/2025/12/16/450762/ , https://www.kommersant.ru/doc/7714639
- Tech skepticism: https://habr.com/ru/articles/1021210/ , https://habr.com/ru/articles/1044322/ , https://habr.com/ru/articles/898236/ , https://habr.com/ru/articles/974176/comments/
- Replace-junior: https://forklog.com/news/ai/ , https://thecode.media/ai-ne-zamenit-junior-developers/
- Access/local models: https://vc.ru/services/2655025 , https://vc.ru/chatgpt/952496 , https://www.computerra.ru/328547/ , https://dtf.ru/top_rating/4777561
- Privacy: https://t-j.ru/ai-confidential/ , https://russian.rt.com/nopolitics/article/1638849
- Pricing/WTP: https://kurshub.ru/kursy/promt-inzhiniring-kursy/ , https://habr.com/ru/articles/1053774/

### Takeaways
1. **RU access friction is a real differentiator — but a webinar topic, not a lecture focus.** Chinese (DeepSeek/Qwen) + local (YandexGPT/GigaChat) cover the no-VPN path.
2. **Non-tech buyers want fast rutina-automation + фриланс outcomes**, burned by "развод" repackaged-free-content courses — lead with concrete JTBD.
3. **Tech buyers blocked by «сам напишу быстрее», de-skilling fear, hallucinated-code distrust, commercial-secret risk** — winning frame: «делегирование без потери контроля» + «заставить ИИ писать правильный код», Cursor→Copilot→agentic on-ramp.
