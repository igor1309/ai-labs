// Agister pages: the Runs and Compare views over api/runs,
// api/runs/{id} and api/runs/compare. A classic script that sets
// globalThis.AgisterPage; start is given the document, fetch and storage,
// so a test can give its own.
(() => {
  const VIEW_KEY = 'agister-pages:view';

  const duration = (ms) => {
    if (typeof ms !== 'number' || ms < 0) return '';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const total = Math.round(ms / 1000), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
  };
  const cost = (usd) => (typeof usd === 'number' ? `$${usd.toFixed(2)}` : '');
  const when = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return '';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  const nameOf = (r) => r.workflow || (r.process ? `${r.process}${r.agent ? ' on ' + r.agent : ''}` : '');

  function start({ document, fetch, storage }) {
    const state = { view: storage.getItem(VIEW_KEY) === 'compare' ? 'compare' : 'runs', list: null, filter: { name: '', status: '' }, chosen: null, rows: [] };
    // token is the newest view's request: a reply to an older one is dropped.
    let token = 0;
    const $view = document.getElementById('view');
    const buttons = [...document.getElementById('nav').children];

    // el makes an element; children nest in arrays to any depth.
    const el = (tag, props = {}, ...children) => {
      const node = Object.assign(document.createElement(tag), props);
      for (const child of children.flat(Infinity)) if (child != null && child !== false) node.append(child);
      return node;
    };
    const status = (s, cls) => el('span', { className: s, textContent: cls ? `${s}: ${cls}` : s });
    const get = async (path) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).trim()}`);
      return res.json();
    };
    const stamp = () => { document.getElementById('read').textContent = `read ${new Date().toLocaleTimeString()}`; };
    // table has left-aligned, then numeric, then trailing left-aligned columns.
    const table = (left, right, rows, tail = []) => el('table', {},
      el('thead', {}, el('tr', {}, left.map((h) => el('th', { textContent: h })), right.map((h) => el('th', { className: 'num', textContent: h })), tail.map((h) => el('th', { textContent: h })))),
      el('tbody', {}, rows));

    async function showRuns(mine) {
      const list = await get('api/runs');
      if (mine !== token) return;
      state.list = list;
      stamp();
      renderRuns();
      if (state.chosen) openRun(state.chosen);
    }

    function renderRuns() {
      const { list, filter } = state;
      const names = [...new Set(list.runs.map(nameOf).filter(Boolean))].sort();
      const statuses = [...new Set(list.runs.map((r) => r.status))].sort();
      const select = (key, all, options) => {
        const node = el('select', {}, el('option', { value: '', textContent: all }), options.map((o) => el('option', { value: o, textContent: o, selected: o === filter[key] })));
        node.onchange = () => { filter[key] = node.value; renderRuns(); };
        return node;
      };
      const shown = list.runs.filter((r) => (!filter.name || nameOf(r) === filter.name) && (!filter.status || r.status === filter.status));
      const notes = [`Runs in Agister home, newest first; click a run to open it. ${list.runs.length} of ${list.total} read.`];
      if (list.skipped) notes.push(`${list.skipped} could not be read and ${list.skipped === 1 ? 'is' : 'are'} left out.`);
      state.rows = shown.map((r) => {
        const tr = el('tr', { className: `pick${r.id === state.chosen ? ' chosen' : ''}`, title: r.id },
          el('td', { textContent: when(r.started) }), el('td', { textContent: nameOf(r) }), el('td', {}, status(r.status, r.class)),
          el('td', { className: 'num', textContent: duration(r.duration_ms) }), el('td', { className: 'num', textContent: cost(r.cost) }),
          el('td', { className: 'num', textContent: String(r.calls) }), el('td', { className: 'wrap', textContent: r.reason || '' }));
        tr.onclick = () => (state.chosen === r.id ? closeRun() : openRun(r.id));
        return tr;
      });
      $view.replaceChildren(
        el('p', { className: 'note', textContent: notes.join(' ') }),
        el('div', { className: 'filters' }, el('label', {}, 'run ', select('name', 'all', names)), el('label', {}, 'status ', select('status', 'all', statuses))),
        state.rows.length
          ? table(['Started', 'Run', 'Status'], ['Wall', 'Cost', 'Calls'], state.rows, ['Reason'])
          : el('p', { className: 'note', textContent: list.runs.length ? 'No runs match the filters.' : 'No runs yet.' }),
        el('div', { id: 'detail', hidden: true }));
    }

    function closeRun() {
      state.chosen = null;
      renderRuns();
    }

    async function openRun(id) {
      state.chosen = id;
      for (const tr of state.rows) tr.className = `pick${tr.title === id ? ' chosen' : ''}`;
      const box = document.getElementById('detail');
      if (!box) return;
      box.hidden = false;
      box.replaceChildren(el('p', { className: 'note', textContent: 'Reading…' }));
      let r;
      try { r = await get(`api/runs/${encodeURIComponent(id)}`); } catch (err) {
        if (state.chosen === id) box.replaceChildren(el('p', { className: 'error', textContent: err.message }));
        return;
      }
      if (state.chosen !== id) return;
      const facts = [['id', r.id], ['run', nameOf(r)], ['started', when(r.started)], ['ended', r.ended ? when(r.ended) : ''], ['directory', r.dir || ''],
        ...Object.entries(r.params || {}).map(([k, v]) => [`param ${k}`, v])].filter(([, v]) => v);
      // A part the run lacks is null and left out, never shown as text.
      box.replaceChildren(...[
        el('h2', {}, nameOf(r) || r.id, ' ', status(r.status, r.class)),
        r.reason ? el('p', { className: 'error', textContent: r.reason }) : null,
        el('dl', {}, facts.map(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })])),
        r.calls.length ? table(['Step', 'Process', 'Agent', 'Status'], ['Wall', 'Cost'], r.calls.map((c) => el('tr', {},
          el('td', { textContent: c.step }), el('td', { textContent: c.process }), el('td', { textContent: c.agent }), el('td', {}, status(c.status, c.class)),
          el('td', { className: 'num', textContent: duration(c.duration_ms) }), el('td', { className: 'num', textContent: cost(c.cost) })))) : null,
        r.children.length ? el('p', { className: 'note' }, 'Child runs: ', r.children.map((c, i) => [i ? ', ' : '', `${c.workflow} `, status(c.status, c.class)])) : null,
        r.output != null ? el('pre', { textContent: typeof r.output === 'string' ? r.output : JSON.stringify(r.output, null, 2) }) : null,
      ].filter(Boolean));
    }

    async function showCompare(mine) {
      const c = await get('api/runs/compare');
      if (mine !== token) return;
      stamp();
      const rows = c.groups.map((g) => el('tr', {}, el('td', { textContent: g.process }), el('td', { textContent: g.agent }),
        [String(g.runs), String(g.completed), `${Math.round(g.pass_rate * 100)}%`, duration(g.median_ms), cost(g.total_cost) + (g.cost_unknown ? ` (+${g.cost_unknown} unknown)` : '')]
          .map((v) => el('td', { className: 'num', textContent: v }))));
      $view.replaceChildren(
        el('p', { className: 'note', textContent: 'Calls that ended completed or failed, by process and agent, whatever their run’s status.' + (c.skipped ? ` ${c.skipped} runs could not be read.` : '') }),
        rows.length ? table(['Process', 'Agent'], ['Calls', 'Completed', 'Pass rate', 'Median wall', 'Cost'], rows)
          : el('p', { className: 'note', textContent: 'No ended calls yet.' }));
    }

    // show shows view; it is done when its reply is shown or dropped.
    function show(view) {
      const mine = ++token;
      state.view = view;
      storage.setItem(VIEW_KEY, view);
      for (const b of buttons) b.className = b.dataset.view === view ? 'on' : '';
      return (view === 'compare' ? showCompare(mine) : showRuns(mine)).catch((err) => {
        if (mine === token) $view.replaceChildren(el('p', { className: 'error', textContent: String(err.message || err) }));
      });
    }

    for (const b of buttons) b.onclick = () => show(b.dataset.view);
    document.getElementById('reload').onclick = () => show(state.view);
    return { show, ready: show(state.view), openRun };
  }

  globalThis.AgisterPage = { start, duration, cost };
})();
