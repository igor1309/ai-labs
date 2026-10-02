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
    if (t === 'true') return true;
    if (t === 'false') return false;
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

  // The file's leading comment block, as one line.
  function leadingComment(src) {
    const out = [];
    for (const line of src.split(/\r?\n/)) {
      const t = line.trim();
      if (!t.startsWith('#')) break;
      out.push(t.replace(/^#+\s?/, ''));
    }
    return out.join(' ').trim();
  }

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

  function workflowItem(file, src, doc) {
    const node = (n) => ({ node: n?.node ?? null, process: refName(n?.uses) });
    return {
      file, name: doc.name ?? stem(file),
      purpose: firstSentence(leadingComment(src)),
      params: params(doc.input),
      fanOut: Array.isArray(doc.fan_out) ? doc.fan_out.map(node) : [],
      join: doc.join ? node(doc.join) : null,
    };
  }

  function processItem(file, src, doc) {
    const instruction = typeof doc.input?.instruction === 'string' ? doc.input.instruction.trim() : '';
    return {
      file, name: doc.name ?? stem(file),
      purpose: firstSentence(leadingComment(src) || instruction),
      agent: refName(doc.uses),
      policy: refName(doc.policy),
      params: params(doc.input),
      // Inline fields, or the name of a verification (verify:<name>).
      verify: typeof doc.verify === 'string'
        ? { ref: refName(doc.verify), maxAttempts: null }
        : doc.verify ? { maxAttempts: doc.verify.max_attempts ?? null } : null,
      output: doc.output?.schema ?? null,
      prompts: prompts(doc.input),
      instruction,
    };
  }

  // The prompts a process's inputs name ({source: prompt, name: <name>}),
  // each once (ADR-011).
  function prompts(input) {
    const values = input && typeof input.values === 'object' && input.values ? Object.values(input.values) : [];
    const names = values.filter((v) => v?.source === 'prompt' && typeof v.name === 'string').map((v) => v.name);
    return [...new Set(names)].map((name) => ({ name }));
  }

  function verifyItem(file, doc) {
    return { file, name: doc.name ?? stem(file), maxAttempts: doc.max_attempts ?? null };
  }

  function agentItem(file, doc) {
    return {
      file, name: doc.name ?? stem(file),
      runtime: doc.runtime ?? null, model: doc.model ?? null,
      effort: doc.effort ?? null, session: doc.session ?? null,
    };
  }

  function policyItem(file, src, doc) {
    return {
      file, name: doc.name ?? stem(file),
      purpose: firstSentence(leadingComment(src)),
      access: doc.workspace?.access ?? null,
      timeout: doc.timeout ?? null,
      maxCostUsd: doc.max_cost_usd ?? null,
      allow: Array.isArray(doc.tools?.allow) ? doc.tools.allow : [],
      deny: Array.isArray(doc.isolation?.deny) ? doc.isolation.deny : [],
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

  // [{ file, src }] for the files of sub with one of exts, by name; none
  // when sub is missing.
  async function readFolder(agister, sub, exts) {
    let dir;
    try {
      dir = await agister.getDirectoryHandle(sub);
    } catch (err) {
      if (err && (err.name === 'NotFoundError' || err.name === 'TypeMismatchError')) return [];
      throw err;
    }
    const files = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file' && exts.some((e) => name.endsWith(e))) files.push([name, handle]);
    }
    files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Promise.all(files.map(async ([file, handle]) => ({ file, src: await readText(handle) })));
  }

  // Each file through build; a file that does not parse becomes
  // { file, name, error } so one bad file does not hide the rest.
  function each(files, parse, build) {
    return files.map(({ file, src }) => {
      try {
        const doc = parse(src);
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('not a map');
        return build(file, src, doc);
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
      return {
        maxTimeout: doc.max_timeout ?? null,
        maxAttempts: doc.max_attempts ?? null,
        maxVerifyAttempts: doc.max_verify_attempts ?? null,
        permissions: Array.isArray(doc.permissions) ? doc.permissions.length : 0,
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  // The dashboard model of the .agister folder agister.
  async function loadAgister(agister) {
    return link(await readAgister(agister));
  }

  const KINDS = ['workflows', 'processes', 'agents', 'policies', 'runtimes', 'schemas', 'verifies', 'prompts'];

  // What Agister uses in a repo: Agister home's settings with the repo's
  // over them. As in Agister, a repo file replaces the home file of the
  // same kind and name, and the repo's service.toml replaces home's. Each
  // item says where it comes from: source 'repo' or 'home', and overrides
  // when a repo item replaces a home one.
  async function loadComposed(home, repo) {
    return link(compose(await readAgister(home), await readAgister(repo)));
  }

  function compose(home, repo) {
    const model = {};
    for (const kind of KINDS) {
      const byFile = new Map(home[kind].map((x) => [stem(x.file), { ...x, source: 'home' }]));
      for (const x of repo[kind]) {
        byFile.set(stem(x.file), { ...x, source: 'repo', overrides: byFile.has(stem(x.file)) });
      }
      model[kind] = [...byFile.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    }
    model.service = repo.service
      ? { ...repo.service, source: 'repo', overrides: !!home.service }
      : home.service && { ...home.service, source: 'home' };
    return model;
  }

  async function readAgister(agister) {
    const [workflows, processes, agents, policies, runtimes, schemas, verifies, prompts, service] = await Promise.all([
      readFolder(agister, 'workflows', ['.yaml', '.yml']),
      readFolder(agister, 'processes', ['.yaml', '.yml']),
      readFolder(agister, 'agents', ['.toml']),
      readFolder(agister, 'policies', ['.yaml', '.yml']),
      readFolder(agister, 'runtimes', ['.yaml', '.yml']),
      readFolder(agister, 'schemas', ['.json']),
      readFolder(agister, 'verifies', ['.yaml', '.yml']),
      readFolder(agister, 'prompts', ['.md']),
      loadService(agister),
    ]);
    return {
      service,
      workflows: each(workflows, parseYaml, workflowItem),
      processes: each(processes, parseYaml, processItem),
      agents: each(agents, parseToml, (file, _src, doc) => agentItem(file, doc)),
      policies: each(policies, parseYaml, policyItem),
      runtimes: each(runtimes, parseYaml, (file, _src, doc) => runtimeItem(file, doc)),
      schemas: schemas.map(({ file }) => ({ file, name: stem(file) })),
      verifies: each(verifies, parseYaml, (file, _src, doc) => verifyItem(file, doc)),
      prompts: prompts.map(({ file }) => ({ file, name: stem(file) })),
    };
  }

  // Adds the cross-references: who uses each item, and which names point
  // outside this folder (defined in Agister's home or built in).
  function link(model) {
    const names = (items) => new Set(items.filter((x) => !x.error).map((x) => x.name));
    const processes = names(model.processes);
    const agents = names(model.agents);
    const policies = names(model.policies);
    const runtimes = names(model.runtimes);
    const schemas = new Set(model.schemas.map((s) => s.name));
    const prompts = new Set(model.prompts.map((s) => s.name));
    const usedBy = (items, key, name) => items.filter((x) => !x.error && x[key] === name).map((x) => x.name);

    for (const w of model.workflows) {
      if (w.error) continue;
      for (const n of [...w.fanOut, ...(w.join ? [w.join] : [])]) n.outside = !processes.has(n.process);
    }
    for (const p of model.processes) {
      if (p.error) continue;
      p.agentOutside = !!p.agent && !agents.has(p.agent);
      p.policyOutside = !!p.policy && !policies.has(p.policy);
      p.outputOutside = !!p.output && !schemas.has(p.output);
      p.prompts = p.prompts.map((x) => ({ ...x, outside: !prompts.has(x.name) }));
      // A named verification, resolved: its attempts, or outside these settings.
      if (p.verify?.ref) {
        const named = model.verifies.find((v) => !v.error && v.name === p.verify.ref);
        p.verify = { ...p.verify, maxAttempts: named?.maxAttempts ?? null, outside: !named };
      }
      p.usedBy = model.workflows
        .filter((w) => !w.error && [...w.fanOut, ...(w.join ? [w.join] : [])].some((n) => n.process === p.name))
        .map((w) => w.name);
    }
    for (const a of model.agents) {
      if (a.error) continue;
      a.runtimeOutside = !!a.runtime && !runtimes.has(a.runtime);
      a.usedBy = usedBy(model.processes, 'agent', a.name);
    }
    for (const p of model.policies) {
      if (!p.error) p.usedBy = usedBy(model.processes, 'policy', p.name);
    }
    for (const r of model.runtimes) {
      if (!r.error) r.usedBy = usedBy(model.agents, 'runtime', r.name);
    }
    for (const s of model.schemas) s.usedBy = usedBy(model.processes, 'output', s.name);
    for (const s of model.prompts) {
      s.usedBy = model.processes.filter((p) => !p.error && p.prompts.some((x) => x.name === s.name)).map((p) => p.name);
    }
    for (const v of model.verifies) {
      if (!v.error) v.usedBy = model.processes.filter((p) => !p.error && p.verify?.ref === v.name).map((p) => p.name);
    }
    return model;
  }

  globalThis.AgisterConfig = {
    parseYaml, parseToml, parseFlow, stripComment,
    leadingComment, firstSentence, loadAgister, loadComposed,
  };
})();
