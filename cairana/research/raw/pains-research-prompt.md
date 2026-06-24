---
date: 2026-06-24
author: Igor Malyarov
model: gpt-5.5-high
title: pains research prompt
version: 0.0.1
---

Проведи исследование тяжести, частоты и фактической незакрытости (whitespace) болей solo-practitioner психологов и психотерапевтов в части документации, continuity, treatment planning, measurement, reimbursement-defensibility и vendor-risk, по состоянию на лето 2026 года.

Это вторая фаза исследования. Первая фаза (research-prompt.md → deep-research-report.md) покрыла продуктовый ландшафт и дала синтез в solo_practitioner_ai_product_pains.md — таблицу из 7 pain cohorts с продуктами, которые их атакуют. Эта фаза не про продукты. Она про сами боли: насколько они реально тяжёлые/частые/дорогие для solo practitioner независимо от того, что говорят вендоры, и какая часть каждой боли остаётся нерешённой даже после внедрения текущих AI-продуктов.

Жёсткий фокус

Исследуй только evidence, которое:

1. идёт от практикующих специалистов напрямую — опросы, форумы, отзывы на продукты, кейсы, интервью, профессиональные ассоциации — а не маркетинговые страницы вендоров;
2. относится конкретно к solo practitioner или very small practice, а не к enterprise/clinic-wide процессам;
3. даёт content signal по одному из трёх типов:
   - severity / frequency — насколько часто и насколько тяжело специалисты называют это болью;
   - cost — время, деньги, burnout, churn, упущенный reimbursement;
   - whitespace — явное указание, что боль остаётся нерешённой даже после внедрения текущего AI-продукта;
4. относится к одному из 7 pain cohorts ниже (список не закрытый — можно находить новые sub-pains внутри cohort или за его пределами, если evidence сильный).

Не исследуй: маркетинговые claims вендоров без независимого подтверждения, общие рассуждения о будущем AI, этику автономной терапии, продукты как таковые (это уже сделано в первой фазе).

Важно

Seed list ниже — это 7 pain cohorts из cairana/research/solo_practitioner_ai_product_pains.md. Это не закрытый список; если найдёшь evidence на новый sub-pain, который не укладывается ни в один cohort, выдели его отдельно.

Seed list (pain cohorts):

1. Progress-note production is unpaid cognitive labor
2. Notes must fit accepted clinical formats (SOAP, DAP, BIRP, GIRP, PIE, intake, discharge, custom)
3. Treatment plans are hard to keep linked to actual sessions (golden thread: problem → goal → intervention → response → progress → next plan)
4. Session prep and case continuity are weak
5. Outcomes and measures are scattered or underused (PHQ-9, GAD-7, PCL-5, assessments, worksheets)
6. Insurance, audit, and reimbursement defensibility is stressful
7. Using AI with client data creates vendor-risk work (BAA/DPA, retention, deletion, no-training, audit posture)

Seed sources (не закрытый список, используй как старт):

* APA Practitioner Pulse Survey 2025 / 2026;
* JMIR Formative Research 2026 — Talkspace Smart Notes deployment study (286,000+ notes, weekly adoption, quality ratings);
* JAMA Network Open 2025 — ambient AI scribe burnout study (51.9% → 38.8% после 30 дней);
* G2 / Capterra / Trustpilot / Software Advice отзывы на Mentalyc, Upheal, Blueprint, SimplePractice, TherapyNotes, Valant, TheraNest, TherapyAppointment, Owl Practice, JotPsych, Eleos, Oasys;
* Reddit: r/therapists, r/psychotherapy, r/socialwork, r/clinicalpsych, r/TalkTherapy;
* профессиональные ассоциации (APA, NASW, ACA) — отчёты о burnout, administrative burden, documentation time;
* академические статьи о documentation burden / burnout у mental health providers.

Обязательно найди дополнительные источники через поиск по категориям, форумам, отзывам и опросам — не ограничивайся seed-списком.

Что нужно выяснить по каждому pain cohort

Для каждого из 7 (или нового) pain cohort собери:

* severity/frequency evidence: насколько часто и насколько остро специалисты называют это болью — с источником и датой;
* cost evidence: время (часы/неделя на эту задачу), деньги (стоимость ошибок, недополученный reimbursement, отказы payer), эмоциональная нагрузка (burnout, turnover, dissatisfaction);
* product-satisfaction evidence: что говорят пользователи текущих AI-продуктов конкретно про этот pain — отзывы, рейтинги, жалобы, churn, сравнения "до/после";
* whitespace evidence: прямые указания, что даже после внедрения AI-инструмента эта боль остаётся — частично решена, решена плохо, или специалисты вернулись к старому способу;
* confidence: high / medium / low;
* вывод: боль (а) подтверждена сильно независимым evidence, (б) подтверждена слабо/смешанно, (в) не подтверждена независимо — только в продуктовом маркетинге.

Особый фокус: whitespace

Для каждого pain cohort отдельно попробуй найти evidence, что cohort НЕ закрыт полностью ни одним текущим продуктом. Например:

* конкретные жалобы пользователей конкретных AI-продуктов именно на этот pain (не общие "продукт плохой", а специфика: формат не принимается payer, continuity всё равно теряется, измерения всё равно не используются в работе и т.д.);
* кейсы/отзывы, где после внедрения инструмента боль осталась частично решённой;
* статьи/отчёты 2025–2026, описывающие этот gap как нерешённый.

Если whitespace evidence не находится для какого-то cohort — явно укажи это как "no whitespace evidence found", а не пропускай cohort молча.

Метод поиска

1. прямой поиск по pain cohort + "complaint" / "problem" / "still" / "doesn't" / "review";
2. поиск по review-сайтам (G2, Capterra, Trustpilot, Software Advice) с фильтром по конкретным продуктам из solo_practitioner_ai_product_pains.md;
3. поиск по форумам и сообществам терапевтов (Reddit, professional Slack/Discord communities, listservs упоминания в открытом доступе);
4. поиск по опросам и отчётам профессиональных ассоциаций (APA, NASW, ACA) и academic survey data о documentation burden и burnout;
5. поиск по peer-reviewed публикациям (JMIR, JAMA, Psychiatric Services и аналоги) про administrative burden, EHR burden, AI scribe adoption у mental health providers;
6. поиск по case studies вендоров, но с явной проверкой: это независимое подтверждение или маркетинговый материал.

Правила фильтрации

Исключай evidence, если:

* это только маркетинговый текст вендора без независимого подтверждения;
* относится к group practice/enterprise/clinic-wide процессам, а не к solo practitioner;
* не имеет даты или относится к периоду до 2024 без подтверждения, что ситуация не изменилась;
* не привязано ни к одному из pain cohorts и не достаточно сильно для нового cohort.

Если непонятно — помести в раздел "unclear / needs verification" с указанием, чего не хватает для подтверждения.

Выходной формат

Сделай результат в 6 разделах.

1. Executive summary

Коротко: что реально известно о тяжести, частоте и whitespace этих болей у solo practitioner, независимо от продуктового маркетинга.

2. Pain Evidence Map

Таблица:

| # | Pain cohort | Severity / frequency evidence | Cost evidence (time / $ / burnout / churn) | Confidence |

3. Product Satisfaction & Failure Evidence

Таблица:

| # | Pain cohort | Where current products fall short | Quote / signal | Source |

4. Whitespace Map

Таблица:

| # | Pain cohort | Sub-pain unsolved by any current product | Evidence | Candidate wedge angle |

5. Excluded / unclear evidence

Таблица:

| Claim | Why excluded or uncertain | What would be needed to verify |

6. Practical conclusions for cairana

Не философия. Только практические выводы:

* какая боль + под-боль выглядит как сильнейший wedge для solo-practitioner продукта, с учётом independent evidence, а не только продуктовой плотности;
* какие cohorts стоит слить или убрать, если independent evidence слабый;
* какие cohorts стоит разбить на более узкие sub-pains, если evidence указывает на это;
* что нужно проверить до коммита к конкретному wedge (например, прямые интервью с практикующими психологами).

Требования к качеству

* Не используй продуктовую плотность ("много вендоров продают X") как доказательство severity — это смешивает спрос с предложением.
* Каждый важный claim должен иметь источник и дату.
* Предпочитай первичные источники: опросы профессиональных ассоциаций, peer-reviewed публикации, прямые отзывы пользователей, форумы практикующих специалистов.
* Отделяй проверенные факты от маркетинговых заявлений.
* Не подменяй independent evidence повторным цитированием product deep dives из первой фазы.

Финальный результат должен быть пригоден для принятия решения: на какую боль и под-боль cairana должен прицелиться как на wedge, с пониманием, какая часть уверенности основана на независимом evidence, а какая — на предположении.
