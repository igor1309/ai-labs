# Sizing a long TextKit 2 text view

The live panel's transcript is one TextKit 2 text view that grows for the
whole call. In a 3-hour rehearsal its `sizeThatFits` took about 15% of all
CPU: the panel's stack proposes no height, so each update laid out the
whole document to measure it.

## How others do it

- **STTextView** never lays out the whole document to size itself during
  normal use. It reads `usageBoundsForTextContainer`, which is TextKit 2's
  estimate. It then lays out only the document-end location and takes that
  segment's bottom edge as the height. It lays out the visible area plus
  half a screen above and below. The author's comments say a whole-document
  `ensureLayout` "may be time consuming (in seconds)" and that "the extra
  precision doesn't survive the next edit anyway". Its one whole-document
  layout path is in `sizeToFit` for a view that is not vertically
  resizable.
- **CodeEditTextView** (its own line layout, not TextKit 2) gives each
  line an estimated height from one font measurement. It lays out only the
  visible lines plus a margin and corrects a line's height when the line is
  laid out, reporting the new total.
- **Apple (WWDC21 "Meet TextKit 2")**: layout outside the viewport is an
  estimate, and asking to ensure layout for it "can be expensive,
  especially for large documents". Work inside the viewport.

None of them publishes a measured cost. The common rule: size from the
estimate plus the end of the document, and lay out only what is shown.

## What audelin does

When the proposal has no height, `sizeThatFits` does what STTextView does:
it lays out the document-end location and returns the larger of the
`usageBoundsForTextContainer` height and that location's bottom edge. It
lays out the whole document only when asked to fit a bounded height. The
view load test proposes what the panel proposes, a nil height, so it
covers this path.
