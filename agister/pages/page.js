// The page: the folder picker, the Settings, Runs, Compare and Knowledge
// views and
// what reads them again. start runs it over what it is given in place of the
// browser's document, fetch, localStorage, location, navigator and
// setTimeout, so a test can run it over fakes.
(() => {
  // Starts the page; the promise settles once the first reads have.
  function start({ document, fetch, localStorage, location, navigator, setTimeout }) {
    const R = globalThis.AgisterRepos;
    const C = globalThis.AgisterConfig;
    const U = globalThis.AgisterRuns;
    const K = globalThis.AgisterKnowledge;

    // current: the path shown, ~ for Agister home; view: settings, runs,
    // compare or knowledge; model: the settings shown, as config.js reads them; skills:
    // the api/skills reply read with them, whose settings skills are the
    // model's (D-16) and whose folders Knowledge shows.
    const state = { current: null, view: U.readView(localStorage), model: null, skills: null };
    let renderToken = 0;

    const $ = (id) => document.getElementById(id);
    // children: nodes, text or arrays of them. They are appended in batches:
    // spread at once, a skill's thousands of inline nodes overflow the
    // stack.
    const BATCH = 1000;
    const el = (tag, { dataset, ...props } = {}, ...children) => {
      const node = Object.assign(document.createElement(tag), props);
      if (dataset) Object.assign(node.dataset, dataset);
      const list = children.flat().filter((c) => c != null && c !== false);
      for (let i = 0; i < list.length; i += BATCH) node.append(...list.slice(i, i + BATCH));
      return node;
    };

    function say(id, text) {
      const node = $(id);
      node.textContent = text || '';
      node.hidden = !text;
    }

    const label = (id) => (id === R.HOME_ID ? '~' : R.baseName(id));

    // --- picker ---

    function setMenu(open) {
      $('picker-menu').hidden = !open;
      $('picker-button').setAttribute('aria-expanded', String(open));
      say('picker-status', '');
      if (open) renderRecent();
    }

    function when(ms) {
      const d = new Date(ms);
      return d.toDateString() === new Date().toDateString()
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    function renderRecent() {
      const list = R.readRecent(localStorage);
      $('recent-list').replaceChildren(...list.map((entry) => {
        const open = el('button', { type: 'button', className: 'item', title: entry.id },
          el('span', { className: 'name mono', textContent: entry.name }),
          el('span', { className: 'when', textContent: when(entry.lastOpened) }));
        open.addEventListener('click', () => open_(entry.id));
        const remove = el('button', { type: 'button', className: 'remove', textContent: '×' });
        remove.setAttribute('aria-label', `Remove ${entry.name}`);
        remove.addEventListener('click', () => { R.forgetRepo(localStorage, entry.id); renderRecent(); });
        return el('li', {}, open, remove);
      }));
      $('recent-empty').hidden = list.length > 0;
    }

    // Asks the server for the settings at id (a repo path, or ~) and shows
    // them. Only a repo whose .agister was found goes on the recent list; on
    // failure the page says why and keeps what it showed. The user's home
    // folder holds Agister's home, so it shows as ~ and leaves the list.
    // The status is the shown view's: while Runs or Compare is shown, a read
    // of the settings leaves it alone. The settings' skills are the server's
    // inventory of them (api/skills), read with the settings files, which
    // leave skills out (D-16). Knowledge shows the settings' agents and
    // those skills, so it is read after them.
    async function open_(path) {
      const token = ++renderToken;
      let id, files, homeFiles, composedFiles, sources, skills;
      try {
        [{ id, files, homeFiles, composedFiles, sources }, skills] = await Promise.all([R.fetchSettings(fetch, path), R.fetchSkills(fetch, path)]);
        if (id !== path) R.forgetRepo(localStorage, path);
      } catch (err) {
        if (token !== renderToken) return;
        if (!$('picker-menu').hidden) say('picker-status', err.message);
        else if (!U.readsRuns(state.view)) say('status', err.message);
        return;
      }
      if (token !== renderToken) return;
      if (id !== R.HOME_ID) R.rememberRepo(localStorage, id, Date.now());
      R.writeCurrent(localStorage, id);
      state.current = id;
      if (knowledge.path !== id) forgetKnowledge();
      setMenu(false);
      if (!U.readsRuns(state.view)) say('status', '');
      const shown = await render(token, files, homeFiles, skills, composedFiles, sources);
      if (shown && state.view === 'knowledge') await loadKnowledge();
    }

    // Asks for a folder in the Mac's own dialog and opens it; cancelling
    // changes nothing. The button waits while the dialog is open; the server
    // also refuses a second dialog.
    async function addFolder() {
      const button = $('add-folder');
      if (button.disabled) return;
      say('picker-status', '');
      button.disabled = true;
      button.textContent = 'Choosing a folder…';
      let path;
      try {
        path = await R.chooseFolder(fetch);
      } catch (err) {
        return say('picker-status', err.message);
      } finally {
        button.disabled = false;
        button.textContent = 'Add folder…';
      }
      if (path) open_(path);
    }

    // --- dashboard ---

    // files: the shown folder's settings; homeFiles: Agister home's, which a
    // repo's go over, or null for ~ itself; skills: the api/skills reply for
    // them. Says whether they were shown.
    async function render(token, files, homeFiles, skills, composedFiles, sources) {
      $('picker-label').textContent = label(state.current);
      $('picker-button').title = state.current === R.HOME_ID ? 'Agister home, ~/.agister' : state.current;
      if (state.view === 'settings') stamp('Settings');
      let model;
      try {
        model = composedFiles
          ? await C.loadReported(R.agisterFromFiles(composedFiles), sources, skills.settings)
          : homeFiles
          ? await C.loadComposed(R.agisterFromFiles(homeFiles), R.agisterFromFiles(files), skills.settings)
          : await C.loadAgister(R.agisterFromFiles(files), skills.settings);
      } catch (err) {
        if (token === renderToken && !U.readsRuns(state.view)) say('status', `Could not read .agister: ${err.message}`);
        return false;
      }
      if (token !== renderToken) return false;
      state.model = model;
      state.skills = skills;
      $('dashboard').replaceChildren(...dashboard(model, !!homeFiles || !!sources));
      $('dashboard').hidden = state.view !== 'settings';
      return true;
    }

    // "read 10:42:07": when what is shown was read.
    function stamp(what) {
      const now = new Date();
      $('read-at').textContent = `read ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      $('read-at').title = `${what} read from disk at ${now.toLocaleString()}`;
    }

    const text = (value, className = '') => el('span', { className, textContent: value });
    const byName = (items) => new Map(items.filter((x) => !x.error).map((x) => [x.name, x]));
    const nodes = (w) => [...w.fanOut, ...(w.join ? [w.join] : [])];

    // What can run first, as cards; what they are made of after, as tables.
    function dashboard(model, composed) {
      const ix = { agent: byName(model.agents), policy: byName(model.policies), process: byName(model.processes) };
      const steps = new Set(model.workflows.flatMap((w) => (w.error ? [] : nodes(w).map((n) => n.process))));
      const alone = model.processes.filter((p) => p.error || !steps.has(p.name));
      const chip = composed ? sourceChip : () => null;
      const runnable = model.workflows.length + alone.length;
      return [
        el('p', { className: 'intro' }, composed
          ? 'What Agister uses here: home, repository and the selected project compose by field. Maps merge by key; lists and scalars replace whole.'
          : 'Agister home, ~/.agister: the settings every repo starts from. A repo’s .agister goes over them.'),
        runnable ? null : el('p', { className: 'intro' }, 'Nothing to run here: no workflows or processes.'),
        group('Workflows', 'several agent calls at once, then one that brings their results together',
          model.workflows.map((w) => workflowCard(w, ix, chip))),
        group('Processes', steps.size
          ? 'one agent call each; the workflow steps above also run alone'
          : 'one agent call each',
        alone.map((p) => processCard(p, ix, chip))),
        model.agents.length || model.policies.length || model.runtimes.length || model.service
          ? el('h2', { className: 'group', textContent: 'Building blocks' }) : null,
        agentsTable(model.agents, composed),
        policiesTable(model.policies, composed),
        runtimesTable(model.runtimes, composed),
        limitsTable(model.service, composed),
      ].filter(Boolean);
    }

    function group(title, note, cards) {
      if (!cards.length) return null;
      return el('section', { className: 'group' },
        el('h2', { className: 'group', textContent: title }),
        el('p', { className: 'group-note', textContent: note }),
        el('div', { className: 'cards' }, ...cards));
    }

    function sourceChip(item) {
      if (!item.source) return null;
      if (item.layers) {
        const composed = item.layers.some((x) => 'fields' in x);
        const title = item.layers.map((x, i) => `${x.layer} ${x.path}${composed ? `: ${x.fields?.join(', ') || '(none)'}` : i ? ' (replaced)' : ''}`).join('\n');
        return el('span', { className: 'chip', title, textContent: item.layers.map((x) => x.layer).join(' + ') });
      }
      if (item.source === 'home') return text('home', 'chip');
      return item.overrides
        ? el('span', { className: 'chip replaces', title: 'The nearest layer supplies these fields', textContent: `${item.source}, replaces home` })
        : text(item.source, 'chip repo');
    }

    function layerLine(item) {
      if (!item.layers) return null;
      return el('div', {}, ...item.layers.map((x, i) => el('div', {},
        `${x.layer} ${x.path}`, 'fields' in x ? `: ${x.fields.join(', ') || '(none)'}` : i ? ' (replaced)' : '')));
    }

    const missing = (kind, name) =>
      el('span', { className: 'missing', title: `No ${kind} named ${name} in these settings: Agister refuses the call` },
        `${name} (missing ${kind})`);

    function copyButton(command) {
      const button = el('button', { type: 'button', className: 'copy', textContent: 'Copy' });
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(command);
          button.textContent = 'Copied';
        } catch {
          button.textContent = 'Select it';
        }
        setTimeout(() => { button.textContent = 'Copy'; }, 1200);
      });
      return button;
    }

    // The command that runs name; required params get a placeholder.
    function command(name, params) {
      const line = ['agister run', name, ...params.filter((p) => p.default === undefined).map((p) => `--param ${p.name}=<${p.name}>`)].join(' ');
      return el('div', { className: 'cmd' }, el('code', { textContent: line }), copyButton(line));
    }

    // The facts grid: [label, value] pairs; a null value drops its row.
    function facts(rows) {
      return el('div', { className: 'facts' }, ...rows.filter(([, v]) => v != null).flatMap(([label, value]) => [
        text(label, 'label'), el('div', { className: 'value' }, value),
      ]));
    }

    function defaults(params) {
      const set = params.filter((p) => p.default !== undefined);
      if (!set.length) return null;
      return el('div', {}, set.map((p) => `${p.name} = ${p.default}`).join(', '));
    }

    const SESSION = { resumable: 'can be continued (--continue)', 'fresh-only': 'starts fresh every call' };

    function agentLine(name, ix) {
      const a = ix.agent.get(name);
      if (!a) return missing('agent', name);
      const parts = [a.model, a.effort && `${a.effort} effort`].filter(Boolean);
      const session = SESSION[a.session] ?? a.session;
      return el('div', {},
        el('div', {}, text(name, 'name'), ' — ',
          a.runtimeOutside ? missing('runtime', a.runtime) : text(a.runtime ?? 'no runtime'),
          parts.length ? `, ${parts.join(', ')}` : ''),
        session ? el('div', { className: 'sub' }, session) : null);
    }

    // "read-only workspace, 20m, $2 cap"
    function policySummary(p) {
      return [p.access && `${p.access} workspace`, p.timeout, p.maxCostUsd != null && `$${p.maxCostUsd} cap`].filter(Boolean).join(', ');
    }

    function policyLines(name, ix) {
      const p = ix.policy.get(name);
      if (!p) return missing('policy', name);
      return el('div', {},
        el('div', {}, text(name, 'name'), ' — ', text(policySummary(p), `access-${p.access}`)),
        el('div', { className: 'sub' }, `allows: ${p.allow.length ? p.allow.join(', ') : 'nothing'}`),
        p.deny.length ? el('div', { className: 'sub' }, `denies: ${p.deny.join(', ')}`) : null);
    }

    // The output schema, with the layers it comes from, then the verify.
    function outputLine(p, chip) {
      const parts = [];
      if (p.schema) parts.push(...named('schema', p.schema, chip, `${p.schema.name} schema`));
      if (p.verify?.outside) parts.push(parts.length ? '; ' : '', missing('verify', p.verify.ref));
      else if (p.verify) {
        parts.push(`${parts.length ? '; ' : ''}a failed verify${p.verify.ref ? ` (${p.verify.ref})` : ''} is fixed up to ${p.verify.maxAttempts ?? '?'}×`);
      }
      return parts.length ? el('div', {}, ...parts) : null;
    }

    // A prompt, schema, skill or brief form (kind) a process, a workflow or
    // an agent names, shown as label: marked missing when these settings
    // have none of that name, or with the chip of the layer it comes from; a
    // read error that breaks it and a skill whose checks fail say so, as
    // Agister refuses the call.
    function named(kind, x, chip, label = x.name) {
      if (x.outside) return [missing(kind, x.name)];
      const origin = chip(x);
      const broken = x.error
        ? el('span', { className: 'error', title: `Agister refuses the call: ${x.error}`, textContent: x.error }) : null;
      const failed = x.checks && !x.checks.passed
        ? el('span', { className: 'failed', title: (x.checks.failed ?? []).join('; '), textContent: 'checks failed' }) : null;
      return [label, origin ? ' ' : '', origin, broken ? ' ' : '', broken, failed ? ' ' : '', failed];
    }

    function namedLine(kind, list, chip) {
      if (!list?.length) return null;
      return el('div', {}, ...list.flatMap((x, i) => [i ? ', ' : '', ...named(kind, x, chip)]));
    }

    // What its call needs of the caller's worktree (ADR-025 rules 2, 3):
    // HEAD at the revision an input names, and HEAD's content exactly for
    // a fresh call.
    function worktreeLine(p) {
      const parts = [];
      if (p.revision) parts.push('HEAD at ', el('code', { textContent: p.revision }));
      if (p.clean) parts.push(parts.length ? ', clean' : 'clean');
      return parts.length ? el('div', {}, ...parts) : null;
    }

    function errorCard(item) {
      return el('article', { className: 'card run' },
        el('header', { className: 'run-head' }, el('h3', { textContent: item.name })),
        el('p', { className: 'error', textContent: `${item.file}: ${item.error}` }));
    }

    function card(kind, item, chip, ...body) {
      return el('article', { className: 'card run', id: `${kind}-${item.name}` },
        el('header', { className: 'run-head' }, el('h3', { textContent: item.name }), chip(item)),
        item.purpose ? el('p', { className: 'purpose', textContent: item.purpose }) : null,
        ...body, item.layers ? facts([['layers', layerLine(item)]]) : null);
    }

    function processCard(p, ix, chip) {
      if (p.error) return errorCard(p);
      return card('process', p, chip, command(p.name, p.params), facts([
        ['defaults', defaults(p.params)],
        ['agent', agentLine(p.agent, ix)],
        ['policy', policyLines(p.policy, ix)],
        ['prompt', namedLine('prompt', p.prompt ? [p.prompt] : [], chip)],
        ['guidance', p.guidance.length ? namedLine('prompt', p.guidance, chip) : text('none')],
        ['briefs', namedLine('brief', p.forms, chip)],
        ['skills', namedLine('skill', p.callSkills, chip)],
        ['output', outputLine(p, chip)],
        ['verification layers', verificationLayers(p)],
        ['worktree', worktreeLine(p)],
      ]));
    }

    function verificationLayers(p) {
      return p.verify?.layers ? el('div', {}, p.verify.ref, layerLine(p.verify)) : null;
    }

    // A workflow step exposes the process's prompt, guidance, output schema
    // and field layers too, since processes used by workflows have no
    // standalone card.
    function step(n, ix, chip) {
      const p = ix.process.get(n.process);
      if (!p) return el('div', { className: 'step' }, missing('process', n.process));
      const a = ix.agent.get(p.agent);
      const pol = ix.policy.get(p.policy);
      return el('div', { className: 'step' },
        el('div', { className: 'step-name', textContent: p.name }),
        p.purpose ? el('p', { className: 'step-purpose', textContent: p.purpose }) : null,
        el('div', { className: 'step-meta' },
          el('div', {}, text('agent  ', 'label'),
            a ? [p.agent, a.model, a.effort && `${a.effort} effort`].filter(Boolean).join(' · ') : missing('agent', p.agent)),
          el('div', {}, text('policy ', 'label'),
            pol ? el('span', {}, `${p.policy} · `, text(policySummary(pol), `access-${pol.access}`)) : missing('policy', p.policy))),
        facts([
          ['prompt', namedLine('prompt', p.prompt ? [p.prompt] : [], chip)],
          ['guidance', p.guidance.length ? namedLine('prompt', p.guidance, chip) : text('none')],
          ['output', outputLine(p, chip)],
          ['layers', layerLine(p)],
          ['verification layers', verificationLayers(p)],
        ]));
    }

    function stage(title, steps) {
      return el('section', { className: 'stage' }, el('h4', { textContent: title }), ...steps);
    }

    // The models a set of steps runs on: "4 × gpt-6.1-sol", "sonnet + opus".
    function models(steps, ix) {
      const count = new Map();
      for (const n of steps) {
        const model = ix.agent.get(ix.process.get(n.process)?.agent)?.model ?? 'unknown model';
        count.set(model, (count.get(model) ?? 0) + 1);
      }
      return [...count].map(([model, k]) => (k > 1 ? `${k} × ${model}` : model)).join(' + ');
    }

    // A workflow in one line: "4 × gpt-6.1-sol at once, then opus".
    function calls(w, ix) {
      const parts = [];
      if (w.fanOut.length) parts.push(`${models(w.fanOut, ix)}${w.fanOut.length > 1 ? ' at once' : ''}`);
      if (w.join) parts.push(`${parts.length ? 'then ' : ''}${models([w.join], ix)}`);
      return parts.length ? text(parts.join(', '), 'name') : null;
    }

    function workflowCard(w, ix, chip) {
      if (w.error) return errorCard(w);
      return card('workflow', w, chip, command(w.name, w.params),
        facts([['calls', calls(w, ix)], ['defaults', defaults(w.params)], ['briefs', namedLine('brief', w.forms, chip)]]),
        w.fanOut.length ? stage(w.fanOut.length > 1 ? `${w.fanOut.length} at once` : 'First', w.fanOut.map((n) => step(n, ix, chip))) : null,
        w.join ? stage('Then', [step(w.join, ix, chip)]) : null);
    }

    // A reference table; the first cell is the name, then cells(item), then
    // the source when settings are composed.
    function table(title, note, columns, items, cells, composed) {
      if (!items.length) return null;
      const head = composed ? [...columns, 'From'] : columns;
      return el('section', { className: 'card' },
        el('header', { className: 'section-head' },
          el('h3', { textContent: title }),
          note ? el('span', { className: 'note', textContent: note }) : null),
        el('table', {},
          el('thead', {}, el('tr', {}, ...head.map((c) => el('th', { textContent: c })))),
          el('tbody', {}, ...items.map((item) => {
            if (item.error) {
              return el('tr', {}, el('td', { className: 'name', textContent: item.name }),
                el('td', { colSpan: head.length - 1, className: 'error', textContent: `${item.file}: ${item.error}` }));
            }
            // data-label names the column where a narrow screen stacks the row.
            const row = [el('td', { className: 'name', textContent: item.name }),
              ...cells(item).map((c, i) => el('td', { dataset: { label: head[i + 1] } }, c ?? '—'))];
            if (composed) row.push(el('td', { dataset: { label: 'From' } }, sourceChip(item)));
            return el('tr', { id: `${title}-${item.name}` }, ...row);
          }))));
    }

    function agentsTable(items, composed) {
      return table('Agents', 'resumable: a run can be continued with --continue; fresh-only: every call starts fresh',
        ['Agent', 'Runtime', 'Model', 'Effort', 'Session', 'Skills'], items, (a) => [
          a.runtimeOutside ? missing('runtime', a.runtime) : a.runtime,
          a.model, a.effort, a.session,
          namedLine('skill', a.skills, composed ? sourceChip : () => null),
        ], composed);
    }

    function policiesTable(items, composed) {
      return table('Policies', 'what a call may touch, for how long and at what cost',
        ['Policy', 'Workspace', 'Timeout', 'Cost cap', 'Allows', 'Denies'], items, (p) => [
          p.access ? text(p.access, `access-${p.access}`) : null,
          p.timeout,
          p.maxCostUsd != null ? `$${p.maxCostUsd}` : null,
          p.allow.length ? p.allow.join(', ') : 'nothing',
          p.deny.length ? p.deny.join(', ') : null,
        ], composed);
    }

    function runtimesTable(items, composed) {
      return table('Runtimes', 'how Agister drives an agent’s CLI; tested with: the CLI versions checked',
        ['Runtime', 'Adapter', 'Contract', 'Tested with'], items, (r) => [
          r.adapter, r.contract,
          r.verified.length ? r.verified.map((v) => v.replace(/\.$/, '.x')).join(', ') : null,
        ], composed);
    }

    // service.toml: the caps no policy or process may go past.
    function limitsTable(service, composed) {
      if (!service) return null;
      const from = service.layers ? service.layers.map((x) => `${x.layer} ${x.path}`).join(' + ')
        : composed ? (service.source === 'repo' ? 'this repo’s service.toml' : 'Agister home’s service.toml') : 'service.toml';
      const head = el('header', { className: 'section-head' },
        el('h3', { textContent: 'Service limits' }),
        el('span', { className: 'note', textContent: `${from}: caps no policy or process may go past` }),
        service.layers ? sourceChip(service) : null);
      if (service.error) {
        return el('section', { className: 'card' }, head, el('p', { className: 'error', textContent: service.error }));
      }
      const rows = [
        ['Longest timeout', service.maxTimeout, 'no policy may set a longer timeout'],
        ['Attempts per call', service.maxAttempts, 'how many times an agent call may be tried; 1 means no retries'],
        ['Verify attempts', service.maxVerifyAttempts, 'how many times a process may fix its work after the verify command fails'],
        ['Permissions', service.permissions, 'how many words policies may use to allow or deny access'],
      ].filter(([, v]) => v != null);
      return el('section', { className: 'card' }, head,
        el('table', {},
          el('thead', {}, el('tr', {}, ...['Limit', 'Value', 'Meaning'].map((c) => el('th', { textContent: c })))),
          el('tbody', {}, ...rows.map(([name, value, meaning]) => el('tr', {},
            el('td', { className: 'name', textContent: name }),
            el('td', { textContent: String(value), dataset: { label: 'Value' } }),
            el('td', { textContent: meaning, dataset: { label: 'Meaning' } }))))));
    }

    // --- runs ---

    // filter: the process and status shown; chosen: the run opened over the
    // list; list: what the server sent last.
    const runs = { list: null, filter: { process: '', status: '' }, chosen: null };
    let runsToken = 0;
    let detailToken = 0;

    // Reads the runs again and shows them, with the run opened before. A
    // read that ends after the user left Runs, or after a newer read, leaves
    // the page alone: the status and the read time are the shown view's.
    async function loadRuns() {
      const token = ++runsToken;
      const current = () => token === runsToken && state.view === 'runs';
      let list;
      try {
        list = await R.fetchRuns(fetch);
      } catch (err) {
        if (current()) say('status', err.message);
        return;
      }
      if (!current()) return;
      say('status', '');
      runs.list = list;
      stamp('Runs');
      renderRuns();
      if (runs.chosen) openRun(runs.chosen);
    }

    function renderRuns() {
      $('runs').replaceChildren(
        el('p', { className: 'intro', textContent: 'Runs in Agister home, ~/.agister/runs, whatever the picker shows.' }),
        el('p', { className: 'group-note', textContent: 'newest first; click a run to open it' }),
        filters(runs.list.runs),
        el('div', { id: 'run-list' }),
        runOverlay(),
        skillOverlay());
      renderRunList();
    }

    // The opened run shows over the page; Close, Escape or a click beside it
    // closes it.
    function runOverlay() {
      const panel = el('div', { id: 'run-detail', className: 'card panel', tabIndex: -1 });
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Run');
      const overlay = el('div', { id: 'run-overlay', className: 'overlay', hidden: true }, panel);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeRun(); });
      return overlay;
    }

    // --- compare ---

    let compareToken = 0;

    // Reads the comparison again and shows it; as with Runs, a read that
    // ends after the user left Compare, or after a newer read, leaves the
    // page alone.
    async function loadCompare() {
      const token = ++compareToken;
      const current = () => token === compareToken && state.view === 'compare';
      let compare;
      try {
        compare = await R.fetchCompare(fetch);
      } catch (err) {
        if (current()) say('status', err.message);
        return;
      }
      if (!current()) return;
      say('status', '');
      stamp('Compare');
      $('compare').replaceChildren(
        el('p', { className: 'intro', textContent: 'Runs in Agister home, ~/.agister/runs, whatever the picker shows.' }),
        el('p', { className: 'group-note', textContent: 'completed and failed calls, not workflows: per process, a row per runtime, model and effort; click a process to list its runs' }),
        ...compareSections(compare.groups));
    }

    // A link that shows Runs filtered to process.
    function processInRuns(process) {
      const link = el('a', { href: `#${process}`, textContent: process });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        runs.filter = { process, status: '' };
        showView('runs');
      });
      return link;
    }

    function compareSections(groups) {
      const tables = U.compareTables(groups);
      if (!tables.length) return [el('p', { className: 'intro', textContent: 'No completed or failed calls yet.' })];
      const head = ['Runtime', 'Model', 'Effort', 'Runs', 'Completed', 'Pass rate', 'Verify attempts', 'Median wall', 'Cost / completed'];
      const keys = ['model', 'effort', 'runs', 'completed', 'passRate', 'verifyAttempts', 'medianWall', 'costPerCompleted'];
      return tables.map((t) => el('section', { className: 'card' },
        el('header', { className: 'section-head' }, el('h3', { className: 'mono' }, processInRuns(t.process))),
        el('table', {},
          el('thead', {}, el('tr', {}, ...head.map((c) => el('th', { textContent: c })))),
          el('tbody', {}, ...t.rows.map((row) => el('tr', {},
            el('td', { className: 'name', textContent: row.adapter }),
            ...keys.map((k, i) => el('td', { className: 'short', textContent: row[k], dataset: { label: head[i + 1] } }))))))));
    }

    function select(name, all, values, chosen) {
      const node = el('select', { name },
        el('option', { value: '', textContent: all }),
        ...values.map((v) => el('option', { value: v, textContent: v, selected: v === chosen })));
      node.addEventListener('change', () => {
        runs.filter[name] = node.value;
        renderRunList();
      });
      return el('label', {}, name, node);
    }

    // The filters offer what is present; a choice no longer present is let go.
    function filters(list) {
      const processes = U.processes(list);
      const statuses = U.statuses(list);
      if (!processes.includes(runs.filter.process)) runs.filter.process = '';
      if (!statuses.includes(runs.filter.status)) runs.filter.status = '';
      return el('div', { className: 'filters' },
        select('process', 'all processes', processes, runs.filter.process),
        select('status', 'all statuses', statuses, runs.filter.status));
    }

    // "Oct 1, 10:42" in local time; the full time in its title.
    function at(iso) {
      const d = new Date(iso);
      if (!iso || Number.isNaN(d.getTime())) return text('');
      const node = text(d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
      node.title = d.toLocaleString();
      return node;
    }

    // A status as its mark, named on hover; one without a mark as its word.
    function status(value) {
      const mark = U.statusMark(value);
      if (!mark) return text(value, U.failed(value) ? 'failed' : '');
      const node = el('span', { className: `mark ${mark.tone}`, textContent: mark.glyph, title: value });
      node.setAttribute('aria-label', value);
      return node;
    }

    function implementorCell(r) {
      if (r.workflow) return text(U.nodes(r.workflow));
      const node = text(U.implementor(r.implementor));
      const reported = U.reportedModel(r.implementor);
      if (reported) node.title = `the runtime reported ${reported}`;
      return node;
    }

    function renderRunList() {
      const { list } = runs;
      const shown = U.filterRuns(list.runs, runs.filter);
      const head = ['Started', 'Process', 'Implementor', 'Status', 'Verify', 'Wall', 'Cost', 'Skills', 'Tool calls'];
      const notes = [];
      if (list.total > list.runs.length) notes.push(`The newest ${list.runs.length} of ${list.total} runs.`);
      if (list.skipped) notes.push(`${list.skipped} ${list.skipped === 1 ? 'run is' : 'runs are'} left out: the record does not parse.`);
      $('run-list').replaceChildren(
        shown.length
          ? el('section', { className: 'card' }, el('div', { className: 'run-scroll' }, el('table', {},
            el('thead', {}, el('tr', {}, ...head.map((c) => el('th', { textContent: c })))),
            el('tbody', {}, ...shown.map(runRow)))))
          : el('p', { className: 'intro', textContent: list.runs.length ? 'No runs match the filters.' : 'No runs yet.' }),
        ...(notes.length ? [el('p', { className: 'group-note', textContent: notes.join(' ') })] : []));
    }

    function runRow(r) {
      const cells = [
        r.process,
        implementorCell(r),
        status(r.status),
        U.verify(r.outcome?.verify),
        U.duration(r.outcome?.wall_ms),
        U.cost(r.outcome?.cost_usd),
        r.workflow ? U.counts(r.workflow.items?.by_ruling) : U.skills(r.skills),
        r.tool_calls != null ? String(r.tool_calls) : '',
      ];
      const row = el('tr', { className: `pick${r.id === runs.chosen ? ' chosen' : ''}`, tabIndex: 0, title: r.id },
        el('td', { className: 'name' }, at(r.created_at)),
        ...cells.map((c, i) => el('td', { className: i >= 2 && i <= 5 ? 'short' : i === 6 ? 'clip' : '', title: i === 6 ? c : '', dataset: { label: ['Process', 'Implementor', 'Status', 'Verify', 'Wall', 'Cost', r.workflow ? 'Rulings' : 'Skills', 'Tool calls'][i] } }, c)));
      const open = () => (runs.chosen === r.id ? closeRun() : openRun(r.id));
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      return row;
    }

    function markChosen() {
      for (const row of document.querySelectorAll('#run-list tr.pick')) row.classList.toggle('chosen', row.title === runs.chosen);
    }

    // Closes the opened run; the focus goes back to its row.
    function closeRun() {
      detailToken++;
      if (skillOpen()) closeSkill();
      const id = runs.chosen;
      runs.chosen = null;
      markChosen();
      $('run-overlay').hidden = true;
      $('run-detail').replaceChildren();
      [...document.querySelectorAll('#run-list tr.pick')].find((r) => r.title === id)?.focus();
    }

    const runOpen = () => !!$('run-overlay') && !$('run-overlay').hidden;
    const skillOpen = () => !!$('skill-overlay') && !$('skill-overlay').hidden;

    // A skill a run used shows over the run; Close, Escape or a click beside
    // it closes it and leaves the run open.
    function skillOverlay() {
      const panel = el('div', { id: 'skill-detail', className: 'card panel', tabIndex: -1 });
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Skill');
      const overlay = el('div', { id: 'skill-overlay', className: 'overlay over', hidden: true }, panel);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSkill(); });
      return overlay;
    }

    let skillToken = 0;

    function closeSkill() {
      skillToken++;
      $('skill-overlay').hidden = true;
      $('skill-detail').replaceChildren();
      $('run-close')?.focus();
    }

    // Opens the skill name a run used, as it is now: read from the run's
    // working directory, else the folder the picker shows, else Agister
    // home, as a run on adapter finds it.
    async function openSkill(name, cwd, adapter) {
      const token = ++skillToken;
      let found = null;
      const unread = [];
      for (const place of U.skillPlaces(cwd, state.current, R.HOME_ID)) {
        try {
          found = U.findSkill(await R.fetchSkills(fetch, place), name, adapter);
        } catch {
          unread.push(place);
          continue;
        }
        if (found) {
          found.place = place;
          break;
        }
      }
      if (token !== skillToken) return;
      const close = el('button', { type: 'button', id: 'skill-close', className: 'close', textContent: '×', title: 'Close (Esc)' });
      close.setAttribute('aria-label', 'Close');
      close.addEventListener('click', closeSkill);
      const label = (p) => (p === R.HOME_ID ? 'Agister home' : p);
      const why = !cwd ? 'The run’s record names no working directory'
        : unread.includes(cwd) ? `The run’s working directory, ${cwd}, cannot be read`
        : 'The run’s working directory has no such skill';
      const note = !found ? `No skill named ${name} in ${U.skillPlaces(cwd, state.current, R.HOME_ID).map(label).join(', ')}.`
        : found.place === cwd ? 'As the run’s working directory holds it now; the run may have read an earlier version.'
        : `${why}: this is the skill as it is here now, which can differ from what the run read.`;
      $('skill-detail').replaceChildren(el('article', { className: 'skill-card', dataset: { skill: name } },
        el('header', { className: 'run-head' }, el('div', { className: 'run-title' }, el('h3', { textContent: name })), close),
        found ? el('p', { className: 'run-when' }, `${found.folder} in ${label(found.place)}`, found.skill.path ? el('span', { className: 'run-id', textContent: ` · ${found.skill.path}` }) : null) : null,
        el('p', { className: 'group-note', textContent: note }),
        found?.skill.content ? el('div', { className: 'markdown' }, K.markdown(K.body(found.skill.content)).map(block))
          : found ? el('p', { className: 'error', textContent: `SKILL.md was not read: ${found.skill.state ?? 'no content'}` }) : null));
      $('skill-overlay').hidden = false;
      $('skill-detail').scrollTop = 0;
      close.focus();
    }

    // A skill a run used, as a link that opens it over the run.
    function skillLink(name, cwd, adapter) {
      const link = el('a', { href: `#${name}`, textContent: name });
      link.addEventListener('click', (e) => { e.preventDefault(); openSkill(name, cwd, adapter); });
      return link;
    }

    // Opens the run id over the list, from the server, in place of the one
    // open, if any.
    async function openRun(id) {
      const token = ++detailToken;
      runs.chosen = id;
      markChosen();
      let content;
      try {
        const detail = await R.fetchRun(fetch, id);
        content = runCard(detail.summary, detail.record);
      } catch (err) {
        content = el('article', {},
          el('header', { className: 'run-head' }, el('p', { className: 'error', textContent: `${id}: ${err.message}` }), closeButton()));
      }
      if (token !== detailToken) return;
      $('run-detail').replaceChildren(content);
      $('run-overlay').hidden = false;
      $('run-detail').scrollTop = 0;
      $('run-close').focus();
    }

    function closeButton() {
      const close = el('button', { type: 'button', id: 'run-close', className: 'close', textContent: '×', title: 'Close (Esc)' });
      close.setAttribute('aria-label', 'Close');
      close.addEventListener('click', closeRun);
      return close;
    }

    // A link that opens the run id.
    function runLink(id, label = id) {
      const link = el('a', { href: `#${id}`, textContent: label, title: id });
      link.addEventListener('click', (e) => { e.preventDefault(); openRun(id); });
      return link;
    }

    const line = (...parts) => el('div', {}, ...parts);
    const joined = (parts) => parts.filter(Boolean).join(' · ');

    // The run: what it is, how it ended, its verdict, what it cost and took,
    // and when, in its head; its ID small; the rest as facts; a workflow's
    // nodes as a table; what its result says; the record as stored folded
    // at the bottom.
    function runCard(s, record) {
      const impl = s.implementor;
      const policy = s.policy;
      const outcome = s.outcome ?? {};
      const items = s.workflow?.items;
      const said = U.runOutput(record?.result);
      const figure = (value, title) => (value ? el('span', { className: 'figure', textContent: value, title }) : null);
      return el('article', { className: 'run-card', dataset: { run: s.id } },
        el('header', { className: 'run-head' },
          el('div', { className: 'run-title' },
            el('h3', { textContent: s.process }),
            status(s.status),
            figure(U.cost(outcome.cost_usd), outcome.cost_source ? `cost, from the ${outcome.cost_source}` : 'cost'),
            figure(U.duration(outcome.wall_ms), 'wall time'),
            said.verdict ? el('span', { className: `chip verdict${toneClass(said.verdict)}`, textContent: said.verdict.replaceAll('_', ' '), title: 'verdict' }) : null),
          closeButton()),
        el('p', { className: 'run-when' },
          joined([U.timeSpan(s.created_at, s.finished_at), s.agent && `agent ${s.agent}`]),
          ' · ', el('span', { className: 'run-id', textContent: s.id })),
        facts([
          ['implementor', impl ? line(
            joined([impl.adapter && [impl.adapter, impl.version].filter(Boolean).join(' '), impl.model, impl.effort && `${impl.effort} effort`]),
            U.reportedModel(impl) ? text(` · the runtime reported ${impl.reported_model}`, 'sub') : '') : null],
          ['policy', policy ? line(
            policy.access ? text(`${policy.access} workspace`, `access-${policy.access}`) : '',
            policy.access ? ' · ' : '',
            joined([policy.timeout_ms ? U.duration(policy.timeout_ms) : '', policy.max_cost_usd != null ? `${U.cost(policy.max_cost_usd)} cap` : '', policy.scope && `scope ${policy.scope}`])) : null],
          ['verify', outcome.verify ? U.verify(outcome.verify, record?.verify?.max_attempts) : null],
          ['timing', joined([outcome.turn_ms != null && `turn ${U.duration(outcome.turn_ms)}`, outcome.runtime_ms != null && `runtime ${U.duration(outcome.runtime_ms)}`]) || null],
          ['activity', s.tool_calls != null ? `${s.tool_calls} tool ${s.tool_calls === 1 ? 'call' : 'calls'}` : null],
          ['skills', s.skills?.length ? line(...s.skills.flatMap((k, i) => [i ? ', ' : null, skillLink(k.name, record?.request?.cwd, impl?.adapter), `×${k.count ?? 0}`])) : null],
          ['workflow', s.parent ? runLink(s.parent, 'the workflow run') : null],
          ['rulings', items ? `${U.counts(items.by_ruling) || 'none'} (${items.total} ${items.total === 1 ? 'item' : 'items'})` : null],
          ['severities', items ? U.counts(items.by_severity) || null : null],
        ]),
        s.workflow?.nodes.length ? nodesTable(s.workflow) : null,
        said.parts.length ? el('section', { className: 'output' }, ...said.parts.map((part) => el('div', { className: `part part-${part.key}`, dataset: { key: part.key } },
          el('h4', { textContent: part.key.replaceAll('_', ' ') }), partBody(part)))) : null,
        el('details', { className: 'record' },
          el('summary', { textContent: 'Record as stored' }),
          el('pre', { className: 'mono', textContent: JSON.stringify(record, null, 2) })));
    }

    const toneClass = (value) => (U.tone(value) ? ` tone-${U.tone(value)}` : '');
    const prose = (src) => el('div', { className: 'markdown' }, K.markdown(src).map(block));

    // One part of a run's output, as runs.js reads it.
    function partBody(part) {
      switch (part.kind) {
        case 'text': return prose(part.text);
        case 'list': {
          const list = el('ul', { className: 'mono' }, ...part.items.map((i) => el('li', { textContent: i })));
          return part.items.length > 12 ? el('details', {}, el('summary', { textContent: `${part.items.length} entries` }), list) : list;
        }
        case 'table': return el('table', { className: 'part-table' },
          el('thead', {}, el('tr', {}, ...part.columns.map((c) => el('th', { textContent: c.replaceAll('_', ' ') })))),
          el('tbody', {}, ...part.rows.map((row) => el('tr', {},
            ...row.map((v, i) => el('td', { className: toneClass(v).trim(), textContent: v, dataset: { label: part.columns[i] } }))))));
        case 'cards': return el('div', {}, ...part.cards.map(findingCard));
        case 'facts': return el('div', { className: 'facts' },
          ...part.facts.flatMap(([k, p]) => [text(k.replaceAll('_', ' '), 'label'), el('div', { className: 'value' }, partBody(p))]));
        default: return el('pre', { className: 'mono json', textContent: part.text });
      }
    }

    // A finding, item or decision: its tags, title and place; its detail,
    // reason and action; the rest folded.
    function findingCard(c) {
      return el('article', { className: 'finding' },
        el('div', { className: 'finding-head' },
          ...c.tags.map((t) => el('span', { className: `chip${toneClass(t)}`, textContent: t })),
          el('strong', { textContent: c.title }),
          c.where ? text(c.where, 'where') : null,
          c.sources ? text(`from ${c.sources}`, 'sub') : null),
        ...c.texts.map(([k, t]) => el('div', { className: 'finding-text' }, k === 'detail' ? null : text(k, 'label'), prose(t))),
        c.more ? el('details', { className: 'more' }, el('summary', { textContent: 'more' }), partBody(c.more)) : null);
    }

    // A workflow's nodes: each opens its run; the join is marked; the
    // rulings are of the judge's items the node was a source of.
    function nodesTable(workflow) {
      return el('div', { className: 'nodes' }, simpleTable(['Node', 'Process', 'Status', 'Wall', 'Cost', 'Rulings'],
        U.nodeRows(workflow).map((n) => [
          el('span', {}, n.run ? runLink(n.run, n.name) : n.name, n.join ? text(' join', 'sub') : null),
          n.process, n.status ? status(n.status) : '', n.wall, n.cost, n.rulings,
        ])));
    }

    // --- knowledge ---

    // data: the view's model, read for path; chosen: the agent or skill
    // opened below the overview, { kind, name }; source: a skill shows its
    // SKILL.md as stored instead of rendered.
    const knowledge = { data: null, path: null, chosen: null, source: false };
    let knowledgeToken = 0;

    // Another folder is shown: its Knowledge is not the last one read, so
    // that one goes, and a failed read leaves nothing under the new label.
    function forgetKnowledge() {
      knowledge.data = null;
      knowledge.path = null;
      $('knowledge').replaceChildren();
    }

    const TWO_LISTS = 'An agent’s skills are two lists, shown apart: the skills its settings name, which Agister gives its calls (ADR-021), and the skills its runtime would load from the repo and the home (ADR-006). This page only reads them; editing is not part of it.';

    // Reads the runs, and shows them with the settings and their skills, as
    // open_ read them, and what was opened before. As with Runs, a read that
    // ends after the user left Knowledge, after a newer read, or after the
    // settings were asked for again (open_), leaves the page alone.
    async function loadKnowledge() {
      const token = ++knowledgeToken;
      const opened = renderToken;
      const current = () => token === knowledgeToken && opened === renderToken && state.view === 'knowledge';
      const settings = state.model;
      const skills = state.skills;
      const path = state.current;
      let list;
      try {
        list = await R.fetchRuns(fetch);
      } catch (err) {
        if (current()) say('status', err.message);
        return;
      }
      if (!current()) return;
      say('status', '');
      knowledge.data = K.model(settings, skills, list.runs);
      knowledge.path = path;
      stamp('Knowledge');
      renderKnowledge();
    }

    function renderKnowledge() {
      const d = knowledge.data;
      $('knowledge').replaceChildren(
        el('p', { className: 'intro' }, d.home
          ? 'Agister home, no repo: the skills each agent’s settings name, and the skills its runtime would load from the home folders.'
          : 'The skills each agent’s settings name, and the skills its runtime would load in this repo’s working tree and from the home folders. A call loads what the worktree it works in holds, which can differ.'),
        el('p', { className: 'intro', textContent: TWO_LISTS }),
        el('h2', { className: 'group', textContent: 'Overview' }),
        el('p', { className: 'group-note', textContent: 'what the runtimes would load: a row per skill name, a column per agent; ● the agent’s runtime loads a skill of that name; shared: the name is in several folders. The skills an agent’s settings name are in its card. Click an agent or a skill to open it below.' }),
        overview(d),
        el('div', { id: 'knowledge-detail' }),
        foldersCard(d.folders));
      renderChosen();
    }

    // A button that opens the agent or skill name below the overview; again
    // closes it.
    function pick(kind, name) {
      const button = el('button', { type: 'button', className: 'link', textContent: name, title: `Open the ${kind} ${name}` });
      button.addEventListener('click', () => {
        const { chosen } = knowledge;
        knowledge.chosen = chosen?.kind === kind && chosen.name === name ? null : { kind, name };
        renderChosen();
        if (knowledge.chosen) $('knowledge-detail').scrollIntoView({ block: 'nearest' });
      });
      return button;
    }

    const sharedChip = (skill) => (skill.shared
      ? el('span', { className: 'chip replaces', title: 'The same name in several folders; which one a runtime uses is not decided here', textContent: `shared ×${skill.entries.length}` })
      : null);
    const scopeChip = (folder) => text(folder.scope, folder.scope === 'repo' ? 'chip repo' : 'chip');

    // The matrix: which agent's runtime loads a skill of which name.
    function overview(d) {
      if (!d.agents.length) return el('p', { className: 'intro', textContent: 'No agents in these settings.' });
      const head = el('tr', {}, el('th', { textContent: 'Skill' }), ...d.agents.map((a) => el('th', {}, pick('agent', a.name),
        el('span', { className: 'sub' }, a.runtimeMissing ? missing('runtime', a.runtime) : a.adapter ?? 'no adapter'),
        el('span', { className: 'sub' }, [a.model, a.effort].filter(Boolean).join(' · ') || '—'))));
      const rows = d.skills.map((s) => el('tr', {},
        el('td', { className: 'name' }, pick('skill', s.name), s.shared ? ' ' : null, sharedChip(s)),
        ...d.agents.map((a) => {
          const n = a.loads.filter((e) => e.name === s.name).length;
          return el('td', { className: 'short', dataset: { label: a.name } }, n ? `●${n > 1 ? ` ×${n}` : ''}` : '');
        })));
      return el('section', { className: 'card matrix', id: 'knowledge-overview' },
        el('table', {}, el('thead', {}, head), el('tbody', {}, ...rows)),
        d.skills.length ? null : el('p', { className: 'group-note', textContent: 'No skills in the folders read.' }));
    }

    // The folders read, each as named: a call started with another HOME,
    // CODEX_HOME or PI_CODING_AGENT_DIR loads others.
    function foldersCard(folders) {
      if (!folders.length) return el('p', { className: 'intro', textContent: 'No skill folders read: no runtime of these settings has an adapter whose folders are known.' });
      const head = ['Folder', 'From', 'Path', 'Loaded by', 'Skills'];
      return el('section', { className: 'card', id: 'knowledge-folders' },
        el('header', { className: 'section-head' }, el('h3', { textContent: 'Folders read' }),
          el('span', { className: 'note', textContent: 'home folders as pages’ own environment names them; a call started with another loads others' })),
        el('table', {},
          el('thead', {}, el('tr', {}, ...head.map((c) => el('th', { textContent: c })))),
          el('tbody', {}, ...folders.map((f) => el('tr', {},
            el('td', { className: 'name', textContent: f.folder }),
            el('td', { dataset: { label: 'From' } }, scopeChip(f)),
            el('td', { dataset: { label: 'Path' } }, paths(f)),
            el('td', { dataset: { label: 'Loaded by' } }, (f.adapters ?? []).join(', ')),
            el('td', { dataset: { label: 'Skills' } }, f.state ? K.folderState(f.state) : String(f.skills.length)))))));
    }

    // A folder's or a skill's path, and its real path beside it when a link
    // leads elsewhere.
    function paths(item) {
      return el('div', {},
        el('div', { textContent: item.path }),
        item.real && item.real !== item.path ? el('div', { className: 'sub', textContent: `→ ${item.real}` }) : null,
        item.link && !item.real ? el('div', { className: 'sub', textContent: `→ ${item.link}` }) : null);
    }

    function renderChosen() {
      const { data, chosen } = knowledge;
      const found = chosen && (chosen.kind === 'agent' ? data.agents : data.skills).find((x) => x.name === chosen.name);
      if (!found) knowledge.chosen = null;
      $('knowledge-detail').replaceChildren(...(found ? [chosen.kind === 'agent' ? agentCard(found, data) : skillCard(found)] : []));
    }

    function detailCard(id, name, chip, ...body) {
      const close = el('button', { type: 'button', className: 'copy', textContent: 'Close' });
      close.addEventListener('click', () => { knowledge.chosen = null; renderChosen(); });
      return el('article', { className: 'card run', id },
        el('header', { className: 'run-head' }, el('div', { className: 'skill-head' }, el('h3', { textContent: name }), chip), close),
        ...body);
    }

    const checksLine = (skill) => text(K.checks(skill.checks), skill.checks?.passed ? '' : 'failed');

    function simpleTable(head, rows) {
      return el('table', {},
        el('thead', {}, el('tr', {}, ...head.map((c) => el('th', { textContent: c })))),
        el('tbody', {}, ...rows.map(([first, ...cells]) => el('tr', {},
          el('td', { className: 'name' }, first),
          ...cells.map((c, i) => el('td', { dataset: { label: head[i + 1] } }, c))))));
    }

    // A link that shows Runs with the run id opened.
    function runInRuns(id) {
      const link = el('a', { href: `#${id}`, textContent: id });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        runs.chosen = id;
        showView('runs');
      });
      return link;
    }

    // An agent's skills its settings name: a row per skill, with what names
    // it (the agent, or a process on it), its layer and its checks; one
    // these settings do not have is missing.
    function settingsSkillsTable(a) {
      const rows = [
        ...a.named.own.map((x) => [x, 'agent']),
        ...a.named.processes.flatMap((p) => p.skills.map((x) => [x, `process ${p.name}`])),
      ];
      if (!rows.length) return el('p', { className: 'group-note', textContent: 'Its settings name no skills, and no process on it does.' });
      return simpleTable(['Skill', 'Named by', 'From', 'Checks'], rows.map(([x, by]) => (x.missing
        ? [missing('skill', x.name), by, '—', '—']
        : [
          el('span', { title: x.path ?? '', textContent: x.name }), by, sourceChip(x),
          x.checks ? checksLine(x) : text('not checked: the server has no such skill', 'failed'),
        ])));
    }

    // An agent: the skills its settings name, what its runtime loads and,
    // apart from both and labelled observed, what its runs used. A skill no
    // run used says nothing of use.
    function agentCard(a, d) {
      const shared = new Set(d.skills.filter((s) => s.shared).map((s) => s.name));
      const used = a.observed.skills;
      return detailCard('agent-detail', a.name, null,
        facts([
          ['runtime', a.runtimeMissing ? missing('runtime', a.runtime) : `${a.runtime} — adapter ${a.adapter ?? 'not set'}`],
          ['model', a.model],
          ['effort', a.effort],
        ]),
        el('p', { className: 'purpose', textContent: TWO_LISTS }),
        el('section', { className: 'stage', id: 'agent-settings-skills' },
          el('h4', { textContent: 'Its settings name' }),
          el('p', { className: 'group-note', textContent: 'skills from these settings’ skills/ folders, which Agister gives the call: the agent’s to each of its calls, a process’s to that process’s calls' }),
          settingsSkillsTable(a)),
        el('section', { className: 'stage', id: 'agent-loads' },
          el('h4', { textContent: 'Its runtime would load from the repo and the home' }),
          a.loads.length
            ? simpleTable(['Skill', 'From', 'Folder', 'Checks'], a.loads.map((e) => [
              el('span', {}, pick('skill', e.name), shared.has(e.name) ? ' ' : null, shared.has(e.name) ? text('shared', 'chip replaces') : null),
              scopeChip(e.folder),
              el('span', { title: e.path, textContent: e.folder.folder }),
              checksLine(e),
            ]))
            : el('p', { className: 'group-note', textContent: a.folders.length
              ? `No skills in the folders ${a.adapter} loads: ${a.folders.map((f) => f.folder).join(', ')}.`
              : 'No skill folders are known for this agent’s runtime.' })),
        a.adapter ? el('section', { className: 'stage', id: 'agent-left-out' },
          el('h4', { textContent: `Not in this list: what ${a.adapter} loads from elsewhere` }),
          el('ul', {}, ...K.leftOut(a.adapter).map((line) => el('li', { textContent: line })))) : null,
        used.length ? el('section', { className: 'stage', id: 'agent-observed' },
          el('h4', { textContent: 'Observed in runs' }),
          el('p', { className: 'group-note', textContent: `observed: what the ${a.observed.runs} ${a.observed.runs === 1 ? 'run' : 'runs'} of this agent among the runs read from Agister home used, whatever the picker shows; not what the runtime loads` }),
          simpleTable(['Skill', 'Uses', 'Runs', 'In'], used.map((u) => [
            u.name, String(u.count), String(u.runs.length),
            el('span', {}, ...u.runs.flatMap((id, i) => (i ? [', ', runInRuns(id)] : [runInRuns(id)]))),
          ]))) : null);
    }

    // A skill name: the agents whose runtime loads it, and each folder's
    // entry with its checks and its SKILL.md, rendered or as stored.
    function skillCard(s) {
      const toggle = (source, label) => {
        const button = el('button', { type: 'button', textContent: label });
        button.setAttribute('aria-pressed', String(knowledge.source === source));
        button.addEventListener('click', () => { knowledge.source = source; renderChosen(); });
        return button;
      };
      return detailCard('skill-detail', s.name, sharedChip(s),
        facts([
          ['loaded by', s.agents.length
            ? el('div', {}, ...s.agents.flatMap((name, i) => (i ? [', ', pick('agent', name)] : [pick('agent', name)])))
            : 'no agent’s runtime in these settings'],
        ]),
        el('div', { className: 'views', role: 'group', id: 'skill-source' }, toggle(false, 'Rendered'), toggle(true, 'Source')),
        s.entries.map((e) => el('section', { className: 'stage' },
          el('h4', {}, `${e.folder.scope} · ${e.folder.folder}`),
          facts([
            ['path', paths(e)],
            ['link', e.link ? `→ ${e.link}` : null],
            ['loaded by', (e.folder.adapters ?? []).join(', ')],
            ['description', e.description || null],
            ['checks', checksLine(e)],
          ]),
          skillText(e))));
    }

    function skillText(e) {
      if (e.state) return el('p', { className: 'group-note', textContent: K.skillState(e.state) });
      if (knowledge.source) return el('pre', { className: 'mono source', textContent: e.content ?? '' });
      return el('div', { className: 'markdown' }, K.markdown(K.body(e.content)).map(block));
    }

    // knowledge.js's Markdown tree as elements and text nodes: a skill's
    // HTML stays text. The lists go to el as arrays, never spread: a skill
    // can hold more nodes than a call takes arguments.
    function block(n) {
      if (typeof n === 'string') return n;
      const props = {};
      if (n.tag === 'a') Object.assign(props, { href: n.href, target: '_blank', rel: 'noopener noreferrer' });
      if (n.tag === 'pre') props.className = 'mono';
      if (n.start != null) props.start = n.start;
      if (n.align) props.className = `align-${n.align}`;
      return el(n.tag, props, n.children.map(block));
    }

    // --- views ---

    // Shows view, remembered for the next visit.
    function setView(view) {
      state.view = view;
      U.writeView(localStorage, view);
      for (const v of U.VIEWS) $(`view-${v}`).setAttribute('aria-pressed', String(v === view));
      $('dashboard').hidden = view !== 'settings' || !$('dashboard').hasChildNodes();
      $('runs').hidden = view !== 'runs';
      $('compare').hidden = view !== 'compare';
      $('knowledge').hidden = view !== 'knowledge';
      $('refresh').title = `Refresh: read the ${view} again`;
    }

    // Shows view and reads what it shows.
    function showView(view) {
      setView(view);
      say('status', '');
      return reload();
    }

    // Reads the shown view again; Knowledge is read after its settings.
    function reload() {
      if (location.protocol === 'file:') return say('status', R.NO_SERVER);
      return readRuns() ?? open_(state.current ?? R.HOME_ID);
    }

    // Reads Runs or Compare when it is shown; null for the other views.
    function readRuns() {
      if (state.view === 'runs') return loadRuns();
      if (state.view === 'compare') return loadCompare();
      return null;
    }

    // --- start ---

    $('picker-button').addEventListener('click', () => setMenu($('picker-menu').hidden));
    $('open-home').addEventListener('click', () => open_(R.HOME_ID));
    $('add-folder').addEventListener('click', addFolder);
    for (const v of U.VIEWS) $(`view-${v}`).addEventListener('click', () => { if (state.view !== v) showView(v); });
    // ↻ spins while the shown view is read, at least one turn so a fast read
    // is still seen.
    $('refresh').addEventListener('click', async () => {
      const button = $('refresh');
      if (button.classList.contains('spinning')) return;
      button.classList.add('spinning');
      await Promise.all([reload(), new Promise((r) => setTimeout(r, 600))]);
      button.classList.remove('spinning');
    });
    document.addEventListener('click', (e) => {
      // The path, not e.target: a replaced row is detached by now.
      if (!$('picker-menu').hidden && !e.composedPath().includes($('picker'))) setMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('picker-menu').hidden) {
        setMenu(false);
        $('picker-button').focus();
      } else if (e.key === 'Escape' && state.view === 'runs' && skillOpen()) {
        closeSkill();
      } else if (e.key === 'Escape' && state.view === 'runs' && runOpen()) {
        closeRun();
      }
    });

    // Start where the page was left: the view, and the folder in the picker;
    // with nothing chosen yet, settings at home.
    setView(state.view);
    if (location.protocol === 'file:') return say('status', R.NO_SERVER);
    return Promise.all([open_(R.readCurrent(localStorage) ?? R.HOME_ID), readRuns()]);
  }

  globalThis.AgisterPage = { start };
})();
