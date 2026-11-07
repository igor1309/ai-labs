# Audelin

A native macOS call recorder with a floating, selectable live transcript.
Audio and speech recognition run locally. The interface is in Russian;
the transcript is designed for Russian conversations with English terms.

![Floating live transcript with speaker symbols](screenshots/live.png)

- Record microphone and call audio as separate tracks.
- Follow the live transcript with separate speaker symbols and timestamps.
- Select and hold a passage while the conversation continues.
- Scroll back without the viewport jumping; return to live text when ready.
- Resize the panel to fit beside a call window.

![Held passage and paused transcript](screenshots/held.png)

The screenshots show the actual panel rendered with synthetic conversation
text, without recording a real call. This is an experimental app built from
source; there is no signed installer.

## Build and run

Requires Apple silicon, macOS 26 and Xcode 26 with Swift 6.2 or later.

```sh
cd macos
AUDELIN_SIGN_IDENTITY=- sh scripts/bundle.sh
open .build/Audelin.app
```

The command creates an ad hoc signed local app. Grant microphone and system
audio recording access in macOS when prompted. Speech models download on
first use; subsequent recognition runs on the Mac. Recordings are stored
in `~/Recordings/Audelin` by default.

## Tests

Both Swift packages build and test independently:

```sh
cd macos
swift build --build-tests
swift test
cd App
swift build --build-tests
swift test
```

Hardware and permission dependent tests may skip without access to audio devices.

## Code

`macos/Sources` holds the audio, recognition, recording and UI components.
`macos/App/Sources/Composer` connects them; `macos/App/Sources/Audelin`
is the menu bar application. Speech recognition uses
[FluidAudio](https://github.com/FluidInference/FluidAudio); app composition
uses [swift-imrx](https://github.com/igor1309/swift-imrx).
Bundled fonts retain their own license notices.

MIT licensed; see [LICENSE](LICENSE).
