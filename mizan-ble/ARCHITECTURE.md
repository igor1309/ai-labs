# Mizan BLE architecture

The rules Mizan BLE's code follows. Re-read them before designing,
specifying or building.

What this file holds, and what it does not:

- **It holds rules:** how components depend on each other, where the
  outside world is reached, who owns which types, what composition may do,
  and the kinds of component.
- **It holds no feature design.** What a component does, its ports, its
  state, its settings and the reasons for them are in its spec under
  `docs/spec/`, the oracle for its behaviour. A component changes this file
  only when it needs a new rule or kind.
- **It repeats no code:** modules, types and wiring live in the code.

## Grounding

They are SOLID applied by composition: components meet only through
interfaces, and the root composes concrete pieces behind them.

1. **A component names what it provides and owns what it requires.** It
   provides one contract of its own (a flow's events in and state out, or
   a pure function's input and answer), and it declares each collaborator
   as an interface of its own, shaped by the role that collaborator plays
   for it. It never imports another component, a concrete implementation
   or another component's interface, so it changes only for its own
   reasons.
2. **The outside world lives only in adapters.** That covers Core Bluetooth,
   the clock, stored preferences and SwiftUI. A component knows none of
   them. CryptoKit is a library of pure functions here: nothing is kept in
   the Keychain, so it needs no adapter.
3. **Each component owns its types.** There is no shared domain module. The
   host and the client each have their own amount, step and outcome; the
   composition root translates between them and the codec's types.
4. **Only the composition root knows concrete pieces.** It builds every
   component and adapter and decides what answers each interface. It
   decides nothing else: coordination that decides anything is a state
   machine with its own tests, and the root only builds and subscribes.
5. **Adapters translate contracts; decorators add behaviour and keep the
   contract.** An adapter's own API is mapped onto a component's interface
   by a thin translation in the root. A decorator wraps an interface with
   the same interface: logging wraps the radios' events, the messages sent
   and received and each machine's state, and no component logs. Any later
   policy that no screen draws and no flow decides (a retry, a measure, a
   fault injected in a test) is added the same way, without changing a
   component. A policy the person sees is a flow's state instead.
6. **The root composes freely.** One object may answer several interfaces
   (each radio answers several flows), and any interface may be answered
   by an adapter, a fake or a stack of decorators; the components cannot
   tell which.

## Machines

- A flow is a state machine: a pure reducer `(State, Event) -> (State,
  Effect?)` and an effect handler that hands each effect to the one
  dependency given for it and returns the one event that comes back, or
  none. It decides nothing. The root runs each on swift-imrx's
  `ObservableModel`.
- A reducer never does I/O. A choice that depends on state is the
  reducer's, named in the effect; a sequence is one effect per step, each
  result coming back as the next step's event.
- Machines that hand work on are known to each other only through the
  root, which builds the next from what the last handed over. The root's
  mapping is fixed; a choice between outcomes is a reducer's.
- A machine's events from several sources (screen, radio, clock, its own
  effects) meet in a thin, pure mapping in the root; no source knows the
  machine.
- UI modules draw a machine's state and send its user events. They decide
  nothing.

## Kinds of component

| Kind | What it may depend on |
|---|---|
| Core | Interfaces it owns; CryptoKit as a library. No Core Bluetooth, SwiftUI or real time |
| UI | Its own state and event types, and `DesignSystem`, the one dependency between modules |
| Adapter | One outside API (Core Bluetooth peripheral or central, the clock, `UserDefaults`) and interfaces it owns |
| Rehearsal | Root code for the rehearsal app only; may use the cores, as the root does |
| Root | Everything; the only importer of swift-imrx and of concrete types |

- All modules but the root live in the Swift package under `ios/`; the
  root lives in `ios/App/`, so its wiring is tested with `swift test`.
- Only the apps wire in `SystemClock`; no other module or test reads or
  waits on real time.
- Each component has a spec folder under `docs/spec/`; its `SPEC.md` is
  the oracle for what it does, and the GATT layout is the message codec's.
