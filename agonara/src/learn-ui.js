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

    .list button {
      width: 100%;
      background: var(--surface-muted);
      border-color: var(--border);
      color: var(--text);
      text-align: left;
    }

    .option-row {
      display: grid;
      gap: 8px;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
    }

    .option-row input[type="radio"] {
      width: auto;
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
              <div class="option-row">
                <input name="answerKeyOptionIndex" type="radio" value="0" aria-label="Answer key option 1" checked>
                <input name="optionText" aria-label="Option 1">
              </div>
              <div class="option-row">
                <input name="answerKeyOptionIndex" type="radio" value="1" aria-label="Answer key option 2">
                <input name="optionText" aria-label="Option 2">
              </div>
            </fieldset>
            <label>
              Rationale
              <textarea id="quick-check-rationale-input" name="rationale"></textarea>
            </label>
            <div class="actions">
              <button type="submit" data-requires-session>Create</button>
              <button data-action="accept-quick-check" data-requires-session class="secondary" type="button">Accept</button>
              <button data-action="reject-quick-check" data-requires-session class="danger" type="button">Reject</button>
              <button data-action="read-quick-check-curation" data-requires-session class="secondary" type="button">Inspect</button>
            </div>
          </form>
          <div id="quick-check-curation-detail" class="empty"></div>
        </section>

        <section id="student-panel" class="panel stack" aria-label="Student Quick Checks">
          <h2>Student</h2>
          <div id="quick-check-delivery-list" class="list">
            <p class="empty">No deliveries loaded.</p>
          </div>
          <button data-action="open-quick-check-delivery" data-requires-session class="secondary" type="button">Open delivery</button>
          <div id="quick-check-delivery-detail" class="empty"></div>
          <form id="quick-check-answer-form" class="stack">
            <fieldset id="quick-check-answer-options" class="stack">
              <legend>Answer</legend>
            </fieldset>
            <button type="submit" data-requires-session>Submit</button>
            <p id="quick-check-submit-status" class="status" aria-live="polite"></p>
          </form>
          <div id="quick-check-attempt-list" class="list">
            <p class="empty">No attempts loaded.</p>
          </div>
          <button data-action="open-quick-check-attempt" data-requires-session class="secondary" type="button">Open attempt</button>
          <div id="quick-check-attempt-detail" class="empty"></div>
        </section>
      </div>
    </main>
  </div>
  <script>
    (() => {
      const state = {
        acceptedQuickCheck: null,
        candidates: [],
        csrfToken: null,
        identity: null,
        mode: "curator",
        programId: "",
        selectedCandidateId: null,
        selectedRevisionId: null,
      };

      const elements = {
        acceptQuickCheckButton: document.querySelector("[data-action='accept-quick-check']"),
        candidateForm: document.querySelector("#quick-check-candidate-form"),
        candidateList: document.querySelector("#quick-check-candidate-list"),
        candidateStatusFilter: document.querySelector("#quick-check-candidate-status-filter"),
        curatorModeTab: document.querySelector("#curator-mode-tab"),
        curationDetail: document.querySelector("#quick-check-curation-detail"),
        logoutButton: document.querySelector("#logout-button"),
        optionInputs: Array.from(document.querySelectorAll("input[name='optionText']")),
        programIdInput: document.querySelector("#program-id-input"),
        quickCheckActions: Array.from(document.querySelectorAll("[data-requires-session]")),
        readQuickCheckCurationButton: document.querySelector("[data-action='read-quick-check-curation']"),
        rejectQuickCheckButton: document.querySelector("[data-action='reject-quick-check']"),
        refreshCandidatesButton: document.querySelector("#refresh-candidates-button"),
        refreshSessionButton: document.querySelector("#refresh-session-button"),
        sessionSummary: document.querySelector("#session-summary"),
        signinForm: document.querySelector("#signin-form"),
        signinStatus: document.querySelector("#signin-status"),
        studentModeTab: document.querySelector("#student-mode-tab"),
      };

      elements.quickCheckActions.push(elements.refreshCandidatesButton);

      elements.signinForm.addEventListener("submit", async event => {
        event.preventDefault();
        const formData = new FormData(elements.signinForm);
        elements.signinStatus.textContent = "Signing in";
        const result = await requestJson("/identity/sessions", {
          body: {
            login: String(formData.get("login") ?? ""),
            password: String(formData.get("password") ?? ""),
          },
          method: "POST",
        });
        if (result.status === "accepted") {
          acceptSession(result.value);
          elements.signinStatus.textContent = "Signed in";
          return;
        }
        clearSession();
        elements.signinStatus.textContent = "Sign in failed";
      });

      elements.refreshSessionButton.addEventListener("click", async () => {
        const result = await requestJson("/identity/session");
        if (result.status === "accepted") {
          acceptSession(result.value);
          return;
        }
        clearSession();
      });

      elements.logoutButton.addEventListener("click", async () => {
        if (!state.csrfToken) {
          clearSession();
          return;
        }
        await requestJson("/identity/session", {
          csrf: true,
          method: "DELETE",
        });
        clearSession();
      });

      elements.programIdInput.addEventListener("input", () => {
        state.programId = elements.programIdInput.value.trim();
      });

      elements.candidateForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canUseProgramApi()) {
          renderCurationStatus("Sign in and set a Program id first.");
          return;
        }
        const formData = new FormData(elements.candidateForm);
        const options = elements.optionInputs.map($0 => $0.value.trim());
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/quick-checks/candidates", {
          body: {
            answerKeyOptionIndex: Number(formData.get("answerKeyOptionIndex")),
            checkKind: "single_select_quick_check",
            options,
            prompt: String(formData.get("prompt") ?? ""),
            rationale: String(formData.get("rationale") ?? ""),
            sourceIds: [],
            title: String(formData.get("title") ?? ""),
          },
          csrf: true,
          method: "POST",
        });
        if (result.status === "accepted") {
          state.selectedCandidateId = result.value.quickCheckCandidate.candidateId;
          await refreshCandidates();
          renderCurationStatus("Created " + result.value.quickCheckCandidate.title);
          return;
        }
        renderCurationStatus("Create failed");
      });

      elements.curatorModeTab.addEventListener("click", () => {
        setMode("curator");
      });

      elements.studentModeTab.addEventListener("click", () => {
        setMode("student");
      });

      elements.refreshCandidatesButton.addEventListener("click", async () => {
        await refreshCandidates();
      });

      elements.candidateList.addEventListener("click", event => {
        const button = event.target.closest("button[data-candidate-id]");
        if (!button) {
          return;
        }
        state.selectedCandidateId = button.dataset.candidateId;
        const candidate = state.candidates.find($0 => $0.candidateId === state.selectedCandidateId);
        renderCurationStatus(candidate ? "Selected " + candidate.title : "Selected candidate unavailable");
      });

      elements.acceptQuickCheckButton.addEventListener("click", async () => {
        if (!state.selectedCandidateId) {
          renderCurationStatus("Select a candidate first.");
          return;
        }
        const result = await requestJson("/quick-checks/candidates/" + encodeURIComponent(state.selectedCandidateId) + "/acceptance", {
          body: {},
          csrf: true,
          method: "POST",
        });
        if (result.status === "accepted") {
          state.acceptedQuickCheck = result.value.acceptedQuickCheck;
          state.selectedRevisionId = result.value.acceptedQuickCheck.revisionId;
          renderCurationStatus("Accepted " + result.value.acceptedQuickCheck.title);
          await refreshCandidates();
          return;
        }
        renderCurationStatus("Accept failed");
      });

      elements.rejectQuickCheckButton.addEventListener("click", async () => {
        if (!state.selectedCandidateId) {
          renderCurationStatus("Select a candidate first.");
          return;
        }
        const result = await requestJson("/quick-checks/candidates/" + encodeURIComponent(state.selectedCandidateId) + "/rejection", {
          body: {},
          csrf: true,
          method: "POST",
        });
        if (result.status === "accepted") {
          renderCurationStatus("Rejected " + result.value.quickCheckCandidate.title);
          await refreshCandidates();
          return;
        }
        renderCurationStatus("Reject failed");
      });

      elements.readQuickCheckCurationButton.addEventListener("click", async () => {
        if (!state.selectedRevisionId) {
          renderCurationStatus("Accept a candidate before inspection.");
          return;
        }
        const result = await requestJson("/quick-checks/revisions/" + encodeURIComponent(state.selectedRevisionId) + "/curation");
        if (result.status === "accepted") {
          state.acceptedQuickCheck = result.value.acceptedQuickCheck;
          renderAcceptedQuickCheck(state.acceptedQuickCheck);
          return;
        }
        renderCurationStatus("Inspection failed");
      });

      function acceptSession(value) {
        state.csrfToken = value.csrfToken;
        state.identity = value.identity;
        renderSession();
      }

      function clearSession() {
        state.csrfToken = null;
        state.identity = null;
        elements.signinStatus.textContent = "";
        renderSession();
      }

      function renderSession() {
        const signedIn = Boolean(state.identity);
        elements.sessionSummary.textContent = signedIn
          ? "Signed in as " + state.identity.displayName
          : "Signed out";
        for (const action of elements.quickCheckActions) {
          action.disabled = !signedIn;
        }
      }

      async function refreshCandidates() {
        if (!canUseProgramApi()) {
          renderCurationStatus("Sign in and set a Program id first.");
          return;
        }
        const status = elements.candidateStatusFilter.value;
        const result = await requestJson(
          "/programs/" + encodeURIComponent(state.programId) + "/quick-checks/candidates?status=" + encodeURIComponent(status),
        );
        if (result.status === "accepted") {
          state.candidates = result.value.quickCheckCandidates;
          renderCandidateList();
          return;
        }
        state.candidates = [];
        renderCandidateList();
        renderCurationStatus("Refresh failed");
      }

      function renderCandidateList() {
        if (state.candidates.length === 0) {
          elements.candidateList.innerHTML = '<p class="empty">No curator items loaded.</p>';
          return;
        }
        elements.candidateList.innerHTML = "";
        for (const candidate of state.candidates) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.candidateId = candidate.candidateId;
          button.textContent = candidate.title + " " + candidate.status;
          elements.candidateList.append(button);
        }
      }

      function renderAcceptedQuickCheck(quickCheck) {
        const answer = quickCheck.options.find($0 => $0.optionId === quickCheck.answerKeyOptionId);
        const lines = [
          quickCheck.title,
          quickCheck.prompt,
          "Answer: " + (answer ? answer.text : "Unavailable"),
        ];
        if (quickCheck.rationale) {
          lines.push("Rationale: " + quickCheck.rationale);
        }
        elements.curationDetail.textContent = lines.join("\\n");
      }

      function renderCurationStatus(message) {
        elements.curationDetail.textContent = message;
      }

      function canUseProgramApi() {
        state.programId = elements.programIdInput.value.trim();
        return Boolean(state.identity && state.programId);
      }

      function setMode(mode) {
        state.mode = mode;
        elements.curatorModeTab.setAttribute("aria-selected", mode === "curator" ? "true" : "false");
        elements.studentModeTab.setAttribute("aria-selected", mode === "student" ? "true" : "false");
      }

      async function requestJson(path, options = {}) {
        const headers = { "content-type": "application/json" };
        if (options.csrf) {
          headers["x-agonara-csrf"] = state.csrfToken;
        }
        const response = await fetch(path, {
          credentials: "same-origin",
          headers,
          method: options.method ?? "GET",
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        });
        return response.json();
      }

      setMode(state.mode);
      renderSession();
    })();
  </script>
</body>
</html>`;
