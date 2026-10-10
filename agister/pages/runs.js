// Agister pages: the Runs and Compare views' logic that does not touch the
// DOM.
//
// A classic script that sets globalThis.AgisterRuns, as repos.js sets
// AgisterRepos. The runs and comparisons it reads are what agister pages
// serves at api/runs and api/runs/compare; pages/runs.go writes them.
(() => {
  const VIEW_KEY = 'agister-pages:view';
  const VIEWS = ['settings', 'runs', 'compare', 'knowledge'];

  // The view shown last, or settings.
  function readView(storage) {
    try {
      const view = storage.getItem(VIEW_KEY);
      return VIEWS.includes(view) ? view : 'settings';
    } catch {
      return 'settings';
    }
  }

  // Whether view shows Agister home's runs, whatever the picker shows, and
  // not the settings it shows: Runs and Compare.
  function readsRuns(view) {
    return view === 'runs' || view === 'compare';
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

  // The mark a status shows as: a green check for completed, a red warning
  // for failed, an amber one for interrupted; null for the others, which
  // show as words.
  function statusMark(status) {
    if (status === 'completed') return { glyph: '✓', tone: 'ok' };
    if (status === 'failed') return { glyph: '⚠\uFE0E', tone: 'failed' };
    if (status === 'interrupted') return { glyph: '⚠\uFE0E', tone: 'warn' };
    return null;
  }

  // "4:07 PM – 4:10 PM, 10.10.26" in local time, the date as DD.MM.YY and
  // once when both ends fall on it; "4:07 PM –, 10.10.26" without an end.
  function timeSpan(startISO, endISO) {
    const start = new Date(startISO);
    if (!startISO || Number.isNaN(start.getTime())) return '';
    const end = endISO ? new Date(endISO) : null;
    const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const two = (n) => String(n).padStart(2, '0').slice(-2);
    const date = (d) => `${two(d.getDate())}.${two(d.getMonth() + 1)}.${two(d.getFullYear())}`;
    if (!end || Number.isNaN(end.getTime())) return `${time(start)} –, ${date(start)}`;
    if (date(start) === date(end)) return `${time(start)} – ${time(end)}, ${date(start)}`;
    return `${time(start)}, ${date(start)} – ${time(end)}, ${date(end)}`;
  }

  // A workflow's nodes as its table shows them: each with the judge's
  // rulings of the items it was a source of, by its name.
  function nodeRows(workflow) {
    const rulings = new Map((workflow?.items?.by_source ?? []).filter((s) => s.node).map((s) => [s.node, counts(s.by_ruling)]));
    return (workflow?.nodes ?? []).map((n) => ({
      name: n.name, process: n.process, join: !!n.join, run: n.run ?? '', status: n.status ?? '',
      wall: duration(n.wall_ms), cost: cost(n.cost_usd), rulings: rulings.get(n.name) ?? '',
    }));
  }

  // --- a run's output ---

  // The output keys shown first, in this order; the others follow as
  // written, but for those left out. The verdict goes in the run's head.
  const OUTPUT_FIRST = ['summary', 'findings', 'items', 'decisions', 'coverage', 'coverage_gaps', 'files_changed', 'notes'];
  const OUTPUT_LEFT_OUT = ['checks'];
  // What a finding, item or decision shows in its head, as tags and where;
  // what it shows as text; the rest is folded under it.
  const CARD_TAGS = ['severity', 'ruling', 'decision'];
  const CARD_HEAD = [...CARD_TAGS, 'title', 'file', 'line', 'sources'];
  const CARD_TEXT = ['detail', 'reason', 'action'];

  // The tone a value shows in, whatever its key: a verdict, a status, a
  // severity; '' for the rest.
  const TONES = {
    ok: ['approve', 'approved', 'checked', 'passed', 'pass', 'completed'],
    bad: ['request_changes', 'reject_change', 'blocked', 'finding', 'failed', 'critical', 'blocker', 'major'],
    warn: ['comment', 'rule_only', 'unchecked', 'partial', 'minor'],
  };
  function tone(value) {
    return Object.keys(TONES).find((t) => TONES[t].includes(value)) ?? '';
  }

  const isObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
  const isScalar = (v) => typeof v === 'string' || isNumber(v) || typeof v === 'boolean';
  const filled = (v) => v != null && v !== '';

  // One value of an output as the page shows it: text (markdown), a list,
  // cards (objects with a title), a table (other objects alike), facts (an
  // object, each value shown the same way), or json for anything else.
  // null for nothing to show: an empty list among them.
  function outputPart(value) {
    if (!filled(value)) return null;
    if (isScalar(value)) return { kind: 'text', text: String(value) };
    if (Array.isArray(value)) {
      if (!value.length) return null;
      if (value.every(isScalar)) return { kind: 'list', items: value.map(String) };
      if (value.every(isObject)) {
        if (value.every((o) => typeof o.title === 'string')) return { kind: 'cards', cards: value.map(card) };
        const columns = [...new Set(value.flatMap(Object.keys))];
        return {
          kind: 'table', columns,
          rows: value.map((o) => columns.map((c) => (!filled(o[c]) ? '' : isScalar(o[c]) ? String(o[c]) : JSON.stringify(o[c])))),
        };
      }
    }
    if (isObject(value)) {
      const facts = Object.entries(value).map(([k, v]) => [k, outputPart(v)]).filter(([, part]) => part);
      return facts.length ? { kind: 'facts', facts } : null;
    }
    return { kind: 'json', text: JSON.stringify(value, null, 2) };
  }

  function card(o) {
    const rest = Object.fromEntries(Object.entries(o).filter(([k]) => !CARD_HEAD.includes(k) && !CARD_TEXT.includes(k)));
    return {
      tags: CARD_TAGS.filter((k) => filled(o[k]) && isScalar(o[k])).map((k) => String(o[k])),
      title: o.title,
      where: typeof o.file === 'string' && o.file ? (filled(o.line) ? `${o.file}:${o.line}` : o.file) : '',
      sources: Array.isArray(o.sources) ? o.sources.join(', ') : '',
      texts: CARD_TEXT.filter((k) => filled(o[k]) && isScalar(o[k])).map((k) => [k, String(o[k])]),
      more: outputPart(rest),
    };
  }

  // What a run's result says: its verdict, and its error and output as
  // parts, each under its key. The text shows only without an output: with
  // one, it is that output as JSON.
  function runOutput(result) {
    const parts = [];
    const add = (key, value) => {
      const part = outputPart(value);
      if (part) parts.push({ key, ...part });
    };
    if (isObject(result?.error)) {
      const { message, ...rest } = result.error;
      add('error', [message, ...Object.entries(rest).filter(([, v]) => isScalar(v)).map(([k, v]) => `${k}: ${v}`)].filter(filled).join('\n\n'));
    } else add('error', result?.error);
    const output = result?.output;
    let verdict = '';
    if (isObject(output)) {
      if (typeof output.verdict === 'string') verdict = output.verdict;
      const keys = Object.keys(output).filter((k) => !OUTPUT_LEFT_OUT.includes(k) && (k !== 'verdict' || typeof output.verdict !== 'string'));
      for (const k of [...OUTPUT_FIRST.filter((k) => keys.includes(k)), ...keys.filter((k) => !OUTPUT_FIRST.includes(k))]) add(k, output[k]);
    } else if (filled(output)) add('output', output);
    else add('text', result?.text);
    return { verdict, parts };
  }

  // --- a skill a run used ---

  // Where to look for a skill a run used, nearest first: the run's working
  // directory, the folder the picker shows, Agister home; each once.
  function skillPlaces(cwd, current, home) {
    return [...new Set([cwd, current, home].filter(Boolean))];
  }

  // The skill name in an api/skills reply, as a run on adapter would find
  // it: the settings' own skills first, then the folders adapter loads,
  // then the others; within each, in the reply's order (repo before home).
  // One whose SKILL.md was read goes before one whose was not. null when
  // there is none.
  function findSkill(reply, name, adapter) {
    const found = [
      ...(reply?.settings ?? []).map((skill) => ({ skill, folder: 'settings' })),
      ...[...(reply?.folders ?? [])]
        .sort((a, b) => Number((b.adapters ?? []).includes(adapter)) - Number((a.adapters ?? []).includes(adapter)))
        .flatMap((f) => (f.skills ?? []).map((skill) => ({ skill, folder: f.folder }))),
    ].filter((x) => x.skill?.name === name);
    return found.find((x) => x.skill.content) ?? found[0] ?? null;
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
    VIEW_KEY, VIEWS, readView, writeView, readsRuns,
    duration, cost, verify, implementor, reportedModel, skills, counts, nodes, percent, mean, failed,
    statusMark, timeSpan, nodeRows, tone, outputPart, runOutput, skillPlaces, findSkill,
    processes, statuses, filterRuns, compareTables,
  };
})();
