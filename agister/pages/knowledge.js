// Agister pages: the Knowledge view's logic that does not touch the DOM.
//
// A classic script that sets globalThis.AgisterKnowledge, as runs.js sets
// AgisterRuns. The skills it reads are what agister pages serves at
// api/skills (pages/skills.go, ADR-010): the skill folders the settings'
// runtimes load, in the repo and the home. Nothing here assigns a skill to
// an agent: an agent's skills are what its runtime loads (ADR-006).
(() => {
  // What each runtime loads that the folders leave out (ADR-010 rule 3).
  const COMMON_LEFT_OUT = 'skills built into the runtime, and plugin or package skills';
  const LEFT_OUT = {
    'claude-code': [
      'managed-settings skills',
      '.claude/commands/ files: commands, not skill folders',
      'skills in a .claude/skills below the repo’s root, loaded once Claude Code works on files there',
    ],
    codex: ['/etc/codex/skills'],
    pi: ['skill paths and package skills named in Pi’s settings files, and their switches'],
  };

  // What the list of adapter's skills leaves out.
  function leftOut(adapter) {
    return [COMMON_LEFT_OUT, ...(LEFT_OUT[adapter] ?? [])];
  }

  const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  // The view's model: settings is config.js's model of the shown settings,
  // skills the api/skills reply for them, runs the run summaries.
  //   agents: each agent with its runtime's adapter, the folders that
  //     adapter loads, the skills in them (loads) and, apart from them, what
  //     its runs used (observed);
  //   skills: each skill name with its entries in every folder, shared when
  //     there is more than one, and the agents whose runtime loads it.
  function model(settings, skills, runs) {
    const runtimes = new Map(settings.runtimes.filter((r) => !r.error).map((r) => [r.name, r]));
    const folders = skills?.folders ?? [];
    const entries = folders.flatMap((f) => (f.skills ?? []).map((s) => ({ ...s, folder: f })));
    const agents = settings.agents.filter((a) => !a.error).map((a) => {
      const runtime = runtimes.get(a.runtime);
      const adapter = runtime?.adapter ?? null;
      const loaded = (f) => !!adapter && (f.adapters ?? []).includes(adapter);
      return {
        name: a.name, runtime: a.runtime, runtimeMissing: !runtime, adapter, model: a.model, effort: a.effort,
        folders: folders.filter(loaded),
        loads: entries.filter((e) => loaded(e.folder)),
        observed: observed(runs, a.name),
      };
    });
    const named = new Map();
    for (const e of entries) named.set(e.name, [...(named.get(e.name) ?? []), e]);
    const skillList = [...named].sort(([a], [b]) => byText(a, b)).map(([name, list]) => ({
      name, entries: list, shared: list.length > 1,
      agents: agents.filter((a) => a.loads.some((e) => e.name === name)).map((a) => a.name),
    }));
    return { home: !!skills?.home, adapters: skills?.adapters ?? [], folders, agents, skills: skillList };
  }

  // What the agent's runs used, as the Runs view counts it: per skill its
  // uses and the runs it was seen in, most used first; runs counts the
  // agent's calls among the summaries.
  function observed(runs, agent) {
    const mine = (runs ?? []).filter((r) => r.agent === agent && !r.workflow);
    const used = new Map();
    for (const r of mine) {
      for (const s of r.skills ?? []) {
        if (!s?.name) continue;
        const u = used.get(s.name) ?? { name: s.name, count: 0, runs: [] };
        u.count += s.count ?? 0;
        if (!u.runs.includes(r.id)) u.runs.push(r.id);
        used.set(s.name, u);
      }
    }
    return { runs: mine.length, skills: [...used.values()].sort((a, b) => b.count - a.count || byText(a.name, b.name)) };
  }

  // "checks passed", or "checks failed: …" with each failed check: the
  // structure only, never a review.
  function checks(result) {
    if (result?.passed) return 'checks passed';
    const failed = result?.failed ?? [];
    return failed.length ? `checks failed: ${failed.join('; ')}` : 'checks failed';
  }

  // Why a SKILL.md was not read, and why a folder lists nothing.
  const SKILL_STATES = {
    too_large: 'SKILL.md is over 256 KB: too large, not read',
    outside_skill: 'SKILL.md lies outside its skill: not read',
    broken_link: 'broken: a link that does not resolve',
    missing: 'no SKILL.md',
    not_a_file: 'SKILL.md is not a file',
  };
  const FOLDER_STATES = {
    missing: 'not there',
    broken_link: 'broken: a link that does not resolve',
    not_a_directory: 'not a folder',
    not_followed: 'a symlinked folder below the top level: not followed',
  };
  const skillState = (state) => SKILL_STATES[state] ?? state;
  const folderState = (state) => FOLDER_STATES[state] ?? state;

  // A SKILL.md without its front matter.
  function body(content) {
    const text = String(content ?? '');
    const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split('\n');
    if (lines[0].replace(/\r$/, '') !== '---') return lines.join('\n');
    const end = lines.findIndex((l, i) => i > 0 && l.replace(/\s+$/, '') === '---');
    return end < 0 ? lines.join('\n') : lines.slice(end + 1).join('\n');
  }

  // --- Markdown ---
  //
  // A small Markdown reader: headings, paragraphs, lists, fenced code,
  // quotes, rules, and inline code, emphasis and links. It returns a tree
  // the page builds from elements and text nodes, so HTML in a skill is
  // shown as text and never parsed. Links keep http(s) targets only.
  // tally(n), when given, is told of each n lines or characters read, so a
  // test can bound the work.

  const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+/;
  const FENCE = /^\s*(```|~~~)/;
  const isRule = (line) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
  const startsBlock = (line) => /^#{1,6}\s/.test(line) || FENCE.test(line) || /^\s*>/.test(line) || LIST_ITEM.test(line) || isRule(line);

  // Blocks: { type: heading, level, inline } | { type: paragraph, inline }
  // | { type: list, ordered, items: [inline] } | { type: code, text }
  // | { type: quote, inline } | { type: rule }.
  function markdown(src, tally = () => {}) {
    const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    const inline_ = (text) => inline(text, tally);
    let i = 0;
    while (i < lines.length) {
      tally(1);
      const line = lines[i];
      if (!line.trim()) {
        i++;
        continue;
      }
      const fence = FENCE.exec(line);
      if (fence) {
        const code = [];
        for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) code.push(lines[i]);
        i++;
        blocks.push({ type: 'code', text: code.join('\n') });
        continue;
      }
      const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (heading) {
        blocks.push({ type: 'heading', level: heading[1].length, inline: inline_(heading[2]) });
        i++;
        continue;
      }
      if (isRule(line)) {
        blocks.push({ type: 'rule' });
        i++;
        continue;
      }
      if (/^\s*>/.test(line)) {
        const quote = [];
        for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''));
        blocks.push({ type: 'quote', inline: inline_(quote.join(' ')) });
        continue;
      }
      if (LIST_ITEM.test(line)) {
        const items = [];
        for (; i < lines.length && lines[i].trim() && !FENCE.test(lines[i]); i++) {
          if (LIST_ITEM.test(lines[i])) items.push(lines[i].replace(LIST_ITEM, ''));
          else items[items.length - 1] += ` ${lines[i].trim()}`;
        }
        blocks.push({ type: 'list', ordered: /^\s*\d/.test(line), items: items.map(inline_) });
        continue;
      }
      const para = [];
      for (; i < lines.length && lines[i].trim() && (!para.length || !startsBlock(lines[i])); i++) para.push(lines[i].trim());
      blocks.push({ type: 'paragraph', inline: inline_(para.join(' ')) });
    }
    return blocks;
  }

  // [text](target "title"): the text runs to the first ], and the target
  // after it may hold one level of brackets.
  const TARGET = /^\(\s*((?:[^()\s]|\([^()\s]*\))*)(?:\s+"[^"]*")?\s*\)/;
  const ESCAPABLE = /[\\`*_[\]()#+\-.!<>]/;

  // Inline: { type: text, text } | { type: code, text } | { type: strong
  // | em, children } | { type: link, href, children }; a link whose target
  // is not http(s) is its text alone.
  function inline(src, tally = () => {}) {
    const out = [];
    let pending = '';
    const add = (...nodes) => {
      const text = pending ? [{ type: 'text', text: pending }] : [];
      pending = '';
      for (const n of [...text, ...nodes]) {
        const last = out[out.length - 1];
        if (n.type === 'text' && last?.type === 'text') last.text += n.text;
        else out.push(n);
      }
    };
    // The first ] after a [ and the target after it, found once for all
    // the [ before it, so a run of unmatched [ stays linear.
    let close = -1;
    let target = null;
    // Where each emphasis mark closes, found once for the whole text and
    // read from a cursor that only moves on, so a run of unmatched marks
    // stays linear too.
    const marks = {};
    const closing = (mark, from) => {
      const m = (marks[mark] ??= { at: closers(src, mark, tally), next: 0 });
      for (; m.next < m.at.length && m.at[m.next] <= from; m.next++) tally(1);
      return m.next < m.at.length ? m.at[m.next] : -1;
    };
    let i = 0;
    while (i < src.length) {
      tally(1);
      const c = src[i];
      if (c === '\\' && ESCAPABLE.test(src[i + 1] ?? '')) {
        pending += src[i + 1];
        i += 2;
        continue;
      }
      if (c === '`') {
        const ticks = /^`+/.exec(src.slice(i))[0];
        const end = src.indexOf(ticks, i + ticks.length);
        tally((end > 0 ? end : src.length) - i);
        if (end > 0) {
          add({ type: 'code', text: src.slice(i + ticks.length, end) });
          i = end + ticks.length;
          continue;
        }
        pending += ticks;
        i += ticks.length;
        continue;
      }
      if (c === '[' && close <= i) {
        close = src.indexOf(']', i + 1);
        if (close < 0) close = src.length;
        target = close < src.length ? TARGET.exec(src.slice(close + 1)) : null;
        tally(close - i + (target?.[0].length ?? 0));
      }
      if (c === '[' && target) {
        const children = inline(src.slice(i + 1, close), tally);
        if (/^https?:\/\//i.test(target[1])) add({ type: 'link', href: target[1], children });
        else add(...children);
        i = close + 1 + target[0].length;
        continue;
      }
      if (c === '*' || c === '_') {
        // _ inside a word is no emphasis: snake_case stays as it is.
        const opens = c === '*' || !/\w/.test(src[i - 1] ?? '');
        const double = src[i + 1] === c;
        const from = i + (double ? 2 : 1);
        const end = opens && src[from] && !/\s/.test(src[from]) ? closing(double ? c + c : c, from) : -1;
        if (end > from) {
          add({ type: double ? 'strong' : 'em', children: inline(src.slice(from, end), tally) });
          i = end + (double ? 2 : 1);
          continue;
        }
      }
      pending += c;
      i++;
    }
    add();
    return out;
  }

  // Where mark can close emphasis in src, in order: after a non-space and,
  // for _, not inside a word.
  function closers(src, mark, tally) {
    tally(src.length);
    const at = [];
    for (let end = src.indexOf(mark, 1); end > 0; end = src.indexOf(mark, end + 1)) {
      if (/\s/.test(src[end - 1])) continue;
      if (mark[0] === '_' && /\w/.test(src[end + mark.length] ?? '')) continue;
      at.push(end);
    }
    return at;
  }

  globalThis.AgisterKnowledge = {
    model, observed, leftOut, checks, skillState, folderState, body, markdown, inline,
  };
})();
