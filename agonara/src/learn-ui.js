export const learnUiHtml = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agonara Learn</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #101413;
      --surface: #171d1b;
      --surface-muted: #202926;
      --field: #0d1110;
      --border: #34423e;
      --text: #f1f6f3;
      --text-muted: #a8b6b0;
      --accent: #56c5a7;
      --accent-strong: #8de6cf;
      --danger: #ff8c8c;
      --warn: #f0bd5e;
      --shadow: 0 16px 36px rgba(0, 0, 0, 0.34);
      --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
    }

    :root[data-theme="light"] {
      color-scheme: light;
      --bg: #f7f5ef;
      --surface: #ffffff;
      --surface-muted: #eef3f6;
      --field: #ffffff;
      --border: #d6d9dd;
      --text: #1c2329;
      --text-muted: #5e6a72;
      --accent: #277a69;
      --accent-strong: #135345;
      --danger: #a33737;
      --warn: #93640c;
      --shadow: 0 10px 24px rgba(28, 35, 41, 0.08);
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
      align-items: start;
      justify-content: space-between;
      gap: 18px;
      padding: 34px 0 22px;
      border-bottom: 1px solid var(--border);
    }

    .header-tools {
      display: grid;
      gap: 12px;
      justify-items: end;
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
      background: var(--field);
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

    .theme-switcher {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--surface-muted);
      padding: 3px;
    }

    .mode-tabs button,
    .theme-switcher button {
      min-height: 34px;
      background: transparent;
      color: var(--text-muted);
    }

    .mode-tabs button[aria-selected="true"],
    .theme-switcher button[aria-pressed="true"] {
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

    #material-content-body {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
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
      <div class="header-tools">
        <div class="theme-switcher" role="group" aria-label="Theme">
          <button id="theme-toggle-button" class="secondary" type="button" aria-pressed="true" aria-label="Switch to light theme">Dark</button>
        </div>
        <section id="session-panel" class="stack" aria-label="Session">
          <p id="session-summary" class="status">Signed out</p>
          <div class="actions">
            <button id="refresh-session-button" class="secondary" type="button">Refresh</button>
            <button id="logout-button" class="secondary" type="button">Logout</button>
          </div>
        </section>
      </div>
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

        <section id="program-membership-section" class="panel wide-panel stack" aria-label="Program Membership">
          <h2>Program membership</h2>
          <div class="navigation-grid">
            <section id="program-membership-curator-panel" class="stack" aria-label="Curator Program Membership">
              <h3>Curator membership controls</h3>
              <form id="program-admission-policy-form" class="stack">
                <label>
                  Student admission policy
                  <select id="program-admission-policy-input" name="admissionPolicy">
                    <option value="self_join">Self join</option>
                    <option value="invitation_only">Invitation only</option>
                  </select>
                </label>
                <button type="submit" data-requires-session>Save admission policy</button>
                <p id="program-admission-policy-status" class="status" aria-live="polite"></p>
              </form>
              <form id="program-invitation-form" class="stack">
                <label>
                  Student identity id
                  <input id="program-invitation-target-input" name="targetIdentityId" autocomplete="off">
                </label>
                <button id="create-program-invitation-button" type="submit" data-requires-session>Create invitation</button>
                <p id="program-invitation-status" class="status" aria-live="polite"></p>
              </form>
              <div class="actions">
                <label>
                  Invitation state
                  <select id="program-invitation-status-filter">
                    <option value="">All</option>
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="declined">Declined</option>
                    <option value="revoked">Revoked</option>
                  </select>
                </label>
                <button id="refresh-program-invitations-button" class="secondary" data-requires-session type="button">Refresh invitations</button>
              </div>
              <div id="program-invitation-list" class="list">
                <p class="empty">No invitations loaded.</p>
              </div>
              <div class="actions">
                <label>
                  Participant kind
                  <select id="program-participant-kind-filter">
                    <option value="">All</option>
                    <option value="student">Student</option>
                    <option value="program_curator">Program curator</option>
                  </select>
                </label>
                <label>
                  Participant state
                  <select id="program-participant-status-filter">
                    <option value="">All</option>
                    <option value="active">Active</option>
                    <option value="left">Left</option>
                    <option value="removed">Removed</option>
                  </select>
                </label>
                <button id="refresh-program-participants-button" class="secondary" data-requires-session type="button">Refresh participants</button>
              </div>
              <div id="program-participant-list" class="list">
                <p class="empty">No participants loaded.</p>
              </div>
              <p id="program-participant-action-status" class="status" aria-live="polite"></p>
              <form id="curator-leave-program-form" class="stack">
                <button id="curator-leave-program-button" class="danger" type="submit" data-requires-session>Stop curating program</button>
                <p id="curator-leave-program-status" class="status" aria-live="polite"></p>
              </form>
            </section>

            <section id="program-membership-student-panel" class="stack" aria-label="Student Program Membership">
              <h3>Student invitations</h3>
              <button id="join-student-program-button" data-requires-session type="button">Join selected Program</button>
              <p id="student-program-membership-status" class="status" aria-live="polite"></p>
              <button id="refresh-my-program-invitations-button" class="secondary" data-requires-session type="button">Refresh my invitations</button>
              <div id="my-program-invitation-list" class="list">
                <p class="empty">No invitations loaded.</p>
              </div>
              <p id="my-program-invitation-status" class="status" aria-live="polite"></p>
            </section>
          </div>
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

            <section id="material-content-curator-panel" class="stack" aria-label="Curator Material Content">
              <h3>Curator material content</h3>
              <form id="source-content-form" class="stack">
                <label>
                  Source id
                  <input id="source-content-id-input" name="sourceId" type="text" />
                </label>
                <label>
                  Content format
                  <select id="source-content-format-input" name="contentFormat">
                    <option value="markdown">Markdown</option>
                    <option value="plain_text">Plain text</option>
                  </select>
                </label>
                <label>
                  Content
                  <textarea id="source-content-input" name="content"></textarea>
                </label>
                <div class="actions">
                  <button data-action="save-source-content" data-requires-session type="submit">Save source content</button>
                  <button data-action="read-source-content" data-requires-session class="secondary" type="button">Read source content</button>
                  <button data-action="delete-source-content" data-requires-session class="danger" type="button">Delete source content</button>
                  <button data-action="withdraw-source" data-requires-session class="danger" type="button">Withdraw source</button>
                  <button data-action="reactivate-source" data-requires-session class="secondary" type="button">Reactivate source</button>
                  <button data-action="delete-source-record" data-requires-session class="danger" type="button">Delete source</button>
                </div>
              </form>
              <p id="source-content-status" class="status" aria-live="polite"></p>
              <p id="source-lifecycle-status" class="status" aria-live="polite"></p>
              <section id="entity-lifecycle-panel" class="stack" aria-label="Entity Lifecycle">
                <h3>Lifecycle</h3>
                <label>
                  Accepted item family
                  <select id="entity-lifecycle-family-input">
                    <option value="corpus">Corpus topic, concept, or material</option>
                    <option value="quick_check">Quick Check</option>
                    <option value="open_answer_check">Open-answer check</option>
                    <option value="assessment_criterion">Assessment criterion</option>
                    <option value="readiness_check">Readiness check</option>
                    <option value="navigation_relationship">Navigation relationship</option>
                    <option value="source">Program source</option>
                  </select>
                </label>
                <label>
                  Entity or source id
                  <input id="entity-lifecycle-id-input" autocomplete="off">
                </label>
                <div class="actions">
                  <button data-action="withdraw-entity" data-requires-session class="danger" type="button">Withdraw</button>
                  <button data-action="reactivate-entity" data-requires-session class="secondary" type="button">Reactivate</button>
                </div>
                <p id="entity-lifecycle-status" class="status" aria-live="polite"></p>
                <button data-action="open-withdrawn-items" data-requires-session class="secondary" type="button">Withdrawn items</button>
                <div id="withdrawn-items-view" class="list">
                  <p class="empty">No withdrawn items in this session.</p>
                </div>
              </section>
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
              <div id="material-content-view" class="detail-section" aria-label="Material content">
                <h3>Material content</h3>
                <div id="material-content-status" class="empty">No material content loaded.</div>
                <pre id="material-content-body" class="list"></pre>
              </div>
            </section>
          </div>
        </section>

        <section id="learner-state-section" class="panel wide-panel stack" aria-label="Learner State">
          <h2>Learner state</h2>
          <p id="learner-state-status" class="status" aria-live="polite">Learner state not loaded.</p>
          <div class="navigation-grid">
            <section id="learner-state-target-link-panel" class="stack" aria-label="Learner State Target Links">
              <h3>Target links</h3>
              <button id="refresh-learner-state-target-links-button" class="secondary" data-requires-session type="button">Refresh target links</button>
              <div id="learner-state-target-link-list" class="list">
                <p class="empty">No learner-state target links loaded.</p>
              </div>
              <form id="learner-state-target-link-form" class="stack">
                <div class="operation-grid">
                  <label>
                    Learner target kind
                    <select id="learner-state-target-kind-input" name="targetKind">
                      <option value="topic">Topic</option>
                      <option value="concept">Concept</option>
                      <option value="material_reference">Material reference</option>
                    </select>
                  </label>
                  <label>
                    Learner target id
                    <input id="learner-state-target-id-input" name="targetId" autocomplete="off">
                  </label>
                  <label>
                    Evidence owner kind
                    <select id="learner-state-evidence-owner-kind-input" name="evidenceOwnerKind">
                      <option value="accepted_quick_check">Accepted Quick Check</option>
                      <option value="accepted_open_answer_check">Accepted Open Answer Check</option>
                      <option value="accepted_assessment_criterion">Accepted assessment criterion</option>
                    </select>
                  </label>
                  <label>
                    Evidence owner id
                    <input id="learner-state-evidence-owner-id-input" name="evidenceOwnerEntityId" autocomplete="off">
                  </label>
                </div>
                <button type="submit" data-requires-session>Create target link</button>
                <p id="learner-state-target-link-status" class="status" aria-live="polite"></p>
              </form>
            </section>

            <section id="learner-state-student-panel" class="stack" aria-label="Student Learner State">
              <h3>Student progress</h3>
              <button id="refresh-learner-state-button" class="secondary" data-requires-session type="button">Refresh learner state</button>
              <div id="learner-state-summary" class="empty">No learner-state summary loaded.</div>
              <div class="detail-section">
                <h3>Weak areas</h3>
                <div id="learner-state-weak-area-list" class="list">
                  <p class="empty">No weak areas loaded.</p>
                </div>
              </div>
              <div class="detail-section">
                <h3>Topics</h3>
                <div id="learner-state-topic-list" class="list">
                  <p class="empty">No learner-state topics loaded.</p>
                </div>
              </div>
              <div class="detail-section">
                <h3>Concepts</h3>
                <div id="learner-state-concept-list" class="list">
                  <p class="empty">No learner-state concepts loaded.</p>
                </div>
              </div>
              <div class="detail-section">
                <h3>Materials</h3>
                <div id="learner-state-material-list" class="list">
                  <p class="empty">No learner-state materials loaded.</p>
                </div>
              </div>
              <div class="detail-section">
                <h3>Checks</h3>
                <div id="learner-state-check-list" class="list">
                  <p class="empty">No learner-state checks loaded.</p>
                </div>
              </div>
              <div class="detail-section">
                <h3>Criteria</h3>
                <div id="learner-state-criterion-list" class="list">
                  <p class="empty">No learner-state criteria loaded.</p>
                </div>
              </div>
              <div id="learner-state-target-detail" class="empty">No learner-state target selected.</div>
              <div id="learner-state-evidence-list" class="list">
                <p class="empty">No learner-state evidence loaded.</p>
              </div>
            </section>
          </div>
        </section>

        <section id="coverage-gap-section" class="panel wide-panel stack" aria-label="Curator Coverage Gaps">
          <h2>Coverage gaps</h2>
          <p id="coverage-gap-status" class="status" aria-live="polite">Coverage gaps not loaded.</p>
          <div class="navigation-grid">
            <section id="coverage-gap-curator-panel" class="stack" aria-label="Curator Coverage Gap Inspection">
              <h3>Curator coverage</h3>
              <form id="coverage-gap-filter-form" class="stack">
                <div class="operation-grid">
                  <label>
                    Coverage scope kind
                    <select id="coverage-gap-scope-kind-input" name="scopeKind">
                      <option value="program">Program</option>
                      <option value="topic">Topic</option>
                      <option value="concept">Concept</option>
                    </select>
                  </label>
                  <label>
                    Coverage scope id
                    <input id="coverage-gap-scope-id-input" name="scopeId" autocomplete="off">
                  </label>
                  <label>
                    Minimum severity
                    <select id="coverage-gap-minimum-severity-input" name="minimumSeverity">
                      <option value="">All</option>
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
                  <label>
                    Coverage gap kinds
                    <input id="coverage-gap-kind-filter-input" name="gapKind" autocomplete="off">
                  </label>
                </div>
                <button id="refresh-coverage-gaps-button" class="secondary" data-requires-session type="submit">Refresh coverage gaps</button>
              </form>
              <div id="coverage-gap-summary" class="empty">No coverage gap summary loaded.</div>
              <div id="coverage-gap-list" class="list">
                <p class="empty">No coverage gaps loaded.</p>
              </div>
              <div id="coverage-gap-detail" class="empty">No coverage gap selected.</div>
            </section>
          </div>
        </section>

        <section id="llm-curation-suggestion-section" class="panel wide-panel stack" aria-label="LLM Curation Suggestions">
          <h2>LLM suggestions</h2>
          <div class="navigation-grid">
            <section id="llm-curation-suggestion-curator-panel" class="stack" aria-label="Curator LLM Suggestion Review">
              <h3>Curator suggestions</h3>
              <form id="llm-curation-suggestion-generation-form" class="stack">
                <div class="operation-grid">
                  <label>
                    Suggestion policy id
                    <input id="llm-curation-suggestion-policy-input" name="suggestionPolicyId" value="default-deterministic-policy" autocomplete="off">
                  </label>
                  <label>
                    Generation kind
                    <select id="llm-curation-suggestion-kind-input" name="suggestionKind">
                      <option value="">Policy allowed kinds</option>
                      <option value="navigation_candidate">Navigation candidate</option>
                      <option value="quick_check_candidate">Quick Check candidate</option>
                      <option value="assessment_criterion_candidate">Assessment criterion candidate</option>
                      <option value="open_answer_check_candidate">Open-answer check candidate</option>
                      <option value="readiness_check_candidate">Readiness check candidate</option>
                    </select>
                  </label>
                  <label>
                    Max suggestions
                    <input id="llm-curation-suggestion-max-input" name="maxSuggestions" type="number" min="1" max="20" value="2">
                  </label>
                  <label>
                    Coverage gap ids
                    <input id="llm-curation-suggestion-coverage-gap-ids-input" name="coverageGapIds" autocomplete="off">
                  </label>
                </div>
                <label>
                  Context entity ids
                  <input id="llm-curation-suggestion-context-entity-ids-input" name="contextEntityIds" autocomplete="off">
                </label>
                <label>
                  Curator instruction
                  <textarea id="llm-curation-suggestion-instruction-input" name="curatorInstruction">Suggest one safe draft topic.</textarea>
                </label>
                <button id="generate-llm-curation-suggestions-button" type="submit" data-requires-session>Generate suggestions</button>
                <p id="llm-curation-suggestion-generation-status" class="status" aria-live="polite"></p>
              </form>
              <form id="llm-curation-suggestion-filter-form" class="stack">
                <div class="operation-grid">
                  <label>
                    Review state
                    <select id="llm-curation-suggestion-status-filter" name="status">
                      <option value="draft_suggestion">Draft suggestion</option>
                      <option value="materialized">Materialized</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <label>
                    Suggestion kind
                    <select id="llm-curation-suggestion-kind-filter" name="suggestionKind">
                      <option value="">All kinds</option>
                      <option value="navigation_candidate">Navigation candidate</option>
                      <option value="quick_check_candidate">Quick Check candidate</option>
                      <option value="assessment_criterion_candidate">Assessment criterion candidate</option>
                      <option value="open_answer_check_candidate">Open-answer check candidate</option>
                      <option value="readiness_check_candidate">Readiness check candidate</option>
                    </select>
                  </label>
                </div>
                <button id="refresh-llm-curation-suggestions-button" class="secondary" data-requires-session type="submit">Refresh suggestions</button>
                <p id="llm-curation-suggestion-list-status" class="status" aria-live="polite">Suggestions not loaded.</p>
              </form>
              <div id="llm-curation-suggestion-list" class="list">
                <p class="empty">No LLM suggestions loaded.</p>
              </div>
            </section>

            <section id="llm-curation-suggestion-detail" class="stack" aria-label="LLM Suggestion Detail">
              <h3>Suggestion detail</h3>
              <div id="llm-curation-suggestion-origin" class="empty">No suggestion selected.</div>
              <div id="llm-curation-suggestion-supporting-evidence" class="empty">No supporting evidence loaded.</div>
              <div id="llm-curation-suggestion-draft-preview" class="empty">No draft preview loaded.</div>
              <div class="actions">
                <button data-action="accept-llm-curation-suggestion" data-requires-session class="secondary" type="button" disabled>Materialize draft</button>
                <button data-action="reject-llm-curation-suggestion" data-requires-session class="danger" type="button" disabled>Dismiss suggestion</button>
              </div>
              <p id="llm-curation-suggestion-review-status" class="status" aria-live="polite"></p>
            </section>
          </div>
        </section>

        <section id="readiness-check-section" class="panel wide-panel stack" aria-label="Topic and Period Readiness">
          <h2>Readiness checks</h2>
          <div class="navigation-grid">
            <section id="readiness-check-curator-panel" class="stack" aria-label="Curator Readiness Checks">
              <h3>Curator readiness</h3>
              <div class="actions">
                <label>
                  Readiness candidate state
                  <select id="readiness-check-candidate-status-filter">
                    <option value="draft">Draft</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
                <button id="refresh-readiness-check-candidates-button" class="secondary" data-requires-session type="button">Refresh</button>
              </div>
              <div id="readiness-check-candidate-list" class="list">
                <p class="empty">No readiness candidates loaded.</p>
              </div>
              <form id="readiness-check-candidate-form" class="stack">
                <label>
                  Readiness title
                  <input id="readiness-check-title-input" name="title">
                </label>
                <div class="operation-grid">
                  <label>
                    Readiness scope
                    <select id="readiness-check-scope-kind-input" name="scopeKind">
                      <option value="topic">Topic</option>
                      <option value="period">Period</option>
                    </select>
                  </label>
                  <label>
                    Topic entity id
                    <input id="readiness-check-topic-id-input" name="topicEntityId" autocomplete="off">
                  </label>
                  <label>
                    Period title
                    <input id="readiness-check-period-title-input" name="periodTitle">
                  </label>
                  <label>
                    Period topic ids
                    <input id="readiness-check-period-topic-ids-input" name="periodTopicIds" autocomplete="off">
                  </label>
                </div>
                <label>
                  Readiness requirements JSON
                  <textarea id="readiness-check-requirements-input" name="requirements"></textarea>
                </label>
                <label>
                  Readiness source ids
                  <input id="readiness-check-source-ids-input" name="sourceIds" autocomplete="off">
                </label>
                <label>
                  Readiness rationale
                  <textarea id="readiness-check-rationale-input" name="rationale"></textarea>
                </label>
                <div class="actions">
                  <button type="submit" data-requires-session>Save readiness</button>
                  <button data-action="accept-readiness-check-candidate" data-requires-session class="secondary" type="button">Approve readiness</button>
                  <button data-action="reject-readiness-check-candidate" data-requires-session class="danger" type="button">Decline readiness</button>
                  <button data-action="read-readiness-check-curation" data-requires-session class="secondary" type="button">Review readiness</button>
                </div>
                <p id="readiness-check-candidate-action-status" class="status" aria-live="polite"></p>
              </form>
              <div id="readiness-check-curation-detail" class="empty"></div>
            </section>

            <section id="readiness-check-student-panel" class="stack" aria-label="Student Readiness Checks">
              <h3>Student readiness</h3>
              <button id="refresh-readiness-checks-button" class="secondary" data-requires-session type="button">Refresh readiness</button>
              <div id="readiness-check-delivery-list" class="list">
                <p class="empty">No readiness checks loaded.</p>
              </div>
              <button data-action="open-readiness-check-delivery" data-requires-session class="secondary" type="button">Open readiness</button>
              <div id="readiness-check-delivery-detail" class="empty"></div>
              <form id="readiness-check-submit-form" class="stack">
                <button type="submit" data-requires-session>Submit readiness</button>
                <p id="readiness-check-submit-status" class="status" aria-live="polite"></p>
              </form>
              <div id="readiness-check-attempt-list" class="list">
                <p class="empty">No readiness attempts loaded.</p>
              </div>
              <label>
                Readiness attempt id
                <input id="readiness-check-attempt-id-input" autocomplete="off">
              </label>
              <button data-action="open-readiness-check-attempt" data-requires-session class="secondary" type="button">Open readiness attempt</button>
              <div id="readiness-check-attempt-detail" class="empty"></div>
              <div id="readiness-check-requirement-result-list" class="list">
                <p class="empty">No readiness requirement results loaded.</p>
              </div>
              <div id="readiness-check-evidence-detail" class="empty">No readiness evidence selected.</div>
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
        coverageGapReport: null,
        coverageGaps: [],
        csrfToken: null,
        deliveries: [],
        identity: null,
        invitations: [],
        learnerState: null,
        learnerStateTargetLinks: [],
        llmSuggestions: [],
        membershipContextVersion: 0,
        myInvitations: [],
        mode: "curator",
        navigation: null,
        navigationCandidates: [],
        pendingQuickCheckAttemptKey: null,
        pendingReadinessAttemptKey: null,
        participants: [],
        programId: "",
        readinessAttempts: [],
        readinessCandidates: [],
        readinessChecks: [],
        selectedNavigationCandidateId: null,
        selectedNavigationNode: null,
        selectedAttemptId: null,
        selectedCandidateId: null,
        selectedCoverageGapIndex: null,
        selectedDelivery: null,
        selectedLearnerStateTarget: null,
        selectedLlmSuggestion: null,
        selectedLlmSuggestionId: null,
        selectedReadinessAttemptId: null,
        selectedReadinessCandidateId: null,
        selectedReadinessCheck: null,
        selectedReadinessRevisionId: null,
        selectedRevisionId: null,
        withdrawnLifecycleItems: [],
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
        coverageGapDetail: document.querySelector("#coverage-gap-detail"),
        coverageGapFilterForm: document.querySelector("#coverage-gap-filter-form"),
        coverageGapKindFilterInput: document.querySelector("#coverage-gap-kind-filter-input"),
        coverageGapList: document.querySelector("#coverage-gap-list"),
        coverageGapMinimumSeverityInput: document.querySelector("#coverage-gap-minimum-severity-input"),
        coverageGapScopeIdInput: document.querySelector("#coverage-gap-scope-id-input"),
        coverageGapScopeKindInput: document.querySelector("#coverage-gap-scope-kind-input"),
        coverageGapStatus: document.querySelector("#coverage-gap-status"),
        coverageGapSummary: document.querySelector("#coverage-gap-summary"),
        curatorModeTab: document.querySelector("#curator-mode-tab"),
        curationDetail: document.querySelector("#quick-check-curation-detail"),
        deliveryDetail: document.querySelector("#quick-check-delivery-detail"),
        deliveryList: document.querySelector("#quick-check-delivery-list"),
        entityLifecycleFamilyInput: document.querySelector("#entity-lifecycle-family-input"),
        entityLifecycleIdInput: document.querySelector("#entity-lifecycle-id-input"),
        entityLifecyclePanel: document.querySelector("#entity-lifecycle-panel"),
        entityLifecycleStatus: document.querySelector("#entity-lifecycle-status"),
        withdrawnItemsView: document.querySelector("#withdrawn-items-view"),
        logoutButton: document.querySelector("#logout-button"),
        membershipAdmissionPolicyForm: document.querySelector("#program-admission-policy-form"),
        membershipAdmissionPolicyInput: document.querySelector("#program-admission-policy-input"),
        membershipAdmissionPolicyStatus: document.querySelector("#program-admission-policy-status"),
        membershipCuratorLeaveForm: document.querySelector("#curator-leave-program-form"),
        membershipCuratorLeaveStatus: document.querySelector("#curator-leave-program-status"),
        membershipCuratorPanel: document.querySelector("#program-membership-curator-panel"),
        membershipInvitationForm: document.querySelector("#program-invitation-form"),
        membershipInvitationList: document.querySelector("#program-invitation-list"),
        membershipInvitationStatus: document.querySelector("#program-invitation-status"),
        membershipInvitationStatusFilter: document.querySelector("#program-invitation-status-filter"),
        membershipInvitationTargetInput: document.querySelector("#program-invitation-target-input"),
        membershipJoinStudentButton: document.querySelector("#join-student-program-button"),
        membershipMyInvitationList: document.querySelector("#my-program-invitation-list"),
        membershipMyInvitationStatus: document.querySelector("#my-program-invitation-status"),
        membershipParticipantActionStatus: document.querySelector("#program-participant-action-status"),
        membershipParticipantKindFilter: document.querySelector("#program-participant-kind-filter"),
        membershipParticipantList: document.querySelector("#program-participant-list"),
        membershipParticipantStatusFilter: document.querySelector("#program-participant-status-filter"),
        membershipStudentStatus: document.querySelector("#student-program-membership-status"),
        membershipStudentPanel: document.querySelector("#program-membership-student-panel"),
        learnerStateCheckList: document.querySelector("#learner-state-check-list"),
        learnerStateConceptList: document.querySelector("#learner-state-concept-list"),
        learnerStateCriterionList: document.querySelector("#learner-state-criterion-list"),
        learnerStateEvidenceList: document.querySelector("#learner-state-evidence-list"),
        learnerStateEvidenceOwnerIdInput: document.querySelector("#learner-state-evidence-owner-id-input"),
        learnerStateEvidenceOwnerKindInput: document.querySelector("#learner-state-evidence-owner-kind-input"),
        learnerStateMaterialList: document.querySelector("#learner-state-material-list"),
        learnerStateStatus: document.querySelector("#learner-state-status"),
        learnerStateStudentPanel: document.querySelector("#learner-state-student-panel"),
        learnerStateSummary: document.querySelector("#learner-state-summary"),
        learnerStateTargetDetail: document.querySelector("#learner-state-target-detail"),
        learnerStateTargetIdInput: document.querySelector("#learner-state-target-id-input"),
        learnerStateTargetKindInput: document.querySelector("#learner-state-target-kind-input"),
        learnerStateTargetLinkForm: document.querySelector("#learner-state-target-link-form"),
        learnerStateTargetLinkList: document.querySelector("#learner-state-target-link-list"),
        learnerStateTargetLinkStatus: document.querySelector("#learner-state-target-link-status"),
        learnerStateTopicList: document.querySelector("#learner-state-topic-list"),
        learnerStateWeakAreaList: document.querySelector("#learner-state-weak-area-list"),
        llmSuggestionAcceptButton: document.querySelector("[data-action='accept-llm-curation-suggestion']"),
        llmSuggestionContextEntityIdsInput: document.querySelector("#llm-curation-suggestion-context-entity-ids-input"),
        llmSuggestionCoverageGapIdsInput: document.querySelector("#llm-curation-suggestion-coverage-gap-ids-input"),
        llmSuggestionDetail: document.querySelector("#llm-curation-suggestion-detail"),
        llmSuggestionDraftPreview: document.querySelector("#llm-curation-suggestion-draft-preview"),
        llmSuggestionFilterForm: document.querySelector("#llm-curation-suggestion-filter-form"),
        llmSuggestionGenerationForm: document.querySelector("#llm-curation-suggestion-generation-form"),
        llmSuggestionGenerationStatus: document.querySelector("#llm-curation-suggestion-generation-status"),
        llmSuggestionInstructionInput: document.querySelector("#llm-curation-suggestion-instruction-input"),
        llmSuggestionKindFilter: document.querySelector("#llm-curation-suggestion-kind-filter"),
        llmSuggestionKindInput: document.querySelector("#llm-curation-suggestion-kind-input"),
        llmSuggestionList: document.querySelector("#llm-curation-suggestion-list"),
        llmSuggestionListStatus: document.querySelector("#llm-curation-suggestion-list-status"),
        llmSuggestionMaxInput: document.querySelector("#llm-curation-suggestion-max-input"),
        llmSuggestionOrigin: document.querySelector("#llm-curation-suggestion-origin"),
        llmSuggestionPolicyInput: document.querySelector("#llm-curation-suggestion-policy-input"),
        llmSuggestionRejectButton: document.querySelector("[data-action='reject-llm-curation-suggestion']"),
        llmSuggestionReviewStatus: document.querySelector("#llm-curation-suggestion-review-status"),
        llmSuggestionStatusFilter: document.querySelector("#llm-curation-suggestion-status-filter"),
        llmSuggestionSupportingEvidence: document.querySelector("#llm-curation-suggestion-supporting-evidence"),
        navigationActionStatus: document.querySelector("#navigation-candidate-action-status"),
        navigationBodyInput: document.querySelector("#navigation-body-input"),
        navigationCandidateForm: document.querySelector("#navigation-candidate-form"),
        navigationCandidateList: document.querySelector("#navigation-candidate-list"),
        navigationCandidateStatusFilter: document.querySelector("#navigation-candidate-status-filter"),
        navigationCitationInput: document.querySelector("#navigation-citation-input"),
        navigationKindInput: document.querySelector("#navigation-kind-input"),
        navigationLocatorInput: document.querySelector("#navigation-locator-input"),
        navigationMaterialBacklinks: document.querySelector("#navigation-material-backlinks"),
        materialContentBody: document.querySelector("#material-content-body"),
        materialContentStatus: document.querySelector("#material-content-status"),
        materialContentView: document.querySelector("#material-content-view"),
        sourceContentForm: document.querySelector("#source-content-form"),
        sourceContentFormatInput: document.querySelector("#source-content-format-input"),
        sourceContentIdInput: document.querySelector("#source-content-id-input"),
        sourceContentInput: document.querySelector("#source-content-input"),
        sourceContentStatus: document.querySelector("#source-content-status"),
        sourceLifecycleStatus: document.querySelector("#source-lifecycle-status"),
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
        readReadinessCheckCurationButton: document.querySelector("[data-action='read-readiness-check-curation']"),
        readinessCheckAcceptButton: document.querySelector("[data-action='accept-readiness-check-candidate']"),
        readinessCheckAttemptDetail: document.querySelector("#readiness-check-attempt-detail"),
        readinessCheckAttemptIdInput: document.querySelector("#readiness-check-attempt-id-input"),
        readinessCheckAttemptList: document.querySelector("#readiness-check-attempt-list"),
        readinessCheckCandidateActionStatus: document.querySelector("#readiness-check-candidate-action-status"),
        readinessCheckCandidateForm: document.querySelector("#readiness-check-candidate-form"),
        readinessCheckCandidateList: document.querySelector("#readiness-check-candidate-list"),
        readinessCheckCandidateStatusFilter: document.querySelector("#readiness-check-candidate-status-filter"),
        readinessCheckCurationDetail: document.querySelector("#readiness-check-curation-detail"),
        readinessCheckDeliveryDetail: document.querySelector("#readiness-check-delivery-detail"),
        readinessCheckDeliveryList: document.querySelector("#readiness-check-delivery-list"),
        readinessCheckEvidenceDetail: document.querySelector("#readiness-check-evidence-detail"),
        readinessCheckPeriodTitleInput: document.querySelector("#readiness-check-period-title-input"),
        readinessCheckPeriodTopicIdsInput: document.querySelector("#readiness-check-period-topic-ids-input"),
        readinessCheckRejectButton: document.querySelector("[data-action='reject-readiness-check-candidate']"),
        readinessCheckRequirementResultList: document.querySelector("#readiness-check-requirement-result-list"),
        readinessCheckRequirementsInput: document.querySelector("#readiness-check-requirements-input"),
        readinessCheckRationaleInput: document.querySelector("#readiness-check-rationale-input"),
        readinessCheckScopeKindInput: document.querySelector("#readiness-check-scope-kind-input"),
        readinessCheckSourceIdsInput: document.querySelector("#readiness-check-source-ids-input"),
        readinessCheckSubmitForm: document.querySelector("#readiness-check-submit-form"),
        readinessCheckSubmitStatus: document.querySelector("#readiness-check-submit-status"),
        readinessCheckTitleInput: document.querySelector("#readiness-check-title-input"),
        readinessCheckTopicIdInput: document.querySelector("#readiness-check-topic-id-input"),
        rejectQuickCheckButton: document.querySelector("[data-action='reject-quick-check']"),
        refreshCandidatesButton: document.querySelector("#refresh-candidates-button"),
        refreshLearnerStateButton: document.querySelector("#refresh-learner-state-button"),
        refreshLearnerStateTargetLinksButton: document.querySelector("#refresh-learner-state-target-links-button"),
        refreshMembershipInvitationsButton: document.querySelector("#refresh-program-invitations-button"),
        refreshMembershipMyInvitationsButton: document.querySelector("#refresh-my-program-invitations-button"),
        refreshMembershipParticipantsButton: document.querySelector("#refresh-program-participants-button"),
        refreshNavigationButton: document.querySelector("#refresh-navigation-button"),
        refreshNavigationCandidatesButton: document.querySelector("#refresh-navigation-candidates-button"),
        refreshReadinessCheckCandidatesButton: document.querySelector("#refresh-readiness-check-candidates-button"),
        refreshReadinessChecksButton: document.querySelector("#refresh-readiness-checks-button"),
        refreshSessionButton: document.querySelector("#refresh-session-button"),
        sessionSummary: document.querySelector("#session-summary"),
        signinForm: document.querySelector("#signin-form"),
        signinStatus: document.querySelector("#signin-status"),
        studentModeTab: document.querySelector("#student-mode-tab"),
        submitStatus: document.querySelector("#quick-check-submit-status"),
        themeToggleButton: document.querySelector("#theme-toggle-button"),
        ungroupedConceptList: document.querySelector("#navigation-ungrouped-concept-list"),
        ungroupedMaterialList: document.querySelector("#navigation-ungrouped-material-list"),
        topicList: document.querySelector("#navigation-topic-list"),
      };

      elements.quickCheckActions.push(elements.refreshCandidatesButton);
      setTheme(storedTheme());

      elements.themeToggleButton.addEventListener("click", () => {
        setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
      });

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
        clearCoverageGapSurfaces();
        clearLlmSuggestionSurfaces();
        clearMembershipSurfaces();
        clearLearnerStateSurfaces();
        clearReadinessSurfaces();
      });

      elements.coverageGapFilterForm.addEventListener("submit", async event => {
        event.preventDefault();
        await refreshCoverageGaps();
      });

      elements.sourceContentForm.addEventListener("submit", async event => {
        event.preventDefault();
        await saveSourceContent();
      });

      elements.sourceContentForm.addEventListener("click", event => {
        if (event.target.closest("[data-action='read-source-content']")) {
          void readSourceContent();
          return;
        }
        if (event.target.closest("[data-action='delete-source-content']")) {
          void deleteSourceContent();
          return;
        }
        if (event.target.closest("[data-action='withdraw-source']")) {
          void setSourceLifecycleStatus("withdrawn");
          return;
        }
        if (event.target.closest("[data-action='reactivate-source']")) {
          void setSourceLifecycleStatus("active");
          return;
        }
        if (event.target.closest("[data-action='delete-source-record']")) {
          void deleteSourceRecord();
        }
      });

      elements.entityLifecyclePanel.addEventListener("click", event => {
        if (event.target.closest("[data-action='withdraw-entity']")) {
          void setEntityLifecycleStatus("withdrawn");
          return;
        }
        if (event.target.closest("[data-action='reactivate-entity']")) {
          void setEntityLifecycleStatus("active");
          return;
        }
        if (event.target.closest("[data-action='open-withdrawn-items']")) {
          elements.withdrawnItemsView.scrollIntoView({ block: "nearest" });
          return;
        }
        const reactivateButton = event.target.closest("[data-action='reactivate-withdrawn-item']");
        if (reactivateButton) {
          void reactivateWithdrawnItem(reactivateButton.dataset.family, reactivateButton.dataset.entityId);
        }
      });

      elements.llmSuggestionGenerationForm.addEventListener("submit", async event => {
        event.preventDefault();
        await generateLlmSuggestions();
      });

      elements.llmSuggestionFilterForm.addEventListener("submit", async event => {
        event.preventDefault();
        await refreshLlmSuggestions();
      });

      elements.membershipAdmissionPolicyForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canUseProgramApi()) {
          elements.membershipAdmissionPolicyStatus.textContent = "Sign in and set a Program id first.";
          return;
        }
        const contextVersion = state.membershipContextVersion;
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/admission-policy", {
          body: { admissionPolicy: elements.membershipAdmissionPolicyInput.value },
          csrf: true,
          method: "PATCH",
        });
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        elements.membershipAdmissionPolicyStatus.textContent = result.status === "accepted"
          ? "Admission policy saved"
          : membershipMessage(result);
      });

      elements.membershipInvitationForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canUseProgramApi()) {
          elements.membershipInvitationStatus.textContent = "Sign in and set a Program id first.";
          return;
        }
        const contextVersion = state.membershipContextVersion;
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/invitations", {
          body: {
            participationKind: "student",
            targetIdentityId: elements.membershipInvitationTargetInput.value.trim(),
          },
          csrf: true,
          method: "POST",
        });
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        elements.membershipInvitationStatus.textContent = result.status === "accepted"
          ? "Invitation created"
          : membershipMessage(result);
        if (result.status === "accepted") {
          elements.membershipInvitationTargetInput.value = "";
          await refreshMembershipInvitations();
        }
      });

      elements.membershipCuratorLeaveForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canUseProgramApi() || !confirm("Stop curating this Program?")) {
          return;
        }
        const contextVersion = state.membershipContextVersion;
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/curator-membership", {
          csrf: true,
          method: "DELETE",
        });
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        elements.membershipCuratorLeaveStatus.textContent = result.status === "accepted"
          ? "Curator membership left"
          : membershipMessage(result);
        await refreshMembershipParticipants();
      });

      elements.refreshMembershipInvitationsButton.addEventListener("click", refreshMembershipInvitations);
      elements.refreshMembershipParticipantsButton.addEventListener("click", refreshMembershipParticipants);
      elements.refreshMembershipMyInvitationsButton.addEventListener("click", refreshMembershipMyInvitations);
      elements.membershipJoinStudentButton.addEventListener("click", async () => {
        if (!canUseProgramApi()) {
          elements.membershipStudentStatus.textContent = "Sign in and set a Program id first.";
          return;
        }
        const contextVersion = state.membershipContextVersion;
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/student-membership", {
          csrf: true,
          method: "POST",
        });
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        elements.membershipStudentStatus.textContent = result.status === "accepted"
          ? "Program joined"
          : membershipMessage(result);
      });

      elements.membershipInvitationList.addEventListener("click", async event => {
        const button = event.target.closest("[data-action='revoke-program-invitation']");
        if (!button || !confirm("Revoke this invitation?")) {
          return;
        }
        const contextVersion = state.membershipContextVersion;
        const result = await requestJson(
          "/program-invitations/" + encodeURIComponent(button.dataset.invitationId) + "/revocation",
          { body: {}, csrf: true, method: "POST" },
        );
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        elements.membershipInvitationStatus.textContent = result.status === "accepted"
          ? "Invitation revoked"
          : membershipMessage(result);
        await refreshMembershipInvitations();
      });

      elements.membershipParticipantList.addEventListener("click", async event => {
        const button = event.target.closest("[data-action='remove-student-participant']");
        if (!button || !confirm("Remove this Student from the Program?")) {
          return;
        }
        const contextVersion = state.membershipContextVersion;
        const result = await requestJson(
          "/programs/" + encodeURIComponent(state.programId) + "/participants/student/" +
            encodeURIComponent(button.dataset.identityId),
          { csrf: true, method: "DELETE" },
        );
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        elements.membershipParticipantActionStatus.textContent = result.status === "accepted"
          ? "Student removed"
          : membershipMessage(result);
        await refreshMembershipParticipants();
      });

      elements.membershipMyInvitationList.addEventListener("click", async event => {
        const button = event.target.closest("[data-action]");
        if (!button || !["accept-program-invitation", "decline-program-invitation"].includes(button.dataset.action)) {
          return;
        }
        const contextVersion = state.membershipContextVersion;
        const action = button.dataset.action === "accept-program-invitation" ? "acceptance" : "decline";
        const result = await requestJson(
          "/program-invitations/" + encodeURIComponent(button.dataset.invitationId) + "/" + action,
          { body: {}, csrf: true, method: "POST" },
        );
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        elements.membershipMyInvitationStatus.textContent = result.status === "accepted"
          ? action === "acceptance" ? "Invitation accepted" : "Invitation declined"
          : membershipMessage(result);
        await refreshMembershipMyInvitations();
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

      elements.learnerStateTargetLinkForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canUseProgramApi()) {
          renderLearnerStateTargetLinkStatus("Sign in and set a Program id first.");
          return;
        }
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/learner-state-target-links", {
          body: {
            evidenceOwnerEntityId: elements.learnerStateEvidenceOwnerIdInput.value.trim(),
            evidenceOwnerKind: elements.learnerStateEvidenceOwnerKindInput.value,
            targetId: elements.learnerStateTargetIdInput.value.trim(),
            targetKind: elements.learnerStateTargetKindInput.value,
          },
          csrf: true,
          method: "POST",
        });
        if (result.status === "accepted") {
          renderLearnerStateTargetLinkStatus("Target link saved");
          await refreshLearnerStateTargetLinks();
          return;
        }
        renderLearnerStateTargetLinkStatus("Target link save failed");
      });

      elements.readinessCheckCandidateForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canUseProgramApi()) {
          renderReadinessCandidateStatus("Sign in and set a Program id first.");
          return;
        }
        const body = readinessCandidateInput();
        if (!body) {
          renderReadinessCandidateStatus("Readiness input is invalid.");
          return;
        }
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/readiness-checks/candidates", {
          body,
          csrf: true,
          method: "POST",
        });
        if (result.status === "accepted") {
          state.selectedReadinessCandidateId = result.value.readinessCheckCandidate.candidateId;
          await refreshReadinessCandidates();
          renderReadinessCandidateStatus("Created " + result.value.readinessCheckCandidate.title);
          return;
        }
        renderReadinessCandidateStatus("Create failed");
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

      elements.readinessCheckDeliveryList.addEventListener("click", event => {
        const button = event.target.closest("button[data-readiness-revision-id]");
        if (!button) {
          return;
        }
        selectReadinessCheck(button.dataset.readinessRevisionId);
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

      elements.readinessCheckSubmitForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!state.selectedReadinessCheck) {
          elements.readinessCheckSubmitStatus.textContent = "Open a readiness check first";
          return;
        }
        if (!state.pendingReadinessAttemptKey) {
          state.pendingReadinessAttemptKey = createBrowserId();
        }
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/readiness-check-attempts", {
          body: {
            readinessCheckRevisionId: state.selectedReadinessCheck.revisionId,
          },
          csrf: true,
          idempotencyKey: state.pendingReadinessAttemptKey,
          method: "POST",
        });
        if (result.status === "accepted") {
          state.selectedReadinessAttemptId = result.value.readinessCheckAttempt.attemptId;
          elements.readinessCheckSubmitStatus.textContent = "Readiness attempt submitted";
          renderReadinessAttemptDetail(result.value.readinessCheckAttempt);
          await refreshReadinessAttempts();
          return;
        }
        elements.readinessCheckSubmitStatus.textContent = "Readiness submission failed";
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

      elements.refreshLearnerStateButton.addEventListener("click", async () => {
        await refreshLearnerState();
      });

      elements.refreshLearnerStateTargetLinksButton.addEventListener("click", async () => {
        await refreshLearnerStateTargetLinks();
      });

      elements.refreshReadinessCheckCandidatesButton.addEventListener("click", async () => {
        await refreshReadinessCandidates();
      });

      elements.refreshReadinessChecksButton.addEventListener("click", async () => {
        await refreshReadinessChecks();
        await refreshReadinessAttempts();
      });

      elements.learnerStateTargetLinkList.addEventListener("click", event => {
        const button = event.target.closest("button[data-action='delete-learner-state-target-link']");
        if (!button) {
          return;
        }
        void deleteLearnerStateTargetLink(button.dataset.linkId);
      });

      elements.learnerStateStudentPanel.addEventListener("click", event => {
        const button = event.target.closest("button[data-action='open-learner-state-target']");
        if (!button) {
          return;
        }
        void openLearnerStateTarget(button.dataset.targetKind, button.dataset.targetId);
      });

      elements.coverageGapList.addEventListener("click", event => {
        const button = event.target.closest("button[data-action='open-coverage-gap']");
        if (!button) {
          return;
        }
        state.selectedCoverageGapIndex = Number(button.dataset.gapIndex);
        const gap = state.coverageGaps[state.selectedCoverageGapIndex] ?? null;
        renderCoverageGapDetail(gap);
      });

      elements.llmSuggestionList.addEventListener("click", event => {
        const button = event.target.closest("button[data-action='open-llm-curation-suggestion']");
        if (!button) {
          return;
        }
        void openLlmSuggestion(button.dataset.suggestionId);
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

      elements.readinessCheckCandidateList.addEventListener("click", event => {
        const button = event.target.closest("button[data-readiness-candidate-id]");
        if (!button) {
          return;
        }
        state.selectedReadinessCandidateId = button.dataset.readinessCandidateId;
        const candidate = state.readinessCandidates.find($0 => $0.candidateId === state.selectedReadinessCandidateId);
        renderReadinessCandidateStatus(candidate ? "Selected " + candidate.title : "Selected readiness candidate unavailable");
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

      elements.llmSuggestionAcceptButton.addEventListener("click", async () => {
        if (!state.selectedLlmSuggestionId) {
          renderLlmSuggestionReviewStatus("Select a suggestion first.");
          return;
        }
        const result = await requestJson(
          "/llm-curation-suggestions/" + encodeURIComponent(state.selectedLlmSuggestionId) + "/acceptance",
          {
            body: {},
            csrf: true,
            method: "POST",
          },
        );
        if (result.status === "accepted") {
          state.selectedLlmSuggestion = result.value.suggestion;
          renderLlmSuggestionDetail(result.value.suggestion);
          renderLlmSuggestionReviewStatus("Materialized draft " + result.value.suggestion.materializedCandidate.candidateKind + ".");
          await refreshLlmSuggestions();
          return;
        }
        renderLlmSuggestionReviewStatus("Suggestion review unavailable.");
      });

      elements.llmSuggestionRejectButton.addEventListener("click", async () => {
        if (!state.selectedLlmSuggestionId) {
          renderLlmSuggestionReviewStatus("Select a suggestion first.");
          return;
        }
        const result = await requestJson(
          "/llm-curation-suggestions/" + encodeURIComponent(state.selectedLlmSuggestionId) + "/rejection",
          {
            body: {},
            csrf: true,
            method: "POST",
          },
        );
        if (result.status === "accepted") {
          state.selectedLlmSuggestion = result.value.suggestion;
          renderLlmSuggestionDetail(result.value.suggestion);
          renderLlmSuggestionReviewStatus("Suggestion rejected.");
          await refreshLlmSuggestions();
          return;
        }
        renderLlmSuggestionReviewStatus("Suggestion review unavailable.");
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

      elements.readinessCheckAcceptButton.addEventListener("click", async () => {
        if (!state.selectedReadinessCandidateId) {
          renderReadinessCandidateStatus("Select a readiness candidate first.");
          return;
        }
        const result = await requestJson(
          "/readiness-checks/candidates/" + encodeURIComponent(state.selectedReadinessCandidateId) + "/acceptance",
          {
            body: {},
            csrf: true,
            method: "POST",
          },
        );
        if (result.status === "accepted") {
          state.selectedReadinessRevisionId = result.value.acceptedReadinessCheck.revisionId;
          renderReadinessCandidateStatus("Accepted " + result.value.acceptedReadinessCheck.title);
          await refreshReadinessCandidates();
          return;
        }
        renderReadinessCandidateStatus("Accept failed");
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

      elements.readinessCheckRejectButton.addEventListener("click", async () => {
        if (!state.selectedReadinessCandidateId) {
          renderReadinessCandidateStatus("Select a readiness candidate first.");
          return;
        }
        const result = await requestJson(
          "/readiness-checks/candidates/" + encodeURIComponent(state.selectedReadinessCandidateId) + "/rejection",
          {
            body: {},
            csrf: true,
            method: "POST",
          },
        );
        if (result.status === "accepted") {
          renderReadinessCandidateStatus("Rejected " + result.value.readinessCheckCandidate.title);
          await refreshReadinessCandidates();
          return;
        }
        renderReadinessCandidateStatus("Reject failed");
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

      elements.readReadinessCheckCurationButton.addEventListener("click", async () => {
        if (!state.selectedReadinessRevisionId) {
          renderReadinessCandidateStatus("Accept a readiness candidate before inspection.");
          return;
        }
        const result = await requestJson("/readiness-checks/revisions/" + encodeURIComponent(state.selectedReadinessRevisionId) + "/curation");
        if (result.status === "accepted") {
          renderAcceptedReadinessCheck(result.value.acceptedReadinessCheck);
          return;
        }
        renderReadinessCandidateStatus("Inspection failed");
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
          return;
        }
        const contentButton = event.target.closest("button[data-action='open-material-content']");
        if (contentButton) {
          void openMaterialContent(contentButton.dataset.entityId);
          return;
        }
        const moreButton = event.target.closest("button[data-action='load-more-material-content']");
        if (moreButton) {
          void loadMaterialContentPage();
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

      elements.readinessCheckAttemptList.addEventListener("click", event => {
        const button = event.target.closest("button[data-readiness-attempt-id]");
        if (!button) {
          return;
        }
        state.selectedReadinessAttemptId = button.dataset.readinessAttemptId;
        elements.readinessCheckAttemptIdInput.value = state.selectedReadinessAttemptId;
        void openReadinessAttemptDetail();
      });

      elements.readinessCheckRequirementResultList.addEventListener("click", event => {
        const button = event.target.closest("button[data-action='open-readiness-evidence-target']");
        if (!button) {
          return;
        }
        void openReadinessEvidenceTarget(button.dataset.targetKind, button.dataset.targetId);
      });

      elements.openQuickCheckAttemptButton.addEventListener("click", async () => {
        const requestedAttemptId = elements.attemptIdInput.value.trim();
        if (requestedAttemptId) {
          state.selectedAttemptId = requestedAttemptId;
        }
        await openAttemptDetail();
      });

      document.querySelector("[data-action='open-readiness-check-delivery']").addEventListener("click", () => {
        if (!state.selectedReadinessCheck) {
          elements.readinessCheckDeliveryDetail.textContent = "Readiness check unavailable";
          return;
        }
        renderReadinessCheckDeliveryDetail(state.selectedReadinessCheck);
      });

      document.querySelector("[data-action='open-readiness-check-attempt']").addEventListener("click", async () => {
        const requestedAttemptId = elements.readinessCheckAttemptIdInput.value.trim();
        if (requestedAttemptId) {
          state.selectedReadinessAttemptId = requestedAttemptId;
        }
        await openReadinessAttemptDetail();
      });

      function acceptSession(value) {
        const sessionChanged = state.identity?.id !== value.identity.id || state.csrfToken !== value.csrfToken;
        if (sessionChanged) {
          state.programId = "";
          elements.programIdInput.value = "";
          clearCoverageGapSurfaces();
          clearLlmSuggestionSurfaces();
          clearMembershipSurfaces();
          clearLearnerStateSurfaces();
          clearReadinessSurfaces();
        }
        state.csrfToken = value.csrfToken;
        state.identity = value.identity;
        renderSession();
      }

      function clearSession() {
        state.csrfToken = null;
        state.identity = null;
        state.pendingQuickCheckAttemptKey = null;
        state.pendingReadinessAttemptKey = null;
        state.programId = "";
        state.selectedAttemptId = null;
        state.selectedCoverageGapIndex = null;
        state.selectedLlmSuggestion = null;
        state.selectedLlmSuggestionId = null;
        state.selectedReadinessAttemptId = null;
        state.withdrawnLifecycleItems = [];
        elements.programIdInput.value = "";
        elements.signinStatus.textContent = "";
        clearCoverageGapSurfaces();
        clearLlmSuggestionSurfaces();
        clearMembershipSurfaces();
        clearLearnerStateSurfaces();
        clearReadinessSurfaces();
        renderWithdrawnItemsView();
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

      function storedTheme() {
        try {
          const theme = localStorage.getItem("agonara-learn-theme");
          return theme === "light" || theme === "dark" ? theme : "dark";
        } catch {
          return "dark";
        }
      }

      function setTheme(theme) {
        const selectedTheme = theme === "light" ? "light" : "dark";
        document.documentElement.dataset.theme = selectedTheme;
        elements.themeToggleButton.setAttribute("aria-pressed", selectedTheme === "dark" ? "true" : "false");
        elements.themeToggleButton.setAttribute(
          "aria-label",
          selectedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        );
        elements.themeToggleButton.textContent = selectedTheme === "dark" ? "Dark" : "Light";
        try {
          localStorage.setItem("agonara-learn-theme", selectedTheme);
        } catch {
          // Browsers can disable storage; the in-page theme still changes.
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

      async function setEntityLifecycleStatus(status) {
        if (!state.identity) {
          elements.entityLifecycleStatus.textContent = "Sign in first.";
          return;
        }
        const entityId = elements.entityLifecycleIdInput.value.trim();
        if (!entityId) {
          elements.entityLifecycleStatus.textContent = "Enter an entity or source id.";
          return;
        }

        const route = lifecycleStatusRoute(elements.entityLifecycleFamilyInput.value, entityId);
        if (!route) {
          elements.entityLifecycleStatus.textContent = "Choose an accepted item family.";
          return;
        }

        const result = await requestJson(route, {
          body: { status },
          csrf: true,
          method: "PUT",
        });
        if (result.status === "accepted") {
          const lifecycleEntity = result.value.entity ?? result.value.source;
          updateWithdrawnLifecycleItems({
            entityId: lifecycleEntity.id,
            family: elements.entityLifecycleFamilyInput.value,
            status: lifecycleEntity.status,
          });
          elements.entityLifecycleStatus.textContent =
            "Lifecycle status is " + lifecycleEntity.status + " for " + lifecycleEntity.id + ".";
          return;
        }
        elements.entityLifecycleStatus.textContent = lifecycleStatusFailureMessage(result.reason);
      }

      function lifecycleStatusRoute(family, entityId) {
        const encodedId = encodeURIComponent(entityId);
        const routes = {
          assessment_criterion: "/assessment-criteria/" + encodedId + "/status",
          corpus: "/corpus/" + encodedId + "/status",
          navigation_relationship: "/navigation-relationships/" + encodedId + "/status",
          open_answer_check: "/open-answer-checks/" + encodedId + "/status",
          quick_check: "/quick-checks/" + encodedId + "/status",
          readiness_check: "/readiness-checks/" + encodedId + "/status",
          source: "/sources/" + encodedId + "/status",
        };
        return routes[family];
      }

      function updateWithdrawnLifecycleItems({ entityId, family, status }) {
        state.withdrawnLifecycleItems = state.withdrawnLifecycleItems.filter(
          $0 => !($0.entityId === entityId && $0.family === family),
        );
        if (status === "withdrawn") {
          state.withdrawnLifecycleItems.push({ entityId, family });
        }
        renderWithdrawnItemsView();
      }

      function renderWithdrawnItemsView() {
        if (state.withdrawnLifecycleItems.length === 0) {
          elements.withdrawnItemsView.innerHTML = '<p class="empty">No withdrawn items in this session.</p>';
          return;
        }
        elements.withdrawnItemsView.innerHTML = "";
        for (const item of state.withdrawnLifecycleItems) {
          const row = document.createElement("article");
          row.className = "list-item";
          const label = document.createElement("strong");
          label.textContent = lifecycleFamilyLabel(item.family);
          const entity = document.createElement("span");
          entity.textContent = item.entityId;
          const button = document.createElement("button");
          button.className = "secondary";
          button.dataset.action = "reactivate-withdrawn-item";
          button.dataset.entityId = item.entityId;
          button.dataset.family = item.family;
          button.type = "button";
          button.textContent = "Reactivate";
          row.append(label, entity, button);
          elements.withdrawnItemsView.append(row);
        }
      }

      async function reactivateWithdrawnItem(family, entityId) {
        if (!state.identity) {
          elements.entityLifecycleStatus.textContent = "Sign in first.";
          return;
        }
        const route = lifecycleStatusRoute(family, entityId);
        if (!route) {
          elements.entityLifecycleStatus.textContent = "Choose an accepted item family.";
          return;
        }
        const result = await requestJson(route, {
          body: { status: "active" },
          csrf: true,
          method: "PUT",
        });
        if (result.status === "accepted") {
          const lifecycleEntity = result.value.entity ?? result.value.source;
          updateWithdrawnLifecycleItems({
            entityId: lifecycleEntity.id,
            family,
            status: lifecycleEntity.status,
          });
          elements.entityLifecycleStatus.textContent =
            "Lifecycle status is " + lifecycleEntity.status + " for " + lifecycleEntity.id + ".";
          return;
        }
        elements.entityLifecycleStatus.textContent = lifecycleStatusFailureMessage(result.reason);
      }

      function lifecycleFamilyLabel(family) {
        const labels = {
          assessment_criterion: "Assessment criterion",
          corpus: "Corpus",
          navigation_relationship: "Navigation relationship",
          open_answer_check: "Open-answer check",
          quick_check: "Quick Check",
          readiness_check: "Readiness check",
          source: "Program source",
        };
        return labels[family] ?? "Accepted item";
      }

      function lifecycleStatusFailureMessage(reason) {
        if (reason === "entity_withdrawal_blocked") {
          return "Withdrawal blocked by active dependents. Remove active relationships, readiness requirements, open-answer check references, or learner-evidence target links before retrying.";
        }
        if (reason === "accepted_entity_not_found" || reason === "source_not_found") {
          return "Item not found.";
        }
        if (reason === "validation_failed") {
          return "Lifecycle status is invalid.";
        }
        return "Lifecycle update failed.";
      }

      async function setSourceLifecycleStatus(status) {
        if (!state.identity) {
          elements.sourceLifecycleStatus.textContent = "Sign in first.";
          return;
        }
        const sourceId = elements.sourceContentIdInput.value.trim();
        if (!sourceId) {
          elements.sourceLifecycleStatus.textContent = "Enter a source id.";
          return;
        }

        const result = await requestJson("/sources/" + encodeURIComponent(sourceId) + "/status", {
          body: { status },
          csrf: true,
          method: "PUT",
        });
        if (result.status === "accepted") {
          const lifecycleEntity = result.value.source;
          updateWithdrawnLifecycleItems({
            entityId: lifecycleEntity.id,
            family: "source",
            status: lifecycleEntity.status,
          });
          elements.sourceLifecycleStatus.textContent =
            "Lifecycle status is " + lifecycleEntity.status + " for " + lifecycleEntity.id + ".";
          return;
        }
        elements.sourceLifecycleStatus.textContent = lifecycleStatusFailureMessage(result.reason);
      }

      async function deleteSourceRecord() {
        if (!state.identity) {
          elements.sourceContentStatus.textContent = "Sign in first.";
          return;
        }
        const sourceId = elements.sourceContentIdInput.value.trim();
        if (!sourceId) {
          elements.sourceContentStatus.textContent = "Enter a source id.";
          return;
        }

        const result = await requestJson("/sources/" + encodeURIComponent(sourceId), {
          csrf: true,
          method: "DELETE",
        });
        if (result.status === "accepted") {
          elements.sourceContentStatus.textContent = "Deleted source " + result.value.source.id + ".";
          return;
        }
        if (result.reason === "source_hard_delete_blocked") {
          elements.sourceContentStatus.textContent = "Source is referenced; withdraw it instead.";
          return;
        }
        if (result.reason === "source_not_found") {
          elements.sourceContentStatus.textContent = "Source not found.";
          return;
        }
        elements.sourceContentStatus.textContent = "Source deletion failed.";
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

      function readinessCandidateInput() {
        const requirements = parseReadinessRequirements(elements.readinessCheckRequirementsInput.value.trim());
        if (requirements === null) {
          return null;
        }
        const scope = readinessScopeInput();
        if (!scope) {
          return null;
        }
        const body = {
          requirements,
          scope,
          sourceIds: splitIdList(elements.readinessCheckSourceIdsInput.value),
          title: elements.readinessCheckTitleInput.value.trim(),
        };
        addOptionalText(body, "rationale", elements.readinessCheckRationaleInput.value);
        return body;
      }

      function readinessScopeInput() {
        if (elements.readinessCheckScopeKindInput.value === "period") {
          return {
            scopeKind: "period",
            title: elements.readinessCheckPeriodTitleInput.value.trim(),
            topicEntityIds: splitIdList(elements.readinessCheckPeriodTopicIdsInput.value),
          };
        }
        return {
          scopeKind: "topic",
          topicEntityId: elements.readinessCheckTopicIdInput.value.trim(),
        };
      }

      function parseReadinessRequirements(value) {
        if (!value) {
          return null;
        }
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) {
            return null;
          }
          return parsed.map($0 => ({
            requiredLevel: $0.requiredLevel,
            targetId: $0.targetId,
            targetKind: $0.targetKind,
          }));
        } catch {
          return null;
        }
      }

      async function refreshReadinessCandidates() {
        if (!canUseProgramApi()) {
          renderReadinessCandidateStatus("Sign in and set a Program id first.");
          return;
        }
        const status = elements.readinessCheckCandidateStatusFilter.value;
        const result = await requestJson(
          "/programs/" + encodeURIComponent(state.programId) + "/readiness-checks/candidates?status=" + encodeURIComponent(status),
        );
        if (result.status === "accepted") {
          state.readinessCandidates = result.value.readinessCheckCandidates;
          renderReadinessCandidateList();
          return;
        }
        state.readinessCandidates = [];
        renderReadinessCandidateList();
        renderReadinessCandidateStatus("Refresh failed");
      }

      function renderReadinessCandidateList() {
        if (state.readinessCandidates.length === 0) {
          elements.readinessCheckCandidateList.innerHTML = '<p class="empty">No readiness candidates loaded.</p>';
          return;
        }
        elements.readinessCheckCandidateList.innerHTML = "";
        for (const candidate of state.readinessCandidates) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.readinessCandidateId = candidate.candidateId;
          button.textContent = candidate.title + " " + candidate.status;
          elements.readinessCheckCandidateList.append(button);
        }
      }

      function renderAcceptedReadinessCheck(readinessCheck) {
        elements.readinessCheckCurationDetail.textContent = [
          readinessCheck.title,
          readinessScopeText(readinessCheck.scope),
          ...readinessCheck.requirements.map(readinessRequirementText),
        ].join("\\n");
      }

      function renderReadinessCandidateStatus(message) {
        elements.readinessCheckCandidateActionStatus.textContent = message;
        elements.readinessCheckCurationDetail.textContent = message;
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

      async function refreshMembershipInvitations() {
        if (!canUseProgramApi()) {
          return;
        }
        const contextVersion = state.membershipContextVersion;
        const status = elements.membershipInvitationStatusFilter.value;
        const query = status ? "?status=" + encodeURIComponent(status) : "";
        const result = await requestJson(
          "/programs/" + encodeURIComponent(state.programId) + "/invitations" + query,
        );
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        state.invitations = result.status === "accepted" ? result.value.invitations : [];
        renderMembershipInvitations();
        if (result.status !== "accepted") {
          elements.membershipInvitationStatus.textContent = membershipMessage(result);
        }
      }

      function renderMembershipInvitations() {
        elements.membershipInvitationList.innerHTML = "";
        if (state.invitations.length === 0) {
          elements.membershipInvitationList.innerHTML = '<p class="empty">No invitations loaded.</p>';
          return;
        }
        for (const invitation of state.invitations) {
          const row = document.createElement("div");
          row.className = "detail-section";
          const summary = document.createElement("p");
          summary.textContent = [
            invitation.targetIdentityId,
            invitation.participationKind,
            invitation.status,
            invitation.createdAt,
          ].join("\\n");
          row.append(summary);
          if (invitation.status === "pending") {
            row.append(membershipActionButton("revoke-program-invitation", "Revoke invitation", invitation.invitationId));
          }
          elements.membershipInvitationList.append(row);
        }
      }

      async function refreshMembershipParticipants() {
        if (!canUseProgramApi()) {
          return;
        }
        const contextVersion = state.membershipContextVersion;
        const query = new URLSearchParams();
        if (elements.membershipParticipantKindFilter.value) {
          query.set("participationKind", elements.membershipParticipantKindFilter.value);
        }
        if (elements.membershipParticipantStatusFilter.value) {
          query.set("status", elements.membershipParticipantStatusFilter.value);
        }
        const suffix = query.size ? "?" + query.toString() : "";
        const result = await requestJson(
          "/programs/" + encodeURIComponent(state.programId) + "/participants" + suffix,
        );
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        state.participants = result.status === "accepted" ? result.value.participants : [];
        renderMembershipParticipants();
        if (result.status !== "accepted") {
          elements.membershipParticipantActionStatus.textContent = membershipMessage(result);
        }
      }

      function renderMembershipParticipants() {
        elements.membershipParticipantList.innerHTML = "";
        if (state.participants.length === 0) {
          elements.membershipParticipantList.innerHTML = '<p class="empty">No participants loaded.</p>';
          return;
        }
        for (const participant of state.participants) {
          const row = document.createElement("div");
          row.className = "detail-section";
          const summary = document.createElement("p");
          summary.textContent = [
            participant.identityId,
            participant.participationKind,
            participant.status,
            participant.updatedAt,
          ].join("\\n");
          row.append(summary);
          if (participant.participationKind === "student" && participant.status !== "removed") {
            const button = membershipActionButton("remove-student-participant", "Remove Student");
            button.dataset.identityId = participant.identityId;
            button.classList.add("danger");
            row.append(button);
          }
          elements.membershipParticipantList.append(row);
        }
      }

      async function refreshMembershipMyInvitations() {
        if (!state.identity) {
          return;
        }
        const contextVersion = state.membershipContextVersion;
        const result = await requestJson("/program-invitations/me");
        if (contextVersion !== state.membershipContextVersion) {
          return;
        }
        state.myInvitations = result.status === "accepted" ? result.value.invitations : [];
        renderMembershipMyInvitations();
        if (result.status !== "accepted") {
          elements.membershipMyInvitationStatus.textContent = membershipMessage(result);
        }
      }

      function renderMembershipMyInvitations() {
        elements.membershipMyInvitationList.innerHTML = "";
        if (state.myInvitations.length === 0) {
          elements.membershipMyInvitationList.innerHTML = '<p class="empty">No invitations loaded.</p>';
          return;
        }
        for (const invitation of state.myInvitations) {
          const row = document.createElement("div");
          row.className = "detail-section";
          const summary = document.createElement("p");
          summary.textContent = [
            invitation.programId,
            invitation.participationKind,
            invitation.status,
            invitation.createdAt,
          ].join("\\n");
          row.append(summary);
          if (invitation.status === "pending") {
            row.append(
              membershipActionButton("accept-program-invitation", "Accept invitation", invitation.invitationId),
              membershipActionButton("decline-program-invitation", "Decline invitation", invitation.invitationId),
            );
          }
          elements.membershipMyInvitationList.append(row);
        }
      }

      function membershipActionButton(action, label, invitationId = null) {
        const button = document.createElement("button");
        button.className = "secondary";
        button.dataset.action = action;
        if (invitationId) {
          button.dataset.invitationId = invitationId;
        }
        button.type = "button";
        button.textContent = label;
        return button;
      }

      function membershipMessage(result) {
        const messages = {
          admin_required: "Admin authority is required",
          admin_or_curator_required: "Admin or Program Curator participation is required",
          invitation_not_found: "Invitation unavailable",
          last_curator_required: "At least one active Program Curator must remain",
          participation_required: "Program Curator participation is required",
          policy_not_satisfied: "This Program requires an invitation",
          validation_failed: "Membership input is invalid",
        };
        return messages[result.reason] ?? "Membership request failed";
      }

      function clearMembershipSurfaces() {
        state.membershipContextVersion += 1;
        state.invitations = [];
        state.myInvitations = [];
        state.participants = [];
        renderMembershipInvitations();
        renderMembershipMyInvitations();
        renderMembershipParticipants();
        elements.membershipAdmissionPolicyStatus.textContent = "";
        elements.membershipCuratorLeaveStatus.textContent = "";
        elements.membershipInvitationStatus.textContent = "";
        elements.membershipInvitationTargetInput.value = "";
        elements.membershipMyInvitationStatus.textContent = "";
        elements.membershipParticipantActionStatus.textContent = "";
        elements.membershipStudentStatus.textContent = "";
      }

      function canUseProgramApi() {
        state.programId = elements.programIdInput.value.trim();
        return Boolean(state.identity && state.programId);
      }

      function clearCoverageGapSurfaces() {
        state.coverageGapReport = null;
        state.coverageGaps = [];
        state.selectedCoverageGapIndex = null;
        renderCoverageGapReport();
        renderCoverageGapDetail(null);
        elements.coverageGapStatus.textContent = "Coverage gaps not loaded.";
      }

      async function refreshCoverageGaps() {
        if (!canUseProgramApi()) {
          elements.coverageGapStatus.textContent = "Sign in and set a Program id first.";
          return;
        }
        const query = coverageGapQuery();
        const suffix = query.size ? "?" + query.toString() : "";
        const result = await requestJson(
          "/programs/" + encodeURIComponent(state.programId) + "/coverage-gaps" + suffix,
        );
        if (result.status === "accepted") {
          state.coverageGapReport = result.value.report;
          state.coverageGaps = result.value.report.gaps;
          state.selectedCoverageGapIndex = null;
          renderCoverageGapReport();
          renderCoverageGapDetail(null);
          elements.coverageGapStatus.textContent = "Coverage gaps loaded.";
          return;
        }
        state.coverageGapReport = null;
        state.coverageGaps = [];
        state.selectedCoverageGapIndex = null;
        renderCoverageGapReport();
        renderCoverageGapDetail(null);
        elements.coverageGapStatus.textContent = "Coverage gaps unavailable.";
      }

      function coverageGapQuery() {
        const query = new URLSearchParams();
        const scopeKind = elements.coverageGapScopeKindInput.value;
        if (scopeKind) {
          query.set("scopeKind", scopeKind);
        }
        const scopeId = elements.coverageGapScopeIdInput.value.trim();
        if (scopeKind !== "program" && scopeId) {
          query.set("scopeId", scopeId);
        }
        if (elements.coverageGapMinimumSeverityInput.value) {
          query.set("minimumSeverity", elements.coverageGapMinimumSeverityInput.value);
        }
        for (const gapKind of splitIdList(elements.coverageGapKindFilterInput.value)) {
          query.append("gapKind", gapKind);
        }
        return query;
      }

      function renderCoverageGapReport() {
        const report = state.coverageGapReport;
        if (!report) {
          elements.coverageGapSummary.textContent = "No coverage gap summary loaded.";
          renderCoverageGapList();
          return;
        }
        const severities = coverageGapSeverityCounts(report.gaps);
        elements.coverageGapSummary.textContent = [
          "Scope " + report.scopeKind,
          report.scopeId ? "Scope id " + report.scopeId : "",
          "Gaps " + report.gaps.length,
          "Critical " + severities.critical,
          "Warning " + severities.warning,
          "Info " + severities.info,
        ].filter(Boolean).join("\\n");
        renderCoverageGapList();
      }

      function coverageGapSeverityCounts(gaps) {
        return gaps.reduce(
          (counts, gap) => ({
            ...counts,
            [gap.severity]: counts[gap.severity] + 1,
          }),
          { critical: 0, info: 0, warning: 0 },
        );
      }

      function renderCoverageGapList() {
        if (state.coverageGaps.length === 0) {
          elements.coverageGapList.innerHTML = '<p class="empty">No coverage gaps loaded.</p>';
          return;
        }
        elements.coverageGapList.innerHTML = "";
        state.coverageGaps.forEach((gap, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.action = "open-coverage-gap";
          button.dataset.gapIndex = String(index);
          button.textContent = [
            gap.severity,
            gap.gapKind,
            gap.targetKind,
            gap.targetTitle,
            gap.status,
          ].join(" ");
          elements.coverageGapList.append(button);
        });
      }

      function renderCoverageGapDetail(gap) {
        if (!gap) {
          elements.coverageGapDetail.textContent = "No coverage gap selected.";
          return;
        }
        elements.coverageGapDetail.textContent = [
          gap.title,
          gap.description,
          "Severity " + gap.severity,
          "Status " + gap.status,
          "Target " + gap.targetKind + " " + gap.targetTitle,
          "Gap kind " + gap.gapKind,
          "Source " + gap.sourceKind,
          "Accepted evidence paths " + gap.acceptedEvidencePathCount,
        ].join("\\n");
      }

      function clearLlmSuggestionSurfaces() {
        state.llmSuggestions = [];
        state.selectedLlmSuggestion = null;
        state.selectedLlmSuggestionId = null;
        renderLlmSuggestionList();
        renderLlmSuggestionDetail(null);
        elements.llmSuggestionGenerationStatus.textContent = "";
        elements.llmSuggestionListStatus.textContent = "Suggestions not loaded.";
        renderLlmSuggestionReviewStatus("");
      }

      async function generateLlmSuggestions() {
        if (!canUseProgramApi()) {
          elements.llmSuggestionGenerationStatus.textContent = "Sign in and set a Program id first.";
          return;
        }
        const suggestionKind = elements.llmSuggestionKindInput.value;
        const result = await requestJson(
          "/programs/" + encodeURIComponent(state.programId) + "/llm-curation-suggestions",
          {
            body: {
              ...(suggestionKind ? { allowedSuggestionKinds: [suggestionKind] } : {}),
              contextEntityIds: splitIdList(elements.llmSuggestionContextEntityIdsInput.value),
              coverageGapIds: splitIdList(elements.llmSuggestionCoverageGapIdsInput.value),
              curatorInstruction: elements.llmSuggestionInstructionInput.value.trim(),
              idempotencyKey: createBrowserId(),
              maxSuggestions: Number(elements.llmSuggestionMaxInput.value),
              suggestionPolicyId: elements.llmSuggestionPolicyInput.value.trim(),
            },
            csrf: true,
            method: "POST",
          },
        );
        if (result.status === "accepted") {
          state.llmSuggestions = result.value.suggestions;
          state.selectedLlmSuggestion = null;
          state.selectedLlmSuggestionId = null;
          renderLlmSuggestionList();
          renderLlmSuggestionDetail(null);
          elements.llmSuggestionGenerationStatus.textContent = "Generated " + result.value.suggestions.length + " suggestions.";
          elements.llmSuggestionListStatus.textContent = "Suggestions loaded.";
          return;
        }
        state.llmSuggestions = [];
        renderLlmSuggestionList();
        renderLlmSuggestionDetail(null);
        elements.llmSuggestionGenerationStatus.textContent = "Suggestions unavailable.";
      }

      async function refreshLlmSuggestions() {
        if (!canUseProgramApi()) {
          elements.llmSuggestionListStatus.textContent = "Sign in and set a Program id first.";
          return;
        }
        const query = new URLSearchParams();
        query.set("status", elements.llmSuggestionStatusFilter.value);
        if (elements.llmSuggestionKindFilter.value) {
          query.set("suggestionKind", elements.llmSuggestionKindFilter.value);
        }
        const result = await requestJson(
          "/programs/" + encodeURIComponent(state.programId) + "/llm-curation-suggestions?" + query.toString(),
        );
        if (result.status === "accepted") {
          state.llmSuggestions = result.value.suggestions;
          renderLlmSuggestionList();
          elements.llmSuggestionListStatus.textContent = "Suggestions loaded.";
          return;
        }
        state.llmSuggestions = [];
        renderLlmSuggestionList();
        renderLlmSuggestionDetail(null);
        elements.llmSuggestionListStatus.textContent = "Suggestions unavailable.";
      }

      function renderLlmSuggestionList() {
        elements.llmSuggestionList.innerHTML = "";
        if (state.llmSuggestions.length === 0) {
          elements.llmSuggestionList.innerHTML = '<p class="empty">No LLM suggestions loaded.</p>';
          return;
        }
        for (const suggestion of state.llmSuggestions) {
          const button = document.createElement("button");
          button.dataset.action = "open-llm-curation-suggestion";
          button.dataset.suggestionId = suggestion.suggestionId;
          button.type = "button";
          button.textContent = [
            suggestion.title,
            suggestion.status,
            suggestion.suggestionKind,
          ].join(" ");
          elements.llmSuggestionList.append(button);
        }
      }

      async function openLlmSuggestion(suggestionId) {
        if (!suggestionId) {
          renderLlmSuggestionDetail(null);
          return;
        }
        const result = await requestJson("/llm-curation-suggestions/" + encodeURIComponent(suggestionId));
        if (result.status !== "accepted") {
          state.selectedLlmSuggestion = null;
          state.selectedLlmSuggestionId = null;
          renderLlmSuggestionDetail(null);
          renderLlmSuggestionReviewStatus("Suggestion unavailable.");
          return;
        }
        state.selectedLlmSuggestion = result.value.suggestion;
        state.selectedLlmSuggestionId = result.value.suggestion.suggestionId;
        renderLlmSuggestionDetail(result.value.suggestion);
        renderLlmSuggestionReviewStatus("Suggestion loaded.");
      }

      function renderLlmSuggestionDetail(suggestion) {
        const isDraft = suggestion?.status === "draft_suggestion";
        elements.llmSuggestionAcceptButton.disabled = !isDraft;
        elements.llmSuggestionRejectButton.disabled = !isDraft;
        if (!suggestion) {
          elements.llmSuggestionOrigin.textContent = "No suggestion selected.";
          elements.llmSuggestionSupportingEvidence.textContent = "No supporting evidence loaded.";
          elements.llmSuggestionDraftPreview.textContent = "No draft preview loaded.";
          return;
        }
        elements.llmSuggestionOrigin.textContent = llmSuggestionOriginText(suggestion);
        elements.llmSuggestionSupportingEvidence.textContent = llmSuggestionSupportingEvidenceText(suggestion.supportingEvidence ?? []);
        elements.llmSuggestionDraftPreview.textContent = llmSuggestionDraftPreviewText(suggestion);
      }

      function llmSuggestionOriginText(suggestion) {
        const origin = suggestion.origin ?? {};
        return [
          suggestion.title,
          suggestion.summary,
          "Status " + suggestion.status,
          "Kind " + suggestion.suggestionKind,
          origin.suggestionPolicyId ? "Policy " + origin.suggestionPolicyId : "",
          origin.outputValidatorPolicyId ? "Validator " + origin.outputValidatorPolicyId : "",
          origin.redactionPolicyId ? "Redaction " + origin.redactionPolicyId : "",
          Array.isArray(origin.sourceKinds) && origin.sourceKinds.length > 0
            ? "Sources " + origin.sourceKinds.map(llmSuggestionSourceKindText).join(", ")
            : "",
          Array.isArray(origin.coverageGapIds) ? "Coverage gaps " + origin.coverageGapIds.length : "",
          origin.promptContextSummary ? "Context " + origin.promptContextSummary : "",
          origin.generatedAt ? "Generated " + origin.generatedAt : "",
          suggestion.materializedCandidate ? "Draft reference " + suggestion.materializedCandidate.candidateKind : "",
          suggestion.rejectedAt ? "Rejected " + suggestion.rejectedAt : "",
        ].filter(Boolean).join("\\n");
      }

      function llmSuggestionSupportingEvidenceText(supportingEvidence) {
        if (supportingEvidence.length === 0) {
          return "No supporting evidence loaded.";
        }
        return supportingEvidence
          .map($0 => [$0.label, $0.sourceKind].filter(Boolean).join(" "))
          .join("\\n");
      }

      function llmSuggestionSourceKindText(sourceKind) {
        const labels = {
          accepted_corpus_context: "accepted program context",
          coverage_gap: "coverage gap",
          curator_instruction: "curator instruction",
        };
        return labels[sourceKind] ?? "redacted source";
      }

      function llmSuggestionDraftPreviewText(suggestion) {
        const draft = suggestion.suggestedDraft ?? {};
        const request = draft.request ?? {};
        return [
          "Draft kind " + (draft.candidateKind ?? suggestion.suggestionKind),
          request.candidateKind ? "Navigation kind " + request.candidateKind : "",
          request.checkKind ? "Check kind " + request.checkKind : "",
          request.title ? "Title " + request.title : "",
          request.prompt ? "Prompt " + request.prompt : "",
          request.body ? "Body " + request.body : "",
          request.rationale ? "Rationale " + request.rationale : "",
          Array.isArray(request.options) ? "Options " + request.options.join(", ") : "",
        ].filter(Boolean).join("\\n");
      }

      function renderLlmSuggestionReviewStatus(message) {
        elements.llmSuggestionReviewStatus.textContent = message;
      }

      function clearLearnerStateSurfaces() {
        state.learnerState = null;
        state.learnerStateTargetLinks = [];
        state.selectedLearnerStateTarget = null;
        renderLearnerState();
        renderLearnerStateTargetLinks();
        renderLearnerStateTargetDetail(null);
        elements.learnerStateStatus.textContent = "Learner state not loaded.";
        elements.learnerStateTargetLinkStatus.textContent = "";
      }

      function clearReadinessSurfaces() {
        state.pendingReadinessAttemptKey = null;
        state.readinessAttempts = [];
        state.readinessCandidates = [];
        state.readinessChecks = [];
        state.selectedReadinessAttemptId = null;
        state.selectedReadinessCandidateId = null;
        state.selectedReadinessCheck = null;
        state.selectedReadinessRevisionId = null;
        renderReadinessCandidateList();
        renderReadinessCheckDeliveryList();
        renderReadinessAttemptList();
        renderReadinessCheckDeliveryDetail(null);
        renderReadinessAttemptDetail(null);
        renderReadinessRequirementResults([]);
        elements.readinessCheckAttemptIdInput.value = "";
        elements.readinessCheckCandidateActionStatus.textContent = "";
        elements.readinessCheckCurationDetail.textContent = "No readiness curation selected.";
        elements.readinessCheckEvidenceDetail.textContent = "No readiness evidence selected.";
        elements.readinessCheckSubmitStatus.textContent = "";
      }

      async function refreshLearnerStateTargetLinks() {
        if (!canUseProgramApi()) {
          renderLearnerStateTargetLinkStatus("Sign in and set a Program id first.");
          return;
        }
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/learner-state-target-links");
        if (result.status === "accepted") {
          state.learnerStateTargetLinks = result.value.learnerStateTargetLinks;
          renderLearnerStateTargetLinks();
          return;
        }
        state.learnerStateTargetLinks = [];
        renderLearnerStateTargetLinks();
        renderLearnerStateTargetLinkStatus("Target links unavailable");
      }

      async function deleteLearnerStateTargetLink(linkId) {
        if (!linkId || !canUseProgramApi()) {
          renderLearnerStateTargetLinkStatus("Sign in and set a Program id first.");
          return;
        }
        const result = await requestJson("/learner-state-target-links/" + encodeURIComponent(linkId), {
          csrf: true,
          method: "DELETE",
        });
        if (result.status === "accepted") {
          renderLearnerStateTargetLinkStatus("Target link deleted");
          await refreshLearnerStateTargetLinks();
          return;
        }
        renderLearnerStateTargetLinkStatus("Target link delete failed");
      }

      function renderLearnerStateTargetLinks() {
        if (state.learnerStateTargetLinks.length === 0) {
          elements.learnerStateTargetLinkList.innerHTML = '<p class="empty">No learner-state target links loaded.</p>';
          return;
        }
        elements.learnerStateTargetLinkList.innerHTML = "";
        for (const link of state.learnerStateTargetLinks) {
          const row = document.createElement("div");
          row.className = "detail-section";
          const summary = document.createElement("p");
          summary.textContent = [
            link.targetKind,
            link.targetId,
            link.evidenceOwnerKind,
            link.evidenceOwnerEntityId,
            link.status,
          ].join("\\n");
          const deleteButton = document.createElement("button");
          deleteButton.className = "danger";
          deleteButton.dataset.action = "delete-learner-state-target-link";
          deleteButton.dataset.linkId = link.linkId;
          deleteButton.type = "button";
          deleteButton.textContent = "Delete target link";
          row.append(summary, deleteButton);
          elements.learnerStateTargetLinkList.append(row);
        }
      }

      function renderLearnerStateTargetLinkStatus(message) {
        elements.learnerStateTargetLinkStatus.textContent = message;
      }

      async function refreshLearnerState() {
        if (!canUseProgramApi()) {
          elements.learnerStateStatus.textContent = "Sign in and set a Program id first.";
          return;
        }
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/learner-state");
        if (result.status === "accepted") {
          state.learnerState = result.value.learnerState;
          state.selectedLearnerStateTarget = null;
          renderLearnerState();
          renderLearnerStateTargetDetail(null);
          elements.learnerStateStatus.textContent = "Learner state loaded.";
          return;
        }
        state.learnerState = null;
        state.selectedLearnerStateTarget = null;
        renderLearnerState();
        renderLearnerStateTargetDetail(null, "Learner-state target unavailable");
        elements.learnerStateStatus.textContent = "Learner state unavailable.";
      }

      function renderLearnerState() {
        const learnerState = state.learnerState;
        if (!learnerState) {
          elements.learnerStateSummary.textContent = "No learner-state summary loaded.";
          renderLearnerStateTargetList(elements.learnerStateWeakAreaList, [], "No weak areas loaded.");
          renderLearnerStateTargetList(elements.learnerStateTopicList, [], "No learner-state topics loaded.");
          renderLearnerStateTargetList(elements.learnerStateConceptList, [], "No learner-state concepts loaded.");
          renderLearnerStateTargetList(elements.learnerStateMaterialList, [], "No learner-state materials loaded.");
          renderLearnerStateTargetList(elements.learnerStateCheckList, [], "No learner-state checks loaded.");
          renderLearnerStateTargetList(elements.learnerStateCriterionList, [], "No learner-state criteria loaded.");
          return;
        }
        elements.learnerStateSummary.textContent = [
          "Program " + learnerState.level,
          "Targets " + learnerState.totals.targets,
          "On track " + learnerState.totals.onTrack,
          "Developing " + learnerState.totals.developing,
          "Needs attention " + learnerState.totals.needsAttention,
        ].join("\\n");
        renderLearnerStateTargetList(elements.learnerStateWeakAreaList, learnerState.weakAreas, "No weak areas loaded.");
        renderLearnerStateTargetList(elements.learnerStateTopicList, learnerState.topics, "No learner-state topics loaded.");
        renderLearnerStateTargetList(elements.learnerStateConceptList, learnerState.concepts, "No learner-state concepts loaded.");
        renderLearnerStateTargetList(elements.learnerStateMaterialList, learnerState.materialReferences, "No learner-state materials loaded.");
        renderLearnerStateTargetList(elements.learnerStateCheckList, learnerState.checks, "No learner-state checks loaded.");
        renderLearnerStateTargetList(elements.learnerStateCriterionList, learnerState.criteria, "No learner-state criteria loaded.");
      }

      function renderLearnerStateTargetList(target, summaries, emptyText) {
        if (summaries.length === 0) {
          target.innerHTML = '<p class="empty">' + emptyText + '</p>';
          return;
        }
        target.innerHTML = "";
        for (const summary of summaries) {
          target.append(learnerStateTargetButton(summary));
        }
      }

      function learnerStateTargetButton(summary) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = "open-learner-state-target";
        button.dataset.targetKind = summary.targetKind;
        button.dataset.targetId = summary.targetId;
        button.setAttribute("aria-label", learnerStateTargetActionLabel(summary));
        button.textContent = [
          summary.title,
          summary.targetKind,
          summary.level,
          "Evidence " + summary.evidenceCount,
        ].join(" ");
        return button;
      }

      function learnerStateTargetActionLabel(summary) {
        if (["topic", "concept", "material_reference"].includes(summary.targetKind)) {
          return "Open learner-state " + summary.targetKind + " " + summary.title;
        }
        return "Open learner-state " + summary.targetKind + " progress";
      }

      async function openLearnerStateTarget(targetKind, targetId) {
        if (!targetKind || !targetId) {
          renderLearnerStateTargetDetail(null);
          return;
        }
        const result = await requestJson(
          "/learner-state/targets/" + encodeURIComponent(targetKind) + "/" + encodeURIComponent(targetId),
        );
        if (result.status !== "accepted") {
          state.selectedLearnerStateTarget = null;
          renderLearnerStateTargetDetail(null, "Learner-state target unavailable");
          return;
        }
        state.selectedLearnerStateTarget = result.value.learnerStateTarget;
        renderLearnerStateTargetDetail(state.selectedLearnerStateTarget);
      }

      function renderLearnerStateTargetDetail(target, unavailableText = "No learner-state target selected.") {
        if (!target) {
          elements.learnerStateTargetDetail.textContent = unavailableText;
          renderLearnerStateEvidenceList([]);
          return;
        }
        elements.learnerStateTargetDetail.textContent = [
          target.title,
          target.targetKind,
          target.level,
          "Evidence " + target.evidenceCount,
          "Positive " + target.positiveEvidenceCount,
          "Partial " + target.partialEvidenceCount,
          "Negative " + target.negativeEvidenceCount,
          "Pending " + target.pendingEvidenceCount,
        ].join("\\n");
        renderLearnerStateEvidenceList(target.evidence);
      }

      function renderLearnerStateEvidenceList(evidence) {
        if (evidence.length === 0) {
          elements.learnerStateEvidenceList.innerHTML = '<p class="empty">No learner-state evidence loaded.</p>';
          return;
        }
        elements.learnerStateEvidenceList.innerHTML = "";
        for (const item of evidence) {
          const row = document.createElement("div");
          row.className = "empty";
          row.textContent = [
            item.sourceKind,
            item.signal,
            item.title,
            item.summary,
            item.occurredAt,
          ].filter(Boolean).join("\\n");
          elements.learnerStateEvidenceList.append(row);
        }
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
          renderMaterialContentAffordance(node);
        } else {
          elements.navigationMaterialBacklinks.innerHTML = '<p class="empty">No material back links loaded.</p>';
          resetMaterialContentView("No material content loaded.");
        }
      }

      function resetMaterialContentView(message) {
        state.materialContentEntityId = null;
        state.materialContentCursor = null;
        elements.materialContentBody.textContent = "";
        elements.materialContentStatus.textContent = message;
      }

      function renderMaterialContentAffordance(node) {
        resetMaterialContentView(
          node.hasContent ? "Material content available." : "No full text stored for this material.",
        );
        if (!node.hasContent) {
          return;
        }
        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "secondary";
        openButton.dataset.action = "open-material-content";
        openButton.dataset.entityId = node.entityId;
        openButton.textContent = "Read full material";
        elements.navigationNodeDetail.append(openButton);
      }

      async function openMaterialContent(entityId) {
        if (!entityId) {
          return;
        }
        state.materialContentEntityId = entityId;
        state.materialContentCursor = null;
        elements.materialContentBody.textContent = "";
        await loadMaterialContentPage();
      }

      async function loadMaterialContentPage() {
        const entityId = state.materialContentEntityId;
        if (!entityId) {
          return;
        }
        let path = "/materials/" + encodeURIComponent(entityId) + "/content?limit=2000";
        if (state.materialContentCursor) {
          path += "&cursor=" + encodeURIComponent(state.materialContentCursor);
        }
        const result = await requestJson(path);
        if (result.status !== "accepted") {
          elements.materialContentStatus.textContent = "Material content unavailable.";
          return;
        }
        elements.materialContentBody.textContent += result.value.content;
        state.materialContentCursor = result.value.nextCursor ?? null;
        renderMaterialContentStatus(result.value);
      }

      function renderMaterialContentStatus(page) {
        elements.materialContentStatus.innerHTML = "";
        const label = document.createElement("span");
        label.textContent = page.contentFormat + " · " + page.byteSize + " bytes";
        elements.materialContentStatus.append(label);
        if (state.materialContentCursor) {
          const more = document.createElement("button");
          more.type = "button";
          more.className = "secondary";
          more.dataset.action = "load-more-material-content";
          more.textContent = "Load more";
          elements.materialContentStatus.append(more);
        }
      }

      async function saveSourceContent() {
        const sourceId = elements.sourceContentIdInput.value.trim();
        if (!sourceId) {
          elements.sourceContentStatus.textContent = "Enter a source id.";
          return;
        }
        const result = await requestJson("/sources/" + encodeURIComponent(sourceId) + "/content", {
          body: {
            content: elements.sourceContentInput.value,
            contentFormat: elements.sourceContentFormatInput.value,
          },
          csrf: true,
          method: "PUT",
        });
        elements.sourceContentStatus.textContent =
          result.status === "accepted"
            ? "Saved content for " + sourceId + " (" + result.value.sourceContent.byteSize + " bytes)."
            : "Save rejected: " + result.reason;
      }

      async function readSourceContent() {
        const sourceId = elements.sourceContentIdInput.value.trim();
        if (!sourceId) {
          elements.sourceContentStatus.textContent = "Enter a source id.";
          return;
        }
        const result = await requestJson("/sources/" + encodeURIComponent(sourceId) + "/content");
        if (result.status !== "accepted") {
          elements.sourceContentStatus.textContent =
            result.reason === "content_not_found" ? "Source content unavailable." : "Read rejected: " + result.reason;
          return;
        }
        elements.sourceContentInput.value = result.value.content;
        elements.sourceContentFormatInput.value = result.value.contentFormat;
        elements.sourceContentStatus.textContent = "Read content for " + sourceId + " (" + result.value.byteSize + " bytes).";
      }

      async function deleteSourceContent() {
        const sourceId = elements.sourceContentIdInput.value.trim();
        if (!sourceId) {
          elements.sourceContentStatus.textContent = "Enter a source id.";
          return;
        }
        const result = await requestJson("/sources/" + encodeURIComponent(sourceId) + "/content", {
          csrf: true,
          method: "DELETE",
        });
        elements.sourceContentStatus.textContent =
          result.status === "accepted"
            ? "Deleted content for " + sourceId + "."
            : "Delete rejected: " + result.reason;
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

      async function refreshReadinessChecks() {
        if (!canUseProgramApi()) {
          return;
        }
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/readiness-checks");
        if (result.status === "accepted") {
          state.readinessChecks = result.value.readinessChecks;
          renderReadinessCheckDeliveryList();
          return;
        }
        state.readinessChecks = [];
        renderReadinessCheckDeliveryList();
      }

      function renderReadinessCheckDeliveryList() {
        if (state.readinessChecks.length === 0) {
          elements.readinessCheckDeliveryList.innerHTML = '<p class="empty">No readiness checks loaded.</p>';
          return;
        }
        elements.readinessCheckDeliveryList.innerHTML = "";
        for (const readinessCheck of state.readinessChecks) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.readinessRevisionId = readinessCheck.revisionId;
          button.textContent = readinessCheck.title;
          elements.readinessCheckDeliveryList.append(button);
        }
      }

      function selectReadinessCheck(revisionId) {
        const readinessCheck = state.readinessChecks.find($0 => $0.revisionId === revisionId) ?? null;
        state.selectedReadinessCheck = readinessCheck;
        state.pendingReadinessAttemptKey = null;
        renderReadinessCheckDeliveryDetail(readinessCheck);
      }

      function renderReadinessCheckDeliveryDetail(readinessCheck) {
        if (!readinessCheck) {
          elements.readinessCheckDeliveryDetail.textContent = "No readiness check selected.";
          return;
        }
        elements.readinessCheckDeliveryDetail.textContent = [
          readinessCheck.title,
          readinessScopeText(readinessCheck.scope),
          ...readinessCheck.requirements.map(readinessRequirementText),
        ].join("\\n");
      }

      async function refreshReadinessAttempts() {
        if (!canUseProgramApi()) {
          return;
        }
        const query = state.selectedReadinessCheck
          ? "?readinessCheckRevisionId=" + encodeURIComponent(state.selectedReadinessCheck.revisionId)
          : "";
        const result = await requestJson("/programs/" + encodeURIComponent(state.programId) + "/readiness-check-attempts" + query);
        if (result.status === "accepted") {
          state.readinessAttempts = result.value.readinessCheckAttempts;
          renderReadinessAttemptList();
          return;
        }
        state.readinessAttempts = [];
        renderReadinessAttemptList();
      }

      function renderReadinessAttemptList() {
        if (state.readinessAttempts.length === 0) {
          elements.readinessCheckAttemptList.innerHTML = '<p class="empty">No readiness attempts loaded.</p>';
          return;
        }
        elements.readinessCheckAttemptList.innerHTML = "";
        for (const attempt of state.readinessAttempts) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.readinessAttemptId = attempt.attemptId;
          const readinessCheck = readinessCheckForRevision(attempt.readinessCheckRevisionId);
          button.textContent = (readinessCheck ? readinessCheck.title : "Readiness attempt") + " " + attempt.result;
          elements.readinessCheckAttemptList.append(button);
        }
      }

      async function openReadinessAttemptDetail() {
        if (!state.selectedReadinessAttemptId) {
          renderReadinessAttemptDetail(null, "Readiness attempt unavailable");
          return;
        }
        const result = await requestJson("/readiness-check-attempts/" + encodeURIComponent(state.selectedReadinessAttemptId));
        if (result.status !== "accepted") {
          renderReadinessAttemptDetail(null, "Readiness attempt unavailable");
          return;
        }
        renderReadinessAttemptDetail(result.value.readinessCheckAttempt);
      }

      function renderReadinessAttemptDetail(attempt, unavailableText = "No readiness attempt selected.") {
        if (!attempt) {
          elements.readinessCheckAttemptDetail.removeAttribute("data-readiness-attempt-id");
          elements.readinessCheckAttemptDetail.textContent = unavailableText;
          renderReadinessRequirementResults([]);
          return;
        }
        elements.readinessCheckAttemptDetail.dataset.readinessAttemptId = attempt.attemptId;
        const readinessCheck = readinessCheckForRevision(attempt.readinessCheckRevisionId);
        elements.readinessCheckAttemptDetail.textContent = [
          readinessCheck ? readinessCheck.title : "Readiness attempt",
          "Result " + attempt.result,
          "Submitted " + attempt.submittedAt,
        ].join("\\n");
        renderReadinessRequirementResults(attempt.requirementResults);
      }

      function renderReadinessRequirementResults(requirementResults) {
        if (requirementResults.length === 0) {
          elements.readinessCheckRequirementResultList.innerHTML = '<p class="empty">No readiness requirement results loaded.</p>';
          return;
        }
        elements.readinessCheckRequirementResultList.innerHTML = "";
        for (const requirement of requirementResults) {
          const row = document.createElement("div");
          row.className = "detail-section";
          const summary = document.createElement("p");
          summary.textContent = [
            readinessRequirementText(requirement),
            "Observed " + requirement.observedLevel,
            "Result " + requirement.result,
          ].join("\\n");
          const button = document.createElement("button");
          button.className = "secondary";
          button.dataset.action = "open-readiness-evidence-target";
          button.dataset.targetKind = requirement.targetKind;
          button.dataset.targetId = requirement.targetId;
          button.type = "button";
          button.textContent = "Open readiness evidence " + requirement.targetKind;
          row.append(summary, button);
          elements.readinessCheckRequirementResultList.append(row);
        }
      }

      async function openReadinessEvidenceTarget(targetKind, targetId) {
        const result = await requestJson(
          "/learner-state/targets/" + encodeURIComponent(targetKind) + "/" + encodeURIComponent(targetId),
        );
        if (result.status !== "accepted") {
          elements.readinessCheckEvidenceDetail.textContent = "Readiness evidence unavailable";
          return;
        }
        const target = result.value.learnerStateTarget;
        const lines = [
          target.title,
          target.targetKind,
          target.level,
          "Evidence " + target.evidenceCount,
          ...target.evidence.map($0 => [$0.sourceKind, $0.signal, $0.title, $0.summary].filter(Boolean).join(" ")),
        ];
        elements.readinessCheckEvidenceDetail.textContent = lines.join("\\n");
      }

      function readinessCheckForRevision(revisionId) {
        if (state.selectedReadinessCheck?.revisionId === revisionId) {
          return state.selectedReadinessCheck;
        }
        return state.readinessChecks.find($0 => $0.revisionId === revisionId) ?? null;
      }

      function readinessScopeText(scope) {
        if (!scope) {
          return "Scope unavailable";
        }
        if (scope.scopeKind === "period") {
          return "period " + scope.title + " topics " + scope.topicEntityIds.join(", ");
        }
        return "topic " + scope.topicEntityId;
      }

      function readinessRequirementText(requirement) {
        return [
          requirement.targetKind,
          requirement.targetId,
          "required " + requirement.requiredLevel,
        ].join(" ");
      }

      function setMode(mode) {
        const changed = state.mode !== mode;
        state.mode = mode;
        elements.curatorModeTab.setAttribute("aria-selected", mode === "curator" ? "true" : "false");
        elements.studentModeTab.setAttribute("aria-selected", mode === "student" ? "true" : "false");
        elements.membershipCuratorPanel.classList.toggle("hidden", mode !== "curator");
        elements.membershipStudentPanel.classList.toggle("hidden", mode !== "student");
        if (changed) {
          clearMembershipSurfaces();
        }
        if (mode === "student" && canUseProgramApi()) {
          void refreshDeliveries();
          void refreshAttempts();
          void refreshLearnerState();
          void refreshNavigation();
          void refreshReadinessChecks();
          void refreshReadinessAttempts();
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
          "Result: " + (attempt.matched ? "matched" : "not matched"),
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
