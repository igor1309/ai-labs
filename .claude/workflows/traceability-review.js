export const meta = {
  name: 'traceability-review',
  description: 'Traceability review as a workflow — ONE module per run (token budget). args: {projectRoot, module, skillDir?}. Slice (discovery-located, markdown) -> passes adr-spec/spec-tests/orphan (JSON) -> umbrella (JSON).',
  phases: [
    { title: 'Slice', detail: 'locate the module from the responsibility map; read its inputs once; grep test titles, label scope' },
    { title: 'Passes', detail: 'adr-spec, spec-tests, orphan — JSON, from the slice only' },
    { title: 'Umbrella', detail: 'aggregate findings + open questions' },
  ],
}

// --- input (args-driven; no hardcoded project/module) ------------------------
const cfg = (typeof args !== 'undefined' && args) || {}
const PROJECT = cfg.projectRoot
const MODULE = cfg.module
if (!PROJECT || !MODULE) {
  throw new Error('traceability-review needs args.projectRoot and args.module — one module per run (a whole-project run exceeds the session token budget). Run the slice-plan ask first to list modules, then fire this per module.')
}
// Default: the skill lives in this repo as a sibling of the project dir; override with args.skillDir for other installs.
const SKILL_DIR = cfg.skillDir || (PROJECT.replace(/\/[^/]+\/?$/, '') + '/dev-skills/public/traceability-review')
const SKILL = SKILL_DIR + '/SKILL.md'
const NOTES = SKILL_DIR + '/references/pass-notes.md'

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

// --- phase 1: slice (discovery-located; the agent finds the module's files) --
phase('Slice')
log('Locating and slicing module "' + MODULE + '" under ' + PROJECT)
const slice = await agent(
  'Apply the traceability-review skill (method: ' + SKILL + ' and ' + NOTES + '). Build a COMPACT slice for ONE module of a My-Way project and return tight MARKDOWN (no preamble).\n' +
  'PROJECT_ROOT: ' + PROJECT + '\nMODULE: ' + MODULE + '\n\n' +
  'Discovery (find the files yourself — nothing is hardcoded): read the module responsibility map under PROJECT_ROOT/docs/ to confirm MODULE and learn which ADRs accept it (the map\'s emerging-direction text maps ADRs to modules). The layout is module-decomposed — ADRs in PROJECT_ROOT/docs/adr/, specs in PROJECT_ROOT/docs/specs/ named by module, intents are the per-role story files + the product intent in PROJECT_ROOT/docs/, tests in PROJECT_ROOT/tests/.\n' +
  'Read MODULE\'s ADRs, specs, intents, and the map ONCE. Grep /(it|test|describe)\\(/ for TITLES across ALL test files (NEVER read bodies, NEVER run tests).\n\n' +
  'Emit sections:\n' +
  '## adrRows — every Decision sentence and Rules/Invariants bullet across the module\'s ADRs, one per line: `adr:line | decision|rule | verbatim text`. No folding.\n' +
  '## specClauses — every numbered behavior clause in the module\'s specs: `spec:line | text`.\n' +
  '## testTitles — every IN-SCOPE title as `file | title`; every SHARED-TRANSPORT title (session/CSRF/fault/rate-limit/cookie/redaction) from any file as `file | title | shared`; unrelated titles as a one-line `out-of-scope: file=count` tally (do not list them).\n' +
  '## intentExcerpts — the module\'s source stories with `ID file:line | story + acceptance signal`.\n' +
  'Be complete on adrRows, specClauses, intentExcerpts, and the in-scope/shared titles.',
  { label: 'slice:' + MODULE, phase: 'Slice' }
)

// --- phase 2: passes (fan out; work only from the slice) ---------------------
phase('Passes')
const tail = '\n\nMethod: ' + SKILL + ' + ' + NOTES + ' (this pass\'s section authoritative). Work ONLY from the SLICE below — do not read the repo. Return the schema JSON only.\nSLICE:\n' + slice
const PASSES = [
  { id: 'adr-spec', instr: 'PASS ADR->spec. One row per adrRow (id = ref). verdict in {honoured, contradicted, missing, deferred}; evidence cites specClauses. A decision another module owns is "deferred (owned by <module>)", not missing. deferred otherwise only with an authorizing spec scoping/Non-Goal line (cite it).' },
  { id: 'spec-tests', instr: 'PASS spec<->tests, NAMES ONLY, using the slice testTitles. One row per specClause (id = ref). verdict in {covered, covered-shared, untested}. covered = an in-scope title names it. covered-shared = shared transport named by a `shared` title — cite it. untested (severity warning, record as a finding) = NO in-scope and NO shared title names it. Backward: every in-scope title traces to a clause else orphan(warning); out-of-scope titles are not orphan. Negative/"does-not" guarantees with no naming test -> openQuestions, not forced untested.' },
  { id: 'orphan', instr: 'PASS upward-orphan. One row per adrRow (id = ref). verdict in {traced, derived, carried-shape, ORPHAN}; evidence = intentExcerpt id+ref or derivation parent. ORPHAN is the only load-bearing verdict; traced/derived/carried-shape are ADVISORY. Decisions a downstream/other module realizes still trace to their source intent. Unsure derived-vs-ORPHAN -> openQuestions, never forced ORPHAN.' },
]
const passOut = (await parallel(PASSES.map(p => () =>
  agent(p.instr + tail, { label: 'pass:' + p.id, phase: 'Passes', schema: MATRIX_SCHEMA })
))).filter(Boolean)

// --- phase 3: umbrella reduce ------------------------------------------------
phase('Umbrella')
log('Aggregating ' + passOut.length + ' pass outputs into the umbrella ledger')
const ledger = await agent(
  'Aggregate these per-pass JSON outputs for the "' + MODULE + '" module into the umbrella ledger per ' + SKILL + ' + ' + NOTES + ' (umbrella section). One ledger item per finding and per open question, linked to (pass, item id) — introduce NO new findings. Provide the resolving-layer rollup and threads. Return the schema JSON only.\n\n' +
  JSON.stringify(passOut),
  { label: 'umbrella:' + MODULE, phase: 'Umbrella', schema: LEDGER_SCHEMA }
)

return { project: PROJECT, module: MODULE, passes: passOut, ledger }
