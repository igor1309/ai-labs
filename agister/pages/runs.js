// Agister pages: the Runs view's logic that does not touch the DOM.
//
// A classic script that sets globalThis.AgisterRuns, as repos.js sets
// AgisterRepos. The runs and comparisons it reads are what agister pages
// serves at api/runs and api/runs/compare; pages/runs.go writes them.
(() => {
  const VIEW_KEY = 'agister-pages:view';
  const VIEWS = ['settings', 'runs', 'knowledge'];

  // The view shown last, or settings.
  function readView(storage) {
    try {
      const view = storage.getItem(VIEW_KEY);
      return VIEWS.includes(view) ? view : 'settings';
    } catch {
      return 'settings';
    }
  }

  function writeView(storage, view) {
    try { storage.setItem(VIEW_KEY, view); } catch { /* the page still shows it */ }
  }

  // --- formatting; a missing value formats as '' ---

  const isNumber = (n) => typeof n === 'number' && Number.isFinite(n);

  // "412ms" under a second, else "47s", "1m 47s", "2h 5m".
  function duration(ms) {
    if (!isNumber(ms) || ms < 0) return '';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const total = Math.round(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  // "$0.50".
  function cost(usd) {
    return isNumber(usd) ? `$${usd.toFixed(2)}` : '';
  }

  // "2/3 ✓": the attempts used, out of max when it is known, and whether the
  // last passed; '' when the run has no verify.
  function verify(outcome, maxAttempts) {
    if (!outcome || !isNumber(outcome.attempts)) return '';
    const used = isNumber(maxAttempts) && maxAttempts > 0 ? `${outcome.attempts}/${maxAttempts}` : `${outcome.attempts}`;
    return `${used} ${outcome.passed ? '✓' : '✗'}`;
  }

  // "claude-code opus high": the adapter, model and effort that are set.
  function implementor(impl) {
    if (!impl) return '';
    return [impl.adapter, impl.model, impl.effort].filter(Boolean).join(' ');
  }

  // The model the runtime reported, when it differs from the one shown.
  function reportedModel(impl) {
    return impl?.reported_model && impl.reported_model !== impl.model ? impl.reported_model : '';
  }

  // "review×3, go×1".
  function skills(used) {
    if (!Array.isArray(used)) return '';
    return used.filter((s) => s?.name).map((s) => `${s.name}×${s.count ?? 0}`).join(', ');
  }

  // "fix 2, defer 1": counts by name, most first, then by name.
  function counts(byName) {
    if (!byName || typeof byName !== 'object') return '';
    return Object.entries(byName)
      .filter(([, n]) => isNumber(n) && n > 0)
      .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, n]) => `${name || '-'} ${n}`)
      .join(', ');
  }

  // "3 nodes".
  function nodes(workflow) {
    const n = workflow?.nodes?.length ?? 0;
    return `${n} ${n === 1 ? 'node' : 'nodes'}`;
  }

  // "67%".
  function percent(rate) {
    return isNumber(rate) ? `${Math.round(rate * 100)}%` : '';
  }

  // "1.5", "2".
  function mean(n) {
    return isNumber(n) ? String(Number(n.toFixed(1))) : '';
  }

  // A failed or interrupted run is marked; the others are not.
  function failed(status) {
    return status === 'failed' || status === 'interrupted';
  }

  // --- the run list ---

  const sorted = (values) => [...new Set(values.filter(Boolean))].sort();

  // The processes present, for the process filter.
  function processes(runs) {
    return sorted((runs ?? []).map((r) => r.process));
  }

  // The statuses present, for the status filter.
  function statuses(runs) {
    return sorted((runs ?? []).map((r) => r.status));
  }

  // The runs of process and with status; an empty filter takes them all.
  function filterRuns(runs, { process = '', status = '' } = {}) {
    return (runs ?? []).filter((r) => (!process || r.process === process) && (!status || r.status === status));
  }

  // --- the comparison ---

  // The compare groups as one table per process, in the server's order: a
  // row per adapter, model and effort, each cell as the page shows it.
  function compareTables(groups) {
    const tables = [];
    const byProcess = new Map();
    for (const g of groups ?? []) {
      let table = byProcess.get(g.process);
      if (!table) {
        table = { process: g.process, rows: [] };
        byProcess.set(g.process, table);
        tables.push(table);
      }
      const perCompleted = cost(g.cost_per_completed_usd);
      const unknown = g.cost_unknown ? `${g.cost_unknown} unknown` : '';
      table.rows.push({
        adapter: g.adapter || '-',
        model: g.model || '-',
        effort: g.effort || '-',
        runs: String(g.runs ?? 0),
        completed: String(g.completed ?? 0),
        passRate: percent(g.pass_rate),
        verifyAttempts: mean(g.mean_verify_attempts),
        medianWall: duration(g.median_wall_ms),
        costPerCompleted: perCompleted && unknown ? `${perCompleted} (${unknown})` : perCompleted || (unknown && `(${unknown})`),
      });
    }
    return tables;
  }

  globalThis.AgisterRuns = {
    VIEW_KEY, VIEWS, readView, writeView,
    duration, cost, verify, implementor, reportedModel, skills, counts, nodes, percent, mean, failed,
    processes, statuses, filterRuns, compareTables,
  };
})();
