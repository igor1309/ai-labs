# ntfy-sender

Static page for sending [ntfy](https://ntfy.sh) notifications from an iPhone (or any browser).
No backend: the page POSTs straight from the browser to the ntfy server using
[JSON publishing](https://docs.ntfy.sh/publish/#publish-as-json).

## Use

1. Open the deployed page in Safari, then **Share → Add to Home Screen** to run it as a standalone app.
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
| `wrangler.toml` | Cloudflare Pages project config |

## Deploy

`.github/workflows/ntfy-sender-deploy.yml` deploys `public/` to the Cloudflare Pages project `ntfy-sender`
on every push to `trunk` that touches `ntfy-sender/public/**` or `ntfy-sender/wrangler.toml`,
and on manual dispatch. It creates the Pages project on first run, then checks that the production URL
serves the page. It uses the repo's `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets.

Local preview: `python3 -m http.server -d ntfy-sender/public 8000`.
