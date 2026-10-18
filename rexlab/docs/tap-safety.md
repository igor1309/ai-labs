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
   which gives the screen showing and `go(next, intent?)`, the only way to
   change it. `next` is a screen, or a function of the screen showing that
   returns the next one, or the screen showing itself to change nothing:
   so work that finishes later (a picture wait) changes the screen only if
   it is still the one the tap came from. `go` knows nothing of pictures
   or input.
2. **Animation (LAB-298).** Each module's `transitionFor(from, to,
   intent)` is a pure function that gives each change's view transition
   type; `go` applies it in the same React transition as the change. A
   change the two screens alone cannot tell apart passes its intent: a
   catalogue page going previous or next, also when the list wraps or has
   one or two dinosaurs. No call site names a transition type.
3. **Timers owned by their occurrence (LAB-298).** A timer that changes
   the screen later (a care reaction or departure, a pairs miss or
   celebration, a skeleton reveal or help) belongs to its visit, board or
   puzzle, and is stopped when that occurrence ends, the game left
   included. Updates inside the occurrence (a bone fitted, a card turned)
   do not stop it.
4. **Double taps (LAB-303).** One filter at the root of the app watches
   pointer input, timed by each event's own time, which `src/root.ts`
   reads and hands it. A tap that counted and ended without a drag opens
   a window; a press less than 500 ms after that tap and less than 100 px
   from where it landed is its second tap, and the filter swallows that
   press's whole sequence (press, moves, release and click), so nothing
   acts on it, whether the screen acts on press (a sort card, a bone) or
   on click. A drag opens no window; a swallowed press opens none.
   Keyboard activation, which has no pointer sequence, is not filtered.
   The filter knows nothing of screens. Accepted cost: two controls
   closer than 100 px, such as neighbouring find-the-pair cards tapped
   near their shared edge, count once if tapped within 500 ms. LAB-303
   removes the guards that exist only for double taps (`MUSEUM_SETTLE`,
   `starting`, `openingCatalogue`) and keeps those that guard a wait the
   child leaves (`roundsLeft`, the `still` checks) for LAB-304.
5. **Pictures (LAB-304).** One `<Picture>` component holds a picture's
   place with a shimmer while it loads and fades it in once decoded, so
   no screen waits for its pictures before it changes. Each game's
   loading and failure behaviour is specified in that issue.

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

Each item lands with its part, and an architecture test searches for it.

- `startTransition` or `addTransitionType` outside `src/screens.ts`, and
  a `useState` or `useReducer` of a screen type, a type whose name ends
  in `Screen`, outside it (LAB-298).
- `setTimeout`, `setInterval`, `Date.now()`, `performance.now()` or an
  event's `timeStamp` outside `src/root.ts` (LAB-303).
- Calling `waitForPictures`, or taking a `LoadPicture`, outside
  `<Picture>` and `src/root.ts` (LAB-304).
- A one-off guard on a single button, once the click filter has landed.
  No search finds it; code review does.
