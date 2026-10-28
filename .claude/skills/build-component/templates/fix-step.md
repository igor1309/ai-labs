# LAB-<n> step <k>: answer the code review's fix ruling

## Goal

`<absolute path to goal.md>`

## Covers

- <the goal items, as they stand after this fix>

## Acts on

The judge's fix ruling from agister code_review of commit <sha>:

- **<the item's title>** (<severity>). <The item's detail and action,
  verbatim.>

## Constraints

Write the new test first and show it red on its assertion, then green;
put the red and green runs' failing and passing lines in your report's
checks. No mutation tests. Do not import any other module. Do not change
any spec; if the ruling needs a spec change, stop and report it. If the
Swift module cache is not writable, set `CLANG_MODULE_CACHE_PATH` and
`SWIFTPM_MODULECACHE_OVERRIDE` under `mizan-ble/ios/.build/`. Leave changes
uncommitted. Do not launch nested agents. Do not leave background
processes.

## Open

None.
