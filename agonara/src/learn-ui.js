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

    .wide-panel {
      grid-column: 1 / -1;
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

    .navigation-grid {
      display: grid;
      gap: 18px;
      grid-template-columns: minmax(280px, 1fr) minmax(0, 1.3fr);
    }

    .detail-section {
      border-top: 1px solid var(--border);
      display: grid;
      gap: 8px;
      padding-top: 12px;
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
      .operation-grid,
      .navigation-grid {
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
          <label>
            Attempt id
            <input id="quick-check-attempt-id-input" autocomplete="off">
          </label>
          <button data-action="open-quick-check-attempt" data-requires-session class="secondary" type="button">Open attempt</button>
          <div id="quick-check-attempt-detail" class="empty"></div>
        </section>

        <section id="navigation-section" class="panel wide-panel stack" aria-label="Topic, Concept, and Material Navigation">
          <h2>Topic navigation</h2>
          <p id="navigation-status" class="status" aria-live="polite">Navigation not loaded.</p>
          <div class="navigation-grid">
            <section id="navigation-curator-panel" class="stack" aria-label="Curator Navigation">
              <h3>Curator navigation</h3>
              <div class="actions">
                <label>
                  Navigation candidate state
                  <select id="navigation-candidate-status-filter">
                    <option value="draft">Draft</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
                <button id="refresh-navigation-candidates-button" class="secondary" data-requires-session type="button">Refresh</button>
              </div>
              <div id="navigation-candidate-list" class="list">
                <p class="empty">No navigation candidates loaded.</p>
              </div>
              <form id="navigation-candidate-form" class="stack">
                <label>
                  Navigation kind
                  <select id="navigation-kind-input" name="candidateKind">
                    <option value="topic">Topic</option>
                    <option value="concept">Concept</option>
                    <option value="definition">Definition</option>
                    <option value="principle">Principle</option>
                    <option value="material_reference">Material reference</option>
                    <option value="relationship_update">Relationship update</option>
                  </select>
                </label>
                <label>
                  Navigation title
                  <input id="navigation-title-input" name="title">
                </label>
                <label>
                  Navigation body
                  <textarea id="navigation-body-input" name="body"></textarea>
                </label>
                <div class="operation-grid">
                  <label>
                    Material kind
                    <select id="navigation-material-kind-input" name="materialReferenceKind">
                      <option value="">None</option>
                      <option value="article">Article</option>
                      <option value="book">Book</option>
                      <option value="course">Course</option>
                      <option value="lecture">Lecture</option>
                      <option value="note">Note</option>
                      <option value="problem_set">Problem set</option>
                      <option value="standard">Standard</option>
                      <option value="video">Video</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label>
                    Locator
                    <input id="navigation-locator-input" name="locator">
                  </label>
                </div>
                <label>
                  Citation
                  <input id="navigation-citation-input" name="citation">
                </label>
                <label>
                  Source ids
                  <input id="navigation-source-ids-input" name="sourceIds">
                </label>
                <label>
                  Navigation relationships JSON
                  <textarea id="navigation-relationships-input" name="relationshipDrafts"></textarea>
                </label>
                <label>
                  Rationale
                  <textarea id="navigation-rationale-input" name="rationale"></textarea>
                </label>
                <div class="actions">
                  <button type="submit" data-requires-session>Create navigation</button>
                  <button data-action="accept-navigation-candidate" data-requires-session class="secondary" type="button">Approve navigation</button>
                  <button data-action="reject-navigation-candidate" data-requires-session class="danger" type="button">Decline navigation</button>
                </div>
              </form>
              <p id="navigation-candidate-action-status" class="status" aria-live="polite"></p>
            </section>

            <section id="navigation-student-panel" class="stack" aria-label="Student Navigation">
              <h3>Student navigation</h3>
              <button id="refresh-navigation-button" data-requires-session class="secondary" type="button">Refresh navigation</button>
              <div id="program-navigation-summary" class="empty">No navigation summary loaded.</div>
              <div class="detail-section">
                <h3>Topics</h3>
                <div id="navigation-topic-list" class="list">
                  <p class="empty">No topics loaded.</p>
                </div>
              </div>
              <div class="detail-section">
                <h3>Ungrouped concepts</h3>
                <div id="navigation-ungrouped-concept-list" class="list">
                  <p class="empty">No ungrouped concepts loaded.</p>
                </div>
              </div>
              <div class="detail-section">
                <h3>Ungrouped materials</h3>
                <div id="navigation-ungrouped-material-list" class="list">
                  <p class="empty">No ungrouped materials loaded.</p>
                </div>
              </div>
              <div id="navigation-node-detail" class="empty"></div>
              <div id="navigation-material-backlinks" class="list">
                <p class="empty">No material back links loaded.</p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  </div>
  <script>
    (() => {
      const state = {
        acceptedQuickCheck: null,
        attempts: [],
        candidates: [],
        csrfToken: null,
        deliveries: [],
        identity: null,
        mode: "curator",
        navigation: null,
        navigationCandidates: [],
        pendingQuickCheckAttemptKey: null,
        programId: "",
        selectedNavigationCandidateId: null,
        selectedNavigationNode: null,
        selectedAttemptId: null,
        selectedCandidateId: null,
        selectedDelivery: null,
        selectedRevisionId: null,
      };

      const elements = {
        acceptQuickCheckButton: document.querySelector("[data-action='accept-quick-check']"),
        answerForm: document.querySelector("#quick-check-answer-form"),
        answerOptions: document.querySelector("#quick-check-answer-options"),
        attemptDetail: document.querySelector("#quick-check-attempt-detail"),
        attemptIdInput: document.querySelector("#quick-check-attempt-id-input"),
        attemptList: document.querySelector("#quick-check-attempt-list"),
        candidateForm: document.querySelector("#quick-check-candidate-form"),
        candidateList: document.querySelector("#quick-check-candidate-list"),
        candidateStatusFilter: document.querySelector("#quick-check-candidate-status-filter"),
        curatorModeTab: document.querySelector("#curator-mode-tab"),
        curationDetail: document.querySelector("#quick-check-curation-detail"),
        deliveryDetail: document.querySelector("#quick-check-delivery-detail"),
        deliveryList: document.querySelector("#quick-check-delivery-list"),
        logoutButton: document.querySelector("#logout-button"),
        navigationActionStatus: document.querySelector("#navigation-candidate-action-status"),
        navigationBodyInput: document.querySelector("#navigation-body-input"),
        navigationCandidateForm: document.querySelector("#navigation-candidate-form"),
        navigationCandidateList: document.querySelector("#navigation-candidate-list"),
        navigationCandidateStatusFilter: document.querySelector("#navigation-candidate-status-filter"),
        navigationCitationInput: document.querySelector("#navigation-citation-input"),
        navigationKindInput: document.querySelector("#navigation-kind-input"),
        navigationLocatorInput: document.querySelector("#navigation-locator-input"),
        navigationMaterialBacklinks: document.querySelector("#navigation-material-backlinks"),
        navigationMaterialKindInput: document.querySelector("#navigation-material-kind-input"),
        navigationNodeDetail: document.querySelector("#navigation-node-detail"),
        navigationRationaleInput: document.querySelector("#navigation-rationale-input"),
        navigationRelationshipsInput: document.querySelector("#navigation-relationships-input"),
        navigationSourceIdsInput: document.querySelector("#navigation-source-ids-input"),
        navigationStatus: document.querySelector("#navigation-status"),
        navigationStudentPanel: document.querySelector("#navigation-student-panel"),
        navigationTitleInput: document.querySelector("#navigation-title-input"),
        openNavigationCandidateAcceptButton: document.querySelector("[data-action='accept-navigation-candidate']"),
        openNavigationCandidateRejectButton: document.querySelector("[data-action='reject-navigation-candidate']"),
        openQuickCheckAttemptButton: document.querySelector("[data-action='open-quick-check-attempt']"),
        optionInputs: Array.from(document.querySelectorAll("input[name='optionText']")),
        programNavigationSummary: document.querySelector("#program-navigation-summary"),
        programIdInput: document.querySelector("#program-id-input"),
        quickCheckActions: Array.from(document.querySelectorAll("[data-requires-session]")),
        readQuickCheckCurationButton: document.querySelector("[data-action='read-quick-check-curation']"),
        rejectQuickCheckButton: document.querySelector("[data-action='reject-quick-check']"),
        refreshCandidatesButton: document.querySelector("#refresh-candidates-button"),
        refreshNavigationButton: document.querySelector("#refresh-navigation-button"),
        refreshNavigationCandidatesButton: document.querySelector("#refresh-navigation-candidates-button"),
        refreshSessionButton: document.querySelector("#refresh-session-button"),
        sessionSummary: document.querySelector("#session-summary"),
        signinForm: document.querySelector("#signin-form"),
        signinStatus: document.querySelector("#signin-status"),
        studentModeTab: document.querySelector("#student-mode-tab"),
        submitStatus: document.querySelector("#quick-check-submit-status"),
        ungroupedConceptList: document.querySelector("#navigation-ungrouped-concept-list"),
        ungroupedMaterialList: document.querySelector("#navigation-ungrouped-material-list"),
        topicList: document.querySelector("#navigation-topic-list"),
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

      elements.navigationCandidateForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canUseProgramApi()) {
          renderNavigationCandidateStatus("Sign in and set a Program id first.");
          return;
        }
        const body = navigationCandidateInput();
        if (!body) {
          renderNavigationCandidateStatus("Relationship JSON is invalid.");
          return;
        }
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/navigation-candidates", {
          body,
          csrf: true,
          method: "POST",
        });
        if (result.status === "accepted") {
          state.selectedNavigationCandidateId = result.value.navigationCandidate.candidateId;
          await refreshNavigationCandidates();
          renderNavigationCandidateStatus("Created " + result.value.navigationCandidate.title);
          return;
        }
        renderNavigationCandidateStatus("Create failed");
      });

      elements.curatorModeTab.addEventListener("click", () => {
        setMode("curator");
      });

      elements.studentModeTab.addEventListener("click", () => {
        setMode("student");
      });

      elements.deliveryList.addEventListener("click", event => {
        const button = event.target.closest("button[data-revision-id]");
        if (!button) {
          return;
        }
        void selectDelivery(button.dataset.revisionId);
      });

      elements.answerForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!state.selectedDelivery) {
          elements.submitStatus.textContent = "Open a delivery first";
          return;
        }
        const formData = new FormData(elements.answerForm);
        const selectedOptionIndex = Number(formData.get("selectedQuickCheckOption"));
        const selectedOption = state.selectedDelivery.options[selectedOptionIndex];
        if (!selectedOption) {
          elements.submitStatus.textContent = "Select an answer";
          return;
        }
        if (!state.pendingQuickCheckAttemptKey) {
          state.pendingQuickCheckAttemptKey = createBrowserId();
        }
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/quick-check-attempts", {
          body: {
            checkRevisionId: state.selectedDelivery.revisionId,
            selectedOptionId: selectedOption.optionId,
          },
          csrf: true,
          idempotencyKey: state.pendingQuickCheckAttemptKey,
          method: "POST",
        });
        if (result.status === "accepted") {
          state.selectedAttemptId = result.value.quickCheckAttempt.attemptId;
          elements.submitStatus.textContent = "Attempt submitted";
          renderAttemptDetail(result.value.quickCheckAttempt);
          await refreshAttempts();
          return;
        }
        elements.submitStatus.textContent = "Submission failed";
      });

      elements.refreshCandidatesButton.addEventListener("click", async () => {
        await refreshCandidates();
      });

      elements.refreshNavigationCandidatesButton.addEventListener("click", async () => {
        await refreshNavigationCandidates();
      });

      elements.refreshNavigationButton.addEventListener("click", async () => {
        await refreshNavigation();
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

      elements.navigationCandidateList.addEventListener("click", event => {
        const button = event.target.closest("button[data-navigation-candidate-id]");
        if (!button) {
          return;
        }
        state.selectedNavigationCandidateId = button.dataset.navigationCandidateId;
        const candidate = state.navigationCandidates.find($0 => $0.candidateId === state.selectedNavigationCandidateId);
        renderNavigationCandidateStatus(candidate ? "Selected " + candidate.title : "Selected candidate unavailable");
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

      elements.openNavigationCandidateAcceptButton.addEventListener("click", async () => {
        if (!state.selectedNavigationCandidateId) {
          renderNavigationCandidateStatus("Select a navigation candidate first.");
          return;
        }
        const result = await requestJson(
          "/navigation-candidates/" + encodeURIComponent(state.selectedNavigationCandidateId) + "/acceptance",
          {
            body: {},
            csrf: true,
            method: "POST",
          },
        );
        if (result.status === "accepted") {
          renderNavigationCandidateStatus("Accepted " + result.value.navigationChange.acceptedCorpus.title);
          await refreshNavigationCandidates();
          return;
        }
        renderNavigationCandidateStatus("Accept failed");
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

      elements.openNavigationCandidateRejectButton.addEventListener("click", async () => {
        if (!state.selectedNavigationCandidateId) {
          renderNavigationCandidateStatus("Select a navigation candidate first.");
          return;
        }
        const result = await requestJson(
          "/navigation-candidates/" + encodeURIComponent(state.selectedNavigationCandidateId) + "/rejection",
          {
            body: {},
            csrf: true,
            method: "POST",
          },
        );
        if (result.status === "accepted") {
          renderNavigationCandidateStatus("Rejected " + result.value.navigationCandidate.title);
          await refreshNavigationCandidates();
          return;
        }
        renderNavigationCandidateStatus("Reject failed");
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

      elements.navigationStudentPanel.addEventListener("click", event => {
        const nodeButton = event.target.closest("button[data-action='open-navigation-node']");
        if (nodeButton) {
          void openNavigationNode(nodeButton.dataset.entityId);
          return;
        }
        const revisionButton = event.target.closest("button[data-action='open-navigation-revision']");
        if (revisionButton) {
          void openNavigationRevision(revisionButton.dataset.revisionId);
        }
      });

      elements.attemptList.addEventListener("click", event => {
        const button = event.target.closest("button[data-attempt-id]");
        if (!button) {
          return;
        }
        state.selectedAttemptId = button.dataset.attemptId;
        elements.attemptIdInput.value = state.selectedAttemptId;
        void openAttemptDetail();
      });

      elements.openQuickCheckAttemptButton.addEventListener("click", async () => {
        const requestedAttemptId = elements.attemptIdInput.value.trim();
        if (requestedAttemptId) {
          state.selectedAttemptId = requestedAttemptId;
        }
        await openAttemptDetail();
      });

      function acceptSession(value) {
        state.csrfToken = value.csrfToken;
        state.identity = value.identity;
        renderSession();
      }

      function clearSession() {
        state.csrfToken = null;
        state.identity = null;
        state.pendingQuickCheckAttemptKey = null;
        state.selectedAttemptId = null;
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

      function navigationCandidateInput() {
        const relationshipDrafts = parseRelationshipDrafts(elements.navigationRelationshipsInput.value.trim());
        if (relationshipDrafts === null) {
          return null;
        }
        const body = {
          candidateKind: elements.navigationKindInput.value,
          sourceIds: splitIdList(elements.navigationSourceIdsInput.value),
          title: elements.navigationTitleInput.value.trim(),
        };
        addOptionalText(body, "body", elements.navigationBodyInput.value);
        addOptionalText(body, "citation", elements.navigationCitationInput.value);
        addOptionalText(body, "locator", elements.navigationLocatorInput.value);
        addOptionalText(body, "rationale", elements.navigationRationaleInput.value);
        if (elements.navigationMaterialKindInput.value) {
          body.materialReferenceKind = elements.navigationMaterialKindInput.value;
        }
        if (relationshipDrafts.length > 0) {
          body.relationshipDrafts = relationshipDrafts;
        }
        return body;
      }

      function parseRelationshipDrafts(value) {
        if (!value) {
          return [];
        }
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }

      function splitIdList(value) {
        return value
          .split(",")
          .map($0 => $0.trim())
          .filter(Boolean);
      }

      function addOptionalText(target, key, value) {
        const trimmed = value.trim();
        if (trimmed) {
          target[key] = trimmed;
        }
      }

      async function refreshNavigationCandidates() {
        if (!canUseProgramApi()) {
          renderNavigationCandidateStatus("Sign in and set a Program id first.");
          return;
        }
        const status = elements.navigationCandidateStatusFilter.value;
        const result = await requestJson(
          "/programs/" + encodeURIComponent(state.programId) + "/navigation-candidates?status=" + encodeURIComponent(status),
        );
        if (result.status === "accepted") {
          state.navigationCandidates = result.value.navigationCandidates;
          renderNavigationCandidateList();
          return;
        }
        state.navigationCandidates = [];
        renderNavigationCandidateList();
        renderNavigationCandidateStatus("Refresh failed");
      }

      function renderNavigationCandidateList() {
        if (state.navigationCandidates.length === 0) {
          elements.navigationCandidateList.innerHTML = '<p class="empty">No navigation candidates loaded.</p>';
          return;
        }
        elements.navigationCandidateList.innerHTML = "";
        for (const candidate of state.navigationCandidates) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.navigationCandidateId = candidate.candidateId;
          button.textContent = candidate.title + " " + candidate.status;
          elements.navigationCandidateList.append(button);
        }
      }

      function renderNavigationCandidateStatus(message) {
        elements.navigationActionStatus.textContent = message;
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

      async function refreshNavigation() {
        if (!canUseProgramApi()) {
          elements.navigationStatus.textContent = "Sign in and set a Program id first.";
          return;
        }
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/navigation");
        if (result.status === "accepted") {
          state.navigation = result.value.navigation;
          renderNavigationSummary();
          elements.navigationStatus.textContent = "Navigation loaded.";
          return;
        }
        state.navigation = null;
        renderNavigationSummary();
        elements.navigationStatus.textContent = "Navigation unavailable.";
      }

      function renderNavigationSummary() {
        const navigation = state.navigation;
        if (!navigation) {
          elements.programNavigationSummary.textContent = "No navigation summary loaded.";
          renderNavigationSummaryList(elements.topicList, [], "No topics loaded.");
          renderNavigationSummaryList(elements.ungroupedConceptList, [], "No ungrouped concepts loaded.");
          renderNavigationSummaryList(elements.ungroupedMaterialList, [], "No ungrouped materials loaded.");
          return;
        }
        elements.programNavigationSummary.textContent = [
          "Topics " + navigation.topics.length,
          "Ungrouped concepts " + navigation.ungroupedConcepts.length,
          "Ungrouped materials " + navigation.ungroupedMaterials.length,
        ].join("\\n");
        renderNavigationSummaryList(elements.topicList, navigation.topics, "No topics loaded.");
        renderNavigationSummaryList(elements.ungroupedConceptList, navigation.ungroupedConcepts, "No ungrouped concepts loaded.");
        renderNavigationSummaryList(elements.ungroupedMaterialList, navigation.ungroupedMaterials, "No ungrouped materials loaded.");
      }

      function renderNavigationSummaryList(target, nodes, emptyText) {
        if (nodes.length === 0) {
          target.innerHTML = '<p class="empty">' + emptyText + '</p>';
          return;
        }
        target.innerHTML = "";
        for (const node of nodes) {
          target.append(navigationNodeButton(node));
        }
      }

      function navigationNodeButton(node) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = "open-navigation-node";
        button.dataset.entityId = node.entityId;
        button.textContent = node.title + " " + node.acceptedKind;
        return button;
      }

      function navigationRevisionButton(relationship, direction) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = "open-navigation-revision";
        button.dataset.revisionId = direction === "from" ? relationship.fromRevisionId : relationship.toRevisionId;
        button.textContent = (direction === "from" ? relationship.fromTitle : relationship.toTitle) + " revision";
        return button;
      }

      async function openNavigationNode(entityId) {
        if (!entityId) {
          return;
        }
        const result = await requestJson("/navigation/entities/" + encodeURIComponent(entityId));
        if (result.status !== "accepted") {
          elements.navigationNodeDetail.textContent = "Navigation node unavailable.";
          return;
        }
        state.selectedNavigationNode = result.value.navigationNode;
        await renderNavigationNode(state.selectedNavigationNode);
      }

      async function openNavigationRevision(revisionId) {
        if (!revisionId) {
          return;
        }
        const result = await requestJson("/navigation/revisions/" + encodeURIComponent(revisionId));
        if (result.status !== "accepted") {
          elements.navigationNodeDetail.textContent = "Navigation revision unavailable.";
          return;
        }
        renderNavigationRevision(result.value.navigationRevision);
      }

      async function renderNavigationNode(node) {
        elements.navigationNodeDetail.innerHTML = "";
        const lines = [
          node.title,
          node.acceptedKind,
          node.body,
          node.locator,
          node.citation,
        ].filter(Boolean);
        const summary = document.createElement("p");
        summary.textContent = lines.join("\\n");
        elements.navigationNodeDetail.append(summary);
        const outgoing = navigationRelationshipSection("Outgoing", node.relationships.outgoing, "to");
        const incoming = navigationRelationshipSection("Incoming", node.relationships.incoming, "from");
        elements.navigationNodeDetail.append(outgoing, incoming);
        if (node.acceptedKind === "material_reference") {
          await renderMaterialBacklinks(node);
        } else {
          elements.navigationMaterialBacklinks.innerHTML = '<p class="empty">No material back links loaded.</p>';
        }
      }

      function navigationRelationshipSection(title, relationships, direction) {
        const section = document.createElement("div");
        section.className = "detail-section";
        const heading = document.createElement("h3");
        heading.textContent = title;
        section.append(heading);
        if (relationships.length === 0) {
          const empty = document.createElement("p");
          empty.className = "empty";
          empty.textContent = "No links.";
          section.append(empty);
          return section;
        }
        for (const relationship of relationships) {
          section.append(navigationRelationshipNodeButton(relationship, direction));
          section.append(navigationRevisionButton(relationship, direction));
        }
        return section;
      }

      function navigationRelationshipNodeButton(relationship, direction) {
        return navigationNodeButton({
          acceptedKind: direction === "from" ? relationship.fromKind : relationship.toKind,
          entityId: direction === "from" ? relationship.fromEntityId : relationship.toEntityId,
          title: direction === "from" ? relationship.fromTitle : relationship.toTitle,
        });
      }

      function renderNavigationRevision(revision) {
        elements.navigationNodeDetail.textContent = [
          revision.title,
          revision.acceptedKind,
          revision.body,
          revision.locator,
          "Current revision: " + (revision.isCurrentRevision ? "yes" : "no"),
        ].filter(Boolean).join("\\n");
      }

      async function renderMaterialBacklinks(node) {
        elements.navigationMaterialBacklinks.innerHTML = "";
        const seen = new Set();
        for (const relationship of node.relationships.incoming) {
          appendBacklink(relationship.fromEntityId, relationship.fromTitle, relationship.fromKind, seen);
          const parent = await requestJson("/navigation/entities/" + encodeURIComponent(relationship.fromEntityId));
          if (parent.status === "accepted") {
            for (const parentRelationship of parent.value.navigationNode.relationships.incoming) {
              appendBacklink(parentRelationship.fromEntityId, parentRelationship.fromTitle, parentRelationship.fromKind, seen);
            }
          }
        }
        if (seen.size === 0) {
          elements.navigationMaterialBacklinks.innerHTML = '<p class="empty">No material back links loaded.</p>';
        }
      }

      function appendBacklink(entityId, title, acceptedKind, seen) {
        if (seen.has(entityId)) {
          return;
        }
        seen.add(entityId);
        elements.navigationMaterialBacklinks.append(navigationNodeButton({
          acceptedKind,
          entityId,
          title,
        }));
      }

      function setMode(mode) {
        state.mode = mode;
        elements.curatorModeTab.setAttribute("aria-selected", mode === "curator" ? "true" : "false");
        elements.studentModeTab.setAttribute("aria-selected", mode === "student" ? "true" : "false");
        if (mode === "student" && canUseProgramApi()) {
          void refreshDeliveries();
          void refreshAttempts();
          void refreshNavigation();
        }
      }

      async function refreshDeliveries() {
        if (!canUseProgramApi()) {
          return;
        }
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/quick-checks");
        if (result.status === "accepted") {
          state.deliveries = result.value.quickCheckDeliveries;
          renderDeliveryList();
          return;
        }
        state.deliveries = [];
        renderDeliveryList();
      }

      function renderDeliveryList() {
        if (state.deliveries.length === 0) {
          elements.deliveryList.innerHTML = '<p class="empty">No deliveries loaded.</p>';
          return;
        }
        elements.deliveryList.innerHTML = "";
        for (const delivery of state.deliveries) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.revisionId = delivery.revisionId;
          button.textContent = delivery.title;
          elements.deliveryList.append(button);
        }
      }

      async function selectDelivery(revisionId) {
        const result = await requestJson("/quick-checks/revisions/" + encodeURIComponent(revisionId));
        if (result.status !== "accepted") {
          elements.deliveryDetail.textContent = "Delivery unavailable";
          return;
        }
        state.selectedDelivery = result.value.quickCheckDelivery;
        state.pendingQuickCheckAttemptKey = null;
        renderDeliveryDetail(state.selectedDelivery);
      }

      function renderDeliveryDetail(delivery) {
        elements.deliveryDetail.textContent = delivery.title + "\\n" + delivery.prompt;
        elements.answerOptions.innerHTML = "<legend>Answer</legend>";
        delivery.options.forEach((option, index) => {
          const label = document.createElement("label");
          const radio = document.createElement("input");
          radio.name = "selectedQuickCheckOption";
          radio.type = "radio";
          radio.value = String(index);
          label.append(radio, " " + option.text);
          elements.answerOptions.append(label);
        });
      }

      async function refreshAttempts() {
        if (!canUseProgramApi()) {
          return;
        }
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/quick-check-attempts");
        if (result.status === "accepted") {
          state.attempts = result.value.quickCheckAttempts;
          renderAttemptList();
          return;
        }
        state.attempts = [];
        renderAttemptList();
      }

      function renderAttemptList() {
        if (state.attempts.length === 0) {
          elements.attemptList.innerHTML = '<p class="empty">No attempts loaded.</p>';
          return;
        }
        elements.attemptList.innerHTML = "";
        for (const attempt of state.attempts) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.attemptId = attempt.attemptId;
          const delivery = deliveryForRevision(attempt.checkRevisionId);
          button.textContent = delivery ? delivery.title : "Quick Check attempt";
          elements.attemptList.append(button);
        }
      }

      async function openAttemptDetail() {
        if (!state.selectedAttemptId) {
          elements.attemptDetail.textContent = "Attempt unavailable";
          return;
        }
        const result = await requestJson("/quick-check-attempts/" + encodeURIComponent(state.selectedAttemptId));
        if (result.status !== "accepted") {
          elements.attemptDetail.removeAttribute("data-attempt-id");
          elements.attemptDetail.textContent = "Attempt unavailable";
          return;
        }
        renderAttemptDetail(result.value.quickCheckAttempt);
      }

      function renderAttemptDetail(attempt) {
        elements.attemptDetail.dataset.attemptId = attempt.attemptId;
        const delivery = deliveryForRevision(attempt.checkRevisionId);
        const selectedOption = delivery?.options.find($0 => $0.optionId === attempt.selectedOptionId);
        elements.attemptDetail.textContent = [
          delivery ? delivery.title : "Quick Check attempt",
          delivery ? delivery.prompt : attempt.checkRevisionId,
          "Selected: " + (selectedOption ? selectedOption.text : "Unavailable"),
        ].join("\\n");
      }

      function deliveryForRevision(revisionId) {
        if (state.selectedDelivery?.revisionId === revisionId) {
          return state.selectedDelivery;
        }
        return state.deliveries.find($0 => $0.revisionId === revisionId) ?? null;
      }

      function createBrowserId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
          return window.crypto.randomUUID();
        }
        return String(Date.now()) + "-" + Math.random().toString(36).slice(2);
      }

      async function requestJson(path, options = {}) {
        const headers = { "content-type": "application/json" };
        if (options.csrf) {
          headers["x-agonara-csrf"] = state.csrfToken;
        }
        if (options.idempotencyKey) {
          headers["x-agonara-idempotency-key"] = options.idempotencyKey;
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
