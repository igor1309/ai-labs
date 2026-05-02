---
date: 2026-01-25
source: "[Closing the Loop on iOS with Claude Code](https://twocentstudios.com/2025/12/27/closing-the-loop-on-ios-with-claude-code/)"
---

# insights

## Links
Use links to test feature
- it’s safe to have Claude to run the openurl command immediately after the install command (or even in the same line) without needing a sleep or otherwise waiting for the launch to complete.

## DerivedData
- Add DerivedData folder to permissions (root settings)
- The DerivedData has a full copy of your Swift Packages, including any documentation. Claude Code can do fast greps to verify syntax or find examples. In my CLAUDE.md I have a direct link for each important package:

```markdown
- `DerivedData/train-timetable/SourcePackages/checkouts/swift-composable-architecture/Sources/ComposableArchitecture/Documentation.docc`
- When using Search/Grep/etc. tools, ignore anything in the /DerivedData folder by default unless specifically looking for build artifacts or code/docs for Swift Packages used by this project
```

## Cache simulator UUID
- The usual command you’ll use to find the simulator you want produces a very long list, so it’s reasonable to cache your favorite simulator’s UDID so each new Claude Code session doesn’t need do this from scratch each time. “Cache” meaning note it in your CLAUDE.md file, add it as an environment variable, etc.

## xcsift
- Install xcsift `brew install xcsift`. xcsift is a companion parsing library for build output. You’ll be building a lot, and you don’t want to fill up your context with hundreds of lines of “file.swift built”. xcsift solves this by producing just the actionable errors and warnings in json.

## Logging
A lot!!

## simctl
The simctl CLI has a ton of abilities that Claude can use to make our lives easier. This includes adding images to Photos, changing the system time, changing the system language, resetting privacy, resetting the keychain, and many more.

Ask Claude to configure your simulator on the fly instead of clicking through settings with your mouse.

## TODO
Complete reading of Step 4&5