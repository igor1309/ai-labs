# Call app processes — QA

A pure rule over a list of processes, each with its audio object, pid,
bundle id and name, and the choice made last time. Every row runs on a
hand-made list. Reading the real
list from Core Audio is system audio capture's binding.

## S-1 The call app's own process is chosen

`us.zoom.xos` is chosen for the prefix `us.zoom`. Evidence: Missing.

## S-2 The call app's helpers are chosen

`com.google.Chrome.helper.Renderer` and its siblings are chosen for
`com.google.Chrome`, and "Comet Helper (Renderer)" with bundle id
`ai.perplexity.comet.helper.renderer` for "Comet". Evidence: Missing.

## S-3 Another app is left out

Music playing beside Zoom is not chosen. Evidence: Missing.

## S-4 An app with a similar name is left out

"Cometary", and a "Comet Helper" whose bundle id has no `.helper`, are not
chosen for "Comet". Evidence: Missing.

## S-5 A process with no bundle id is found by name

A process with an empty bundle id and the name `zoom-cli` is chosen for
`zoom-cli`. Evidence: Missing.

## S-6 With the call app not running, every other app is chosen

With no match on the first ask, the choice is every app, with Audelin's
own pid left out. Evidence: Missing.

## S-7 A helper opened later is chosen

A second ask, with a new Chrome renderer in the list, adds it. Evidence:
Missing.

## S-8 A call app that leaves keeps its choice

A second ask with none of the call app's processes left, given the earlier
choice, returns it. Evidence: Missing.

## S-9 A call app that starts after every app was chosen is chosen

Given the every-app choice, an ask with Zoom now in the list returns Zoom's
processes. Evidence: Missing.
