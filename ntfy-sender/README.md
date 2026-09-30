# ntfy-sender

Static page for sending [ntfy](https://ntfy.sh) notifications from an iPhone (or any browser).
No backend: the page POSTs straight from the browser to the ntfy server using
[JSON publishing](https://docs.ntfy.sh/publish/#publish-as-json).

Live: <https://ntfy-sender.pages.dev/>

## Use

1. Open <https://ntfy-sender.pages.dev/> in Safari, then **Share → Add to Home Screen** to run it as a standalone app.
2. On first launch, set the server (default `https://ntfy.sh`), the topic, and an access token if the topic is protected.
3. Type a message and tap **Send**. Title, priority, tags, click URL and Markdown are under **More options**.

Settings and the last 20 sent messages stay in the browser's `localStorage` only. Nothing is stored server-side.
Anyone who knows a public ntfy.sh topic name can read and write it, so use a hard-to-guess name or an access token.

## Layout

| Path | Purpose |
|------|---------|
| `public/index.html` | The whole app (HTML, CSS, JS inline) |
| `public/manifest.webmanifest`, `public/icon.svg`, `public/apple-touch-icon.png` | Home-screen / PWA metadata |
| `public/_headers` | Cloudflare Pages response headers (CSP, noindex) |
| `tests/page.test.js` | Browser test of the page (Playwright, iPhone profile) |
| `wrangler.toml` | Cloudflare Pages project config |
| `.github/workflows/ntfy-sender-core.yml` | Reusable CI job that runs the browser test |

## Test

`tests/page.test.js` serves `public/` from a local HTTP server with the headers from `public/_headers`
(so the real CSP applies), opens it in Chromium with an iPhone 13 profile, and mocks the ntfy server.
It covers first-run settings, the exact JSON body and `Authorization` header sent, default priority and
no-token sends, an HTTP 403 error, a missing topic, settings and history surviving a reload, and no page
errors or CSP violations during a send.

```sh
npm run test:ntfy-sender
```

It is skipped unless `RUN_NTFY_SENDER_E2E=1` (the script sets it), so root `npm test` needs no browser.
Locally, point it at an installed Chromium with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome` if
`npx playwright install chromium` has not been run. CI runs it via `ntfy-sender-core.yml` when
`ntfy-sender/public/**`, `ntfy-sender/tests/**` or `ntfy-sender/wrangler.toml` change.

## Deploy

`.github/workflows/ntfy-sender-deploy.yml` deploys `public/` to the Cloudflare Pages project `ntfy-sender`
on every push to `trunk` that touches `ntfy-sender/public/**`, `ntfy-sender/tests/**` or `ntfy-sender/wrangler.toml`,
and on manual dispatch. It runs the browser test first and deploys only if it passes. It creates the Pages project on first run, then checks that the production URL
serves the page. It uses the repo's `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets.

Local preview: `python3 -m http.server -d ntfy-sender/public 8000`.
