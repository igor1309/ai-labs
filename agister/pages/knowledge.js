// Agister pages: the Knowledge view's logic that does not touch the DOM.
//
// A classic script that sets globalThis.AgisterKnowledge, as runs.js sets
// AgisterRuns. The skills it reads are what agister pages serves at
// api/skills (pages/skills.go): the skill folders the settings' runtimes
// load, in the repo and the home (ADR-011), and the settings' own skills
// with their checks (ADR-021), which reach it through config.js's model of
// the settings (D-16). An agent's skills are two lists, kept apart: the
// skills its settings name, and the skills its runtime loads.
(() => {
  // What each runtime loads that the folders leave out (ADR-011 rule 3).
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
  // its skills from the inventory api/skills gave; skills the api/skills
  // reply for them, of which the folders are read here; runs the run
  // summaries.
  //   agents: each agent with its runtime's adapter; the skills its
  //     settings name (named: its own, and per process a workflow's node
  //     binds to it the process's); the folders that adapter loads and the skills in them
  //     (loads); and, apart from both, what its runs used (observed);
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
        named: {
          own: (a.skills ?? []).map(fromSettings),
          processes: settings.processes.filter((p) => !p.error && p.agents?.includes(a.name) && p.skills?.length)
            .map((p) => ({ name: p.name, skills: p.skills.map(fromSettings) })),
        },
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

  // A skill the settings name, as config.js found it in the server's
  // inventory of the settings' skills (D-16): with its layer, home's when
  // the settings are not composed (~), and what the server read of it there.
  function fromSettings(x) {
    if (x.outside) return { name: x.name, missing: true };
    return {
      name: x.name, missing: false, source: x.source ?? 'home', overrides: !!x.overrides,
      path: x.path ?? null, state: x.state ?? null, description: x.description ?? null,
      checks: x.checks ?? null,
    };
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
    linked_folder: 'a symbolic link, not a folder: not followed',
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
  // markdown-it (markdown-it.min.js, loaded before this script) reads the
  // Markdown; its tokens become a tree the page builds from elements and
  // text nodes, never an HTML string, so HTML in a skill is text. A node
  // is a string (text) or { tag, children } with, for a link, its href,
  // for an ordered list its start and for a table cell its align. Links
  // keep http(s) targets only; any other link is its text, and an image
  // its alt text.

  let parser = null;
  function md() {
    if (!parser) {
      parser = globalThis.markdownit({ html: false, linkify: false, typographer: false });
      // Every link is read as one, so one that is not http(s) shows its
      // text rather than its Markdown; LINK decides what stays a link.
      parser.validateLink = () => true;
    }
    return parser;
  }

  const LINK = /^https?:\/\//i;
  // The token types that open an element, and the element.
  const OPENS = {
    paragraph_open: 'p', blockquote_open: 'blockquote', bullet_list_open: 'ul', ordered_list_open: 'ol',
    list_item_open: 'li', table_open: 'table', thead_open: 'thead', tbody_open: 'tbody', tr_open: 'tr',
    th_open: 'th', td_open: 'td', em_open: 'em', strong_open: 'strong', s_open: 's',
  };
  const ALIGN = /^text-align:(left|center|right)$/;

  // The tree of src's Markdown: a list of nodes. Headings go two levels
  // down, # to h3, as the card holds h1 and h2. The walk keeps its own
  // stack, so deep nesting takes no call stack; each entry is the list
  // the tokens up to its closing token go to.
  function markdown(src) {
    const root = [];
    const stack = [{ into: root, closes: null }];
    const add = (node) => stack[stack.length - 1].into.push(node);
    const walk = (tokens) => {
      for (const t of tokens) {
        if (t.hidden) continue; // a tight list's paragraph: its text goes in the item
        if (t.type === 'inline') walk(t.children ?? []);
        else if (t.nesting === 1) open(t);
        else if (t.nesting === -1) {
          if (stack.length > 1 && stack[stack.length - 1].closes === t.type) stack.pop();
        } else if (t.type === 'softbreak') add('\n');
        else if (t.type === 'hardbreak') add({ tag: 'br', children: [] });
        else if (t.type === 'hr') add({ tag: 'hr', children: [] });
        else if (t.type === 'code_inline') add({ tag: 'code', children: [t.content] });
        else if (t.type === 'code_block' || t.type === 'fence') add({ tag: 'pre', children: [{ tag: 'code', children: [t.content.replace(/\n$/, '')] }] });
        else if (t.type === 'image') add(alt(t));
        else add(t.content); // text, and anything else as its text
      }
    };
    const open = (t) => {
      const closes = t.type.replace(/_open$/, '_close');
      let node = null;
      if (t.type === 'heading_open') node = { tag: `h${Math.min(6, Number(t.tag.slice(1)) + 2)}` };
      else if (t.type === 'link_open') {
        const href = t.attrGet('href') ?? '';
        if (LINK.test(href)) node = { tag: 'a', href };
      } else if (OPENS[t.type]) node = { tag: OPENS[t.type] };
      // Anything else, a link that is not http(s) too, is its contents.
      if (!node) {
        stack.push({ into: stack[stack.length - 1].into, closes });
        return;
      }
      if (node.tag === 'ol') {
        const start = Number(t.attrGet('start'));
        if (Number.isInteger(start) && start !== 1) node.start = start;
      }
      if (node.tag === 'th' || node.tag === 'td') {
        const align = ALIGN.exec(t.attrGet('style') ?? '');
        if (align) node.align = align[1];
      }
      node.children = [];
      add(node);
      stack.push({ into: node.children, closes });
    };
    walk(md().parse(String(src ?? ''), {}));
    return root;
  }

  // An image's alt text: the text of its description.
  function alt(t) {
    const text = [];
    for (const c of t.children ?? []) {
      if (c.type === 'softbreak' || c.type === 'hardbreak') text.push('\n');
      else if (c.type === 'text' || c.type === 'text_special' || c.type === 'code_inline') text.push(c.content);
      else if (c.type === 'image') text.push(alt(c));
    }
    return text.join('');
  }

  globalThis.AgisterKnowledge = {
    model, observed, leftOut, checks, skillState, folderState, body, markdown,
  };
})();
