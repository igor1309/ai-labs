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
   write of the screen state. A request names the screen it asks for: its
   kind, and for a question its number, for a dinosaur's page, a skeleton
   chosen or a friend called back its dinosaur. A fresh round or board of
   a game is one request, whatever it deals. The entry point does nothing
   when asked for the screen already showing or already on its way, so a
   second tap on SORT or PLAY AGAIN deals no second round, and a second
   tap on NEXT asks again for the question already on its way. While a
   change waits for its pictures, a different request or an update
   replaces it: the waiting change is dropped and never opens, so the
   child's latest choice wins. Once a new
   screen begins to appear, no screen takes a tap or starts a drag until
   it has settled: 500 ms have passed since it began to appear. The window
   outlasts every screen's view transition (320 ms, 160 ms with reduced
   motion), so the second tap of a double tap, slower than the motion,
   still presses nothing. Updates inside the screen showing,
   such as an answer chosen or a food chosen, go through the entry
   point's own call for updates, not its screen changes: rules 2 and 3
   govern them.
2. **Actions inside a screen are idempotent.** An action that has started
   (an answer chosen, a card turned, a bone dropped, a care action) holds
   an explicit state, and a second trigger while that state holds does
   nothing. A round or board started, a skeleton chosen or a friend called
   back is a screen request instead, under rule 1.
3. **Stale taps are dropped.** A tap takes effect only if the screen is
   still the one the child tapped on, showing the same thing. Work a tap
   started and that finishes later, such as a wait for pictures, checks
   this before it changes the screen, and does nothing if the child has
   gone elsewhere, or made an update to the screen through the entry
   point's call for updates, meanwhile.
4. **One settle window, and no other timed guard.** Telling the second
   tap of a double tap from a new tap takes time, so the entry point owns
   the one settle window of rule 1. No button, screen or game has a timed
   guard of its own: no debounce, no "ignore taps for N ms" wrapper. The
   window's timer is injected by the composition root, `src/root.ts`, as
   the wait for pictures' is, so tests fire it. The injected timer and
   clock are the only ones: no code reads the time itself.

## Why 500 ms

Nothing but time tells the second tap of a double tap from a new tap:
every platform recognises a double tap by a window between its taps, of
300 to 500 ms (Android's default and Hammer.js 300 ms, WebKit's media
controls 350 ms, React Native Gesture Handler 500 ms). A view transition
already keeps taps off the new screen's buttons while it runs, since its
pseudo-elements cover the page, but that is 320 ms, 160 ms with reduced
motion, and nothing where the browser runs no transition. No study
measures how far apart a child of 5–7 taps twice by accident; 500 ms
takes the cautious end of the platforms' range for children less sure of
their fingers. It is provisional and one constant: if a child's deliberate
taps are lost on an iPad, lower it toward 350 ms.

Sources: Nácher, Jaén, Navarro, Catalá and González, "Multi-touch
gestures for pre-kindergarten children", IJHCS 73:37–51, 2015, with
children of 2–3 (the 300 ms pass mark); Guerreiro, "User-Sensitive Mobile
Interfaces: Accounting for Individual Differences amongst the Blind", PhD
thesis, 2014, arXiv:1402.1036, section 6 (blind adults' double taps: the
share included levels off at a window of about 400 ms, and some need up to
750 ms); the CSS Working Group's issues #7797 and #12629 on input
during a view transition.

## Forbidden

- Writing the screen state anywhere but `src/screens.ts`: no
  `setScreen(` call, nor `changeScreen` around one, in `App.tsx`, a game
  module or a screen.
- A one-off guard on a single button in place of the entry point or an
  action's state.
- A timer that drops taps anywhere but the entry point's settle window,
  or a time read outside `src/root.ts` (`Date.now()`, `performance.now()`,
  an event's `timeStamp`).

## How it is checked

Two checks keep the rule, added with its sibling issues:

- **The double-tap test** (LAB-299): a registry lists every tappable entry
  point, such as the home tiles, the large card, MUSEUM, back and home
  buttons, result buttons, the catalogue's cards and arrows, the skeleton
  cards, REBUILD, FRIENDS and each game's start and next buttons. Each is
  tapped twice quickly, and exactly one screen change may follow, with
  nothing pressed on the next screen. A screen with no registry entry
  fails the test.
- **The architecture test** (LAB-300), in `tests/architecture.test.ts`:
  it fails on a screen-state write or `changeScreen` call outside the
  guarded entry point, and on `setTimeout`, `setInterval`, `Date.now`,
  `performance.now` or `timeStamp` outside `src/root.ts`, with a message
  pointing here.
