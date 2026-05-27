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
      --warn: #9a6700;
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

    button,
    input {
      font: inherit;
    }

    button {
      min-height: 36px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: var(--accent);
      color: #ffffff;
      cursor: pointer;
      font-weight: 650;
      padding: 7px 12px;
      white-space: nowrap;
    }

    button.secondary {
      border-color: var(--border);
      background: #ffffff;
      color: var(--text);
    }

    button.danger {
      background: var(--danger);
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

    h2 {
      font-size: 17px;
      line-height: 1.25;
    }

    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
      text-transform: uppercase;
    }

    input {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #ffffff;
      color: var(--text);
      padding: 8px 10px;
    }

    main {
      padding: 18px 0 32px;
    }

    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
    }

    .surface {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      padding: 16px;
    }

    .stack {
      display: grid;
      gap: 12px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .muted {
      color: var(--muted);
    }

    .status {
      min-height: 24px;
      color: var(--muted);
    }

    .status[data-tone="accepted"] {
      color: var(--ok);
    }

    .status[data-tone="rejected"] {
      color: var(--warn);
    }

    .status[data-tone="fault"] {
      color: var(--danger);
    }

    .chip {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 2px 8px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }

    .hidden {
      display: none !important;
    }

    @media (max-width: 780px) {
      header,
      .grid {
        align-items: stretch;
        grid-template-columns: 1fr;
      }

      header {
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
    <div class="actions hidden" id="session-actions">
      <span class="chip" id="session-chip">Signed out</span>
      <button class="secondary" type="button" id="refresh-session-button">Refresh</button>
      <button class="danger" type="button" id="logout-button">Log out</button>
    </div>
  </header>
  <main id="admin-app" data-state="loading">
    <section class="surface stack" id="loading-panel">
      <h2>Loading</h2>
      <p class="status">Checking instance state.</p>
    </section>

    <section class="grid hidden" id="entry-panel">
      <form class="surface stack" id="bootstrap-form" autocomplete="off">
        <h2>Bootstrap</h2>
        <label>
          Bootstrap secret
          <input name="bootstrapSecret" type="password" required autocomplete="off">
        </label>
        <label>
          Display name
          <input name="displayName" type="text" required autocomplete="name">
        </label>
        <label>
          Login
          <input name="login" type="email" required autocomplete="username">
        </label>
        <label>
          Password
          <input name="password" type="password" required autocomplete="new-password">
        </label>
        <button type="submit">Initialize</button>
        <p class="status" id="bootstrap-status"></p>
      </form>

      <form class="surface stack" id="login-form" autocomplete="on">
        <h2>Sign in</h2>
        <label>
          Login
          <input name="login" type="email" required autocomplete="username">
        </label>
        <label>
          Password
          <input name="password" type="password" required autocomplete="current-password">
        </label>
        <button type="submit">Sign in</button>
        <p class="status" id="login-status"></p>
      </form>
    </section>

    <section class="surface stack hidden" id="session-panel">
      <h2>Session</h2>
      <p class="muted" id="session-summary">No active session.</p>
      <p class="status" id="session-status"></p>
    </section>
  </main>
  <script>
    (() => {
      const state = {
        csrfToken: null,
        identity: null
      };
      const elements = {
        app: document.querySelector("#admin-app"),
        bootstrapForm: document.querySelector("#bootstrap-form"),
        bootstrapStatus: document.querySelector("#bootstrap-status"),
        entryPanel: document.querySelector("#entry-panel"),
        loadingPanel: document.querySelector("#loading-panel"),
        loginForm: document.querySelector("#login-form"),
        loginStatus: document.querySelector("#login-status"),
        logoutButton: document.querySelector("#logout-button"),
        refreshSessionButton: document.querySelector("#refresh-session-button"),
        sessionActions: document.querySelector("#session-actions"),
        sessionChip: document.querySelector("#session-chip"),
        sessionPanel: document.querySelector("#session-panel"),
        sessionStatus: document.querySelector("#session-status"),
        sessionSummary: document.querySelector("#session-summary")
      };

      globalThis.agonaraAdmin = {
        apiBase: "",
        state: "loading",
        refresh: refreshSession
      };

      elements.bootstrapForm.addEventListener("submit", async event => {
        event.preventDefault();
        await submitSessionForm(elements.bootstrapForm, "/identity/bootstrap/admin", elements.bootstrapStatus);
      });

      elements.loginForm.addEventListener("submit", async event => {
        event.preventDefault();
        await submitSessionForm(elements.loginForm, "/identity/sessions", elements.loginStatus);
      });

      elements.logoutButton.addEventListener("click", async () => {
        elements.sessionStatus.textContent = "Logging out.";
        const result = await requestJson("/identity/session", { method: "DELETE", csrf: true });
        if (result.status === "accepted") {
          setSignedOut();
          showLogin();
          elements.loginStatus.textContent = "Signed out.";
          elements.loginStatus.dataset.tone = "accepted";
          return;
        }
        renderStatus(elements.sessionStatus, result);
      });

      elements.refreshSessionButton.addEventListener("click", refreshSession);

      refreshSession();

      async function refreshSession() {
        setLoading();
        const session = await requestJson("/identity/session");
        if (session.status === "accepted") {
          setSignedIn(session.value);
          return;
        }

        const bootstrap = await requestJson("/identity/bootstrap/status");
        setSignedOut();
        if (bootstrap.status === "accepted" && bootstrap.value.available) {
          showBootstrap();
          return;
        }
        showLogin();
      }

      async function submitSessionForm(form, path, statusElement) {
        statusElement.textContent = "Submitting.";
        statusElement.dataset.tone = "";
        const result = await requestJson(path, {
          body: Object.fromEntries(new FormData(form)),
          method: "POST"
        });
        form.reset();
        if (result.status === "accepted") {
          renderStatus(statusElement, { status: "accepted", reason: "accepted" });
          setSignedIn(result.value);
          return;
        }
        renderStatus(statusElement, result);
      }

      async function requestJson(path, { body = null, csrf = false, method = "GET" } = {}) {
        try {
          const headers = {};
          if (body) {
            headers["content-type"] = "application/json";
          }
          if (csrf && state.csrfToken) {
            headers["x-agonara-csrf"] = state.csrfToken;
          }
          const response = await fetch(path, {
            body: body ? JSON.stringify(body) : null,
            credentials: "same-origin",
            headers,
            method
          });
          return await response.json();
        } catch {
          return { status: "fault", reason: "network_error" };
        }
      }

      function setLoading() {
        setState("loading");
        showOnly(elements.loadingPanel);
      }

      function setSignedOut() {
        state.csrfToken = null;
        state.identity = null;
        elements.sessionActions.classList.add("hidden");
        elements.sessionChip.textContent = "Signed out";
        elements.sessionSummary.textContent = "No active session.";
        setState("signed-out");
        showOnly(elements.entryPanel);
      }

      function showBootstrap() {
        elements.bootstrapForm.classList.remove("hidden");
        elements.loginForm.classList.add("hidden");
      }

      function showLogin() {
        elements.bootstrapForm.classList.add("hidden");
        elements.loginForm.classList.remove("hidden");
      }

      function setSignedIn(value) {
        state.csrfToken = value.csrfToken;
        state.identity = value.identity;
        elements.sessionActions.classList.remove("hidden");
        elements.sessionChip.textContent = value.identity.displayName;
        elements.sessionSummary.textContent = value.identity.displayName + " · " + value.identity.state + " · " + (value.identity.isAdmin ? "Admin" : "No Admin");
        elements.sessionStatus.textContent = "Session active.";
        elements.sessionStatus.dataset.tone = "accepted";
        setState("signed-in");
        showOnly(elements.sessionPanel);
      }

      function showOnly(element) {
        for (const panel of [elements.loadingPanel, elements.entryPanel, elements.sessionPanel]) {
          panel.classList.toggle("hidden", panel !== element);
        }
      }

      function renderStatus(element, result) {
        element.textContent = messageFor(result);
        element.dataset.tone = result.status;
      }

      function messageFor(result) {
        const messages = {
          accepted: "Accepted.",
          bootstrap_already_completed: "Bootstrap is already completed.",
          csrf_invalid: "Session token expired. Refresh and try again.",
          csrf_required: "Session token required. Refresh and try again.",
          invalid_bootstrap_secret: "Bootstrap secret was rejected.",
          invalid_credentials: "Credentials were rejected.",
          network_error: "Network request failed.",
          rate_limited: "Too many attempts. Wait before retrying.",
          session_not_found: "No active session.",
          session_revoked: "Session ended."
        };
        return messages[result.reason] ?? messages[result.status] ?? "Request failed.";
      }

      function setState(nextState) {
        globalThis.agonaraAdmin.state = nextState;
        elements.app.dataset.state = nextState;
      }
    })();
  </script>
</body>
</html>`;
