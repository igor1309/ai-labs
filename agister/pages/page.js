// The page: the folder picker, the Settings, Runs and Knowledge views and
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

    // current: the path shown, ~ for Agister home; view: settings, runs or
    // knowledge; model: the settings shown, as config.js reads them.
    const state = { current: null, view: U.readView(localStorage), model: null };
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
    // The status is the shown view's: while Runs is shown, a read of the
    // settings leaves it alone. Knowledge shows the settings' agents, so it
    // is read after them.
    async function open_(path) {
      const token = ++renderToken;
      let id, files, homeFiles;
      try {
        ({ id, files, homeFiles } = await R.fetchSettings(fetch, path));
        if (id !== path) R.forgetRepo(localStorage, path);
      } catch (err) {
        if (token !== renderToken) return;
        if (!$('picker-menu').hidden) say('picker-status', err.message);
        else if (state.view !== 'runs') say('status', err.message);
        return;
      }
      if (token !== renderToken) return;
      if (id !== R.HOME_ID) R.rememberRepo(localStorage, id, Date.now());
      R.writeCurrent(localStorage, id);
      state.current = id;
      if (knowledge.path !== id) forgetKnowledge();
      setMenu(false);
      if (state.view !== 'runs') say('status', '');
      const shown = await render(token, files, homeFiles);
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
    // repo's go over, or null for ~ itself. Says whether they were shown.
    async function render(token, files, homeFiles) {
      $('picker-label').textContent = label(state.current);
      $('picker-button').title = state.current === R.HOME_ID ? 'Agister home, ~/.agister' : state.current;
      if (state.view === 'settings') stamp('Settings');
      let model;
      try {
        model = homeFiles
          ? await C.loadComposed(R.agisterFromFiles(homeFiles), R.agisterFromFiles(files))
          : await C.loadAgister(R.agisterFromFiles(files));
      } catch (err) {
        if (token === renderToken && state.view !== 'runs') say('status', `Could not read .agister: ${err.message}`);
        return false;
      }
      if (token !== renderToken) return false;
      state.model = model;
      $('dashboard').replaceChildren(...dashboard(model, !!homeFiles));
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
          ? 'What Agister uses in this repo: Agister home’s settings (~/.agister) with this repo’s .agister over them. A repo file replaces the home file of the same kind and name.'
          : 'Agister home, ~/.agister: the settings every repo starts from. A repo’s .agister goes over them.'),
        runnable ? null : el('p', { className: 'intro' }, 'Nothing to run here: no workflows or processes.'),
        group('Workflows', 'several agent calls at once, then one that brings their results together',
          model.workflows.map((w) => workflowCard(w, ix, chip))),
        group('Processes', steps.size
          ? 'one agent call each; the workflow steps above also run alone'
          : 'one agent call each',
        alone.map((p) => processCard(p, ix, chip))),
        model.agents.length || model.policies.length || model.runtimes.length || model.service || model.workspace?.error
          ? el('h2', { className: 'group', textContent: 'Building blocks' }) : null,
        agentsTable(model.agents, composed),
        policiesTable(model.policies, composed),
        runtimesTable(model.runtimes, composed),
        limitsTable(model.service, composed),
        workspaceError(model.workspace, composed),
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
      if (item.source === 'home') return text('home', 'chip');
      return item.overrides
        ? el('span', { className: 'chip replaces', title: 'This repo’s file replaces the one in Agister home', textContent: 'repo, replaces home' })
        : text('repo', 'chip repo');
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

    function outputLine(p) {
      const parts = [];
      if (p.output) parts.push(p.outputOutside ? missing('schema', p.output) : `${p.output} schema`);
      if (p.verify?.outside) parts.push(parts.length ? '; ' : '', missing('verify', p.verify.ref));
      else if (p.verify) parts.push(`${parts.length ? '; ' : ''}a failed verify${p.verify.ref ? ` (${p.verify.ref})` : ''} is fixed up to ${p.verify.maxAttempts ?? '?'}×`);
      return parts.length ? el('div', {}, ...parts) : null;
    }

    // The setup its checkout runs before the agent starts, and whether it
    // is the workspace's default.
    function setupLine(p) {
      const s = p.effectiveSetup;
      if (!s) return null;
      return el('div', {}, el('code', { textContent: s.command ?? '?' }),
        ` within ${s.timeout ?? '?'}${s.from === 'workspace' ? ', from workspace.yaml' : ''}`);
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
        ...body);
    }

    function processCard(p, ix, chip) {
      if (p.error) return errorCard(p);
      return card('process', p, chip, command(p.name, p.params), facts([
        ['defaults', defaults(p.params)],
        ['agent', agentLine(p.agent, ix)],
        ['policy', policyLines(p.policy, ix)],
        ['output', outputLine(p)],
        ['setup', setupLine(p)],
      ]));
    }

    // One step of a workflow: the process, what it does in a sentence, and
    // its agent and policy each on a line.
    function step(n, ix) {
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
            pol ? el('span', {}, `${p.policy} · `, text(policySummary(pol), `access-${pol.access}`)) : missing('policy', p.policy))));
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
        facts([['calls', calls(w, ix)], ['defaults', defaults(w.params)]]),
        w.fanOut.length ? stage(w.fanOut.length > 1 ? `${w.fanOut.length} at once` : 'First', w.fanOut.map((n) => step(n, ix))) : null,
        w.join ? stage('Then', [step(w.join, ix)]) : null);
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
        ['Agent', 'Runtime', 'Model', 'Effort', 'Session'], items, (a) => [
          a.runtimeOutside ? missing('runtime', a.runtime) : a.runtime,
          a.model, a.effort, a.session,
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

    // A broken workspace document blocks calls that inherit its setup.
    function workspaceError(workspace, composed) {
      if (!workspace?.error) return null;
      const from = composed
        ? (workspace.source === 'repo' ? 'this repo’s workspace.yaml' : 'Agister home’s workspace.yaml')
        : 'workspace.yaml';
      return el('section', { className: 'card' },
        el('header', { className: 'section-head' }, el('h3', { textContent: 'Workspace settings' })),
        el('p', { className: 'error', textContent: `${from}: ${workspace.error}` }));
    }

    // service.toml: the caps no policy or process may go past.
    function limitsTable(service, composed) {
      if (!service) return null;
      const from = composed ? (service.source === 'repo' ? 'this repo’s service.toml' : 'Agister home’s service.toml') : 'service.toml';
      const head = el('header', { className: 'section-head' },
        el('h3', { textContent: 'Service limits' }),
        el('span', { className: 'note', textContent: `${from}: caps no policy or process may go past` }));
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

    // filter: the process and status shown; chosen: the run opened below the
    // table; list and compare: what the server sent last.
    const runs = { list: null, compare: null, filter: { process: '', status: '' }, chosen: null };
    let runsToken = 0;
    let detailToken = 0;

    // Reads the runs and their comparison again and shows them, with the run
    // opened before. A read that ends after the user left Runs, or after a
    // newer read, leaves the page alone: the status and the read time are
    // the shown view's.
    async function loadRuns() {
      const token = ++runsToken;
      const current = () => token === runsToken && state.view === 'runs';
      let list, compare;
      try {
        [list, compare] = await Promise.all([R.fetchRuns(fetch), R.fetchCompare(fetch)]);
      } catch (err) {
        if (current()) say('status', err.message);
        return;
      }
      if (!current()) return;
      say('status', '');
      Object.assign(runs, { list, compare });
      stamp('Runs');
      renderRuns();
      if (runs.chosen) openRun(runs.chosen, false);
    }

    function renderRuns() {
      const { list, compare } = runs;
      $('runs').replaceChildren(
        el('p', { className: 'intro', textContent: 'Runs in Agister home, ~/.agister/runs, whatever the picker shows.' }),
        el('h2', { className: 'group', textContent: 'Compare' }),
        el('p', { className: 'group-note', textContent: 'completed and failed calls, not workflows: per process, a row per runtime, model and effort' }),
        ...compareSections(compare.groups),
        el('h2', { className: 'group', textContent: 'Runs' }),
        el('p', { className: 'group-note', textContent: 'newest first; click a run to open it below' }),
        filters(list.runs),
        el('div', { id: 'run-list' }),
        el('div', { id: 'run-detail' }));
      renderRunList();
    }

    function compareSections(groups) {
      const tables = U.compareTables(groups);
      if (!tables.length) return [el('p', { className: 'intro', textContent: 'No completed or failed calls yet.' })];
      const head = ['Runtime', 'Model', 'Effort', 'Runs', 'Completed', 'Pass rate', 'Verify attempts', 'Median wall', 'Cost / completed'];
      const keys = ['model', 'effort', 'runs', 'completed', 'passRate', 'verifyAttempts', 'medianWall', 'costPerCompleted'];
      return tables.map((t) => el('section', { className: 'card' },
        el('header', { className: 'section-head' }, el('h3', { className: 'mono', textContent: t.process })),
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

    const status = (value) => text(value, U.failed(value) ? 'failed' : '');

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
          ? el('section', { className: 'card' }, el('table', {},
            el('thead', {}, el('tr', {}, ...head.map((c) => el('th', { textContent: c })))),
            el('tbody', {}, ...shown.map(runRow))))
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
        ...cells.map((c, i) => el('td', { className: i >= 2 && i <= 5 ? 'short' : '', dataset: { label: ['Process', 'Implementor', 'Status', 'Verify', 'Wall', 'Cost', r.workflow ? 'Rulings' : 'Skills', 'Tool calls'][i] } }, c)));
      const open = () => (runs.chosen === r.id ? closeRun() : openRun(r.id));
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      return row;
    }

    function markChosen() {
      for (const row of document.querySelectorAll('#run-list tr.pick')) row.classList.toggle('chosen', row.title === runs.chosen);
    }

    function closeRun() {
      detailToken++;
      runs.chosen = null;
      markChosen();
      $('run-detail').replaceChildren();
    }

    // Opens the run id below the table, from the server; scroll brings it
    // into sight.
    async function openRun(id, scroll = true) {
      const token = ++detailToken;
      runs.chosen = id;
      markChosen();
      let detail;
      try {
        detail = await R.fetchRun(fetch, id);
      } catch (err) {
        if (token === detailToken) $('run-detail').replaceChildren(el('p', { className: 'error', textContent: `${id}: ${err.message}` }));
        return;
      }
      if (token !== detailToken) return;
      $('run-detail').replaceChildren(runCard(detail.summary, detail.record));
      if (scroll) $('run-detail').scrollIntoView({ block: 'nearest' });
    }

    // A link that opens the run id.
    function runLink(id, label = id) {
      const link = el('a', { href: `#${id}`, textContent: label });
      link.addEventListener('click', (e) => { e.preventDefault(); openRun(id); });
      return link;
    }

    const line = (...parts) => el('div', {}, ...parts);
    const joined = (parts) => parts.filter(Boolean).join(' · ');

    function runCard(s, record) {
      const impl = s.implementor;
      const policy = s.policy;
      const outcome = s.outcome ?? {};
      const items = s.workflow?.items;
      const close = el('button', { type: 'button', className: 'copy', textContent: 'Close' });
      close.addEventListener('click', closeRun);
      return el('article', { className: 'card run' },
        el('header', { className: 'run-head' }, el('h3', { textContent: s.id }), close),
        facts([
          ['process', line(text(s.process, 'name'), s.agent ? ` — agent ${s.agent}` : '')],
          ['started', at(s.created_at)],
          ['finished', s.finished_at ? at(s.finished_at) : null],
          ['implementor', impl ? el('div', {},
            line(joined([impl.adapter && [impl.adapter, impl.version].filter(Boolean).join(' '), impl.model, impl.effort && `${impl.effort} effort`])),
            U.reportedModel(impl) ? el('div', { className: 'sub' }, `the runtime reported ${impl.reported_model}`) : null) : null],
          ['policy', policy ? line(
            policy.access ? text(`${policy.access} workspace`, `access-${policy.access}`) : '',
            policy.access ? ' · ' : '',
            joined([policy.timeout_ms ? U.duration(policy.timeout_ms) : '', policy.max_cost_usd != null ? `${U.cost(policy.max_cost_usd)} cap` : '', policy.scope && `scope ${policy.scope}`])) : null],
          ['outcome', el('div', {},
            line(status(s.status), outcome.verify ? ` · verify ${U.verify(outcome.verify, record?.verify?.max_attempts)}` : ''),
            line(joined([outcome.wall_ms != null && `wall ${U.duration(outcome.wall_ms)}`, outcome.turn_ms != null && `turn ${U.duration(outcome.turn_ms)}`,
              outcome.runtime_ms != null && `runtime ${U.duration(outcome.runtime_ms)}`])),
            outcome.cost_usd != null ? line(`${U.cost(outcome.cost_usd)}${outcome.cost_source ? ` (${outcome.cost_source})` : ''}`) : null)],
          ['skills', U.skills(s.skills) || null],
          ['tool calls', s.tool_calls != null ? String(s.tool_calls) : null],
          ['workflow', s.parent ? runLink(s.parent) : null],
          ['nodes', s.workflow?.nodes.length ? el('div', {}, ...s.workflow.nodes.map((n) => line(
            n.run ? runLink(n.run, n.name) : text(n.name, 'name'),
            ` — ${n.process}${n.join ? ', join' : ''}`,
            n.status ? ' · ' : '', n.status ? status(n.status) : null))) : null],
          ['rulings', items ? `${U.counts(items.by_ruling) || 'none'} (${items.total} ${items.total === 1 ? 'item' : 'items'})` : null],
          ['severities', items ? U.counts(items.by_severity) || null : null],
          ['by source', items?.by_source.length ? el('div', {}, ...items.by_source.map((src) => line(
            `${src.source} `, src.node ? (src.run ? runLink(src.run, src.node) : text(src.node, 'name')) : '',
            `: ${U.counts(src.by_ruling)}`))) : null],
        ]),
        el('details', { className: 'record' },
          el('summary', { textContent: 'Record as stored' }),
          el('pre', { className: 'mono', textContent: JSON.stringify(record, null, 2) })));
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

    const NO_ASSIGNMENT = 'Agister does not choose an agent’s skills: a call loads what its runtime loads in the repo and the home (ADR-006). This page only reads them; editing is not part of it.';

    // Reads the skills of the shown settings and the runs, and shows them
    // with what was opened before. As with Runs, a read that ends after the
    // user left Knowledge, after a newer read, or after the settings were
    // asked for again (open_), leaves the page alone.
    async function loadKnowledge() {
      const token = ++knowledgeToken;
      const opened = renderToken;
      const current = () => token === knowledgeToken && opened === renderToken && state.view === 'knowledge';
      const settings = state.model;
      const path = state.current;
      let skills, list;
      try {
        [skills, list] = await Promise.all([R.fetchSkills(fetch, path), R.fetchRuns(fetch)]);
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
          ? 'Agister home, no repo: the skills each agent’s runtime would load from the home folders.'
          : 'The skills each agent’s runtime would load in this repo’s working tree and from the home folders. A call on a checkout loads what that checkout holds, which can differ.'),
        el('p', { className: 'intro', textContent: NO_ASSIGNMENT }),
        el('h2', { className: 'group', textContent: 'Overview' }),
        el('p', { className: 'group-note', textContent: 'a row per skill name, a column per agent; ● the agent’s runtime loads a skill of that name; shared: the name is in several folders. Click an agent or a skill to open it below.' }),
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

    // An agent: what its runtime loads and, apart from that and labelled
    // observed, what its runs used. A skill no run used says nothing of use.
    function agentCard(a, d) {
      const shared = new Set(d.skills.filter((s) => s.shared).map((s) => s.name));
      const used = a.observed.skills;
      return detailCard('agent-detail', a.name, null,
        facts([
          ['runtime', a.runtimeMissing ? missing('runtime', a.runtime) : `${a.runtime} — adapter ${a.adapter ?? 'not set'}`],
          ['model', a.model],
          ['effort', a.effort],
        ]),
        el('p', { className: 'purpose', textContent: NO_ASSIGNMENT }),
        el('section', { className: 'stage', id: 'agent-loads' },
          el('h4', { textContent: 'Its runtime would load' }),
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
      return state.view === 'runs' ? loadRuns() : open_(state.current ?? R.HOME_ID);
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
      }
    });

    // Start where the page was left: the view, and the folder in the picker;
    // with nothing chosen yet, settings at home.
    setView(state.view);
    if (location.protocol === 'file:') return say('status', R.NO_SERVER);
    return Promise.all([open_(R.readCurrent(localStorage) ?? R.HOME_ID), state.view === 'runs' ? loadRuns() : null]);
  }

  globalThis.AgisterPage = { start };
})();
