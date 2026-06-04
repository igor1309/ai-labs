export const adminBoardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agonara Admin</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0d10;
      --bg-elev: #14181d;
      --bg-elev-2: #1b2027;
      --border: #262d36;
      --text: #e6edf3;
      --text-dim: #8b96a3;
      --accent: #6ee7b7;
      --accent-2: #93c5fd;
      --warn: #fcd34d;
      --danger: #fca5a5;
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
      font-size: 14px;
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
      min-height: 36px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
      color: #0b0d10;
      cursor: pointer;
      font-weight: 600;
      letter-spacing: -0.005em;
      padding: 7px 14px;
      white-space: nowrap;
    }

    button.secondary {
      background: var(--bg-elev-2);
      border-color: var(--border);
      color: var(--text);
    }

    button.danger {
      background: transparent;
      border-color: rgba(252, 165, 165, 0.5);
      color: var(--danger);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
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
      padding: 48px 0 28px;
      border-bottom: 1px solid var(--border);
      background:
        radial-gradient(ellipse at top left, rgba(110, 231, 183, 0.08), transparent 60%),
        radial-gradient(ellipse at top right, rgba(147, 197, 253, 0.06), transparent 55%);
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    h2 {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1.25;
    }

    .pill {
      display: inline-block;
      padding: 4px 12px;
      border: 1px solid var(--border);
      border-radius: 999px;
      font-family: var(--mono);
      font-size: 11px;
      color: var(--accent);
      letter-spacing: 0.04em;
      margin-bottom: 12px;
    }

    label {
      display: grid;
      gap: 6px;
      color: var(--text-dim);
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    input,
    select,
    textarea {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg-elev-2);
      color: var(--text);
      font-family: var(--sans);
      font-size: 14px;
      letter-spacing: normal;
      padding: 8px 12px;
      text-transform: none;
    }

    textarea {
      min-height: 88px;
      resize: vertical;
    }

    input:focus,
    select:focus,
    textarea:focus {
      border-color: var(--accent-2);
      outline: none;
    }

    main {
      padding: 28px 0 64px;
    }

    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
    }

    .surface {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg-elev);
      padding: 20px;
    }

    .stack {
      display: grid;
      gap: 14px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .operation-grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 720px;
    }

    th,
    td {
      border-bottom: 1px solid var(--border);
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }

    th {
      color: var(--text-dim);
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    td code {
      background: var(--bg-elev-2);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--accent);
      font-family: var(--mono);
      font-size: 12px;
      padding: 2px 6px;
    }

    .muted {
      color: var(--text-dim);
    }

    .status {
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.02em;
      min-height: 20px;
      color: var(--text-dim);
    }

    .status[data-tone="accepted"] {
      color: var(--accent);
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
      padding: 2px 10px;
      background: var(--bg-elev);
      color: var(--accent);
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.04em;
    }

    .hidden {
      display: none !important;
    }

    @media (max-width: 780px) {
      header,
      .grid,
      .operation-grid {
        align-items: stretch;
        grid-template-columns: 1fr;
      }

      header {
        flex-direction: column;
        align-items: flex-start;
      }

      h1 {
        font-size: 28px;
      }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <span class="pill">Console · Identity Operations</span>
      <h1>Agonara Admin</h1>
      <p class="muted">Operator controls for bootstrap, identities, credentials, and audit events.</p>
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
      <div class="operation-grid">
        <form class="surface stack" id="create-identity-form" autocomplete="off">
          <h2>Create Identity</h2>
          <label>
            Display name
            <input name="displayName" type="text" required autocomplete="off">
          </label>
          <button type="submit">Create</button>
          <p class="status" id="create-identity-status"></p>
        </form>

        <form class="surface stack" id="credential-form" autocomplete="off">
          <h2>Bind Credential</h2>
          <label>
            Identity ID
            <input name="identityId" type="text" required autocomplete="off">
          </label>
          <label>
            Login
            <input name="login" type="email" required autocomplete="off">
          </label>
          <label>
            Password
            <input name="password" type="password" required autocomplete="new-password">
          </label>
          <button type="submit">Bind</button>
          <p class="status" id="credential-status"></p>
        </form>
      </div>

      <section class="surface stack" id="identity-board">
        <div class="actions">
          <h2>Identities</h2>
          <button class="secondary" type="button" id="refresh-identities-button">Refresh</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Display name</th>
                <th>Identity ID</th>
                <th>State</th>
                <th>Admin</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="identity-list"></tbody>
          </table>
        </div>
        <p class="status" id="identity-status"></p>
      </section>

      <section class="surface stack" id="operational-access-panel">
        <h2>Operational Access</h2>
        <p class="muted" id="operational-access-summary">Select Inspect for an identity.</p>
      </section>

      <section class="surface stack" id="program-membership-admin-panel">
        <h2>Exceptional Program Membership</h2>
        <div class="operation-grid">
          <form class="surface stack" id="program-membership-recovery-form" autocomplete="off">
            <h2>Recover membership</h2>
            <label>
              Program ID
              <input id="program-membership-recovery-program-id-input" name="programId" required autocomplete="off">
            </label>
            <label>
              Target identity ID
              <input id="program-membership-recovery-target-id-input" name="targetIdentityId" required autocomplete="off">
            </label>
            <label>
              Participation kind
              <select id="program-membership-recovery-kind-input" name="participationKind">
                <option value="student">Student</option>
                <option value="program_curator">Program curator</option>
              </select>
            </label>
            <label>
              Recovery reason
              <textarea id="program-membership-recovery-reason-input" name="recoveryReason" required></textarea>
            </label>
            <button type="submit">Recover membership</button>
            <p class="status" id="program-membership-recovery-status" aria-live="polite"></p>
          </form>

          <form class="surface stack" id="program-membership-revocation-form" autocomplete="off">
            <h2>Revoke membership</h2>
            <label>
              Program ID
              <input id="program-membership-revocation-program-id-input" name="programId" required autocomplete="off">
            </label>
            <label>
              Target identity ID
              <input id="program-membership-revocation-target-id-input" name="targetIdentityId" required autocomplete="off">
            </label>
            <label>
              Participation kind
              <select id="program-membership-revocation-kind-input" name="participationKind">
                <option value="student">Student</option>
                <option value="program_curator">Program curator</option>
              </select>
            </label>
            <label>
              Revocation reason
              <textarea id="program-membership-revocation-reason-input" name="revocationReason" required></textarea>
            </label>
            <button class="danger" type="submit">Revoke membership</button>
            <p class="status" id="program-membership-revocation-status" aria-live="polite"></p>
          </form>
        </div>
        <div class="actions">
          <button class="secondary" type="button" id="refresh-program-membership-events-button">Refresh membership events</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Outcome</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Policy</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody id="program-membership-event-list"></tbody>
          </table>
        </div>
        <p class="status" id="program-membership-event-status" aria-live="polite"></p>
      </section>

      <section class="surface stack" id="audit-events-panel">
        <div class="actions">
          <h2>Audit Events</h2>
          <button class="secondary" type="button" id="refresh-audit-events-button">Refresh</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Outcome</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody id="audit-event-list"></tbody>
          </table>
        </div>
        <p class="status" id="audit-event-status"></p>
      </section>
    </section>
  </main>
  <script>
    (() => {
      const state = {
        csrfToken: null,
        identity: null,
        identities: [],
        membershipContextVersion: 0,
        membershipProgramId: null
      };
      const elements = {
        app: document.querySelector("#admin-app"),
        auditEventList: document.querySelector("#audit-event-list"),
        auditEventStatus: document.querySelector("#audit-event-status"),
        bootstrapForm: document.querySelector("#bootstrap-form"),
        bootstrapStatus: document.querySelector("#bootstrap-status"),
        createIdentityForm: document.querySelector("#create-identity-form"),
        createIdentityStatus: document.querySelector("#create-identity-status"),
        credentialForm: document.querySelector("#credential-form"),
        credentialStatus: document.querySelector("#credential-status"),
        entryPanel: document.querySelector("#entry-panel"),
        identityList: document.querySelector("#identity-list"),
        identityStatus: document.querySelector("#identity-status"),
        loadingPanel: document.querySelector("#loading-panel"),
        loginForm: document.querySelector("#login-form"),
        loginStatus: document.querySelector("#login-status"),
        logoutButton: document.querySelector("#logout-button"),
        membershipAdminPanel: document.querySelector("#program-membership-admin-panel"),
        membershipEventList: document.querySelector("#program-membership-event-list"),
        membershipEventStatus: document.querySelector("#program-membership-event-status"),
        membershipRecoveryForm: document.querySelector("#program-membership-recovery-form"),
        membershipRecoveryProgramIdInput: document.querySelector("#program-membership-recovery-program-id-input"),
        membershipRecoveryStatus: document.querySelector("#program-membership-recovery-status"),
        membershipRevocationForm: document.querySelector("#program-membership-revocation-form"),
        membershipRevocationProgramIdInput: document.querySelector("#program-membership-revocation-program-id-input"),
        membershipRevocationStatus: document.querySelector("#program-membership-revocation-status"),
        operationalAccessSummary: document.querySelector("#operational-access-summary"),
        refreshAuditEventsButton: document.querySelector("#refresh-audit-events-button"),
        refreshIdentitiesButton: document.querySelector("#refresh-identities-button"),
        refreshMembershipEventsButton: document.querySelector("#refresh-program-membership-events-button"),
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

      elements.createIdentityForm.addEventListener("submit", async event => {
        event.preventDefault();
        const result = await requestJson("/identity/identities", {
          body: Object.fromEntries(new FormData(elements.createIdentityForm)),
          csrf: true,
          method: "POST"
        });
        elements.createIdentityForm.reset();
        renderStatus(elements.createIdentityStatus, result);
        await refreshIdentities();
        await refreshAuditEvents();
      });

      elements.credentialForm.addEventListener("submit", async event => {
        event.preventDefault();
        const formData = Object.fromEntries(new FormData(elements.credentialForm));
        const result = await requestJson("/identity/identities/" + encodeURIComponent(formData.identityId) + "/local-password", {
          body: { login: formData.login, password: formData.password },
          csrf: true,
          method: "POST"
        });
        elements.credentialForm.reset();
        renderStatus(elements.credentialStatus, result);
        await refreshAuditEvents();
      });

      elements.membershipRecoveryForm.addEventListener("submit", async event => {
        event.preventDefault();
        const body = Object.fromEntries(new FormData(elements.membershipRecoveryForm));
        const contextVersion = state.membershipContextVersion;
        const result = await requestJson("/admin/program-memberships/recovery", {
          body,
          csrf: true,
          method: "POST"
        });
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        state.membershipProgramId = body.programId;
        renderStatus(elements.membershipRecoveryStatus, result);
        await refreshMembershipEvents();
      });

      elements.membershipRevocationForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!confirm("Revoke this Program membership?")) {
          return;
        }
        const body = Object.fromEntries(new FormData(elements.membershipRevocationForm));
        const contextVersion = state.membershipContextVersion;
        const result = await requestJson("/admin/program-memberships/revocation", {
          body,
          csrf: true,
          method: "POST"
        });
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        state.membershipProgramId = body.programId;
        renderStatus(elements.membershipRevocationStatus, result);
        await refreshMembershipEvents();
      });

      for (const input of [elements.membershipRecoveryProgramIdInput, elements.membershipRevocationProgramIdInput]) {
        input.addEventListener("input", () => {
          const programId = input.value.trim() || null;
          if (programId === state.membershipProgramId) {
            return;
          }
          state.membershipContextVersion += 1;
          state.membershipProgramId = programId;
          elements.membershipEventList.textContent = "";
          elements.membershipEventStatus.textContent = "";
          elements.membershipRecoveryStatus.textContent = "";
          elements.membershipRevocationStatus.textContent = "";
        });
      }

      elements.identityList.addEventListener("click", async event => {
        const button = event.target.closest("button[data-action]");
        if (!button) {
          return;
        }
        const identityId = button.dataset.identityId;
        const action = button.dataset.action;
        if (action === "inspect-access") {
          await inspectAccess(identityId);
          return;
        }
        if (action === "disable" && !confirm("Disable this identity?")) {
          return;
        }
        const request = requestForIdentityAction(action, identityId);
        if (!request) {
          return;
        }
        const result = await requestJson(request.path, { csrf: true, method: request.method });
        await refreshIdentities();
        await refreshAuditEvents();
        renderStatus(elements.identityStatus, result);
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

      elements.refreshIdentitiesButton.addEventListener("click", refreshIdentities);
      elements.refreshAuditEventsButton.addEventListener("click", refreshAuditEvents);
      elements.refreshMembershipEventsButton.addEventListener("click", refreshMembershipEvents);
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
        state.membershipContextVersion += 1;
        state.csrfToken = null;
        state.identity = null;
        state.identities = [];
        state.membershipProgramId = null;
        elements.auditEventList.textContent = "";
        elements.membershipEventList.textContent = "";
        elements.membershipEventStatus.textContent = "";
        elements.membershipRecoveryForm.reset();
        elements.membershipRecoveryStatus.textContent = "";
        elements.membershipRevocationForm.reset();
        elements.membershipRevocationStatus.textContent = "";
        elements.membershipAdminPanel.classList.add("hidden");
        elements.sessionActions.classList.add("hidden");
        elements.sessionChip.textContent = "Signed out";
        elements.sessionSummary.textContent = "No active session.";
        elements.identityList.textContent = "";
        elements.operationalAccessSummary.textContent = "Select Inspect for an identity.";
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
        state.membershipContextVersion += 1;
        state.csrfToken = value.csrfToken;
        state.identity = value.identity;
        elements.membershipAdminPanel.classList.toggle("hidden", !value.identity.isAdmin);
        elements.sessionActions.classList.remove("hidden");
        elements.sessionChip.textContent = value.identity.displayName;
        elements.sessionSummary.textContent = value.identity.displayName + " · " + value.identity.state + " · " + (value.identity.isAdmin ? "Admin" : "No Admin");
        elements.sessionStatus.textContent = "Session active.";
        elements.sessionStatus.dataset.tone = "accepted";
        setState("signed-in");
        showOnly(elements.sessionPanel);
        refreshIdentities();
        refreshAuditEvents();
      }

      async function refreshIdentities() {
        const result = await requestJson("/identity/identities");
        if (result.status !== "accepted") {
          renderStatus(elements.identityStatus, result);
          return;
        }
        state.identities = result.value.identities;
        renderIdentities();
        elements.identityStatus.textContent = state.identities.length === 0 ? "No identities." : "Identities refreshed.";
        elements.identityStatus.dataset.tone = "accepted";
      }

      function renderIdentities() {
        elements.identityList.innerHTML = state.identities.map(identity => {
          const adminAction = identity.isAdmin
            ? '<button class="secondary" type="button" data-action="revoke-admin" data-identity-id="' + escapeAttribute(identity.id) + '">Revoke Admin</button>'
            : '<button class="secondary" type="button" data-action="grant-admin" data-identity-id="' + escapeAttribute(identity.id) + '">Grant Admin</button>';
          return '<tr>' +
            '<td>' + escapeHtml(identity.displayName) + '</td>' +
            '<td><code>' + escapeHtml(identity.id) + '</code></td>' +
            '<td>' + escapeHtml(identity.state) + '</td>' +
            '<td>' + (identity.isAdmin ? "yes" : "no") + '</td>' +
            '<td><div class="actions">' +
              '<button class="secondary" type="button" data-action="inspect-access" data-identity-id="' + escapeAttribute(identity.id) + '">Inspect</button>' +
              adminAction +
              '<button class="danger" type="button" data-action="disable" data-identity-id="' + escapeAttribute(identity.id) + '">Disable</button>' +
            '</div></td>' +
          '</tr>';
        }).join("");
      }

      async function inspectAccess(identityId) {
        const result = await requestJson("/identity/identities/" + encodeURIComponent(identityId) + "/operational-access");
        if (result.status !== "accepted") {
          elements.operationalAccessSummary.textContent = messageFor(result);
          return;
        }
        const value = result.value;
        elements.operationalAccessSummary.textContent = value.identity.displayName + " · effective Admin: " + (value.effectiveAdmin ? "yes" : "no");
      }

      async function refreshAuditEvents() {
        const result = await requestJson("/identity/audit-events");
        if (result.status !== "accepted") {
          renderStatus(elements.auditEventStatus, result);
          return;
        }
        const auditEvents = result.value.auditEvents;
        elements.auditEventList.innerHTML = auditEvents.map(auditEvent => (
          '<tr>' +
            '<td>' + escapeHtml(auditEvent.occurredAt) + '</td>' +
            '<td>' + escapeHtml(auditEvent.eventType) + '</td>' +
            '<td>' + escapeHtml(auditEvent.outcome) + '</td>' +
            '<td><code>' + escapeHtml(auditEvent.actorIdentityId ?? "") + '</code></td>' +
            '<td><code>' + escapeHtml(auditEvent.targetIdentityId ?? auditEvent.targetCredentialId ?? "") + '</code></td>' +
            '<td>' + escapeHtml(auditEvent.reason ?? "") + '</td>' +
          '</tr>'
        )).join("");
        elements.auditEventStatus.textContent = auditEvents.length === 0 ? "No audit events." : "Audit events refreshed.";
        elements.auditEventStatus.dataset.tone = "accepted";
      }

      async function refreshMembershipEvents() {
        const programId = state.membershipProgramId ||
          new FormData(elements.membershipRecoveryForm).get("programId") ||
          new FormData(elements.membershipRevocationForm).get("programId");
        if (!programId) {
          elements.membershipEventStatus.textContent = "Set a Program ID first.";
          elements.membershipEventStatus.dataset.tone = "rejected";
          return;
        }
        const contextVersion = state.membershipContextVersion;
        const result = await requestJson("/programs/" + encodeURIComponent(programId) + "/membership-events");
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        if (result.status !== "accepted") {
          renderStatus(elements.membershipEventStatus, result);
          return;
        }
        state.membershipProgramId = programId;
        elements.membershipEventList.innerHTML = result.value.events.map(membershipEvent => (
          '<tr>' +
            '<td>' + escapeHtml(membershipEvent.occurredAt) + '</td>' +
            '<td>' + escapeHtml(membershipEvent.eventType) + '</td>' +
            '<td>' + escapeHtml(membershipEvent.outcome) + '</td>' +
            '<td><code>' + escapeHtml(membershipEvent.actorIdentityId) + '</code></td>' +
            '<td><code>' + escapeHtml(membershipEvent.targetIdentityId) + '</code></td>' +
            '<td>' + escapeHtml(membershipEvent.policyPath ?? "") + '</td>' +
            '<td>' + escapeHtml(membershipEvent.reason ?? "") + '</td>' +
          '</tr>'
        )).join("");
        elements.membershipEventStatus.textContent = result.value.events.length === 0
          ? "No membership events."
          : "Membership events refreshed.";
        elements.membershipEventStatus.dataset.tone = "accepted";
      }

      function requestForIdentityAction(action, identityId) {
        if (action === "disable") {
          return { method: "POST", path: "/identity/identities/" + encodeURIComponent(identityId) + "/disable" };
        }
        if (action === "grant-admin") {
          return { method: "POST", path: "/identity/identities/" + encodeURIComponent(identityId) + "/admin" };
        }
        if (action === "revoke-admin") {
          return { method: "DELETE", path: "/identity/identities/" + encodeURIComponent(identityId) + "/admin" };
        }
        return null;
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
          admin_required: "Admin authority is required.",
          duplicate_login: "Login is already bound.",
          identity_disabled: "Identity is disabled.",
          identity_not_found: "Identity was not found.",
          last_admin_removal: "At least one Admin must remain active.",
          last_admin_removal_rejected: "At least one Admin must remain active.",
          last_curator_required: "At least one active Program Curator must remain.",
          membership_missing: "Membership was not found.",
          network_error: "Network request failed.",
          rate_limited: "Too many attempts. Wait before retrying.",
          session_not_found: "No active session.",
          session_revoked: "Session ended."
        };
        return messages[result.reason] ?? messages[result.status] ?? "Request failed.";
      }

      function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[character]);
      }

      function escapeAttribute(value) {
        return escapeHtml(value);
      }

      function setState(nextState) {
        globalThis.agonaraAdmin.state = nextState;
        elements.app.dataset.state = nextState;
      }
    })();
  </script>
</body>
</html>`;
