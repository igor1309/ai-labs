"""Shared core for the sessions-audit tools.

Agent-neutral pieces live here: detection regexes, per-session counters and
score, the per-file behavior tracker (reads, builds, polling, checks, skills,
subagents, results), aggregation, time-window filtering, project grouping,
text output, the versioned JSON emitter, and the CLI.

Agent-specific discovery and record parsing live in `claude_parser.py` and
`codex_parser.py`. Python 3 standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, TextIO

SCHEMA_VERSION = 1

RAW_BUILD = re.compile(r"(^|[\s;&(])(xcodebuild\b|swift\s+(?:build|test)\b)")
BUILD_FILTER = re.compile(r"xcsift|xcbeautify|xcpretty|\s-quiet\b")
POLLING = re.compile(r"(?:^|[;&|]\s*)sleep\b|\b(?:watch|gh\s+run\s+watch|gh\s+pr\s+checks\s+--watch)\b")
CHECK_COMMAND = re.compile(r"\b(?:gh\s+(?:run\s+view|pr\s+checks)|curl|wget)\b")
SKILL_IN_COMMAND = re.compile(r"(?:^|\s)([^\s'\"]*SKILL\.md)(?:\s|$)")

COUNTERS = (
    "tool_calls", "full_reads", "repeated_reads", "builds", "unfiltered_builds",
    "polling_candidates", "repeated_checks", "skill_loads", "duplicate_skill_loads",
    "subagents", "large_results", "result_chars", "parse_errors",
)
TOKEN_KEYS = ("input", "cached", "cache_creation", "output", "reasoning")
UNKNOWN_PROJECT = "(unknown)"


def empty_tokens() -> dict[str, int]:
    return {k: 0 for k in TOKEN_KEYS}


# --------------------------------------------------------------------------
# Small helpers shared by both parsers


def text_size(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, str):
        return len(value)
    try:
        return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    except Exception:
        return len(str(value))


def norm_path(path: str, cwd: str | None) -> str:
    p = Path(os.path.expanduser(path))
    if not p.is_absolute() and cwd:
        p = Path(cwd) / p
    try:
        return str(p.resolve(strict=False))
    except Exception:
        return str(p)


def iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                yield {"__parse_error__": True}
                continue
            if isinstance(value, dict):
                yield value


def skill_in_command(command: str | None) -> str | None:
    if command:
        m = SKILL_IN_COMMAND.search(command)
        if m:
            return m.group(1)
    return None


# --------------------------------------------------------------------------
# Per-session state


@dataclass
class SessionStats:
    agent: str
    path: str
    mtime: float = 0.0
    cwd: str | None = None
    project: str = UNKNOWN_PROJECT
    tool_calls: int = 0
    full_reads: int = 0
    repeated_reads: int = 0
    builds: int = 0
    unfiltered_builds: int = 0
    polling_candidates: int = 0
    repeated_checks: int = 0
    skill_loads: int = 0
    duplicate_skill_loads: int = 0
    subagents: int = 0
    large_results: int = 0
    result_chars: int = 0
    largest_result_chars: int = 0
    parse_errors: int = 0
    tokens: dict[str, int] = field(default_factory=empty_tokens)
    extras: dict[str, Any] = field(default_factory=dict)
    subagent_models: Counter = field(default_factory=Counter)
    tool_names: Counter = field(default_factory=Counter)

    @property
    def score(self) -> int:
        return score_of(self)


def score_of(c: Any) -> int:
    get = c.get if isinstance(c, dict) else lambda k, d=0: getattr(c, k, d)
    return (
        get("repeated_reads", 0) * 4
        + get("unfiltered_builds", 0) * 5
        + get("duplicate_skill_loads", 0) * 3
        + get("repeated_checks", 0) * 3
        + get("large_results", 0) * 2
        + get("full_reads", 0)
    )


class Tracker:
    """Behavior counters shared by both parsers.

    Parsers translate their records into these calls, in the order their
    original rules require; the counting logic itself is identical.
    """

    def __init__(self, stats: SessionStats, large_result_threshold: int) -> None:
        self.s = stats
        self.threshold = large_result_threshold
        self.file_revision: defaultdict[str, int] = defaultdict(int)
        self.last_read_revision: dict[str, int] = {}
        self.skill_counts: Counter[str] = Counter()
        self.pending: dict[str, str] = {}
        self.last_check: str | None = None

    def tool(self, name: str, call_id: str | None) -> None:
        self.s.tool_calls += 1
        self.s.tool_names[name] += 1
        if call_id:
            self.pending[call_id] = name

    def edit(self, normalized_path: str) -> None:
        self.file_revision[normalized_path] += 1

    def read(self, normalized_path: str, full: bool) -> None:
        if full:
            self.s.full_reads += 1
        rev = self.file_revision[normalized_path]
        if self.last_read_revision.get(normalized_path) == rev:
            self.s.repeated_reads += 1
        self.last_read_revision[normalized_path] = rev

    def command(self, cmd: str) -> None:
        if RAW_BUILD.search(cmd):
            self.s.builds += 1
            if not BUILD_FILTER.search(cmd):
                self.s.unfiltered_builds += 1
        if POLLING.search(cmd):
            self.s.polling_candidates += 1
        if CHECK_COMMAND.search(cmd):
            normalized = re.sub(r"\s+", " ", cmd.strip())
            if normalized == self.last_check:
                self.s.repeated_checks += 1
            self.last_check = normalized
        else:
            self.last_check = None

    def skill(self, name: str | None) -> None:
        if not name:
            return
        self.s.skill_loads += 1
        self.skill_counts[name] += 1
        if self.skill_counts[name] > 1:
            self.s.duplicate_skill_loads += 1

    def subagent(self, inp: Any) -> None:
        self.s.subagents += 1
        model = inp.get("model") if isinstance(inp, dict) else None
        self.s.subagent_models[str(model or "unspecified")] += 1

    def result(self, content: Any) -> None:
        n = text_size(content)
        self.s.result_chars += n
        self.s.largest_result_chars = max(self.s.largest_result_chars, n)
        if n >= self.threshold:
            self.s.large_results += 1


# --------------------------------------------------------------------------
# Time window


def parse_when(value: str, now: datetime | None = None) -> datetime:
    """Parse `YYYY-MM-DD` (local midnight) or ISO 8601 (naive = local time)."""
    value = value.strip()
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            d = date.fromisoformat(value)
            dt = datetime(d.year, d.month, d.day)
        else:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00") if value.endswith("Z") else value)
    except ValueError as e:
        raise argparse.ArgumentTypeError(f"invalid date/datetime {value!r}: expected YYYY-MM-DD or ISO 8601") from e
    if dt.tzinfo is None:
        dt = dt.astimezone()  # interpret naive as local time
    return dt


@dataclass
class Window:
    since: datetime | None = None
    until: datetime | None = None

    def contains(self, mtime: float) -> bool:
        if self.since is not None and mtime < self.since.timestamp():
            return False
        if self.until is not None and mtime >= self.until.timestamp():
            return False
        return True

    def to_json(self) -> dict[str, Any]:
        return {
            "since": iso_utc(self.since) if self.since else None,
            "until": iso_utc(self.until) if self.until else None,
            "basis": "file_mtime",
        }


def build_window(days: int | None, since: str | None, until: str | None, now: datetime) -> Window:
    w = Window()
    if days is not None:
        if days < 0:
            raise argparse.ArgumentTypeError(f"--days must be >= 0, got {days}")
        try:
            w.since = now - timedelta(days=days)
        except (OverflowError, ValueError) as e:
            raise argparse.ArgumentTypeError(f"--days {days} is out of range") from e
    elif since is not None:
        w.since = parse_when(since)
    if until is not None:
        w.until = parse_when(until)
    return w


def iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def filter_by_window(paths: Iterable[Path], window: Window) -> list[tuple[Path, float]]:
    out: list[tuple[Path, float]] = []
    for p in paths:
        try:
            mtime = p.stat().st_mtime
        except OSError:
            continue
        if window.contains(mtime):
            out.append((p, mtime))
    return out


# --------------------------------------------------------------------------
# Project resolution (git repo root, no subprocess)

_project_cache: dict[str, str] = {}


def _main_root_from_gitfile(repo_dir: Path, gitfile: Path) -> Path:
    try:
        text = gitfile.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return repo_dir
    m = re.search(r"^gitdir:\s*(.+?)\s*$", text, re.M)
    if not m:
        return repo_dir
    gitdir = Path(m.group(1))
    if not gitdir.is_absolute():
        gitdir = repo_dir / gitdir
    gitdir = Path(os.path.normpath(gitdir))
    common: Path | None = None
    commondir = gitdir / "commondir"
    try:
        if commondir.is_file():
            c = Path(commondir.read_text(encoding="utf-8", errors="replace").strip())
            common = Path(os.path.normpath(c if c.is_absolute() else gitdir / c))
    except OSError:
        common = None
    if common is None and gitdir.parent.name == "worktrees":
        common = gitdir.parent.parent
    if common is None:
        return repo_dir  # e.g. a submodule: its own checkout is the project
    return common.parent if common.name == ".git" else common


def _canonical(path: Path) -> Path:
    try:
        return path.resolve(strict=False)
    except (OSError, RuntimeError):
        return Path(os.path.normpath(path))


def resolve_project(cwd: str | None) -> str:
    """Git repository root containing `cwd` (main root for linked worktrees).

    An existing cwd is canonicalized (symlinks resolved) before the walk, and
    the root found is canonicalized too, so symlink aliases of one repository
    group together. A cwd that does not exist here is only normpath'ed.
    """
    if not cwd:
        return UNKNOWN_PROJECT
    if cwd in _project_cache:
        return _project_cache[cwd]
    start = Path(os.path.expanduser(cwd))
    if start.is_dir():
        start = _canonical(start)
        result = str(start)
        for d in (start, *start.parents):
            g = d / ".git"
            if g.is_dir():
                result = str(_canonical(d))
                break
            if g.is_file():
                result = str(_canonical(_main_root_from_gitfile(d, g)))
                break
    else:
        result = os.path.normpath(cwd)
    _project_cache[cwd] = result
    return result


# --------------------------------------------------------------------------
# Aggregation


def sum_counters(items: Iterable[Any]) -> dict[str, Any]:
    totals: dict[str, Any] = {"sessions": 0, **{k: 0 for k in COUNTERS}}
    tokens = empty_tokens()
    for s in items:
        get = s.get if isinstance(s, dict) else lambda k, d=0, s=s: getattr(s, k, d)
        totals["sessions"] += get("sessions", 1)
        for k in COUNTERS:
            totals[k] += get(k, 0)
        for k in TOKEN_KEYS:
            tokens[k] += get("tokens", {}).get(k, 0)
    totals["score"] = score_of(totals)
    totals["tokens"] = tokens
    return totals


def aggregate(items: list[SessionStats]) -> dict[str, Any]:
    models: Counter = Counter()
    tools: Counter = Counter()
    for s in items:
        models.update(s.subagent_models)
        tools.update(s.tool_names)
    return {
        "totals": sum_counters(items),
        "subagent_models": dict(models),
        "top_tools": [list(x) for x in tools.most_common(15)],
    }


def by_project(items: list[SessionStats]) -> list[dict[str, Any]]:
    groups: dict[str, list[SessionStats]] = {}
    for s in items:
        groups.setdefault(s.project, []).append(s)
    rows = [{"project": k, **sum_counters(v)} for k, v in groups.items()]
    rows.sort(key=lambda r: (-r["score"], -r["sessions"], r["project"]))
    return rows


def total_tokens(tokens: dict[str, int]) -> int:
    return tokens["input"] + tokens["cached"] + tokens["cache_creation"] + tokens["output"]


# --------------------------------------------------------------------------
# Agents


@dataclass
class AgentResult:
    name: str
    title: str
    source: dict[str, Any]
    items: list[SessionStats]
    extras: dict[str, Any]
    extra_lines: list[str]


def _adapters() -> dict[str, Any]:
    here = str(Path(__file__).resolve().parent)
    if here not in sys.path:
        sys.path.insert(0, here)
    import claude_parser
    import codex_parser

    return {"claude": claude_parser, "codex": codex_parser}


def run_agent(adapter: Any, source_arg: Any, window: Window, threshold: int, **kw: Any) -> AgentResult:
    paths = adapter.discover(source_arg, **kw)
    items: list[SessionStats] = []
    for p, mtime in filter_by_window(paths, window):
        s = adapter.analyze(p, threshold)
        s.mtime = mtime
        s.project = resolve_project(s.cwd)
        items.append(s)
    extras = adapter.aggregate_extras(items)
    return AgentResult(
        name=adapter.NAME,
        title=adapter.TITLE,
        source=adapter.source_info(source_arg, **kw),
        items=items,
        extras=extras,
        extra_lines=adapter.extra_lines(extras),
    )


# --------------------------------------------------------------------------
# Output


def session_json(s: SessionStats) -> dict[str, Any]:
    out: dict[str, Any] = {
        "agent": s.agent,
        "path": s.path,
        "mtime": iso_utc(datetime.fromtimestamp(s.mtime, timezone.utc)),
        "cwd": s.cwd,
        "project": s.project,
        "score": s.score,
    }
    for k in COUNTERS:
        out[k] = getattr(s, k)
    out["largest_result_chars"] = s.largest_result_chars
    out["tokens"] = dict(s.tokens)
    out["extras"] = s.extras
    return out


def build_json(
    results: list[AgentResult], window: Window, threshold: int, top: int,
    group_by_project: bool, now: datetime,
) -> dict[str, Any]:
    agents: dict[str, Any] = {}
    for r in results:
        a = aggregate(r.items)
        block: dict[str, Any] = {
            "source": r.source,
            "totals": a["totals"],
            "extras": r.extras,
            "subagent_models": a["subagent_models"],
            "top_tools": a["top_tools"],
        }
        if group_by_project:
            block["by_project"] = by_project(r.items)
        block["sessions"] = [session_json(s) for s in r.items]
        agents[r.name] = block
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": iso_utc(now),
        "window": window.to_json(),
        "options": {"large_result_chars": threshold, "top": top},
        "agents": agents,
        "totals": sum_counters(b["totals"] for b in agents.values()),
    }


def fmt_tokens(t: dict[str, int]) -> str:
    return (
        f"input={t['input']:,} cached={t['cached']:,} cache-create={t['cache_creation']:,} "
        f"output={t['output']:,} reasoning={t['reasoning']:,} total={total_tokens(t):,}"
    )


def print_text(
    results: list[AgentResult], threshold: int, top: int, group_by_project: bool,
    out: TextIO,
) -> None:
    def p(line: str = "") -> None:
        print(line, file=out)

    for i, r in enumerate(results):
        if i:
            p()
        a = aggregate(r.items)
        t = a["totals"]
        p(f"{r.title} session audit")
        p(f"sessions: {t['sessions']:,}  tool calls: {t['tool_calls']:,}  parse errors: {t['parse_errors']:,}  score: {t['score']:,}")
        p(f"reads: full/default {t['full_reads']:,}, repeated-without-edit {t['repeated_reads']:,}")
        p(
            f"builds: {t['builds']:,}, unfiltered {t['unfiltered_builds']:,}  |  "
            f"polling candidates {t['polling_candidates']:,}, repeated checks {t['repeated_checks']:,}"
        )
        p(
            f"skills: loads {t['skill_loads']:,}, duplicate loads {t['duplicate_skill_loads']:,}  |  "
            f"subagents {t['subagents']:,}"
        )
        p(f"large tool results: {t['large_results']:,} (>= {threshold:,} chars)")
        p(f"tokens (normalized): {fmt_tokens(t['tokens'])}")
        for line in r.extra_lines:
            p(line)
        if a["subagent_models"]:
            p("subagent models: " + ", ".join(f"{k}={v}" for k, v in sorted(a["subagent_models"].items())))

        if group_by_project:
            rows = by_project(r.items)
            if rows:
                p(f"\nBy project ({min(top, len(rows))} of {len(rows)}):")
                p(f"  {'score':>6} {'sess':>5} {'tools':>6} {'full':>5} {'rep':>4} {'rawb':>4} {'poll':>4} {'chk':>4} {'dupsk':>5} {'large':>5} {'tokens':>14}  project")
                for row in rows[:top]:
                    p(
                        f"  {row['score']:6d} {row['sessions']:5d} {row['tool_calls']:6d} {row['full_reads']:5d} "
                        f"{row['repeated_reads']:4d} {row['unfiltered_builds']:4d} {row['polling_candidates']:4d} "
                        f"{row['repeated_checks']:4d} {row['duplicate_skill_loads']:5d} {row['large_results']:5d} "
                        f"{total_tokens(row['tokens']):14,d}  {row['project']}"
                    )

        ranked = sorted(r.items, key=lambda x: (x.score, x.result_chars), reverse=True)[:top]
        if ranked:
            p("\nHighest-signal sessions:")
            for s in ranked:
                p(
                    f"  score={s.score:4d} repeat_reads={s.repeated_reads:3d} raw_builds={s.unfiltered_builds:3d} "
                    f"dup_skills={s.duplicate_skill_loads:3d} large_results={s.large_results:3d}  {s.path}"
                )

    if len(results) > 1:
        c = sum_counters(aggregate(r.items)["totals"] for r in results)
        p()
        p(
            f"Combined: sessions {c['sessions']:,}  tool calls {c['tool_calls']:,}  score {c['score']:,}  "
            f"tokens {fmt_tokens(c['tokens'])}"
        )


# --------------------------------------------------------------------------
# CLI


def default_claude_root() -> Path:
    return Path(os.environ.get("CLAUDE_CONFIG_DIR", "~/.claude")).expanduser() / "projects"


def default_codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME", "~/.codex")).expanduser()


def add_common_args(parser: argparse.ArgumentParser) -> None:
    window = parser.add_mutually_exclusive_group()
    window.add_argument("--days", type=int, default=None, help="Only transcripts modified in the last N days (exclusive with --since)")
    window.add_argument("--since", default=None, help="Only transcripts modified at/after this time: YYYY-MM-DD (local midnight) or ISO 8601 (naive = local)")
    parser.add_argument("--until", default=None, help="Only transcripts modified before this time (exclusive); YYYY-MM-DD means the start of that day")
    parser.add_argument("--top", type=int, default=15, help="Number of high-signal sessions/projects to print")
    parser.add_argument("--large-result-chars", type=int, default=20_000, help="Threshold for a large tool result")
    parser.add_argument("--by-project", action="store_true", help="Group sessions by git repository root of their cwd")
    parser.add_argument("--json", action="store_true", help="Emit versioned machine-readable JSON")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sessions-audit",
        description="Audit local Claude Code and Codex transcripts for context-expanding behavior.",
    )
    sub = parser.add_subparsers(dest="agent", required=True, metavar="{claude,codex,all}")
    for name, help_text in (
        ("claude", "Claude Code transcripts"),
        ("codex", "Codex rollouts"),
        ("all", "both agents; a missing root is a warning and that agent is skipped"),
    ):
        sp = sub.add_parser(name, help=help_text)
        if name in ("claude", "all"):
            sp.add_argument("--claude-root", type=Path, default=default_claude_root(), help="Claude projects/transcript root")
        if name in ("codex", "all"):
            sp.add_argument("--codex-home", type=Path, default=default_codex_home(), help="CODEX_HOME")
            sp.add_argument("--active-only", action="store_true", help="Skip Codex archived_sessions")
        add_common_args(sp)
    return parser


def execute(
    parser: argparse.ArgumentParser, args: argparse.Namespace, agents: list[str],
    now: datetime | None = None, out: TextIO | None = None, err: TextIO | None = None,
) -> int:
    out = out or sys.stdout
    err = err or sys.stderr
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.astimezone()
    try:
        window = build_window(args.days, args.since, args.until, now)
    except argparse.ArgumentTypeError as e:
        parser.error(str(e))

    adapters = _adapters()
    lenient = len(agents) > 1
    results: list[AgentResult] = []
    for name in agents:
        adapter = adapters[name]
        if name == "claude":
            source = args.claude_root.expanduser()
            kw: dict[str, Any] = {}
            missing = f"transcript root does not exist: {source}"
        else:
            source = args.codex_home.expanduser()
            kw = {"active_only": bool(getattr(args, "active_only", False))}
            missing = f"CODEX_HOME does not exist: {source}"
        if not source.exists():
            if lenient:
                print(f"warning: {name}: {missing}; skipping", file=err)
                continue
            parser.error(missing)
        results.append(run_agent(adapter, source, window, args.large_result_chars, **kw))

    if not results:
        parser.error("no agent transcript roots found")

    if args.json:
        payload = build_json(results, window, args.large_result_chars, args.top, args.by_project, now)
        json.dump(payload, out, indent=2)
        print(file=out)
    else:
        print_text(results, args.large_result_chars, args.top, args.by_project, out)
    return 0


def main(argv: list[str] | None = None, now: datetime | None = None,
         out: TextIO | None = None, err: TextIO | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    agents = ["claude", "codex"] if args.agent == "all" else [args.agent]
    return execute(parser, args, agents, now=now, out=out, err=err)
