export const meta = {
  name: 'traceability-review',
  description: 'Traceability review. Invoke: /traceability-review <project> [on "<Module>"]. Lone project runs whole if small; if it has many modules it returns a slice plan instead. Scope -> slice -> passes (adr-spec/spec-tests/orphan) -> umbrella.',
  phases: [
    { title: 'Scope', detail: 'list modules + estimate size; gate whole-project vs slice' },
    { title: 'Slice', detail: 'read the in-scope module(s) once; grep test titles' },
    { title: 'Passes', detail: 'adr-spec, spec-tests, orphan — JSON, from the slice only' },
    { title: 'Umbrella', detail: 'aggregate findings + open questions' },
  ],
}

// args: object, JSON string, or "<project> [on "<Module>"]". Leading token is ALWAYS the project.
let A = (typeof args !== 'undefined' && args) || {}
if (typeof A === 'string') {
  const s = A.trim()
  try { A = JSON.parse(s) } catch {
    const m = s.match(/^(\S+)(?:\s+on\s+['"]?(.+?)['"]?\s*)?$/i)
    A = m ? { project: m[1], module: m[2] } : {}
  }
}
const PROJECT = A.project || A.projectRoot || 'agonara'   // short name or absolute path; agents resolve it
const MODULE = A.module                                    // optional
const ROW_WARN = 300                                       // heuristic: a single scope above this is costly/flaky

const RESOLVE = 'Resolve paths first: REPO = `git rev-parse --show-toplevel`. PROJECT_DIR = "' + PROJECT + '" if absolute, else REPO + "/" + "' + PROJECT + '". SKILL = REPO/dev-skills/public/traceability-review/SKILL.md and REPO/dev-skills/public/traceability-review/references/pass-notes.md.'

const SCOPE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    modules: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { name: { type: 'string' }, rows: { type: 'integer' } }, required: ['name', 'rows'] } },
    totalRows: { type: 'integer' },
  }, required: ['modules', 'totalRows'],
}

const MATRIX_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    pass: { type: 'string' }, summary: { type: 'string' },
    rows: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { id: { type: 'string' }, verdict: { type: 'string' }, evidence: { type: 'string' } }, required: ['id', 'verdict', 'evidence'] } },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { id: { type: 'string' }, severity: { type: 'string' }, detail: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'detail'] } },
    openQuestions: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { detail: { type: 'string' }, resolvingLayer: { type: 'string' } }, required: ['detail', 'resolvingLayer'] } },
  }, required: ['pass', 'summary', 'rows', 'findings', 'openQuestions'],
}

const LEDGER_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { source: { type: 'string' }, kind: { type: 'string' }, severity: { type: 'string' }, resolvingLayer: { type: 'string' }, note: { type: 'string' } }, required: ['source', 'kind', 'severity', 'resolvingLayer', 'note'] } },
    rollup: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { layer: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }, required: ['layer', 'items'] } },
    threads: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { theme: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }, required: ['theme', 'items'] } },
  }, required: ['summary', 'items', 'rollup', 'threads'],
}

// --- phase 1: scope (cheap) — list modules, estimate per-module size ---------
phase('Scope')
log('Scoping ' + PROJECT + (MODULE ? ' / ' + MODULE : ' (whole)'))
const scope = await agent(
  RESOLVE + '\n\nList this project\'s modules and CHEAPLY estimate each one\'s size — do NOT extract full text or run passes. Read the module responsibility map under PROJECT_DIR/docs/ to get the module list; for each module count (grep -c, not extraction): ADR Decision/Rules bullets in its ADRs + behavior clauses in its specs + relevant test titles. Return { modules: [{name, rows}], totalRows } where rows = that sum. If the project is a single module, return just that one.',
  { label: 'scope', phase: 'Scope', schema: SCOPE_SCHEMA }
)

// --- gate: pick the run target, or refuse a too-big whole-project run --------
const norm = (x) => String(x || '').trim().toLowerCase()
let target
if (MODULE) {
  const hit = scope.modules.find(m => norm(m.name) === norm(MODULE))
  if (!hit) throw new Error('Module "' + MODULE + '" not found in ' + PROJECT + '. Modules: ' + scope.modules.map(m => m.name).join(', '))
  target = hit
} else if (scope.modules.length > 1) {
  return {                                  // whole multi-module project: too big — return the slice plan, don't run
    project: PROJECT, status: 'sliceplan-too-big',
    message: PROJECT + ' has ' + scope.modules.length + ' modules (~' + scope.totalRows + ' rows). Too big for one run — pick a module: /traceability-review ' + PROJECT + ' on "<Module>"',
    modules: scope.modules,
  }
} else {
  target = scope.modules[0]                 // single-module project: run it whole
}
if (target.rows > ROW_WARN) log('WARNING: "' + target.name + '" is large (~' + target.rows + ' rows) — high token cost and may exceed one run.')

// --- phase 2: slice (the chosen module) --------------------------------------
phase('Slice')
log('Slicing "' + target.name + '"')
const slice = await agent(
  RESOLVE + '\n\nApply the traceability-review skill (read SKILL + pass-notes). Build a COMPACT slice for module "' + target.name + '" of PROJECT_DIR; return tight MARKDOWN, no preamble.\n' +
  'Discovery (find files yourself): the module responsibility map under PROJECT_DIR/docs/ maps ADRs to the module. Layout is module-decomposed: ADRs in PROJECT_DIR/docs/adr/, specs in PROJECT_DIR/docs/specs/, intents are the per-role story files + product intent in PROJECT_DIR/docs/, tests in PROJECT_DIR/tests/. Read the module\'s ADRs/specs/intents/map ONCE; grep /(it|test|describe)\\(/ for TITLES across ALL test files (NEVER read bodies, NEVER run tests).\n' +
  'Sections:\n## adrRows — every Decision sentence + Rules/Invariants bullet, one per line `adr:line | decision|rule | text`, no folding.\n## specClauses — `spec:line | text`.\n## testTitles — in-scope `file | title`; shared-transport (session/CSRF/fault/rate-limit/cookie/redaction) `file | title | shared`; unrelated as one-line `out-of-scope: file=count` tally.\n## intentExcerpts — `ID file:line | story + acceptance signal`.\nBe complete on adrRows/specClauses/intentExcerpts/in-scope+shared titles.',
  { label: 'slice:' + target.name, phase: 'Slice' }
)

// --- phase 3: passes ---------------------------------------------------------
phase('Passes')
const tail = '\n\n' + RESOLVE + ' Read this pass\'s section of SKILL + pass-notes. Work ONLY from the SLICE below — do not read the repo. Return the schema JSON only.\nSLICE:\n' + slice
const PASSES = [
  { id: 'adr-spec', instr: 'PASS ADR->spec. One row per adrRow (id=ref). verdict {honoured,contradicted,missing,deferred}; evidence cites specClauses. A decision another module owns is "deferred (owned by <module>)", not missing. deferred otherwise only with an authorizing spec scoping/Non-Goal line.' },
  { id: 'spec-tests', instr: 'PASS spec<->tests, NAMES ONLY, using slice testTitles. One row per specClause (id=ref). verdict {covered,covered-shared,untested}. covered=in-scope title names it. covered-shared=shared title names it (cite). untested(warning,record as finding)=no in-scope and no shared title. Negative/"does-not" guarantees with no naming test -> openQuestions.' },
  { id: 'orphan', instr: 'PASS upward-orphan. One row per adrRow (id=ref). verdict {traced,derived,carried-shape,ORPHAN}; evidence=intentExcerpt id+ref or derivation parent. Only ORPHAN is load-bearing; the rest ADVISORY. Unsure derived-vs-ORPHAN -> openQuestions, never forced ORPHAN.' },
]
const passOut = (await parallel(PASSES.map(p => () =>
  agent(p.instr + tail, { label: 'pass:' + p.id, phase: 'Passes', schema: MATRIX_SCHEMA })
))).filter(Boolean)

// --- phase 4: umbrella -------------------------------------------------------
phase('Umbrella')
log('Aggregating ' + passOut.length + ' pass outputs')
const ledger = await agent(
  'Aggregate these per-pass JSON outputs for module "' + target.name + '" into the umbrella ledger (one item per finding/open-question linked to (pass,item id); NO new findings; resolving-layer rollup + threads). ' + RESOLVE + ' Return the schema JSON only.\n\n' + JSON.stringify(passOut),
  { label: 'umbrella:' + target.name, phase: 'Umbrella', schema: LEDGER_SCHEMA }
)

return { project: PROJECT, module: target.name, rows: target.rows, passes: passOut, ledger }
