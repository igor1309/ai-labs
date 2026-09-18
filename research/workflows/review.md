## Notes
- ask agent with "bmad-help" how bmad is solving it
- ask agent how spec-kit and other do it (clone repos)

### McKinsey The Pyramid Principle
Useful distillation of long docs

### Maestro & MITM
Maestro lanes and flows, mitm stubs are code as well => review subjects

## Pains

### Figjam is huge
Here is a point of constant pain: Figjam used to describe feature flow with contract details is huge (i.e. context hungry, expensive) and complex. It uses images. Even local is expensive. Need a better (cheaper) artifact to work with. UX-spec.md?
> [teams report](https://chatgpt.com/s/t_6aabed571dd48191845a1701b32a04dd) extracting Markdown design specs containing flows/states/interactions and references while keeping component/system knowledge elsewhere, partly so agents do not need to repeatedly ingest Figma.
So UX-spec does not make sense. BUT Spec should also reflect navigation, transition, screen elements, etc and hold refs to component specs

## Reviewers
Input: checkout+diff (that’s it, no extra context, no spec, no other details)
Separate sessions, different LLMs

### Adversarial review
This code has bugs find at least XX things to fix or improve.

### Edge Cases Hunter

### Rules Audit
Folder structure; huge flat not good
Is README needed (? - questionable)
Unnecessary comments (duplicating code, over-explaining, etc)

## Reviews Judge
Knows context - what we build and why
Input: reviews by reviewers

Dedupe

Accept, reject, or defer (goes to DEFERRED.md) findings that don’t relate to the current scope or task. (Append only - reading, deduplication, etc., are for focus work on this file.)

Severity (Fail, Warn)

Types:
- spec gap (? - intent gap - include or not?) => escalate
- coding error

Present triage table, incl decisions

## Architect
- Does not need to read code
Input: spec

SOLID, Design Patterns, Composition Root, Factories
Reactive, Unidirectional flow, view should render state and pass UI events

### UI
Navigation: state driven
Complex UI components should have their own state machines
UI - composition of state machines with bindings of observing state projections (payment state does not care about account balance animation details, but account card do)

## Explorer/Researcher
Input: spec(s), architecture, code
AST
Output?

## Worflows
QA.md and ARCHITECTURE.md writing could run in parallel 

### QA.md writing
Cycle: get input (spec + figjam/ux-spec), create, (review, fix)
Output: spec gaps and `qa.md`

### ARCHITECTURE.md writing
