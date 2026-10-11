// Agister pages: reads a repo's .agister settings into the few fields the
// dashboard shows. No DOM here.
//
// A classic script that sets globalThis.AgisterConfig, like repos.js: browsers
// refuses module scripts from file://. The parsers cover the YAML and TOML
// that Agister settings use (block maps and lists, flow maps and lists, folded
// and literal scalars, comments), not the whole of either language.
(() => {
  // --- shared scalar and flow parsing ---

  // text without its trailing comment: a # at the start or after whitespace,
  // outside quotes.
  function stripComment(text) {
    let quote = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === '\\' && quote === '"') i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
        return text.slice(0, i).trimEnd();
      }
    }
    return text.trimEnd();
  }

  function unquote(text) {
    if (text.length >= 2 && text[0] === '"' && text.endsWith('"')) return JSON.parse(text);
    if (text.length >= 2 && text[0] === "'" && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
    return text;
  }

  function scalar(text) {
    const t = text.trim();
    if (t[0] === '"' || t[0] === "'") return unquote(t);
    // The spellings Agister's YAML reads as booleans (yaml.v3's !!bool).
    if (t === 'true' || t === 'True' || t === 'TRUE') return true;
    if (t === 'false' || t === 'False' || t === 'FALSE') return false;
    if (t === '' || t === 'null' || t === '~') return null;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    return t;
  }

  // True when every [ and { in text outside quotes is closed.
  function balanced(text) {
    let depth = 0;
    let quote = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === '\\' && quote === '"') i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth--;
    }
    return depth <= 0;
  }

  // A flow list or map: [a, "b"] or {k: v, n: [1, 2]}.
  function parseFlow(text) {
    let pos = 0;
    const fail = (what) => { throw new Error(`${what} at column ${pos + 1} of ${text}`); };
    const space = () => { while (pos < text.length && /\s/.test(text[pos])) pos++; };
    function item(stops) {
      space();
      const c = text[pos];
      if (c === '[') return list();
      if (c === '{') return map();
      if (c === '"' || c === "'") {
        const start = pos++;
        while (pos < text.length && text[pos] !== c) pos += text[pos] === '\\' && c === '"' ? 2 : 1;
        if (pos >= text.length) fail('unclosed string');
        pos++;
        return unquote(text.slice(start, pos));
      }
      const start = pos;
      while (pos < text.length && !stops.includes(text[pos])) pos++;
      return scalar(text.slice(start, pos));
    }
    function list() {
      const out = [];
      pos++;
      for (;;) {
        space();
        if (text[pos] === ']') { pos++; return out; }
        out.push(item(',]'));
        space();
        if (text[pos] === ',') pos++;
        else if (text[pos] !== ']') fail('expected , or ]');
      }
    }
    function map() {
      const out = {};
      pos++;
      for (;;) {
        space();
        if (text[pos] === '}') { pos++; return out; }
        const key = item(':,}');
        space();
        if (text[pos] !== ':') fail('expected :');
        pos++;
        out[String(key)] = item(',}');
        space();
        if (text[pos] === ',') pos++;
        else if (text[pos] !== '}') fail('expected , or }');
      }
    }
    const value = item(',]}');
    space();
    if (pos < text.length) fail('unexpected text');
    return value;
  }

  // --- YAML ---

  function parseYaml(src) {
    const lines = src.replace(/\t/g, '  ').split(/\r?\n/);
    let i = 0;
    const indentOf = (line) => line.match(/^ */)[0].length;
    const blank = (line) => { const t = line.trim(); return t === '' || t.startsWith('#'); };
    const skip = () => { while (i < lines.length && blank(lines[i])) i++; };
    const fail = (what) => { throw new Error(`line ${i + 1}: ${what}`); };

    // The node whose first line is indented at least min, or null.
    function node(min) {
      skip();
      if (i >= lines.length) return null;
      const ind = indentOf(lines[i]);
      if (ind < min) return null;
      return /^-(\s|$)/.test(lines[i].slice(ind)) ? seq(ind) : map(ind);
    }

    function map(ind) {
      const out = {};
      for (;;) {
        skip();
        if (i >= lines.length) return out;
        const at = indentOf(lines[i]);
        if (at < ind) return out;
        if (at > ind) fail('unexpected indent');
        const text = stripComment(lines[i].slice(ind));
        if (/^-(\s|$)/.test(text)) return out;
        const m = text.match(/^("(?:[^"\\]|\\.)*"|'[^']*'|[^\s"'][^:]*?)\s*:(?:\s+(.*))?$/);
        if (!m) fail(`expected "key: value", got ${text}`);
        i++;
        out[unquote(m[1])] = value(m[2] ?? '', ind, true);
      }
    }

    function seq(ind) {
      const out = [];
      for (;;) {
        skip();
        if (i >= lines.length || indentOf(lines[i]) !== ind) return out;
        const text = stripComment(lines[i].slice(ind));
        if (!/^-(\s|$)/.test(text)) return out;
        const rest = text.slice(1).trimStart();
        if (/^[^\s"'[{][^:]*:(\s|$)/.test(rest) || /^("[^"]*"|'[^']*')\s*:(\s|$)/.test(rest)) {
          // "- key: v" opens a map whose keys line up with key.
          lines[i] = ' '.repeat(ind + 2) + rest;
          out.push(map(ind + 2));
        } else {
          i++;
          out.push(value(rest, ind, false));
        }
      }
    }

    // The value after "key:" or "- ", the key indented at ind.
    function value(rest, ind, inMap) {
      const t = rest.trim();
      if (t === '') {
        skip();
        // A list may sit at the key's own indent: "key:\n- a".
        if (inMap && i < lines.length && indentOf(lines[i]) === ind && /^-(\s|$)/.test(lines[i].slice(ind))) {
          return seq(ind);
        }
        return node(ind + 1);
      }
      if (/^[>|][-+]?$/.test(t)) return blockScalar(t, ind);
      if (t[0] === '[' || t[0] === '{') {
        let text = t;
        while (!balanced(text) && i < lines.length) text += ' ' + stripComment(lines[i++].trim());
        return parseFlow(text);
      }
      return scalar(t);
    }

    // A > or | scalar: the lines indented past ind, comments and all.
    function blockScalar(header, ind) {
      const body = [];
      let at = null;
      while (i < lines.length) {
        const line = lines[i];
        if (line.trim() === '') { body.push(''); i++; continue; }
        const li = indentOf(line);
        if (li <= ind) break;
        at ??= li;
        body.push(line.slice(Math.min(at, li)));
        i++;
      }
      while (body.length && body[body.length - 1] === '') body.pop();
      let text;
      if (header[0] === '|') {
        text = body.join('\n');
      } else {
        text = body.reduce((acc, line) => {
          if (line === '') return acc + '\n';
          return acc === '' || acc.endsWith('\n') ? acc + line : `${acc} ${line}`;
        }, '');
      }
      return header.endsWith('-') ? text : `${text}\n`;
    }

    // A --- may open the one document, as Agister reads it; a second still
    // fails at its own line.
    skip();
    if (i < lines.length && stripComment(lines[i]) === '---') i++;
    const doc = node(0);
    skip();
    if (i < lines.length) fail('unexpected text');
    return doc ?? {};
  }

  // --- TOML: key = value lines and [table] headers ---

  function parseToml(src) {
    const out = {};
    let table = out;
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = stripComment(lines[i].trim());
      if (text === '') continue;
      const header = text.match(/^\[([^\]]+)\]$/);
      if (header) {
        table = header[1].split('.').map((k) => unquote(k.trim()))
          .reduce((t, k) => (t[k] ??= {}), out);
        continue;
      }
      const m = text.match(/^("[^"]*"|[A-Za-z0-9_-]+)\s*=\s*(.+)$/);
      if (!m) throw new Error(`line ${i + 1}: expected "key = value", got ${text}`);
      let raw = m[2];
      while (!balanced(raw) && i + 1 < lines.length) raw += ' ' + stripComment(lines[++i].trim());
      table[unquote(m[1])] = raw[0] === '[' ? parseFlow(raw) : scalar(raw);
    }
    return out;
  }

  // --- what the dashboard shows ---

  // The first sentence of text, or all of it when it has no full stop.
  function firstSentence(text) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    const m = t.match(/^(.+?[.!?])(\s|$)/);
    return m ? m[1] : t;
  }

  // "agent:codex-sol" -> "codex-sol".
  const refName = (ref) => (typeof ref === 'string' ? ref.replace(/^[a-z-]+:/, '') : null);

  // Parameters as [{ name, default }]; default is undefined when required.
  function params(input) {
    const p = input && typeof input.params === 'object' && input.params ? input.params : {};
    return Object.entries(p).map(([name, spec]) => ({
      name,
      default: spec && typeof spec === 'object' && 'default' in spec ? spec.default : undefined,
    }));
  }

  function workflowItem(file, _src, doc) {
    // A node's agent is its name alone, and runs its call in place of its
    // process's; null when the node names none (ADR-030 rule 5).
    const node = (n) => ({ node: n?.node ?? null, process: refName(n?.uses), agent: typeof n?.agent === 'string' ? n.agent : null });
    return {
      file, name: doc.name ?? stem(file),
      params: params(doc.input),
      fanOut: Array.isArray(doc.fan_out) ? doc.fan_out.map(node) : [],
      join: doc.join ? node(doc.join) : null,
      // The one node of a workflow of one call (ADR-030 rule 6).
      call: doc.call ? node(doc.call) : null,
      forms: forms(doc.input),
    };
  }

  // A workflow's nodes: the fan-out, then the join, or its one call.
  const workflowNodes = (w) => [...w.fanOut, ...(w.join ? [w.join] : []), ...(w.call ? [w.call] : [])];

  function processItem(file, _src, doc) {
    const instruction = typeof doc.input?.instruction === 'string' ? doc.input.instruction.trim() : '';
    return {
      file, name: doc.name ?? stem(file),
      purpose: firstSentence(instruction),
      // Its own limits, which a node's call takes within the service's
      // (ADR-030 rule 3); access is null when it sets none.
      access: doc.workspace?.access ?? null,
      scope: doc.workspace?.scope ?? null,
      timeout: doc.timeout ?? null,
      maxCostUsd: doc.max_cost_usd ?? null,
      attempts: doc.retry?.max_attempts ?? null,
      allow: Array.isArray(doc.tools?.allow) ? doc.tools.allow : [],
      require: Array.isArray(doc.tools?.require) ? doc.tools.require : [],
      deny: Array.isArray(doc.isolation?.deny) ? doc.isolation.deny : [],
      // resumable or fresh-only; null when it sets none, fresh-only
      // (ADR-030 rule 4).
      session: doc.session ?? null,
      params: params(doc.input),
      // Inline fields, or the name of a verification (verify:<name>).
      verify: typeof doc.verify === 'string'
        ? { ref: refName(doc.verify), maxAttempts: null }
        : doc.verify ? { maxAttempts: doc.verify.max_attempts ?? null } : null,
      // What its call needs of the caller's worktree (ADR-025 rules 2, 3):
      // the input whose revision HEAD must be at, null when it pins none;
      // and whether a fresh call needs HEAD's content.
      revision: doc.workspace?.revision ?? null,
      clean: doc.workspace?.clean === true,
      output: doc.output?.schema ?? null,
      prompt: typeof doc.prompt === 'string' ? { name: doc.prompt } : null,
      guidance: Array.isArray(doc.guidance) ? doc.guidance.map((name) => ({ name })) : [],
      prompts: [doc.prompt, ...(Array.isArray(doc.guidance) ? doc.guidance : [])]
        .filter((name) => typeof name === 'string').map((name) => ({ name })),
      forms: forms(doc.input),
      skills: skillNames(doc.skills),
      instruction,
    };
  }

  // The brief forms a process's or a workflow's file inputs name ({source:
  // file, path: ..., form: [<name>, ...]}), each once (ADR-026 rule 8).
  function forms(input) {
    const values = input && typeof input.values === 'object' && input.values ? Object.values(input.values) : [];
    const names = values.filter((v) => v?.source === 'file' && Array.isArray(v.form))
      .flatMap((v) => v.form.filter((name) => typeof name === 'string'));
    return [...new Set(names)].map((name) => ({ name }));
  }

  // A brief form (ADR-026 rules 3 to 5): its parts, each a heading, and
  // whether it is required.
  function briefItem(file, _src, doc) {
    const parts = Array.isArray(doc.parts) ? doc.parts : [];
    return {
      file, name: doc.name ?? stem(file),
      parts: parts.map((p) => ({ heading: p?.heading ?? null, required: p?.required === true })),
    };
  }

  // The skills an agent or a process names (skills = [...] or skills:
  // [...]), each once (ADR-021).
  function skillNames(list) {
    const names = Array.isArray(list) ? list.filter((name) => typeof name === 'string') : [];
    return [...new Set(names)].map((name) => ({ name }));
  }

  // A verification document (ADR-010). It runs in the call's worktree
  // (ADR-025 rule 5).
  function verifyItem(file, doc) {
    return { file, name: doc.name ?? stem(file), maxAttempts: doc.max_attempts ?? null };
  }

  function agentItem(file, doc) {
    return {
      file, name: doc.name ?? stem(file),
      runtime: doc.runtime ?? null, model: doc.model ?? null,
      effort: doc.effort ?? null,
      skills: skillNames(doc.skills),
    };
  }

  function runtimeItem(file, doc) {
    const items = doc.primitives && typeof doc.primitives.items === 'object' ? doc.primitives.items : {};
    const verified = new Set();
    for (const p of Object.values(items)) for (const v of p?.verified ?? []) verified.add(String(v));
    return {
      file, name: doc.name ?? stem(file),
      adapter: doc.adapter ?? null, contract: doc.contract ?? null,
      verified: [...verified],
    };
  }

  const stem = (file) => file.replace(/\.[^.]+$/, '');

  // --- reading .agister through a directory handle ---

  async function readText(fileHandle) {
    return (await fileHandle.getFile()).text();
  }

  // The folder sub of agister, or null when it is missing.
  async function subfolder(agister, sub) {
    try {
      return await agister.getDirectoryHandle(sub);
    } catch (err) {
      if (err && (err.name === 'NotFoundError' || err.name === 'TypeMismatchError')) return null;
      throw err;
    }
  }

  // [{ file, src }] for the files of sub with one of exts, by name; none
  // when sub is missing.
  async function readFolder(agister, sub, exts) {
    const dir = await subfolder(agister, sub);
    if (!dir) return [];
    const files = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file' && exts.some((e) => name.endsWith(e))) files.push([name, handle]);
    }
    files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Promise.all(files.map(async ([file, handle]) => ({ file, src: await readText(handle) })));
  }

  // The skills of a layer's skills/ (skills/<name>/SKILL.md, ADR-021), by
  // name, from the server's inventory of them (api/skills' settings), never
  // from the settings files: a skill that is there is one whatever its
  // state, so a broken one still goes over home's (D-16). Each is
  // { file, name, path, state, description, checks }.
  function layerSkills(inventory) {
    return (inventory ?? []).map((s) => ({
      file: `${s.name}/SKILL.md`, name: s.name, path: s.path ?? null, state: s.state ?? null,
      description: s.description ?? null, checks: s.checks ?? null, ...(s.source && { source: s.source }),
    })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  // Each file through build; a file that does not parse becomes
  // { file, name, error } so one bad file does not hide the rest.
  function each(files, parse, build) {
    return files.map(({ file, src }) => {
      try {
        const doc = parse(src);
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('not a map');
        const item = build(file, src, doc);
        Object.defineProperties(item, { doc: { value: doc }, src: { value: src } });
        return item;
      } catch (err) {
        return { file, name: stem(file), error: err.message };
      }
    });
  }

  async function loadService(agister) {
    let handle;
    try {
      handle = await agister.getFileHandle('service.toml');
    } catch (err) {
      if (err && (err.name === 'NotFoundError' || err.name === 'TypeMismatchError')) return null;
      throw err;
    }
    try {
      const doc = parseToml(await readText(handle));
      return serviceItem(doc);
    } catch (err) {
      return { error: err.message };
    }
  }

  function serviceItem(doc) {
    const item = {
      maxTimeout: doc.max_timeout ?? null,
      maxAttempts: doc.max_attempts ?? null,
      maxVerifyAttempts: doc.max_verify_attempts ?? null,
      permissions: Array.isArray(doc.permissions) ? doc.permissions.length : 0,
    };
    Object.defineProperty(item, 'doc', { value: doc });
    return item;
  }

  // The dashboard model of the .agister folder agister, whose skills are
  // skills, the server's inventory of that one layer.
  async function loadAgister(agister, skills = []) {
    const model = await readAgister(agister, skills);
    model.processes = extended(model.processes);
    return link(model);
  }

  const KINDS = ['workflows', 'processes', 'agents', 'runtimes', 'schemas', 'verifies', 'prompts', 'briefs', 'skills'];

  // Raw folder readers used by local fixtures. The served view receives
  // the Go definition language's composed text and provenance instead.
  async function loadComposed(home, repo, skills = []) {
    const scope = (s) => (skills ?? []).filter((x) => x.scope === s);
    return link(compose(await readAgister(home, scope('home')), await readAgister(repo, scope('repo'))));
  }

  // Each process that extends a base (extends: process:<name>) laid over
  // it: the base's fields but its name and extends, under the process's
  // own (ADR-030 rule 9). A base is marked as one: it is not work, and is
  // read through each process that extends it, which extendedBy lists.
  function extended(processes) {
    const docs = new Map(processes.filter((p) => !p.error && p.doc).map((p) => [p.name, p.doc]));
    const items = processes.map((p) => {
      const name = baseName(p);
      if (!docs.has(name)) return p;
      const { name: _name, extends: _extends, ...given } = docs.get(name);
      const { doc: _doc, ...own } = p;
      return { ...own, ...processItem(p.file, p.src, merge(given, p.doc)), extends: name };
    });
    return markBases(items);
  }

  // The base a process's document names (extends: process:<name>), or null.
  const baseName = (p) => (!p.error && typeof p.doc?.extends === 'string' ? refName(p.doc.extends) : null);

  // Marks each base a process extends as one, with the processes that
  // extend it.
  function markBases(processes) {
    const bases = new Map();
    for (const p of processes) {
      if (p.extends) bases.set(p.extends, [...(bases.get(p.extends) ?? []), p.name]);
    }
    for (const p of processes) {
      if (bases.has(p.name)) Object.assign(p, { base: true, extendedBy: bases.get(p.name) });
    }
    return processes;
  }

  const mapValue = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  function merge(base, over) {
    if (!mapValue(base) || !mapValue(over)) return over;
    const result = { ...base };
    for (const [key, value] of Object.entries(over)) result[key] = key in result ? merge(result[key], value) : value;
    return result;
  }

  const builders = {
    workflows: workflowItem, processes: processItem,
    agents: (file, _src, doc) => agentItem(file, doc),
    runtimes: (file, _src, doc) => runtimeItem(file, doc),
    verifies: (file, _src, doc) => verifyItem(file, doc), briefs: briefItem,
  };

  function compose(home, repo) {
    const model = {};
    for (const kind of KINDS) {
      const byFile = new Map(home[kind].map((x) => [stem(x.file), { ...x, source: 'home', doc: x.doc }]));
      for (const x of repo[kind]) {
        const base = byFile.get(stem(x.file));
        const doc = base?.doc && x.doc && builders[kind] ? merge(base.doc, x.doc) : x.doc;
        const item = doc && builders[kind] ? builders[kind](x.file, x.src, doc) : x;
        byFile.set(stem(x.file), { ...item, source: 'repo', overrides: !!base, doc });
      }
      const items = kind === 'processes' ? extended([...byFile.values()]) : [...byFile.values()];
      model[kind] = items.map(({ doc, ...x }) => x)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    }
    model.service = repo.service
      ? { ...(home.service?.doc && repo.service.doc ? serviceItem(merge(home.service.doc, repo.service.doc)) : repo.service), source: 'repo', overrides: !!home.service }
      : home.service && { ...home.service, source: 'home' };
    return model;
  }

  // The server uses definition.Compose: sources carry each document's
  // layer files nearest first and their surviving leaf fields, just as
  // process show and check --tree do. A broken composition is an error
  // item even when no text could be produced for it.
  async function loadReported(agister, sources, skills = []) {
    const model = await readAgister(agister, []);
    const priority = { project: 3, repository: 2, home: 1 };
    const selectedSkills = new Map();
    for (const s of [...skills].sort((a, b) => priority[b.scope === 'repo' ? 'repository' : b.scope] - priority[a.scope === 'repo' ? 'repository' : a.scope])) {
      const source = s.scope === 'repo' ? 'repository' : s.scope;
      const layer = { layer: source, path: `${s.path}/SKILL.md` };
      const previous = selectedSkills.get(s.name);
      if (previous) {
        previous.layers.push(layer);
        previous.overrides = true;
      } else {
        selectedSkills.set(s.name, { ...layerSkills([s])[0], source, layers: [layer], overrides: false });
      }
    }
    model.skills = [...selectedSkills.values()];
    for (const [file, source] of Object.entries(sources ?? {})) {
      const kind = file === 'service.toml' ? 'service' : file.split('/')[0];
      if (kind !== 'service' && !KINDS.includes(kind)) continue;
      const items = kind === 'service' ? [model.service].filter(Boolean) : model[kind];
      const relative = kind === 'service' ? file : file.slice(kind.length + 1);
      let item = kind === 'service' ? model.service : items.find((x) => x.file === relative);
      if (!item && source.error) {
        item = { file: relative, name: stem(relative), error: source.error };
        if (kind === 'service') model.service = item;
        else items.push(item);
      }
      if (item) Object.assign(item, source, { source: source.layers?.[0]?.layer, overrides: source.layers?.length > 1 });
    }
    // The binary has laid each process over its base already, and its
    // text keeps the extends it names: only the base and the processes
    // that extend it are read from that (ADR-030 rule 9).
    for (const p of model.processes) {
      const name = baseName(p);
      if (name) p.extends = name;
    }
    markBases(model.processes);
    return link(model);
  }

  async function readAgister(agister, skills) {
    const [workflows, processes, agents, runtimes, schemas, verifies, prompts, briefs, service] = await Promise.all([
      readFolder(agister, 'workflows', ['.yaml', '.yml']),
      readFolder(agister, 'processes', ['.yaml', '.yml']),
      readFolder(agister, 'agents', ['.toml']),
      readFolder(agister, 'runtimes', ['.yaml', '.yml']),
      readFolder(agister, 'schemas', ['.json']),
      readFolder(agister, 'verifies', ['.yaml', '.yml']),
      readFolder(agister, 'prompts', ['.md']),
      readFolder(agister, 'briefs', ['.yaml', '.yml']),
      loadService(agister),
    ]);
    return {
      service,
      workflows: each(workflows, parseYaml, workflowItem),
      processes: each(processes, parseYaml, processItem),
      agents: each(agents, parseToml, (file, _src, doc) => agentItem(file, doc)),
      runtimes: each(runtimes, parseYaml, (file, _src, doc) => runtimeItem(file, doc)),
      schemas: schemas.map(({ file }) => ({ file, name: stem(file) })),
      verifies: each(verifies, parseYaml, (file, _src, doc) => verifyItem(file, doc)),
      prompts: prompts.map(({ file }) => ({ file, name: stem(file) })),
      briefs: each(briefs, parseYaml, briefItem),
      skills: layerSkills(skills),
    };
  }

  // Adds the cross-references: who uses each item, and which names point
  // outside this folder (defined in Agister's home or built in).
  function link(model) {
    const names = (items) => new Set(items.filter((x) => !x.error).map((x) => x.name));
    const processes = names(model.processes);
    const byProcess = new Map(model.processes.filter((p) => !p.error).map((p) => [p.name, p]));
    const byAgent = new Map(model.agents.filter((a) => !a.error).map((a) => [a.name, a]));
    const runtimes = names(model.runtimes);
    const schemas = new Set(model.schemas.map((s) => s.name));
    // A named prompt, schema or skill, found: with the layer it comes from
    // when composed and the error that breaks it, or outside these settings.
    const found = (items) => {
      const byName = new Map(items.map((s) => [s.name, s]));
      return (x) => {
        const item = byName.get(x.name);
        return { ...x, outside: !item, ...(item?.source && { source: item.source, overrides: !!item.overrides }),
          ...(item?.layers && { layers: item.layers }), ...(item?.error && { error: item.error }) };
      };
    };
    const prompt = found(model.prompts);
    const schema = found(model.schemas);
    const brief = found(model.briefs.filter((b) => !b.error));
    // A skill found carries what the server's inventory says of it in its
    // layer: its path, state, description and checks.
    const skillFound = found(model.skills);
    const skillByName = new Map(model.skills.map((s) => [s.name, s]));
    const skill = (x) => {
      const item = skillByName.get(x.name);
      return item ? { ...skillFound(x), path: item.path, state: item.state, description: item.description, checks: item.checks } : skillFound(x);
    };
    const usedBy = (items, key, name) => items.filter((x) => !x.error && x[key] === name).map((x) => x.name);

    for (const w of model.workflows) {
      if (w.error) continue;
      for (const n of workflowNodes(w)) n.outside = !processes.has(n.process);
      // A workflow of one call takes its process's params (ADR-030 rule 6).
      if (w.call) w.params = byProcess.get(w.call.process)?.params ?? [];
      // Each brief form its goal names, found as prompts are (ADR-026).
      w.forms = w.forms.map(brief);
    }
    for (const p of model.processes) {
      if (p.error) continue;
      p.outputOutside = !!p.output && !schemas.has(p.output);
      // Its output schema found, with the layers the binary reports for it.
      p.schema = p.output ? schema({ name: p.output }) : null;
      // Each prompt found, with the layer it comes from when composed (ADR-014).
      p.prompts = p.prompts.map(prompt);
      p.prompt = p.prompt ? prompt(p.prompt) : null;
      p.guidance = p.guidance.map(prompt);
      p.forms = p.forms.map(brief);
      // The skills it names, found as prompts are. A node's call gets
      // these, then the skills of the agent the node binds (ADR-021 rule 2).
      p.skills = p.skills.map(skill);
      // A named verification, resolved: its attempts, or outside these
      // settings.
      if (p.verify?.ref) {
        const named = model.verifies.find((v) => !v.error && v.name === p.verify.ref);
        p.verify = { ...p.verify, maxAttempts: named?.maxAttempts ?? null, outside: !named,
          ...(named?.layers && { layers: named.layers }) };
      }
      const bound = model.workflows.filter((w) => !w.error).flatMap(workflowNodes).filter((n) => n.process === p.name);
      p.usedBy = model.workflows
        .filter((w) => !w.error && workflowNodes(w).some((n) => n.process === p.name))
        .map((w) => w.name);
      // The agents workflows' nodes bind it to, each once: a process names
      // none of its own (ADR-030 rule 2).
      p.agents = [...new Set(bound.map((n) => n.agent).filter(Boolean))];
    }
    for (const a of model.agents) {
      if (a.error) continue;
      a.skills = a.skills.map(skill);
      a.runtimeOutside = !!a.runtime && !runtimes.has(a.runtime);
      // The workflows whose nodes bind it.
      a.usedBy = model.workflows
        .filter((w) => !w.error && workflowNodes(w).some((n) => n.agent === a.name))
        .map((w) => w.name);
    }
    for (const r of model.runtimes) {
      if (!r.error) r.usedBy = usedBy(model.agents, 'runtime', r.name);
    }
    for (const s of model.schemas) s.usedBy = usedBy(model.processes, 'output', s.name);
    for (const s of model.prompts) {
      s.usedBy = model.processes.filter((p) => !p.error && p.prompts.some((x) => x.name === s.name)).map((p) => p.name);
    }
    for (const b of model.briefs) {
      if (b.error) continue;
      const names = (items) => items.filter((x) => !x.error && x.forms.some((f) => f.name === b.name)).map((x) => x.name);
      b.usedBy = [...names(model.processes), ...names(model.workflows)];
    }
    // A skill is used by each process whose calls get it: one the process
    // names, or one an agent a node binds it to names.
    const naming = (list, name) => (list ?? []).some((x) => x.name === name);
    for (const s of model.skills) {
      s.usedBy = model.processes.filter((p) => !p.error &&
        (naming(p.skills, s.name) || p.agents.some((a) => naming(byAgent.get(a)?.skills, s.name)))).map((p) => p.name);
    }
    for (const v of model.verifies) {
      if (!v.error) v.usedBy = model.processes.filter((p) => !p.error && p.verify?.ref === v.name).map((p) => p.name);
    }
    return model;
  }

  globalThis.AgisterConfig = {
    parseYaml, parseToml, parseFlow, stripComment,
    firstSentence, loadAgister, loadComposed, loadReported,
  };
})();
