---
title: Product Intent: Приложение для программы освоения
date: 2026-06-27
description: Intent-документ для персонального приложения обучения с разделением программы, корпуса и состояния студента.
model: gpt-5.5-thinking
version: 0.4.2
---

# Product Intent: Приложение для программы освоения

## Product outcome

Пользователь получает управляемую программу освоения темы, где ясно видно, что нужно изучить, как проверить понимание и где остаются пробелы.

Agonara должна сохранять разделение между общим корпусом программы и личным состоянием конкретного студента, чтобы программа могла развиваться без потери истории обучения.

## Operating model — bring-your-own-agent (BYOA)

Agonara управляется по модели **bring-your-own-agent (BYOA)**: продукт — это API плюс набор операторских скиллов по ролям. Оператор приводит того агента, в котором уже работает, направляет его на свой экземпляр Agonara, загружает скилл под нужную роль и работает с продуктом через контракт. Скилл — это операционная поверхность роли.

BYOA — основной способ работы с продуктом, но не единственный. Браузерные интерфейсы `/learn` и `/admin` остаются полноценными клиентами того же контракта; они не объявляются устаревшими и не понижаются до примеров.

Это уточнение существующего API-first замысла, а не смена продукта. *Что* осваивается — курируемые программы и прогресс студента — не меняется; уточняется только то, *как* продуктом управляют. Курация остаётся ответственностью человека: агент управляет операциями, а не содержанием программы и не становится владельцем учебного материала.

Механика контракта (маршруты, схемы, форматы запросов и ответов) живёт в [`docs/api/openapi.yml`](../api/openapi.yml) и в `architecture.html`, а не в этом intent-документе.

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

- [curator_user_stories.md](curator_user_stories.md)
- [student_user_stories.md](student_user_stories.md)

Admin-facing identity, role-management, and membership recovery stories live in [admin_user_stories.md](admin_user_stories.md).

A proposed **coaching** capability — explaining topics and training the student
two-contour (understanding *and* course-specific factual nomenclature) for
test-resistance — is framed separately in [coach-persona-intent.md](coach-persona-intent.md)
(stories COACH-01..08, status proposed).

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
| INT-01 | n/a | [Module Responsibility Map](../module_responsibility_map.md), [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md) | [Corpus Storage and Curator Acceptance First Slice](../specs/corpus-storage-and-curator-acceptance-first-slice.md), [Corpus Storage and Curator Acceptance API](../specs/corpus-storage-and-curator-acceptance-api.md), [Curator Coverage Gaps](../specs/curator-coverage-gaps.md), [LLM-Assisted Curation Suggestions](../specs/llm-assisted-curation-suggestions.md) | [Corpus Storage and Curator Acceptance First-Slice Implementation Plan](../plans/implemented/corpus-storage-and-curator-acceptance-first-slice.md), [Corpus Storage and Curator Acceptance HTTP API Implementation Plan](../plans/implemented/corpus-storage-and-curator-acceptance-api.md), [Curator Coverage Gaps Implementation Plan](../plans/implemented/curator-coverage-gaps.md), [LLM-Assisted Curation Suggestions Implementation Plan](../plans/implemented/llm-assisted-curation-suggestions.md) | [Corpus domain service](../../src/corpus.js), [Curator Workspace coverage diagnostics and LLM suggestion workflow](../../src/curator-workspace.js), [Corpus, coverage, and LLM suggestion HTTP API adapter](../../src/server.js), [`/learn` coverage-gap and LLM suggestion UI](../../src/learn-ui.js), [Suggestion storage and restore validation](../../src/storage.js), [Corpus domain tests](../../tests/corpus.test.js), [Curator Workspace tests](../../tests/curator-workspace.test.js), [http-api-corpus-sources.test.js](../../tests/http-api-corpus-sources.test.js), [http-api-corpus-candidates.test.js](../../tests/http-api-corpus-candidates.test.js), [http-api-corpus-candidate-decisions.test.js](../../tests/http-api-corpus-candidate-decisions.test.js), [http-api-corpus-accepted.test.js](../../tests/http-api-corpus-accepted.test.js), [http-api-corpus-events.test.js](../../tests/http-api-corpus-events.test.js), [http-api-coverage-gaps.test.js](../../tests/http-api-coverage-gaps.test.js), [http-api-llm-suggestions.test.js](../../tests/http-api-llm-suggestions.test.js), [Corpus acceptance flow](../../tests/corpus-executable-acceptance.test.js), [Coverage and LLM HTTP acceptance flows](../../tests/executable-acceptance.test.js), [Coverage browser tests](../../tests/curator-coverage-gaps.playwright.js), [Suggestion storage tests](../../tests/storage.test.js), [Suggestion backup/restore tests](../../tests/backup-restore.test.js), [LLM suggestion browser tests](../../tests/llm-assisted-curation-suggestions.playwright.js) |
| INT-02 | n/a | [Module Responsibility Map](../module_responsibility_map.md), [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md) | [Corpus Storage and Curator Acceptance First Slice](../specs/corpus-storage-and-curator-acceptance-first-slice.md), [Corpus Storage and Curator Acceptance API](../specs/corpus-storage-and-curator-acceptance-api.md) | [Corpus Storage and Curator Acceptance First-Slice Implementation Plan](../plans/implemented/corpus-storage-and-curator-acceptance-first-slice.md), [Corpus Storage and Curator Acceptance HTTP API Implementation Plan](../plans/implemented/corpus-storage-and-curator-acceptance-api.md) | [Corpus domain service](../../src/corpus.js), [Corpus HTTP API adapter](../../src/server.js), [Corpus domain tests](../../tests/corpus.test.js), [http-api-corpus-sources.test.js](../../tests/http-api-corpus-sources.test.js), [http-api-corpus-candidates.test.js](../../tests/http-api-corpus-candidates.test.js), [http-api-corpus-candidate-decisions.test.js](../../tests/http-api-corpus-candidate-decisions.test.js), [http-api-corpus-accepted.test.js](../../tests/http-api-corpus-accepted.test.js), [http-api-corpus-events.test.js](../../tests/http-api-corpus-events.test.js), [Corpus acceptance flow](../../tests/corpus-executable-acceptance.test.js), [Corpus HTTP acceptance flow](../../tests/executable-acceptance.test.js) |
| INT-03 | n/a | [Module Responsibility Map](../module_responsibility_map.md), [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), [ADR-021](../adr/adr-021-material-content-storage-and-role-gated-reading.md) | [Topic, Concept, and Material Navigation](../specs/topic-concept-material-navigation.md), [Material Content Storage](../specs/material-content-storage.md) | [Topic, Concept, and Material Navigation Implementation Plan](../plans/implemented/topic-concept-material-navigation.md), [Material Content Storage Implementation Plan](../plans/implemented/material-content-storage.md) | [Corpus domain service](../../src/corpus.js), [Corpus HTTP API adapter](../../src/server.js), [Navigation and material content product UI](../../src/learn-ui.js), [Storage backup/restore](../../src/storage.js), [Navigation and material content domain tests](../../tests/corpus.test.js), [http-api-navigation.test.js](../../tests/http-api-navigation.test.js), [http-api-material-content.test.js](../../tests/http-api-material-content.test.js), [Navigation and material content browser tests](../../tests/topic-concept-material-navigation.playwright.js), [Navigation and material content backup/restore tests](../../tests/backup-restore.test.js), [Navigation and material content storage tests](../../tests/storage.test.js), [Navigation executable acceptance](../../tests/executable-acceptance.test.js), [Material content executable acceptance](../../tests/corpus-executable-acceptance.test.js) |
| INT-04 | n/a | [Module Responsibility Map](../module_responsibility_map.md), [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), [ADR-016](../adr/adr-016-quick-check-assessment-boundary.md) | [Quick-Check Assessment First Slice](../specs/quick-check-assessment-first-slice.md), [Quick Check Assessment API](../specs/quick-check-assessment-api.md), [Quick Check Product UI](../specs/quick-check-product-ui.md) | [Quick-Check Assessment First Slice Implementation Plan](../plans/implemented/quick-check-assessment-first-slice.md), [Quick Check Assessment HTTP API Implementation Plan](../plans/implemented/quick-check-assessment-api.md), [Quick Check Product UI Implementation Plan](../plans/implemented/quick-check-product-ui.md) | [Corpus domain service](../../src/corpus.js), [Corpus HTTP API adapter](../../src/server.js), [Student Workspace domain service](../../src/student-workspace.js), [Student Workspace HTTP API adapter](../../src/server.js), [Quick Check product UI](../../src/learn-ui.js), [Storage backup/restore](../../src/storage.js), [Student Workspace quick-check acceptance flow](../../tests/student-workspace.test.js), [http-api-quick-check-curation.test.js](../../tests/http-api-quick-check-curation.test.js), [http-api-quick-check-delivery.test.js](../../tests/http-api-quick-check-delivery.test.js), [http-api-quick-check-attempts.test.js](../../tests/http-api-quick-check-attempts.test.js), [http-api-quick-check-ui.test.js](../../tests/http-api-quick-check-ui.test.js), [http-api-server.test.js](../../tests/http-api-server.test.js), [Quick Check product UI browser tests](../../tests/quick-check-product-ui.playwright.js), [Quick-check backup/restore tests](../../tests/backup-restore.test.js), [Quick-check storage tests](../../tests/storage.test.js). |
| INT-05 | [Implementation Notes](../implementation-notes.md) | [Identity & Role Management First Slice](../identity_role_management_first_slice.md), [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), [ADR-012](../adr/adr-012-student-workspace-open-answer-attempt-lifecycle.md), [ADR-013](../adr/adr-013-student-workspace-open-answer-evaluation-governance.md), [ADR-014](../adr/adr-014-student-workspace-open-answer-evaluator-orchestration.md), [ADR-015](../adr/adr-015-open-answer-evaluator-worker-provider-boundary.md) | [Accepted Checks and Assessment Criteria First Slice](../specs/accepted-checks-and-assessment-criteria-first-slice.md), [Accepted Checks and Assessment Criteria API](../specs/accepted-checks-and-assessment-criteria-api.md), [Student Workspace Open-Answer Attempt First Slice](../specs/student-workspace-open-answer-attempt-first-slice.md), [Student Workspace Open-Answer Attempt API](../specs/student-workspace-open-answer-attempt-api.md), [Student Workspace Open-Answer Evaluation Status and Evidence](../specs/student-workspace-open-answer-evaluation-status-and-evidence.md), [Student Workspace Open-Answer Evaluator Orchestration](../specs/student-workspace-open-answer-evaluator-orchestration.md), [Student Workspace Open-Answer Evaluator Worker](../specs/student-workspace-open-answer-evaluator-worker.md) | [Accepted Checks and Assessment Criteria First-Slice Implementation Plan](../plans/implemented/accepted-checks-and-assessment-criteria-first-slice.md), [Accepted Checks and Assessment Criteria HTTP API Implementation Plan](../plans/implemented/accepted-checks-and-assessment-criteria-api.md), [Student Workspace Open-Answer Attempt First Slice Implementation Plan](../plans/implemented/student-workspace-open-answer-attempt-first-slice.md), [Student Workspace Open-Answer Attempt HTTP API Implementation Plan](../plans/implemented/student-workspace-open-answer-attempt-api.md), [Student Workspace Open-Answer Evaluation Status and Evidence Implementation Plan](../plans/implemented/student-workspace-open-answer-evaluation-status-and-evidence.md), [Student Workspace Open-Answer Evaluator Orchestration Implementation Plan](../plans/implemented/student-workspace-open-answer-evaluator-orchestration.md), [Student Workspace Open-Answer Evaluator Worker Implementation Plan](../plans/implemented/student-workspace-open-answer-evaluator-worker.md) | [Corpus domain service](../../src/corpus.js), [Corpus HTTP API adapter](../../src/server.js), [Student Workspace domain service](../../src/student-workspace.js), [Student Workspace HTTP API adapter](../../src/server.js), [Storage backup/restore](../../src/storage.js), [Corpus domain tests](../../tests/corpus.test.js), [http-api-assessment-criteria.test.js](../../tests/http-api-assessment-criteria.test.js), [http-api-open-answer-checks.test.js](../../tests/http-api-open-answer-checks.test.js), [http-api-assessment-validation.test.js](../../tests/http-api-assessment-validation.test.js), [Student Workspace domain tests](../../tests/student-workspace.test.js), [http-api-open-answer-attempt-submission.test.js](../../tests/http-api-open-answer-attempt-submission.test.js), [http-api-open-answer-attempt-detail.test.js](../../tests/http-api-open-answer-attempt-detail.test.js), [http-api-open-answer-attempt-list.test.js](../../tests/http-api-open-answer-attempt-list.test.js), [Backup/restore tests](../../tests/backup-restore.test.js), [Corpus assessment acceptance flow](../../tests/corpus-executable-acceptance.test.js), [Assessment HTTP acceptance flow](../../tests/executable-acceptance.test.js), [http-api-open-answer-attempt-acceptance.test.js](../../tests/http-api-open-answer-attempt-acceptance.test.js), [http-api-server.test.js](../../tests/http-api-server.test.js) |
| INT-06 | n/a | [Module Responsibility Map](../module_responsibility_map.md), [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), [ADR-016](../adr/adr-016-quick-check-assessment-boundary.md) | [Topic and Period Readiness Checks](../specs/topic-period-readiness-checks.md) | [Topic and Period Readiness Checks Implementation Plan](../plans/implemented/topic-period-readiness-checks.md) | [Corpus readiness curation](../../src/corpus.js), [Student Workspace readiness attempts](../../src/student-workspace.js), [readiness HTTP routes](../../src/server.js), [`/learn` readiness UI](../../src/learn-ui.js), [readiness storage tests](../../tests/storage.test.js), [readiness domain tests](../../tests/corpus.test.js), [readiness Student Workspace tests](../../tests/student-workspace.test.js), [http-api-readiness-checks.test.js](../../tests/http-api-readiness-checks.test.js), [readiness browser tests](../../tests/topic-period-readiness-checks.playwright.js), [readiness backup/restore tests](../../tests/backup-restore.test.js), [readiness executable acceptance](../../tests/executable-acceptance.test.js) |
| INT-07 | n/a | [Module Responsibility Map](../module_responsibility_map.md), [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), [ADR-012](../adr/adr-012-student-workspace-open-answer-attempt-lifecycle.md), [ADR-016](../adr/adr-016-quick-check-assessment-boundary.md) | [Learner-State Interpretation](../specs/learner-state-interpretation.md) | [Learner-State Interpretation Implementation Plan](../plans/implemented/learner-state-interpretation.md) | [Student Workspace learner-state derivation](../../src/student-workspace.js), [Corpus target-link curation](../../src/corpus.js), [learner-state HTTP routes](../../src/server.js), [`/learn` learner-state UI](../../src/learn-ui.js), [learner-state domain tests](../../tests/student-workspace.test.js), [http-api-learner-state.test.js](../../tests/http-api-learner-state.test.js), [learner-state browser tests](../../tests/learner-state-interpretation.playwright.js), [target-link storage tests](../../tests/storage.test.js), [backup/restore tests](../../tests/backup-restore.test.js) |
| CUR-20..CUR-21 | n/a | [ADR-022](../adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md) | [Accepted Entity Withdrawal and Source Deletion](../specs/accepted-entity-withdrawal-and-source-deletion.md) | [Accepted Entity Withdrawal and Source Deletion Implementation Plan](../plans/implemented/accepted-entity-withdrawal-and-source-deletion.md) | [Lifecycle storage and restore validation](../../src/storage.js), [accepted-check lifecycle and coverage filtering](../../src/curator-workspace.js), [corpus, source, and material lifecycle](../../src/corpus.js), [student delivery filters](../../src/student-workspace.js), [HTTP routes](../../src/server.js), [`/learn` lifecycle controls](../../src/learn-ui.js), [storage tests](../../tests/storage.test.js), [backup/restore tests](../../tests/backup-restore.test.js), [curator tests](../../tests/curator-workspace.test.js), [corpus tests](../../tests/corpus.test.js), [student tests](../../tests/student-workspace.test.js), [http-api-lifecycle-status.test.js](../../tests/http-api-lifecycle-status.test.js), [http-api-corpus-sources.test.js](../../tests/http-api-corpus-sources.test.js), [http-api-corpus-accepted.test.js](../../tests/http-api-corpus-accepted.test.js), [http-api-assessment-criteria.test.js](../../tests/http-api-assessment-criteria.test.js), [http-api-open-answer-checks.test.js](../../tests/http-api-open-answer-checks.test.js), [http-api-quick-check-delivery.test.js](../../tests/http-api-quick-check-delivery.test.js), [http-api-readiness-checks.test.js](../../tests/http-api-readiness-checks.test.js), [http-api-navigation.test.js](../../tests/http-api-navigation.test.js), [OpenAPI tests](../../tests/openapi-contract.test.js), [Quick Check browser tests](../../tests/quick-check-product-ui.playwright.js), [navigation and source browser tests](../../tests/topic-concept-material-navigation.playwright.js) |
| ADM-01..ADM-11 | [Implementation Notes](../implementation-notes.md) | [Identity & Role Management First Slice](../identity_role_management_first_slice.md), [ADR-008](../adr/adr-008-first-slice-authentication-session-and-credential-boundary.md) | [Identity & Role Management First Slice Spec](../specs/identity-role-management-first-slice.md), [Identity & Role Management API and CLI Spec](../specs/identity-role-management-api-cli.md), [Operational Cross-Cutting First Slice](../specs/operational-cross-cutting-first-slice.md) | [Identity and Operations First-Slice Implementation Plan](../plans/implemented/identity-and-operations-first-slice.md) | [Identity domain service](../../src/identity.js), [Storage backup/restore](../../src/storage.js), [HTTP API and operations adapter](../../src/server.js), [Operator CLI](../../src/cli.js), [Admin board shell](../../src/admin-ui.js), [Identity tests](../../tests/identity.test.js), [http-api-identity-session.test.js](../../tests/http-api-identity-session.test.js), [http-api-logging.test.js](../../tests/http-api-logging.test.js), [http-api-server.test.js](../../tests/http-api-server.test.js), [Operations tests](../../tests/operations.test.js), [Backup/restore tests](../../tests/backup-restore.test.js), [CLI tests](../../tests/cli.test.js), [Executable acceptance flow](../../tests/executable-acceptance.test.js) |
| STU-01, STU-18..STU-21, CUR-01, ADM-12, ADM-15 | n/a | [Module Responsibility Map](../module_responsibility_map.md), [Program Membership Pre-ADR](../pre-adr/program_membership_pre_adr.md), [ADR-004](../adr/adr-004-program-membership-owns-program-participation.md), [ADR-005](../adr/adr-005-program-membership-state-and-first-admission-policy.md), [ADR-006](../adr/adr-006-program-membership-policy-actor.md), [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md), [ADR-009](../adr/adr-009-program-shell-and-initial-curator-participation.md) | [Program Shell and Membership First Slice](../specs/program-shell-and-membership-first-slice.md), [Program Shell and Membership API](../specs/program-shell-and-membership-api.md) | [Program Shell and Membership First-Slice Implementation Plan](../plans/implemented/program-shell-and-membership-first-slice.md), [Program Shell and Membership HTTP API Implementation Plan](../plans/implemented/program-shell-and-membership-api.md) | [Program domain service](../../src/program.js), [http-api-programs.test.js](../../tests/http-api-programs.test.js), [http-api-program-student-memberships.test.js](../../tests/http-api-program-student-memberships.test.js), [http-api-program-membership-control.test.js](../../tests/http-api-program-membership-control.test.js), [http-api-program-participation.test.js](../../tests/http-api-program-participation.test.js), [http-api-program-events.test.js](../../tests/http-api-program-events.test.js), [Program acceptance flow](../../tests/executable-acceptance.test.js) |
| STU-22..STU-23, CUR-14..CUR-18, ADM-13..ADM-14 | n/a | [Module Responsibility Map](../module_responsibility_map.md), [Program Membership Pre-ADR](../pre-adr/program_membership_pre_adr.md), [ADR-004](../adr/adr-004-program-membership-owns-program-participation.md), [ADR-005](../adr/adr-005-program-membership-state-and-first-admission-policy.md), [ADR-006](../adr/adr-006-program-membership-policy-actor.md), [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md) | [Program Membership Invitations and Recovery](../specs/program-membership-invitations-and-recovery.md) | [Program Membership Invitations and Recovery Implementation Plan](../plans/implemented/program-membership-invitations-and-recovery.md) | [Program domain service](../../src/program.js), [Program HTTP API adapter](../../src/server.js), [`/learn` membership UI](../../src/learn-ui.js), [`/admin` exceptional recovery UI](../../src/admin-ui.js), [Storage backup/restore](../../src/storage.js), [membership domain tests](../../tests/program.test.js), [http-api-program-membership-control.test.js](../../tests/http-api-program-membership-control.test.js), [membership browser tests](../../tests/program-membership-invitations-and-recovery.playwright.js), [membership backup/restore tests](../../tests/backup-restore.test.js), [membership executable acceptance](../../tests/executable-acceptance.test.js) |

## Change review

| Change | Impact review |
|---|---|
| Editorial wording that preserves actor, capability, outcome, acceptance signal, and boundary | No downstream review required. |
| Stating the operating model (e.g. the BYOA refinement) without changing the *what* | Verify no accepted ADR is contradicted (backward-traceability check); propagate the framing to README, landing, architecture, and brand docs. Performed for the BYOA refinement (v0.4.0): the ADRs that cite intent/stories all place UI outside their decision scope, so module ownership and boundaries are unaffected. |
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
