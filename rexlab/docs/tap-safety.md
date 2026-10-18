# Tap safety

A child of 5–7 often taps twice, or keeps tapping while a screen changes.
Every tap in RexLab is safe to repeat: a quick double tap does what one tap
does, never opens a screen twice, and never presses anything on the screen
that appears next. The rule came from MUSEUM on the home page (LAB-290): a
double tap opened the museum once, but its second tap could have landed on
a button of the museum.

## Four parts, each on its own

1. **Screen state.** A tap that changes the screen changes it at once,
   through `go(next)` from `src/screens.ts`, the one writer of screen
   state in App and in each game module. `go` knows nothing of
   animation, pictures or time. Nothing waits before a screen change, so
   nothing arrives late, nothing is replaced and no tap goes stale.
2. **Animation.** How one screen gives way to the next is worked out in
   one place from the change itself: a pure `transitionFor(from, to)`
   gives the view transition type (the next question, a page closing to
   its card, a page sliding left or right, or a plain screen change).
   Callers never name a transition type.
3. **Pictures.** One `<Picture>` component shows a shimmer in the
   picture's place while it loads and fades the picture in once it is
   decoded; a picture that fails shows the dinosaur symbol. Nothing
   outside it knows where pictures come from or when they arrive.
4. **Double taps.** One input filter at the root of the app drops a tap
   that lands within 500 ms and 100 px of the tap before it, whatever
   the screen, timed by the clock `src/root.ts` injects. Two quick taps
   far apart both count. Actions inside a screen keep the states their
   games give them.

## Why 500 ms and 100 px

Platforms recognise a double tap by time and place: a window of 300 to
500 ms (Android and Hammer.js 300 ms, WebKit's media controls 350 ms,
React Native Gesture Handler 500 ms) and Android's double-tap slop of
100 dp. No study measures how far apart a child of 5–7 taps twice by
accident; 500 ms takes the cautious end. If deliberate taps are lost on
an iPad, lower it toward 350 ms. Sources: Nácher et al., IJHCS 73:37–51,
2015 (children of 2–3, 300 ms); Guerreiro, PhD thesis, 2014,
arXiv:1402.1036, section 6 (about 400 ms, some up to 750 ms).

## Forbidden

- Writing screen state but through `go`, or naming a view transition
  type at a call site.
- Waiting for pictures before a screen change.
- A one-off guard on a single button.
- A timer or a time read (`setTimeout`, `setInterval`, `Date.now()`,
  `performance.now()`, an event's `timeStamp`) outside `src/root.ts`.

## How it is checked

- `docs/features/double-tap.feature`: a double tap on every control that
  changes the screen opens one screen and presses nothing on it.
- Unit tests of each part on its own: `go` as plain state,
  `transitionFor` as a table of changes, `<Picture>` with pictures that
  load, fail or never arrive, and the filter with a fake clock (LAB-299).
- An architecture test (LAB-300) fails on a screen write outside `go`, a
  transition type named at a call site, a wait for pictures before a
  screen change, and a timer or time read outside `src/root.ts`, with a
  message pointing here.
