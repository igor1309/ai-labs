export const adminBoardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agonara Admin</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --panel: #ffffff;
      --border: #d8dde8;
      --text: #172033;
      --muted: #657085;
      --accent: #2864d7;
      --danger: #b42318;
      --ok: #067647;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.4;
    }

    header,
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 22px 0 14px;
      border-bottom: 1px solid var(--border);
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      font-size: 22px;
      font-weight: 700;
    }

    main {
      padding: 18px 0 32px;
    }

    .surface {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      padding: 16px;
    }

    .muted {
      color: var(--muted);
    }

    .status {
      min-height: 24px;
      margin-top: 12px;
      color: var(--muted);
    }

    .hidden {
      display: none !important;
    }

    @media (max-width: 700px) {
      header {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Agonara Admin</h1>
      <p class="muted">Identity operations</p>
    </div>
  </header>
  <main id="admin-app" data-state="loading">
    <section class="surface" id="loading-panel">
      <h2>Loading</h2>
      <p class="status">Checking instance state.</p>
    </section>
  </main>
  <script>
    globalThis.agonaraAdmin = {
      apiBase: "",
      state: "loading"
    };
  </script>
</body>
</html>`;
