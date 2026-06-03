export const learnUiHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agonara Learn</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f5ef;
      --surface: #ffffff;
      --surface-muted: #eef3f6;
      --border: #d6d9dd;
      --text: #1c2329;
      --text-muted: #5e6a72;
      --accent: #277a69;
      --accent-strong: #135345;
      --danger: #a33737;
      --warn: #93640c;
      --shadow: 0 10px 24px rgba(28, 35, 41, 0.08);
      --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      font-size: 15px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    button,
    input,
    select,
    textarea {
      font: inherit;
    }

    button {
      min-height: 38px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: var(--accent);
      color: #ffffff;
      cursor: pointer;
      font-weight: 650;
      padding: 8px 14px;
      white-space: nowrap;
    }

    button.secondary {
      background: var(--surface);
      border-color: var(--border);
      color: var(--text);
    }

    button.danger {
      background: transparent;
      border-color: rgba(163, 55, 55, 0.45);
      color: var(--danger);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    header,
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
    }

    header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 18px;
      padding: 34px 0 22px;
      border-bottom: 1px solid var(--border);
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      color: var(--accent-strong);
      font-size: 34px;
      font-weight: 760;
      line-height: 1.1;
    }

    h2 {
      font-size: 18px;
      line-height: 1.25;
    }

    h3 {
      font-size: 15px;
      line-height: 1.25;
    }

    label,
    legend {
      color: var(--text-muted);
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    label {
      display: grid;
      gap: 6px;
    }

    input,
    select,
    textarea {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #ffffff;
      color: var(--text);
      padding: 9px 11px;
    }

    textarea {
      min-height: 98px;
      resize: vertical;
    }

    input:focus,
    select:focus,
    textarea:focus {
      border-color: var(--accent);
      outline: 2px solid rgba(39, 122, 105, 0.18);
      outline-offset: 1px;
    }

    main {
      display: grid;
      gap: 18px;
      padding: 24px 0 56px;
    }

    .workspace {
      display: grid;
      gap: 18px;
      grid-template-columns: minmax(260px, 330px) minmax(0, 1fr);
    }

    .panel,
    .toolbar {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: var(--shadow);
      padding: 18px;
    }

    .toolbar {
      display: grid;
      gap: 14px;
      grid-template-columns: minmax(220px, 1fr) auto;
      align-items: end;
    }

    .stack {
      display: grid;
      gap: 14px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .mode-tabs {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--surface-muted);
      padding: 3px;
    }

    .mode-tabs button {
      min-height: 34px;
      background: transparent;
      color: var(--text-muted);
    }

    .mode-tabs button[aria-selected="true"] {
      background: var(--surface);
      color: var(--accent-strong);
      box-shadow: 0 1px 4px rgba(28, 35, 41, 0.1);
    }

    .operation-grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .list {
      display: grid;
      gap: 8px;
      min-height: 88px;
    }

    .empty {
      border: 1px dashed var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      padding: 14px;
    }

    .status {
      min-height: 22px;
      color: var(--text-muted);
    }

    .status[data-tone="warn"] {
      color: var(--warn);
    }

    .status[data-tone="danger"] {
      color: var(--danger);
    }

    .hidden {
      display: none !important;
    }

    @media (max-width: 820px) {
      header,
      main {
        width: min(100% - 24px, 680px);
      }

      header,
      .toolbar,
      .workspace,
      .operation-grid {
        grid-template-columns: 1fr;
      }

      header {
        display: grid;
        align-items: start;
      }

      h1 {
        font-size: 28px;
      }
    }
  </style>
</head>
<body>
  <div id="learn-app">
    <header>
      <div class="stack">
        <h1>Agonara Learn</h1>
        <p>Quick Check workspace</p>
      </div>
      <section id="session-panel" class="stack" aria-label="Session">
        <p id="session-summary" class="status">Signed out</p>
        <div class="actions">
          <button id="refresh-session-button" class="secondary" type="button">Refresh</button>
          <button id="logout-button" class="secondary" type="button">Logout</button>
        </div>
      </section>
    </header>

    <main>
      <form id="signin-form" class="toolbar">
        <div class="operation-grid">
          <label>
            Login
            <input name="login" autocomplete="username" required>
          </label>
          <label>
            Password
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
        </div>
        <button type="submit">Sign in</button>
        <p id="signin-status" class="status" aria-live="polite"></p>
      </form>

      <form id="program-context-form" class="toolbar">
        <label>
          Program id
          <input id="program-id-input" name="programId" autocomplete="off" required>
        </label>
        <div class="mode-tabs" role="tablist" aria-label="Quick Check mode">
          <button id="curator-mode-tab" type="button" role="tab" aria-selected="true">Curator</button>
          <button id="student-mode-tab" type="button" role="tab" aria-selected="false">Student</button>
        </div>
      </form>

      <div class="workspace">
        <section id="curator-panel" class="panel stack" aria-label="Curator Quick Checks">
          <h2>Curator</h2>
          <div class="actions">
            <label>
              Status
              <select id="quick-check-candidate-status-filter">
                <option value="draft">Draft</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <button id="refresh-candidates-button" class="secondary" type="button">Refresh</button>
          </div>
          <div id="quick-check-candidate-list" class="list">
            <p class="empty">No curator items loaded.</p>
          </div>
          <form id="quick-check-candidate-form" class="stack">
            <label>
              Title
              <input id="quick-check-title-input" name="title">
            </label>
            <label>
              Prompt
              <textarea id="quick-check-prompt-input" name="prompt"></textarea>
            </label>
            <fieldset id="quick-check-options-fieldset" class="stack">
              <legend>Options</legend>
            </fieldset>
            <label>
              Rationale
              <textarea id="quick-check-rationale-input" name="rationale"></textarea>
            </label>
            <div class="actions">
              <button type="submit">Create</button>
              <button data-action="accept-quick-check" class="secondary" type="button">Accept</button>
              <button data-action="reject-quick-check" class="danger" type="button">Reject</button>
              <button data-action="read-quick-check-curation" class="secondary" type="button">Inspect</button>
            </div>
          </form>
          <div id="quick-check-curation-detail" class="empty"></div>
        </section>

        <section id="student-panel" class="panel stack" aria-label="Student Quick Checks">
          <h2>Student</h2>
          <div id="quick-check-delivery-list" class="list">
            <p class="empty">No deliveries loaded.</p>
          </div>
          <button data-action="open-quick-check-delivery" class="secondary" type="button">Open delivery</button>
          <div id="quick-check-delivery-detail" class="empty"></div>
          <form id="quick-check-answer-form" class="stack">
            <fieldset id="quick-check-answer-options" class="stack">
              <legend>Answer</legend>
            </fieldset>
            <button type="submit">Submit</button>
            <p id="quick-check-submit-status" class="status" aria-live="polite"></p>
          </form>
          <div id="quick-check-attempt-list" class="list">
            <p class="empty">No attempts loaded.</p>
          </div>
          <button data-action="open-quick-check-attempt" class="secondary" type="button">Open attempt</button>
          <div id="quick-check-attempt-detail" class="empty"></div>
        </section>
      </div>
    </main>
  </div>
</body>
</html>`;
