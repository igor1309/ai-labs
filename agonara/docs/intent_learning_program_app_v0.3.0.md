---
title: Product Intent: Приложение для программы освоения
date: 2026-05-27
description: Intent-документ для персонального приложения обучения с разделением программы, корпуса и состояния студента.
model: gpt-5.5-thinking
version: 0.3.0
---

# Product Intent: Приложение для программы освоения

## Product outcome

Пользователь получает управляемую программу освоения темы, где ясно видно, что нужно изучить, как проверить понимание и где остаются пробелы.

Agonara должна сохранять разделение между общим корпусом программы и личным состоянием конкретного студента, чтобы программа могла развиваться без потери истории обучения.

## Problem

Самостоятельное освоение сложной темы легко распадается на чтение материалов без ясного понимания, что именно нужно знать, как проверять понимание и где остаются пробелы.

Пользователю нужна программа освоения, которая связывает темы, понятия, материалы и проверки в управляемую учебную рамку.

Отдельная проблема — наполнение программы. Ядро программы может собираться из публичных учебных планов, экзаменационных требований, стандартов проверки знаний, учебных материалов и результатов ресерча. Это содержание должно быть отделено от личного прогресса конкретного студента.

## Actors

### Студент

Студент проходит программу освоения, изучает материалы, отвечает на проверочные задания и использует результаты проверок для решения, что повторять или изучать дальше.

### Куратор программы

Куратор программы собирает, уточняет и пополняет программу освоения.

Куратор может использовать внешние источники, собственные материалы и LLM-предложения, но отвечает за принятие содержания в программу.

Один человек может совмещать роли студента и куратора.

### Администратор экземпляра

Администратор экземпляра управляет идентичностями, привязками учетных данных, ролями и операциями восстановления частного экземпляра Agonara.

Администратор не является учебной ролью и не заменяет ответственность куратора за принятое содержание программы.

## User stories

### INT-01 — Собрать программу из источников

As a program curator,
I want to assemble a learning program from external sources and my own materials,
so that the student follows a structured program instead of a random set of links.

Status: accepted

### INT-02 — Увидеть понятийный аппарат темы

As a student,
I want to see the key terms, concepts, principles, and definitions inside a topic,
so that I understand what must be learned, remembered, or studied more deeply.

Status: accepted

### INT-03 — Изучать материалы в контексте программы

As a student,
I want to see materials linked to topics and concepts,
so that I know which sources support each part of the program.

Status: accepted

### INT-04 — Проверять понимание по ходу обучения

As a student,
I want to answer checks during study,
so that I can verify understanding before moving further.

Status: accepted

### INT-05 — Получать оценку развернутого ответа

As a student,
I want open answers to be evaluated against program criteria,
so that I can see weak or missing parts of my understanding.

Status: accepted

### INT-06 — Проходить итоговые проверки

As a student,
I want to pass topic-level or period-level checks,
so that I can decide whether I am ready to continue.

Status: accepted

### INT-07 — Видеть личное состояние освоения

As a student,
I want to see mastered, weak, and unconfirmed topics and concepts,
so that I can decide what to repeat, study, or verify next.

Status: accepted

The detailed curator and student story catalogs live in:

- [curator_user_stories_v0.3.0.md](curator_user_stories_v0.3.0.md)
- [student_user_stories_v0.3.1.md](student_user_stories_v0.3.1.md)

Admin-facing identity, role-management, and membership recovery stories live in [admin_user_stories_v0.2.1.md](admin_user_stories_v0.2.1.md).

## Acceptance signals

| Story | Acceptance signal |
|---|---|
| INT-01 | A curator can create or update a program from accepted sources, keep draft suggestions separate, and accept only reviewed content into the program corpus. |
| INT-02 | A student can inspect a topic and see its key concepts, definitions, principles, and confusing neighbors. |
| INT-03 | A student can navigate from a topic or concept to relevant materials and back to the program structure. |
| INT-04 | A student can complete quick checks and see whether the check confirms or challenges current understanding. |
| INT-05 | A student can submit an open answer and receive feedback tied to accepted criteria. |
| INT-06 | A student can complete a topic-level or period-level check and see whether the result supports moving forward. |
| INT-07 | A student can see personal progress, weak areas, and evidence behind the current state without mutating the shared program corpus. |

## Product structure

Приложение помогает пользователю собирать и проходить программу освоения темы.

Программа освоения должна связывать:

- темы;
- понятия, термины, концепции и принципы;
- материалы для изучения;
- проверочные задания;
- критерии проверки;
- состояние личного освоения студента.

Приложение должно сохранять разделение между общим содержанием программы и состоянием конкретного студента.

### Program curation

Куратор программы должен иметь возможность собирать и пополнять программу освоения из внешних и собственных источников.

Источниками могут быть:

- публичные учебные планы;
- экзаменационные требования;
- стандарты проверки знаний;
- учебники, статьи, лекции и курсы;
- дидактические материалы;
- ссылки;
- собственные заметки;
- результаты ресерча.

LLM может помогать куратору предлагать структуру программы, выделять понятия, связывать материалы с темами, предлагать проверочные задания и находить пробелы в покрытии.

LLM-предложения не считаются содержанием программы, пока куратор их не принял.

## Boundaries and non-goals

Приложение не является общей LMS-платформой.

Первичный фокус — персональное освоение темы, а не управление классами, преподавателями, расписаниями или институциональной отчетностью.

Программа освоения не должна смешиваться с личным состоянием студента.

Материалы, понятия, проверки и критерии относятся к программе освоения.

Ответы, попытки, результаты, пробелы и состояние освоения относятся к конкретному студенту.

LLM-предложения являются вспомогательным материалом для куратора, а не самостоятельным источником утвержденного содержания.

## Open product questions

- Какие минимальные типы проверок нужны в первом рабочем срезе: quick checks, open answers, topic-level checks, или только один из них?
- Должна ли первая версия поддерживать несколько программ одновременно для одного студента?
- Какие внешние источники считаются достаточно надежными для первого curator flow?
- Где проходит продуктовая граница между личным повторением студента и изменением общей программы?

## Downstream traceability

| Story | Research | Pre-ADR / ADR | Spec | Implementation plan | Code / tests |
|---|---|---|---|---|---|
| INT-01 | n/a | [Module Responsibility Map](module_responsibility_map_v0.4.1.md) | n/a | n/a | n/a |
| INT-02 | n/a | [Module Responsibility Map](module_responsibility_map_v0.4.1.md) | n/a | n/a | n/a |
| INT-03 | n/a | [Module Responsibility Map](module_responsibility_map_v0.4.1.md) | n/a | n/a | n/a |
| INT-04 | n/a | [Module Responsibility Map](module_responsibility_map_v0.4.1.md) | n/a | n/a | n/a |
| INT-05 | [Implementation Notes](implementation-notes_v0.2.1.md) | [Identity & Role Management First Slice](identity_role_management_first_slice_v0.2.2.md) | n/a | n/a | n/a |
| INT-06 | n/a | [Module Responsibility Map](module_responsibility_map_v0.4.1.md) | n/a | n/a | n/a |
| INT-07 | n/a | [Module Responsibility Map](module_responsibility_map_v0.4.1.md) | n/a | n/a | n/a |
| ADM-01..ADM-11 | [Implementation Notes](implementation-notes_v0.2.1.md) | [Identity & Role Management First Slice](identity_role_management_first_slice_v0.2.2.md) | n/a | n/a | n/a |
| STU-18..STU-23, CUR-14..CUR-18, ADM-12..ADM-15 | n/a | [Module Responsibility Map](module_responsibility_map_v0.4.1.md), [Program Membership Pre-ADR](program_membership_pre_adr_v0.1.0.md), [ADR-004](../../docs/adr/agonara/adr-004-program-membership-owns-program-participation.md), [ADR-005](../../docs/adr/agonara/adr-005-program-membership-state-and-first-admission-policy.md) | n/a | n/a | n/a |

## Change review

| Change | Impact review |
|---|---|
| Editorial wording that preserves actor, capability, outcome, acceptance signal, and boundary | No downstream review required. |
| Adding or removing an accepted story | Review story catalogs, module responsibility map, and any affected Pre-ADR/spec artifacts. |
| Changing corpus/student-state separation | Review module responsibility map, identity first slice, and future storage design before implementation. |

## Success notes

Приложение успешно решает задачу, если куратор может:

- собрать программу освоения из внешних источников и собственных материалов;
- связать темы, понятия, материалы и проверки;
- пополнять программу после дополнительного ресерча;
- отличать принятый корпус программы от черновиков и предложений.

Приложение успешно решает задачу, если студент может:

- выбрать или открыть программу освоения;
- видеть, что нужно изучить и проверить;
- проходить регулярные проверки;
- получать оценку своих ответов;
- видеть личные пробелы;
- принимать решение, что повторять, что изучать дальше и когда переходить к следующей теме.

## Ownership

Куратор программы отвечает за принятие содержания программы: тем, понятий, материалов, проверок и критериев.

Студент отвечает за прохождение программы, ответы на задания и решение, как использовать результаты проверок.

Приложение отвечает за организацию программы освоения, связь материалов с понятиями и проверками, фиксацию результатов и отображение личного состояния освоения.

LLM помогает готовить черновики и предложения для куратора и может помогать оценивать развернутые ответы студента, но не является владельцем программы и не заменяет решение куратора.
