# Tap safety

A child of 5–7 often taps twice. In RexLab a quick double tap does what one
tap does: its second tap never opens a screen twice and never presses
anything on the screen that appears next. The rule came from MUSEUM on the
home page (LAB-290): a double tap opened the museum once, but its second
tap could have landed on a button of the museum.

It is built from parts that do not know of each other, each landing in its
own issue, in this order: LAB-298, LAB-303, LAB-304. Until the double-tap
filter lands, today's picture waits and one-off guards keep double taps
safe, and they stay; LAB-304 removes the waits only after it. Each issue
brings the Gherkin of its own behaviour; LAB-298 changes none.

## The parts

1. **Screen state (LAB-298).** App and each game module keep their
   screens with `useScreens(first, transitionFor)` from `src/screens.ts`,
   the only place screen state is written. It changes the screen through
   `go`, which knows nothing of pictures or input.
2. **Animation (LAB-298).** Each module's pure `transitionFor` gives each
   change its view transition type, or none, as today. No call site
   names a transition type.
3. **Timers (LAB-298).** A timer that changes the screen later keeps
   today's checks, and is stopped when its visit, board or puzzle ends,
   the game left included.
4. **Double taps (LAB-303).** One double-tap filter at the root of the
   app swallows the second tap of a double tap, by time and place: less
   than 500 ms and 100 px from the tap before it, timed by each event's
   own time, which `src/root.ts` hands it. It knows nothing of screens.
   Its exact behaviour (when the window opens, drags, repeated taps,
   keyboard) is specified in LAB-303's own feature. Accepted cost: two
   controls closer than 100 px, tapped within 500 ms, count once.
5. **Pictures (LAB-304).** One `<Picture>` component holds a picture's
   place with a shimmer while it loads and fades it in once decoded, so
   no screen waits for its pictures before it changes. LAB-304 specifies
   each game's loading and failure behaviour, and removes the guards of
   the picture waits with them.

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

Each item lands with its part. An architecture test searches for every
item but the last.

- `startTransition` or `addTransitionType` outside `src/screens.ts`
  (LAB-298).
- In App and the game modules, a `useState` or `useReducer` without its
  type written, or with a type whose name ends in `Screen` (LAB-298).
- `setTimeout`, `setInterval`, `Date.now()`, `performance.now()`, an
  argless `new Date()` or an event's `timeStamp` outside `src/root.ts`
  (LAB-303).
- Calling `waitForPictures`, or taking a `LoadPicture`, outside
  `<Picture>` and `src/root.ts` (LAB-304).
- A guard against double taps on a single button, once LAB-303 has
  landed. No search finds it; code review does.
