---
date: 2026-06-29
model: claude-opus-4-8
description: "Product intent: a coaching capability that teaches and drills the student on both understanding and course-specific factual nomenclature so they are test-resistant."
version: 0.1.0
---

# Product Intent: Коуч — объяснять и тренировать на тестоустойчивость

## Product outcome

Студент получает не только проверку, но и **коуча**: агентную поверхность, которая
*объясняет* темы на нужной глубине, *диагностирует причину* слабого места по
собственным данным студента, и *тренирует двухконтурно* — и понимание, и
курсоспецифическую фактуру (именные классификации, авторские типологии, категории,
типы, терминологические сетки), — так чтобы студент не проваливался на реальных
тестах там, где одной логики недостаточно.

Это расширяет существующего студенческого ассистента, а не заменяет его. Проверка
(quick/open/readiness checks, authored drills) уже зрелая; недобран **обучающий
контур** и **номенклатурный слой** подготовки.

### Grounding (почему этот интент)

Реальный сигнал из подготовки к экзамену: студент, которого долго готовили на смысл,
кейсы, принципы и защиту от натяжек, сдал реальный тест на **71/100** — провалившись
именно на «номенклатурной» фактуре (кто что выделял, как называются типы, как устроена
авторская классификация: Маркова/Марков, Шварц и подобные). Это классический профиль
«понимание есть, фактура держится слабо». Коуч существует, чтобы закрыть оба контура,
а не один.

## Operating model — продолжение BYOA

Коуч — это **обучающая персона того же BYOA-агента**, что уже действует за студента
через контракт экземпляра (`agonara-student` и смежные скиллы). Он работает целиком в
безопасной зоне студента: читает **только принятый корпус** и **собственное состояние**
студента (`learner-state`, evidence за метками), и **никогда** не порождает оценочную
доказательную базу студента.

Этот интент описывает *что* коуч даёт студенту и *какие границы* держит. *Как* он
реализуется — расширением скилла, новым скиллом `agonara-coach`, или новым persisted
состоянием на бэкенде — решается ниже по цепочке (research / pre-ADR), а не здесь.

## Actors

### Студент

Осваивает программу. Хочет, чтобы его не только проверяли, но и учили — объясняли
непонятное, вскрывали *причину* слабого места, и готовили к тесту по обоим контурам
(смысл и фактура), чтобы быть тестоустойчивым.

### Куратор программы

Не действует в коучинге напрямую, но релевантен одной открытой развилкой: приоритет
номенклатуры (must-know / часто тестируемое / редкое-но-неприятное) может быть либо
выведен коучем из материалов, либо задан куратором как метаданные корпуса. Вторая
ветка добавляет кураторскую ответственность и меняет контракт (см. открытые вопросы).

## User stories

Сгруппированы по виду коучинговой активности. Все истории — поверх безопасной зоны
студента: только принятый корпус и собственное состояние.

### Объяснение (обучающий контур)

#### COACH-01 — Объяснение на нужной глубине

As a student,
I want the coach to explain a concept at the depth I ask for — from a plain
intuition to a working account to a rigorous, source-faithful treatment —
so that I can build understanding without being stuck at one fixed level.

Status: proposed

Acceptance signal: студент может запросить «проще» или «глубже/строже» по одному и
тому же понятию и получить объяснение соответствующего уровня, привязанное к принятым
материалам, без выхода за принятый корпус.

#### COACH-02 — Диагностика причины слабого места

As a student,
I want the coach to explain *why* a concept is weak from the evidence behind my
state — which attempts, what feedback — rather than just flagging it as weak,
so that I fix the actual misconception instead of blindly re-reading.

Status: proposed

Acceptance signal: для слабой метки коуч читает `learner-state/targets/...` evidence и
называет конкретную причину (какая попытка, какой feedback, какое смешение понятий),
а не выдаёт «повтори тему». Диагностика не мутирует принятый корпус.

#### COACH-03 — Сначала фундамент (prerequisite-aware)

As a student,
I want the coach, when a concept depends on shaky fundamentals, to check and teach
the prerequisites first,
so that I am not taught the top of a chain while its base is missing.

Status: proposed

Acceptance signal: при слабом понятии коуч проходит по принятым связям
`concept_prerequisite` назад и адресует фундамент до верхушки.

#### COACH-04 — Различение спутываемых понятий

As a student,
I want the coach to teach the distinction between confusable concepts shown together,
so that I do not hold a shallow or false understanding that survives until a test
exposes it.

Status: proposed

Acceptance signal: для пары спутываемых понятий (STU-07 уже отдаёт такие пары) коуч
объясняет *различие, которое надо сохранить*, а не показывает их рядом без разбора.

### Тестоустойчивость (двухконтурная тренировка)

#### COACH-05 — Тренировка номенклатурного слоя

As a student,
I want the coach to train me on the course-specific factual layer — named
classifications, author typologies, categories, types, terminology grids (who
distinguished what, how the scheme is named and built) — not only on meaning,
so that I do not fail test items where the right answer is a remembered fact, not
a derivation.

Status: proposed

Acceptance signal: коуч способен вести прогон, целевой на фактуру (фамилии, типологии,
категории, пары, списки), грунтованный на принятых материалах, держа item-quality bar.

#### COACH-06 — Смешанный двухконтурный прогон

As a student,
I want a single drilling run to mix understanding items and exact-fact items
(and hybrids that need both), deliberately balanced,
so that I am test-resistant on both axes — neither failing where analysis is
needed nor where a precise course fact is needed.

Status: proposed

Acceptance signal: прогон явно балансирует между «принципы / логика / кейсы» и «имена /
классификации / категории / структура материала»; коуч может показать этот баланс, а не
сваливаться в один контур по инерции. Не «отдельный блок зубрёжки» и не «отдельный блок
логики» — вперемешку.

#### COACH-07 — Приоритизация фактуры

As a student,
I want named classifications and factual items triaged by priority — must-know /
frequently-tested / rare-but-nasty —
so that limited prep time goes to the facts most likely to decide the test first.

Status: proposed

Acceptance signal: коуч может разметить номенклатуру темы по трём уровням приоритета и
вести прогон в этом порядке. (Источник приоритета — открытый вопрос ниже.)

### Целостность коучинга (граница как обязательство)

#### COACH-08 — Коуч до линии официальной оценки, но не за неё

As a student,
I want the coach to help me right up to — but never across — the official-assessment
line: explain, diagnose, drill on practice items, interpret returned feedback, but
never produce, choose, hint, or submit my own assessment evidence,
so that my recorded progress stays grounded in my own attempts.

Status: proposed

Acceptance signal: пока официальный check активен, коуч не порождает и не подсказывает
ответ и подаёт только тот ответ, который студент назвал сам (правило assessment-integrity
владеет `agonara-student`; здесь оно подтверждается как обязательство коуча, а не
ослабляется обучающей ролью).

## Acceptance signals

| Story | Acceptance signal |
|---|---|
| COACH-01 | Один и тот же концепт объясняется на запрошенном уровне (проще/строже), привязка к принятым материалам, без выхода за принятый корпус. |
| COACH-02 | Для слабой метки названа конкретная причина из evidence (`learner-state/targets`), без мутации корпуса. |
| COACH-03 | Слабое понятие ведёт коуча по `concept_prerequisite` назад; фундамент адресуется до верхушки. |
| COACH-04 | Для пары спутываемых понятий объяснено различие, которое надо удержать. |
| COACH-05 | Возможен прогон, целевой на фактуру (фамилии/типологии/категории), грунтованный на материалах, по item-quality bar. |
| COACH-06 | Прогон демонстрирует явный баланс «смысл vs фактура»; коуч не сваливается в один контур. |
| COACH-07 | Номенклатура темы размечена must-know / часто тестируемое / редкое; прогон уважает приоритет. |
| COACH-08 | При активном официальном check коуч не порождает/не подсказывает ответ; подаёт только ответ, названный студентом. |

## Boundaries and non-goals

- **Коуч не порождает оценочную базу студента.** Граница assessment-integrity
  (`agonara-student`) сохраняется без ослабления: обучающая роль не даёт права решать
  или подсказывать ответ на официальный check.
- **Коуч видит только принятый корпус и собственное состояние.** Никаких кураторских
  кандидатов/черновиков, ключей ответов, метаданных корректности, внутренностей
  эвалуатора, чужого состояния.
- **Коуч не курирует.** Тренировочные вопросы, которые он сочиняет, — разговорные, не
  персистятся как кандидаты проверок программы; авторство принятых проверок остаётся
  кураторской ролью.
- **Этот интент не выбирает реализацию.** Скилл vs расширение vs новое persisted
  состояние — downstream-решение. В частности, **персистентный план обучения,
  расписание интервальных повторений и персистентная карта освоения номенклатуры — вне
  обещаний этого интента**, пока отдельный спек не введёт новое persisted learner state
  (README прямо требует для такого отдельный спек).
- **Не общая LMS.** Фокус — персональное освоение, а не классы, расписания, отчётность.

## Open product questions

- **Двухконтурность — состояние или вывод?** Нужна ли COACH-05/06/07 персистентная
  per-student карта освоения номенклатуры и расписание повторений (новое persisted
  learner state → ADR/spec), или достаточно сессионного вывода из evidence
  `learner-state`? Это и есть развилка «скилл vs бэкенд».
- **Откуда берётся приоритет номенклатуры (COACH-07)?** Выводит ли коуч must-know /
  часто-тестируемое / редкое из материалов, или это кураторская метаданная корпуса? Вторая
  ветка добавляет кураторскую историю и меняет контракт (расширение корпуса), не остаётся
  чистым коучингом.
- **Диагностика причины (COACH-02) — эфемерна или фиксируется?** Остаётся ли «почему
  weak» разовым коучингом, или становится частью learner-state, видимой между сессиями?
- **Где живёт двухконтурный баланс (COACH-06)?** Это правило скилла (как сейчас секция
  «Coverage» в `assistant-authored-study-drills`, но по когнитивному слою, а не только по
  темам), или ему нужен сигнал из корпуса о том, какие элементы — фактура, а какие —
  понимание?

## Downstream traceability

Ничего ниже по цепочке ещё нет — это первый артефакт по коучу. Реализация ждёт
research/pre-ADR по развилке «скилл vs persisted state».

| Story | Research | Pre-ADR / ADR | Spec | Implementation plan | Code / tests |
|---|---|---|---|---|---|
| COACH-01..04 | [Coach realization fork](../research/coach-realization-fork.md) §sub-question A | TBD | TBD | TBD | TBD |
| COACH-05..07 | [Coach realization fork](../research/coach-realization-fork.md) (fork + priority-source) | TBD | TBD | partial, skill-level: [`assistant-authored-study-drills`](../../skills/assistant-authored-study-drills/SKILL.md) §"Two-contour balance" (v1.2.0) | [`assistant-authored-study-drills` SKILL](../../skills/assistant-authored-study-drills/SKILL.md), [calibration note](../../skills/assistant-authored-study-drills/references/user-calibration-notes.md) |
| COACH-08 | n/a | reuses assessment-integrity boundary ([ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), [ADR-016](../adr/adr-016-quick-check-assessment-boundary.md)) | n/a (owned by `agonara-student` skill) | n/a | [`agonara-student` skill](../../skills/agonara-student/SKILL.md) |

Связанные существующие поверхности, на которые коуч опирается уже сегодня:
[`agonara-student`](../../skills/agonara-student/SKILL.md) (граница, item-quality, authored-quiz loop),
[`assistant-authored-study-drills`](../../skills/assistant-authored-study-drills/SKILL.md) (оркестрация дрилов, coverage),
[`oral-exam-drills`](../../skills/oral-exam-drills/SKILL.md) (устные/кейсовые драйвы),
[learner-state interpretation](../specs/learner-state-interpretation.md) (evidence за слабыми метками — сырьё COACH-02).

## Change review

| Change | Impact review |
|---|---|
| Editorial wording preserving actor, capability, outcome, acceptance signal, boundary | No downstream review required. |
| Accepting a COACH story into build | Choose realization (skill vs persisted state) via research/pre-ADR; if persisted learner state is introduced, a new spec and ADR are required (README rule). |
| Resolving the priority-source question (COACH-07) toward curator metadata | Adds a curator story and changes the corpus contract — review module responsibility map and ADR-010 acceptance boundary before any build. |
| Strengthening the two-contour balance in a drill skill (COACH-06) | Skill-only change; recalibrate `assistant-authored-study-drills` coverage to balance the cognitive layer (meaning vs nomenclature), not only topic spread. |
