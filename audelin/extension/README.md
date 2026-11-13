# Audelin Call Companion

A Manifest V3 extension for Chrome and Yandex Browser that tells Audelin who
is in a Yandex Telemost call and who is speaking, so the panel and the
transcript name each remote speaker. It reads the call page's participant
tiles only: no audio, no video, no account data. Participant IDs name a tile
for the life of the page.

## Install

1. Install Audelin (`sh audelin/macos/scripts/install.sh` from the repository
   root) and open it once. At each launch it registers its helper,
   `audelin-browser-host` inside the app, as the native messaging host
   `app.audelin.call_companion` for every installed browser of the two, in
   that browser's `NativeMessagingHosts` folder under
   `~/Library/Application Support`.
2. Build the extension: `npm ci && npm run build` in `audelin/extension`
   writes `dist/`.
3. Open `chrome://extensions` in Chrome or `browser://extensions` in Yandex
   Browser, turn on developer mode, choose **Load unpacked** and pick
   `audelin/extension/dist`.
4. Check that the extension's ID is `boljabpcnipijdcdjjnmnpbfbdjjodkf`. The
   `key` in `manifest.json` fixes it, and the helper's registration lets only
   that ID start it. A copy loaded without the key gets another ID and cannot
   reach Audelin.
5. Join a call at `telemost.yandex.ru/j/…` or `telemost.360.yandex.ru/j/…`
   while Audelin records. Names appear on their side's rows once a remote
   participant speaks.

A browser installed after Audelin's last launch gets the helper at the next
launch. After `npm run build`, press the reload button on the extension's
card for the browser to load the new `dist/`.

## Develop

`npm test` runs the tests, which read saved Telemost pages under jsdom.
The macOS side's live scenario, `audelin/macos/scripts/live-browser-names.sh`,
replays recorded extension events through the app's socket and checks the
panel and transcript name the remote speakers.
