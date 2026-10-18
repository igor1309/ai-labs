# Tap safety

A child of 5–7 often taps twice, or keeps tapping while a screen changes.
Every tap in RexLab is safe to repeat: a quick double tap does what one tap
does, never opens a screen twice, and never presses anything on the screen
that appears next. The rule came from MUSEUM on the home page (LAB-290): a
double tap opened the museum once, but its second tap could have landed on
a button of the museum.

## The rule

1. **Screen changes go through one place.** Every screen change goes
   through one guarded entry point in `src/screens.ts`, never a direct
   write of the screen state. A request names the kind of screen it asks
   for (a question, the dinosaur list, a dinosaur's page, a game's board).
   The entry point does nothing when asked for the kind of screen already
   showing or already on its way, so a second tap on SORT or PLAY AGAIN
   deals no second round; a dinosaur's page asked for is the same request
   only for the same dinosaur. While a change waits for its pictures, a
   request for another kind of screen replaces it: the waiting change is
   dropped and never opens. Once a new screen begins to appear, no screen
   takes a tap or starts a drag until it has settled: its view transition
   has ended (or, where the browser runs none, it is shown) and the settle
   window of 500 ms from its appearing has passed, so the second tap of a
   double tap, slower than the motion, still presses nothing. Updates inside the screen showing, such as an answer chosen or
   a food chosen, go through the entry point's own call for updates, not
   its screen changes: rules 2 and 3 govern them.
2. **Actions inside a screen are idempotent.** An action that has started
   (an answer chosen, a card turned, a round or board started, a bone
   dropped, a care action, a skeleton chosen) holds an explicit state, and
   a second trigger while that state holds does nothing.
3. **Stale taps are dropped.** A tap takes effect only if the screen is
   still the one the child tapped on, showing the same thing. Work a tap
   started and that finishes later, such as a wait for pictures, checks
   this before it changes the screen, and does nothing if the child has
   gone elsewhere, or changed what the screen shows, meanwhile.
4. **One settle window, and no other timed guard.** Telling the second
   tap of a double tap from a new tap takes time, so the entry point owns
   the one settle window of rule 1. No button, screen or game has a timed
   guard of its own: no debounce, no "ignore taps for N ms" wrapper. The
   window's timer is injected by the composition root, `src/root.ts`, as
   the wait for pictures' is, so tests fire it.

## Forbidden

- Writing the screen state anywhere but `src/screens.ts`: no
  `setScreen(` call, nor `changeScreen` around one, in `App.tsx`, a game
  module or a screen.
- A one-off guard on a single button in place of the entry point or an
  action's state.
- A timer that drops taps anywhere but the entry point's settle window.

## How it is checked

Two checks keep the rule, added with its sibling issues:

- **The double-tap test** (LAB-299): a registry lists every tappable entry
  point, such as the home tiles, the large card, MUSEUM, back and home
  buttons, result buttons, the catalogue's cards and arrows, the skeleton
  cards, REBUILD, FRIENDS and each game's start and next buttons. Each is tapped twice quickly, and
  exactly one screen change may follow, with nothing pressed on the next
  screen. A screen with no registry entry fails the test.
- **The architecture test** (LAB-300), in `tests/architecture.test.ts`:
  it fails on a screen-state write or `changeScreen` call outside the
  guarded entry point, and on `setTimeout` or `setInterval` outside
  `src/root.ts`, with a message pointing here.
