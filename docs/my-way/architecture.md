# Architecture: what it is and how we reason about it

The owner's guidelines, collected from Claude sessions (Aug–Nov 2026) across
Vortex/CBDC (iOS), Android, agister, verger, audelin, mizan, rex and others.
Quotes are the owner's words, lightly trimmed. Where this doc and an agent's
understanding differ, the quote wins.

## 1. What architecture is

- "The architecture is a description of components, their responsibilities
  and their deps."
- "Architecture is components, their connections, boundaries and
  responsibilities."
- It is drawn from the code and the responsibilities, not from use cases or a
  borrowed picture: "'implements Agister's use cases' has nothing to do with
  architecture — why do you draw architecture based on use cases and not the
  code?" and "the hexagonal/clean-architecture picture — where did you get it
  and why did you use it?"
- "Ports-and-adapters" is not an architecture: "how the fuck is
  Ports-and-adapters architecture?"
- A proposal answers these questions, and nothing else:
  "What new responsibilities do you need to build? How are these
  responsibilities divided between components, and why? Who would hold these
  components? Who would construct them?"
- Reviewing a component needs "not just responsibilities but dependencies and
  interfaces as well, and they should be scrutinized by that lens — what is the
  reason to change".

## 2. The grounding rules

The owner's "Tora": "no shared types, components define their own types and
interfaces, they should not speak a foreign language — if anything contradicts
it, then IT is wrong."

1. **Dependencies point at the consumer's own interfaces.** A component
   declares each collaborator as an interface it owns, shaped by the role that
   collaborator plays for it. It never imports another component, a concrete
   implementation, or someone else's interface. This keeps each component's
   reason to change its own.
2. **The external world lives only in adapters.** Disk and file formats,
   devices, models, the OS, the UI toolkit. Each file format has exactly one
   reader and one writer.
3. **Each component owns its types; no shared domain module.** Look-alike
   components keep their own types; the composition root translates.
4. **The composition root is the only place that knows concrete pieces.** It
   builds everything and plugs an answer into each interface. Coordination
   between features is wiring, not a shared component.
5. **Cross-cutting concerns are decorators at the root.** Logging, metrics,
   retries wrap interfaces at the root; no component logs.

(Rules 1–5 were agreed as audelin's grounding and asked to be repeated at the
top of its ARCHITECTURE.md "because you tend to ignore these grounding rules".)

- SOLID — "encapsulation, dependency inversion, single responsibility" — is
  the discipline, "as practice, not idol".
- "Any import must be verified against architecture. Claims like 'X needs to
  import a parser to do Y, that is why it should violate Z' are plain wrong."
- Do not talk your way around a rule: "rules are simple — are you in
  violation or not?" A sentence like "domain values may cross any boundary;
  the rule restricts capabilities, not data" is "your ticket to dismissing the
  rules".

## 3. Components and boundaries

- **Foreign language is the smell.** "Despite 'isolated' components that have
  their own types, the huge blast tells us the architecture is dirty: that
  components speak a foreign language, that separation is ceremony."
- **Outer edges stay at the edge.** "File system and concrete file types are
  not the language of app components, only of outer edges. If we change a
  prompt from md to yaml, the change should touch just that reader/writer."
  The point is "coupling of components to concrete file formats, coupling
  business-logic components to outer-edge types", not JSON as such.
- **One owner per outside concern.** "There should be a single component
  speaking the settings-files language — the one that actually reads and
  writes them (2 at most: reader and writer). No other should even know there
  is a files boundary at all." Renderers that only display files (pages) may
  read them directly; they hold no logic.
- **Concrete-tool knowledge stays in its wrapper.** Verger: "verger code
  should not reason about any credential at all... credentials handling is
  purely the concrete provider's responsibility... the 2 steps for claude
  should not leak into its client."
- **Business logic does not mirror the SDK/backend.** "XSD restricts status
  to ACTV | BLCK | CLSD — true, but that is not business logic/UI states, and
  you spectacularly miss this distinction. You conflate UX requirements with
  direct capabilities of SDK/backend without thinking — that IS the
  architectural job." Transport raises a timeout; business logic processes
  it; the business-logic interface defines the collaborator shape with the
  errors it needs; vendor codes (3000, L001) are SDK-adapter details.
- **Interfaces describe roles, not providers.** "Do we want to couple
  live-text to Parakeet, or should it define the interface the Parakeet
  adapter would fit?" Split an interface that bundles separate roles; do not
  move an old shared interface intact.
- **Same shape is a canary.** "If an adapter maps fields one to one without
  transformation, telling that types have the same shape, it is a smell. OK at
  the persistence edge, but if internal components use same types of the same
  shape, that is a reason to look: what components do, how different
  responsibilities result in the same interface."
- **No shared modules between features.** "Student and curator modules should
  not share anything; it's possible to plug the same adapted(!) component into
  respective interfaces, but no shared shit." "Student workspace should allow a
  student to list programs... all via interfaces — who is doing that and how,
  the student workspace should not know or care."
- **Duplicated types are a second source of truth.** "Core pieces duplicate
  the types — bad: 2nd source of truth, prone to drift, verbose." (This is
  about copying one component's types; owned role-specific types are rule 3.)
- **Dependencies flow down, not round trips.** "Client doing a roundtrip to
  the module to provide dependencies the module's factory needs — why????"
- **Do not widen types for a neighbour.** Making `WalletOperation: Codable`
  so a module one over could encode it was "a lame excuse".
- **Ask what decides.** "If a reducer checks amount > 0, that is not up to him
  to decide! The payment state machine is receiving an optional valid value."
- **Settings-like components resolve.** Agister: Settings' primary
  responsibility is "resolve"; check is built on it ("a decoration of
  resolve"); init/install are by-products sharing the same knowledge. The run
  is gated by resolve, not by check. Resolve's output and core's input are two
  types, mapped in composition; core gets a `resolveSettings` closure.
- **A layer has a radius.** "The top level of composition has access to
  everything. All others have a limited radius of perception." A router does
  not decide where to go; it asks an injected dependency built in the
  composition (as `getNavigation` functions in `RootViewModelFactory`).

## 4. Composition root, adapters, decorators, composers

- **Composition root is a concept, not a place.** "Composition root is a
  concept, not a place or function in main." "It is not an object, not a
  component... you cannot draw it as a rectangle that has dependencies; draw
  it dashed. Most of the time it is a factory that has other factories as
  dependencies." "Do not confuse it with the name. Name is `{}Factory`."
- **It can span modules and levels.** "Composition root could be in a package
  that creates a component from other components, so main stays thin." "Core
  visible from outside the module could be composed of submodules internal to
  core using thin adapters." "No one says it belongs to one module."
- **The root decides.** "How the hell does the root decide nothing? That is
  exactly the place where we decide what components we wire, whether we wire a
  fake, a stub or the real framework."
- **What it does:** "create instances of the components that live in modules,
  wrap them with adapters and decorators, and plug them into the final
  machinery that would be running. That's it."
- **Adapters** are thin, stateless, own no types, and live in composition:
  "Adapter is a different pattern, never stateful" — so "@Observable adapters"
  is a contradiction. "Adapters/mappers are needed in composition, as well as
  decorators." An adapter that needs the app "is a thin adapter in
  composition... should use polymorphic interfaces (as all adapters should)
  and be tested." "Adapter" also names wrappers of concrete runtimes (Claude,
  Codex, bash); both senses are fine.
- **Wrappers import nothing.** Codex example: the Codex CLI is connected in
  the composition root and nowhere else; the Codex wrapper is its own module,
  imports nothing, speaks Codex-CLI language to its dependency and its own
  domain language outward; the supervisor has its own language and imports
  nothing; in the root, the CLI is injected into the wrapper and the wrapper is
  adapted to speak supervisor.
- **Decorators add behaviour at the root.** A decorator is itself a component. "Imagine I decorate
  the text stream from the recognizer with a file write in the composition
  root — boom, I have text in a file; decorate audio capture and I have audio
  in a file." Tracing "does not justify type expansion — each injected closure
  could be log-decorated." "`--continue` needs more than the session — move it
  to a composition decorator." A setting failure is decorated with stderr.
- **Layers of the composition.** "One leg of the composition creates a wide
  closure (a fully testable function); in the composition that wide function
  is injected with a logger and type-erased... different levels of the
  composition root."
- **Composers are components too.** A composer "defines and owns its
  interfaces"; it "cannot depend on the adapters' composer, should define its
  own types". We choose its boundaries: a core composer (everything but UI)
  and an app composer (UI + core). Purpose: rehearsal, main app, semi-e2e
  tests, profiling and benchmarking all build from the same production parts,
  swapping only boundaries (audio, file system), "so we measure what is really
  used in production".
- **Frameworks are a chosen boundary.** SwiftUI in a UI module is a decision
  to use that framework; it is "the outermost boundary for the composition".

## 5. State, UI and the dumb view

- Unidirectional flow; "dumb views — render state, pass UI events". View tests
  are usually absent; views are verified by previews matching design.
- Formatting and "which details exist" are composition decisions: inject
  formatters into the feature factory's input; the view renders
  `content.formattedAmount` and owns only layout and styling.
- UI modules: "No observable objects in UI modules." For each UI component,
  first create the state shape that answers its scenarios; render it, expose
  events, have a preview. "There should be no agister review for UI
  components — there is no architecture, there are no tests."
- Not everything is a state machine: "Why is a state machine needed to copy
  to the clipboard? Why a single state machine to drive everything in a
  window? A simpler thing is an observable optional selected row."
- A store that holds state and changes it on async completion is "in a way a
  state machine"; ask who holds it, who creates it, whether it notifies
  changes, and what its interface promises.
- A screen that pages a list may be a state machine that "gets its data from
  somewhere and exposes it in chunks", even if all data sits in memory.

## 6. Architecture vs implementation

- "Turning architecture into implementation is not what I want. Drop all
  non-essentials from architecture; some things are worth leaving to
  implementation-phase discovery instead of turning architecture into a
  concrete wall prone to endless fixes."
- An ADR or ARCHITECTURE.md names no types ("types are implementation
  details; ADR is about design"), does not lock public/internal, and does not
  name state/event/effect cases. A state × event matrix in a spec "becomes
  debt, a source of constant drift".
- A rule that is a consequence of the design is a test, not an ADR rule
  ("part of the settings resolve test suite").
- A behaviour scenario is a business triple, not a shape: "G: max amount is
  provided / W: entered amount is bigger than max / T: payment cannot be
  performed", not "Given = state, When = event, Then = state + effect".
- No war stories, no "ruled" trackers, no references to outside material
  that may move. One source of truth: "ARCHITECTURE.md has a new Components —
  why? Do you need 2 sources of truth, diagram and md? With code there would
  be 3."
- Concise: "nearly 1000 lines, terrible read — architecture no one reads."
  Top-level proposals are "pretty concise, not verbose".
- Do not dig corner cases: "I have no intention to build a SaaS like
  Microsoft... look at old agister — it has lots of things covered, but is it
  a good software product? No way — it is extremely difficult to change."
- "You dive too deep into implementation details, but we have not settled on
  architecture yet."

## 7. Sources of truth when designing

- Read the repo's architecture documents before drafting.
- Existing code is "current implementation", not an oracle: "it cannot be
  painted as perfect or best possible. If we can do better, we should."
  Equally, "no code as of today proves nothing" — absence of code does not
  justify a design.
- An MVP note, a FigJam, an issue body or an earlier doc is not an oracle:
  "mvp does not define architecture." "This issue's content could very well be
  stated poorly... rely on what is wrong and present your fixes."
- ARCHITECTURE.md can be wrong; "doing wrong excused by ARCHITECTURE.md is
  not good." A violation that got into it "poisoned the implementation" — fix
  the document, not the symptom.
- An accepted ADR is the rule: implement it as written or stop and ask; do not
  depart and note it.
- Prior art is inspiration, not a template to copy blindly.

## 8. Reading the symptoms

- **Blast radius.** "I see change blast radius as a smell that despite
  modularization components are still highly coupled — otherwise the blast
  would be contained on the adapter border." Dropping a policy file "resulted
  in tens of hours of work and a myriad-line diff" — that is "spaghetti
  architecture", not a cost of mappers.
- **Circling reviews** "might be a bug but could also tell something about
  architecture and testing strategy."
- **Unstable interfaces.** A component changing its interface for 150 hours
  is "a monument to an absolutely wrong approach".
- **Slow tests through real tools** in intermediate work are a design smell.
- **Mutation plants.** "If normal tests cannot show the problem plants
  discover, the component architecture is wrong: you cannot inject a closure,
  inject a spy and observe its payload and result." Add the seam.
- **Huge components** "with significant responsibilities and high coupling"
  are "a very core architecture issue".
- When the fix is a rewrite of the world, the suggestion is wrong too: "you
  suggest a complete rewrite of 10k lines?????"

## 9. Process

- Order: spec in the repo (observer: user, testable with a rehearsal app) →
  research the hard platform parts → **architecture, gated by owner
  approval** → a spec per component → sub-issues → one by one, or in parallel
  where not coupled. "Before you write component specs you need approved
  architecture — do you have one?"
- Build "leafs, then nodes, then composition with root and adapters". A plan
  that builds the composition root first is "a constant point of drift and
  friction".
- Draft the architecture, write specs as Gherkin, "test behaviour, not
  implementation"; no plain rewrite.
- Top-level first ("to create the map we need a continent to map"), then each
  component's inner composition ("is Core a single object? why? what
  subcomponents, responsibilities, interfaces?").
- A process doc does not define components ("components nomenclature is not
  spec-process.md's responsibility"), and an architecture skill does not
  depend on a review skill.
- Go: one package may hold several components with unit tests on their public
  interfaces ("format + layering + kinds could be 3 components within one
  package"); split packages when one package breeds implicit coupling.

## 10. Diagrams

- Every arrow has one meaning, stated in a legend. "What are the arrows —
  data flows? dependencies?"
- Notation from the diagramming skills (`~/Downloads/arch-diagramming`),
  which the owner pointed agents to for diagrams:
  - solid line, normal arrow — uses / depends on (consumer → provider);
  - dashed line, hollow triangle — realizes an interface
    (implementation → interface);
  - solid line, hollow triangle — framework/platform dependency.
  Colour groups areas; it carries no relationship meaning.
- An interface sits with its consumer, never in a free-standing "Ports" box.
  "Why do ports live in a separate something called Application?"
- One abstraction level per diagram; split the view before you accept
  crossings.
- A box either lists its parts or points at them, not both: "it lists its
  contents inline in the box itself, then draws arrows to other dependencies
  that are parts of the box itself... why are some boxes pointed with arrows
  more important than those that are not?" Entry points get their own box.
- The composition root is drawn dashed, as a concept. (The arch-drawio skill
  says to draw it "as a peer at the perimeter"; the owner's rule is the
  dashed outline.)
- The skills were written by an LLM: "new and untested... which has bad ideas
  regarding architecture". Use their notation; do not take their layering.

## 11. Rulings on earlier gaps

- **Shared vocabulary.** Generic, reusable primitives (`Identifiable`,
  `Tagged`) may be shared. Domain notions (Money, File and the like) may not:
  "if you have a shared 'primitive' you force components to change not because
  they need to change but because someone needs to change."
- **Errors.** Same principle: a component owns its interfaces, including the
  types those interfaces use, errors included. Adapters map outside failures
  into them.
- **Concurrency and lifetime.** Concurrency and threading belong to
  composition; a component that reasons about them is drifting beyond its
  responsibility. A component's lifetime (who holds it, until when) is stated
  in each product's architecture doc, not in this approach doc.
- **Constructor shape** is an implementation concern, not architecture. No
  hard rule: 2–3 parameters are fine; 4 or more call for encapsulation, and
  sometimes even 2 are better structured.
- **Decorators are components**, like any other (see the many decorators in
  the iOS repo). There is no threshold where one "becomes" a component.

## 12. Open: how architecture is checked

This collection exists for that. The goal is a skill built from it, and an
agister agent that uses the skill to design and review architecture.
