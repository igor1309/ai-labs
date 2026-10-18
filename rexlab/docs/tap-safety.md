# Tap safety

A child of 5–7 often taps twice, or keeps tapping while a screen changes.
Every tap in RexLab is safe to repeat: a quick double tap does what one tap
does, never opens a screen twice, and never presses anything on the screen
that appears next. The rule came from MUSEUM on the home page (LAB-290): a
double tap opened the museum once, but its second tap could have landed on
a button of the museum.

## The rule

1. **Screen changes go through one place.** Every screen change goes
   through one guarded entry point, never a direct write of the screen
   state. It does nothing when asked for the screen already showing, or
   for any screen while a screen change is in progress. A change is in
   progress from the tap that asks for it, through any wait for its
   pictures, until the new screen has finished appearing; the new screen
   takes no taps until then.
2. **Actions inside a screen are idempotent.** An action that has started
   (an answer chosen, a card turned, a round or board started, a bone
   dropped, a care action, a skeleton chosen) holds an explicit state, and
   a second trigger while that state holds does nothing.
3. **Stale taps are dropped.** A tap takes effect only if the screen is
   still the one the child tapped on. Work a tap started and that finishes
   later, such as a wait for pictures, checks this before it changes the
   screen, and does nothing if the child has gone elsewhere meanwhile.
4. **No time-based delays as the fix.** A tap is never made safe by
   ignoring taps for a number of milliseconds. Such a wrapper may stay as
   a safety net behind the rule, never as what makes a tap safe. Timers
   are injected by the composition root, `src/root.ts`.

## Forbidden

- Writing the screen state anywhere but the guarded entry point: no
  `setScreen(` call, nor `changeScreen` around one, in `App.tsx`, a game
  module or a screen.
- A one-off guard on a single button in place of the entry point or an
  action's state.
- A timer that drops taps as the only thing keeping a tap safe.

## How it is checked

Two checks keep the rule, added with its sibling issues:

- **The double-tap test** (LAB-299): a registry lists every tappable entry
  point (home tiles, MUSEUM, back and home buttons, result buttons and
  each game's start and next buttons). Each is tapped twice quickly, and
  exactly one screen change may follow, with nothing pressed on the next
  screen. A screen with no registry entry fails the test.
- **The architecture test** (LAB-300), in `tests/architecture.test.ts`:
  it fails on a screen-state write or `changeScreen` call outside the
  guarded entry point, and on `setTimeout` or `setInterval` outside
  `src/root.ts`, with a message pointing here.
