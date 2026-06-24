---
title: "Регуляторная проверка AI-ассистента для практики психолога"
description: "Практический checklist для проверки EHR, AI notes, AI scribe и других AI-инструментов перед использованием с клиентскими данными"
version: "1.0"
status: "working-note"
date: "2026-06-24"
language: "ru"
jurisdictions:
  primary:
    - "EU / EEA"
    - "Finland"
  secondary:
    - "US / HIPAA context"
scope: "ИИ как ассистент психолога: documentation, AI notes, session prep, summaries, materials, measurement-based care. Автономная терапия, автоматическая диагностика и самостоятельные clinical decisions исключены"
tags:
  - ai-assistant
  - psychology
  - regulatory
  - gdpr
  - dpa
  - hipaa
  - baa
  - ai-act
  - ehr
  - ai-notes
---

# Регуляторная проверка AI-ассистента для практики психолога

## 1. Рабочая позиция

ИИ-инструмент можно рассматривать для практики психолога, если он используется как ассистент:

- черновик clinical note;
- summary;
- session prep;
- treatment plan draft;
- client handout;
- homework draft;
- administrative message;
- measurement-based care summary.

Не рассматривать в этом контуре:

- autonomous therapy;
- автоматическую диагностику;
- самостоятельное clinical decision-making;
- самостоятельную оценку риска;
- автоматическое заключение без review-and-sign специалистом.

---

## 2. Главная регуляторная развилка

Перед выбором инструмента надо определить, какие данные в него попадают.

### A. Без клиентских данных

Примеры:

- “сделай шаблон psychoeducation handout про тревогу”;
- “перепиши общий текст informed consent”;
- “сделай список вопросов для intake без данных клиента”.

Регуляторный риск ниже. Всё равно нельзя вставлять идентифицируемую информацию.

### B. Обезличенный или псевдонимизированный кейс

Пример:

- “клиент А, мужчина 35 лет, тревога на работе, избегание переговоров”.

Риск остаётся. Психотерапевтический контекст может идентифицировать человека даже без имени.

### C. Клиентские заметки / шкалы / history

Пример:

- progress notes;
- intake form;
- PHQ-9/GAD-7/PCL-5;
- treatment plan;
- email клиента.

Это health data / special category data в GDPR-контексте.

### D. Аудио или транскрипт сессии

Самый чувствительный рабочий слой.

Проверка vendor обязательна: DPA, sub-processors, retention, deletion, training use, storage location, access controls.

---

## 3. EU / GDPR: базовая модель

Для практики в ЕС рабочая модель обычно такая:

- психолог или клиника = **controller**;
- AI scribe / EHR / transcription vendor = **processor**;
- cloud, speech-to-text, LLM provider = возможные **sub-processors**.

Если vendor сам определяет цели обработки или использует данные для собственных целей, он может перестать быть простым processor. Это красный флаг для клинического workflow.

---

## 4. Что проверить по GDPR

### 4.1. DPA

DPA должен быть доступен до загрузки клиентских данных.

Проверить:

- предмет обработки;
- срок обработки;
- характер и цель обработки;
- категории персональных данных;
- категории data subjects;
- обязанности controller;
- обязанности processor;
- режим sub-processors;
- security measures;
- breach notification;
- return/delete data после завершения договора;
- audit / information rights;
- запрет или ограничения на model training.

Минимальное решение: нет DPA — не загружать клиентские данные.

### 4.2. Controller / processor roles

Проверить, что vendor явно признаёт роль processor, если он обрабатывает данные от имени практики.

Красные флаги:

- vendor не может объяснить свою роль;
- terms говорят, что данные могут использоваться для “service improvement” без ясного запрета на training;
- vendor оставляет за собой право использовать clinical data для собственных целей;
- нет понятного списка sub-processors.

### 4.3. Special category data

Данные психологической практики почти всегда попадают в health data / special category data.

Проверить:

- lawful basis для основной обработки;
- exception under Article 9 GDPR;
- профессиональную тайну / confidentiality;
- минимизацию данных;
- access control;
- retention;
- deletion;
- export;
- safeguards.

### 4.4. Sub-processors

Проверить:

- список sub-processors;
- где они находятся;
- что каждый делает;
- есть ли LLM provider среди sub-processors;
- есть ли speech-to-text provider;
- есть ли analytics/support tools;
- как vendor уведомляет о новых sub-processors;
- можно ли object to new sub-processors.

### 4.5. International transfers

Проверить, уходят ли данные за пределы EEA.

Если да:

- какой transfer mechanism используется;
- есть ли SCCs;
- есть ли transfer impact assessment;
- где physically/logically хранятся данные;
- попадают ли backups и logs в тот же режим.

### 4.6. Training use

Критический пункт.

Для клиентских данных нормальная позиция:

- no training on customer data;
- no training on audio;
- no training on transcripts;
- no training on notes;
- no human review except controlled support/security cases;
- support access only by permission and logged.

Фраза “we may use data to improve services” без исключения clinical/customer content — красный флаг.

### 4.7. Retention и deletion

Проверить отдельно для:

- audio;
- transcript;
- generated notes;
- prompts;
- model outputs;
- logs;
- backups;
- support tickets;
- analytics events.

Нужен понятный ответ: что хранится, где, сколько, как удалить, что остаётся в backups.

### 4.8. Security controls

Минимально проверить:

- encryption in transit;
- encryption at rest;
- role-based access;
- MFA;
- audit logs;
- least privilege;
- incident response;
- breach notification;
- data export;
- account deletion;
- access revocation;
- support access logging.

### 4.9. DPIA

DPIA стоит рассматривать как обязательную рабочую проверку, если инструмент обрабатывает аудио, транскрипты, health data, шкалы, risk data или longitudinal case history.

DPIA должна ответить:

- какие данные обрабатываются;
- зачем;
- кто имеет доступ;
- какие риски для клиента;
- какие safeguards;
- что будет при breach;
- как реализуются права клиента;
- как ограничено использование данных;
- какие alternatives есть без AI;
- почему выбранный режим пропорционален.

---

## 5. EU AI Act: практическая граница

AI Act надо читать через intended use.

### Низкий практический риск

- general drafting;
- psychoeducation templates;
- administrative text;
- general session preparation prompts без client data.

### Средний практический риск

- AI notes;
- treatment plan drafts;
- case summaries;
- measurement summaries;
- session prep на основе client history.

Требуется review-and-sign, понятный vendor, data protection controls.

### Высокий практический риск

- triage;
- risk scoring;
- treatment recommendation;
- prioritization of clients;
- automated clinical decision support;
- automated assessment of suicide/self-harm risk;
- profiling клиента.

Для такой зоны нужен отдельный legal/regulatory review. В обычный assistant workflow это не включать.

---

## 6. Finland: практические особенности

Для практики в Финляндии GDPR остаётся базовым режимом, но есть местный healthcare data context.

Проверить:

- является ли практика health care provider в соответствующем смысле;
- какие patient record obligations применимы;
- используется ли Kanta / Patient Data Repository;
- входит ли AI-generated note в официальную patient record;
- где происходит review-and-sign;
- как обеспечивается traceability;
- как клиент может получить доступ к записи;
- как исправляются ошибки в записи;
- как хранится audit trail.

Kanta указывает, что patient data в Patient Data Repository используется public и private healthcare, доступ к данным должен быть только при необходимости лечения, доступы управляются health care provider, а обращения к данным оставляют traceable log.

Практический вывод: AI note не должен попадать в официальный контур как “готовая запись” без проверки специалистом.

---

## 7. US / HIPAA-контекст

HIPAA актуален, если workflow попадает в американский regulated healthcare context.

### Проверить

- является ли практика covered entity;
- является ли vendor business associate;
- подписывает ли vendor BAA;
- покрывает ли BAA именно AI notes / transcription / storage / LLM processing;
- кто sub-processors;
- есть ли breach notification terms;
- есть ли PHI use restrictions;
- есть ли return/delete PHI;
- есть ли safeguards.

Минимальное решение: HIPAA-context + PHI + нет BAA = не использовать для клиентских данных.

### HIPAA-compliant ≠ достаточно

Маркетинговая фраза “HIPAA-compliant” не равна подписанному BAA.

Нужно проверить именно:

- BAA;
- covered services;
- PHI handling;
- sub-processors;
- breach terms;
- retention and deletion.

---

## 8. Vendor checklist

### 8.1. Документы

Запросить или найти:

- DPA;
- privacy policy;
- security page;
- sub-processors list;
- data retention policy;
- deletion policy;
- model training policy;
- incident response / breach notification terms;
- BAA, если нужен HIPAA;
- SCCs / transfer terms, если данные выходят за EEA.

### 8.2. Product questions

Спросить vendor:

1. Where is customer data stored?
2. Is audio stored? For how long?
3. Are transcripts stored? For how long?
4. Are prompts and outputs stored?
5. Is customer data used for model training?
6. Are customer data manually reviewed by staff?
7. Which LLM provider is used?
8. Is the LLM provider a sub-processor?
9. Can we disable audio retention?
10. Can we delete transcripts automatically?
11. Can we export all notes?
12. Can we delete all customer data after termination?
13. Are access logs available?
14. Is support access logged and permission-based?
15. Do you sign a DPA?
16. Do you sign a BAA?
17. Do you support EU data residency?
18. What happens to backups after deletion?

### 8.3. Workflow questions

Проверить внутри практики:

- кто включает запись;
- как фиксируется consent, если он нужен;
- кто проверяет AI note;
- где хранится draft;
- когда draft становится official note;
- кто может видеть transcript;
- удаляется ли audio после note generation;
- как исправляются ошибки;
- как отмечается, что note reviewed by clinician;
- как отключить AI для конкретного клиента;
- что делать при ошибочной генерации.

---

## 9. Красные флаги

Не использовать с клиентскими данными, если:

- нет DPA;
- нет ясной роли processor;
- vendor не раскрывает sub-processors;
- vendor использует clinical/customer data для training по умолчанию;
- нет deletion controls;
- нет retention policy;
- нет ответа по audio/transcript storage;
- support staff имеет unrestricted access;
- нет breach notification terms;
- данные уходят за EEA без понятного transfer mechanism;
- HIPAA-контекст есть, PHI есть, BAA нет;
- продукт позиционируется как autonomous therapist, а не assistant;
- продукт предлагает diagnosis/risk/treatment decisions без specialist review.

---

## 10. Практическая классификация инструментов

| Тип инструмента | Можно рассматривать? | Условие |
|---|---:|---|
| General LLM для общих шаблонов | Да | Без клиентских данных |
| General LLM для обезличенных кейсов | Осторожно | Минимизация и отсутствие идентифицируемого контекста |
| AI scribe для сессий | Да | DPA, retention, no training, review-and-sign |
| EHR с AI notes | Да | DPA, security, audit trail, export/delete |
| Measurement-based care assistant | Да | Понятный data workflow и review |
| AI clinical decision support | Отдельная проверка | High-risk / medical/legal review |
| Autonomous therapist | Нет | Вне этого workflow |
| Автоматическая диагностика | Нет | Вне этого workflow |
| Самостоятельный suicide risk scoring | Нет | Вне этого workflow |

---

## 11. Минимальный безопасный контур для solo practice в ЕС

1. Использовать general LLM только без идентифицируемых клиентских данных.
2. Для AI notes выбирать специализированный vendor.
3. До загрузки клиентских данных получить DPA.
4. Проверить no-training policy.
5. Проверить sub-processors.
6. Проверить storage location и transfer mechanism.
7. Отключить или минимизировать audio retention.
8. Сохранять только проверенные notes.
9. Не переносить в EHR непроверенные AI drafts.
10. Разделить internal draft и official clinical record.
11. Вести список используемых AI tools.
12. Периодически пересматривать vendor terms.

---

## 12. Decision rule

### Можно использовать

- данные минимизированы;
- vendor подписывает DPA;
- нет training on client data;
- понятны sub-processors;
- понятен retention/deletion;
- есть access controls;
- специалист проверяет и утверждает результат.

### Нельзя использовать для клиентских данных

- нет DPA;
- нет прозрачности по данным;
- нет контроля retention;
- данные используются для training;
- нет review-and-sign;
- продукт делает самостоятельные clinical decisions.

### Требует отдельной проверки

- triage;
- risk scoring;
- treatment recommendation;
- automated monitoring;
- profiling;
- работа с minors;
- cross-border data transfer;
- integration with official patient record systems;
- HIPAA-regulated workflow.

---

## 13. Источники

- EU GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng
- EU AI Act: https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng
- EUR-Lex summary — AI Act application dates: https://eur-lex.europa.eu/EN/legal-content/summary/rules-for-trustworthy-artificial-intelligence-in-the-eu.html
- European Commission — controller/processor roles: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/obligations/controllerprocessor/what-data-controller-or-data-processor_en
- European Commission — standard contractual clauses for controllers and processors under Article 28 GDPR: https://commission.europa.eu/publications/standard-contractual-clauses-controllers-and-processors-eueea_en
- Finnish Data Protection Ombudsman — special categories of personal data: https://tietosuoja.fi/en/processing-of-special-categories-of-personal-data
- Finnish Data Protection Ombudsman — impact assessments: https://tietosuoja.fi/en/impact-assessments
- Kanta — Patient Data Repository: https://www.kanta.fi/en/professionals/patient-data-repository
- HHS — Business Associates: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html
- HHS — Model Business Associate Agreement: https://www.hhs.gov/sites/default/files/model-business-associate-agreement.pdf
- HHS — Breach Notification Rule: https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html
