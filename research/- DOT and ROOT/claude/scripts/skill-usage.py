#!/usr/bin/env python3
"""Report which skills were and were not used, per project, over a time window.

Two independent sources, kept as separate columns because they mean different
things:

  invoked  - the model called the Skill tool.   ~/.claude/projects/*/*.jsonl
  typed    - the user typed /name at the prompt. ~/.claude/history.jsonl
             (slash-command expansions are NOT written to the transcripts,
             so this is the only source for them)

The denominator is the union of names seen in `skill_listing` attachments,
which is the roster actually offered to the model - it includes built-ins and
commands that have no SKILL.md on disk.
"""

import argparse
import datetime as dt
import fnmatch
import glob
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

HOME = os.path.expanduser("~")
PROJECTS = os.path.join(HOME, ".claude", "projects")
HISTORY = os.path.join(HOME, ".claude", "history.jsonl")
SETTINGS = os.path.join(HOME, ".claude", "settings.json")

INSTALLED_PLUGINS = os.path.join(HOME, ".claude", "plugins", "installed_plugins.json")

SKILL_ROOTS = [
    ("user", os.path.join(HOME, ".claude", "skills")),
    ("project", os.path.join(HOME, "Developer/Fora/iFora/iOS-app/ios.config/.claude/skills")),
]

LISTING_LINE = re.compile(r"^-\s+([^\s:]+(?::[^\s:]+)?):?(?:\s|$)")
SLUG_CHARS = re.compile(r"[^A-Za-z0-9]")


def slugify(path):
    """Project path -> the directory name Claude Code uses under projects/."""
    return SLUG_CHARS.sub("-", path)


def parse_ts(value):
    """ISO-8601 with Z -> aware datetime, or None."""
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def iso(moment):
    return moment.isoformat(timespec="seconds") if moment else None


def load_settings():
    """deny globs, name-only overrides, disabled plugins."""
    denied, name_only, plugins_off, retention = [], set(), set(), 30
    try:
        with open(SETTINGS) as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return denied, name_only, plugins_off, retention
    retention = data.get("cleanupPeriodDays", 30)
    for rule in data.get("permissions", {}).get("deny", []):
        match = re.fullmatch(r"Skill\((.+)\)", rule)
        if match:
            denied.append(match.group(1))
    for name, mode in (data.get("skillOverrides") or {}).items():
        if mode == "name-only":
            name_only.add(name)
    for key, enabled in (data.get("enabledPlugins") or {}).items():
        if not enabled:
            plugins_off.add(key.split("@")[0])
    return denied, name_only, plugins_off, retention


def git_added(path):
    """When the file was first committed. Filesystem birthtime is useless here -
    a worktree checkout or a config symlink sync resets it - and first_listed is
    bounded by transcript retention, so git is the only honest creation date."""
    try:
        result = subprocess.run(
            ["git", "-C", os.path.dirname(path), "log", "--diff-filter=A",
             "--format=%at", "-1", "--", path],
            capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    stamp = result.stdout.strip().splitlines()
    if result.returncode != 0 or not stamp:
        return None
    try:
        return dt.datetime.fromtimestamp(int(stamp[0]), dt.timezone.utc)
    except ValueError:
        return None


def model_invocable(path):
    """`disable-model-invocation: true` in the frontmatter means the skill is
    reachable only by the user typing /name - it is deliberately absent from the
    model's roster, so its usage lives entirely in the `typed` column."""
    try:
        with open(path, errors="replace") as handle:
            head = handle.read(2048)
    except OSError:
        return True
    return not re.search(r"^disable-model-invocation:\s*true\s*$", head, re.M)


def record(found, name, source, path):
    if name in found:
        return
    stat = os.stat(path)
    born = dt.datetime.fromtimestamp(getattr(stat, "st_birthtime", stat.st_mtime), dt.timezone.utc)
    found[name] = (source, path, git_added(path) or born, model_invocable(path))


def installed_plugin_skills(found):
    """Only plugins actually installed - plugins/marketplaces/ is a browsable
    catalog, and counting it would report skills that were never available."""
    try:
        with open(INSTALLED_PLUGINS) as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return
    for key, installs in (data.get("plugins") or {}).items():
        prefix = key.split("@")[0]
        for install in installs:
            root = install.get("installPath")
            if not root:
                continue
            # two layouts in the wild: <install>/skills/<name>/ and <install>/<name>/
            paths = glob.glob(os.path.join(root, "skills", "*", "SKILL.md"))
            paths += glob.glob(os.path.join(root, "*", "SKILL.md"))
            for path in paths:
                name = os.path.basename(os.path.dirname(path))
                record(found, f"{prefix}:{name}", f"plugin:{prefix}", path)


def disk_inventory():
    """name -> (source, path, created). Plugin skills carry their `plugin:`
    prefix so they line up with how the roster and the Skill tool name them."""
    found = {}
    for source, root in SKILL_ROOTS:
        for path in glob.glob(os.path.join(root, "**", "SKILL.md"), recursive=True):
            record(found, os.path.basename(os.path.dirname(path)), source, path)
    installed_plugin_skills(found)
    return found


def canonicalise(name, on_disk):
    """The same skill surfaces under several names - bare, `plugin:name`, and
    `dir:name` when it is directory-scoped. Fold them onto whichever name has a
    file on disk, or the counts split and every alias reads as never-used."""
    if name in on_disk:
        return name
    bare = name.split(":")[-1]
    if bare in on_disk:
        return bare
    matches = [k for k in on_disk if k.split(":")[-1] == bare]
    return matches[0] if len(matches) == 1 else name


def scan_transcripts(counters, on_disk):
    """Walk every transcript; fill invocation counters and the listing roster."""
    stats = {"files": 0, "lines_parsed": 0, "parse_errors": 0}
    oldest = newest = oldest_top = None
    listed_first = {}
    listed_last = {}
    invoked = defaultdict(lambda: defaultdict(lambda: {"main": 0, "sub": 0}))
    last_invoked = {}

    # recursive: subagent transcripts sit one level deeper, under
    # <project>/<session>/subagents/, and they invoke skills too
    for path in glob.glob(os.path.join(PROJECTS, "**", "*.jsonl"), recursive=True):
        stats["files"] += 1
        project = os.path.relpath(path, PROJECTS).split(os.sep)[0]
        is_subagent = f"{os.sep}subagents{os.sep}" in path
        file_first = file_last = None
        try:
            handle = open(path, errors="replace")
        except OSError:
            stats["parse_errors"] += 1
            continue
        with handle:
            for line in handle:
                has_skill = '"Skill"' in line
                has_listing = '"skill_listing"' in line
                if not (has_skill or has_listing):
                    file_last = line
                    if file_first is None:
                        file_first = line
                    continue
                try:
                    entry = json.loads(line)
                except ValueError:
                    stats["parse_errors"] += 1
                    continue
                stats["lines_parsed"] += 1
                moment = parse_ts(entry.get("timestamp"))
                if moment:
                    oldest = moment if oldest is None or moment < oldest else oldest
                    newest = moment if newest is None or moment > newest else newest

                if has_listing:
                    attachment = entry.get("attachment") or {}
                    if attachment.get("type") == "skill_listing" and moment:
                        for row in (attachment.get("content") or "").splitlines():
                            match = LISTING_LINE.match(row.strip())
                            if not match:
                                continue
                            name = canonicalise(match.group(1).rstrip(":"), on_disk)
                            if name not in listed_first or moment < listed_first[name]:
                                listed_first[name] = moment
                            if name not in listed_last or moment > listed_last[name]:
                                listed_last[name] = moment

                if not has_skill or not moment:
                    continue
                content = (entry.get("message") or {}).get("content")
                if not isinstance(content, list):
                    continue
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") != "tool_use" or block.get("name") != "Skill":
                        continue
                    name = (block.get("input") or {}).get("skill")
                    if not name:
                        continue
                    name = canonicalise(name, on_disk)
                    lane = "sub" if (is_subagent or entry.get("isSidechain")) else "main"
                    counters.append((name, project, moment, lane))
                    invoked[name][project][lane] += 1
                    if name not in last_invoked or moment > last_invoked[name]:
                        last_invoked[name] = moment

        # corpus range: the boundary lines are enough, and parsing only those
        # keeps the walk off the ~800MB of message bodies in between
        for edge in (file_first, file_last):
            if not edge:
                continue
            try:
                moment = parse_ts(json.loads(edge).get("timestamp"))
            except ValueError:
                continue
            if not moment:
                continue
            oldest = moment if oldest is None or moment < oldest else oldest
            newest = moment if newest is None or moment > newest else newest
            if not is_subagent and (oldest_top is None or moment < oldest_top):
                oldest_top = moment

    stats["oldest_entry"] = iso(oldest)
    stats["oldest_main_session_entry"] = iso(oldest_top)
    stats["newest_entry"] = iso(newest)
    return stats, listed_first, listed_last, invoked, last_invoked


def scan_history(roster, on_disk):
    """Typed slash commands. Returns per-skill counts plus the non-skill residue."""
    typed = defaultdict(lambda: defaultdict(list))
    non_skill = defaultdict(int)
    stats = {"entries": 0, "parse_errors": 0, "oldest": None, "newest": None}
    oldest = newest = None
    try:
        handle = open(HISTORY, errors="replace")
    except OSError:
        stats["unreadable"] = True
        return typed, non_skill, stats
    with handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                stats["parse_errors"] += 1
                continue
            stats["entries"] += 1
            raw = entry.get("timestamp")
            moment = dt.datetime.fromtimestamp(raw / 1000, dt.timezone.utc) if raw else None
            if moment:
                oldest = moment if oldest is None or moment < oldest else oldest
                newest = moment if newest is None or moment > newest else newest
            text = (entry.get("display") or "").strip()
            if not text.startswith("/"):
                continue
            token = re.split(r"[\s\n]", text[1:], maxsplit=1)[0]
            if not token:
                continue
            project = slugify(entry.get("project") or "")
            token = canonicalise(token, on_disk)
            if token in roster:
                typed[token][project].append(moment)
            else:
                non_skill[token] += 1
    stats["oldest"] = iso(oldest)
    stats["newest"] = iso(newest)
    return typed, non_skill, stats


def build(args):
    since = args.since
    denied_globs, name_only, plugins_off, retention_days = load_settings()
    on_disk = disk_inventory()

    invocations = []
    tstats, listed_first, listed_last, invoked, last_invoked = scan_transcripts(invocations, on_disk)
    # nested subagent transcripts outlive the retention sweep, so the true
    # horizon is the oldest surviving main-session entry
    corpus_start = parse_ts(tstats["oldest_main_session_entry"]) or parse_ts(tstats["oldest_entry"])
    # a skill first listed at the very start of the corpus was not necessarily
    # new then - that is just where our visibility begins
    horizon = corpus_start + dt.timedelta(days=1) if corpus_start else None
    roster = set(listed_first) | set(on_disk)
    typed, non_skill, hstats = scan_history(roster, on_disk)

    last_typed = {}
    for name, projects in typed.items():
        moments = [m for group in projects.values() for m in group if m]
        if moments:
            last_typed[name] = max(moments)

    newest_listing = max(listed_last.values(), default=None)
    roster_cutoff = newest_listing - dt.timedelta(days=7) if newest_listing else None

    rows = []
    for name in sorted(roster):
        source, path, created, invocable = on_disk.get(name, (None, None, None, True))
        if source is None:
            source = "listing-only"
        first_listed = listed_first.get(name)
        # No file anywhere, and absent from recent rosters: the skill is gone.
        # The test is against the newest roster we have, not the window - a
        # built-in offered today is live however long the window is.
        retired = source == "listing-only" and (
            listed_last.get(name) is None or listed_last[name] < roster_cutoff)

        by_project = defaultdict(lambda: {"invoked": 0, "typed": 0})
        window_invoked = window_typed = 0
        for entry_name, project, moment, lane in invocations:
            if entry_name != name or moment < since:
                continue
            by_project[project]["invoked"] += 1
            window_invoked += 1
        for project, moments in typed.get(name, {}).items():
            hits = sum(1 for m in moments if m and m >= since)
            if hits:
                by_project[project]["typed"] += hits
                window_typed += hits

        all_invoked = sum(
            lanes["main"] + lanes["sub"]
            for lanes in invoked.get(name, {}).values()
        )
        all_typed = sum(len(m) for m in typed.get(name, {}).values())
        last_use = max([m for m in (last_invoked.get(name), last_typed.get(name)) if m], default=None)

        # Newness is only knowable for skills we own the history of. The plugin
        # cache's git dates are cache-refresh dates, not authorship, and a
        # listing-only skill has no file at all - claiming "too-new" for either
        # would excuse a skill that has simply been ignored for months.
        trusted_birth = source in ("user", "project")
        born = created if trusted_birth else None
        if window_invoked or window_typed:
            verdict = "active"
        elif retired:
            verdict = "retired"
        elif born and born > since:
            verdict = "too-new"
        elif all_invoked or all_typed:
            verdict = "dormant"
        else:
            verdict = "never-used"

        plugin_prefix = name.split(":")[0] if ":" in name else None
        rows.append({
            "skill": name,
            "verdict": verdict,
            "source": source,
            "path": path,
            "denied": any(fnmatch.fnmatch(name, g) for g in denied_globs),
            "name_only": name in name_only,
            "plugin_disabled": bool(plugin_prefix and plugin_prefix in plugins_off),
            "first_listed": iso(first_listed),
            "last_listed": iso(listed_last.get(name)),
            "born": iso(born),
            "newness_unknown": not trusted_birth,
            # a user-only skill CANNOT be model-invoked, so inv=0 is structural.
            # Reporting it beside model-invocable skills reads as "the model
            # ignores this", which is a claim the data cannot support.
            "reachable": "user-only" if not invocable else "model+user",
            "reached_only_by_typing": bool(all_typed and not all_invoked),
            "created": iso(created),
            "window": {"invoked": window_invoked, "typed": window_typed},
            "all_time": {
                "invoked": all_invoked,
                "typed": all_typed,
                "last_invoked": iso(last_invoked.get(name)),
                "last_typed": iso(last_typed.get(name)),
                "last_used": iso(last_use),
            },
            "by_project": {k: v for k, v in sorted(by_project.items())},
        })

    order = {"never-used": 0, "dormant": 1, "retired": 2, "too-new": 3, "active": 4}
    rows.sort(key=lambda r: (order[r["verdict"]], r["all_time"]["last_used"] or "", r["skill"]))

    # transcripts are swept on a rolling window; what survives past it is only
    # resumed sessions and nested subagent files, so older coverage is partial
    # cleanupPeriodDays governs FUTURE sweeps; whatever an earlier, shorter
    # setting already deleted is gone. The honest horizon is the later of the
    # two - the setting can only ever widen coverage from today forward.
    boundary = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=retention_days)
    observed = parse_ts(tstats["oldest_entry"])
    horizon = max(boundary, observed) if observed else boundary
    warnings = []
    if since < horizon:
        warnings.append(
            f"`invoked` coverage begins {iso(horizon)[:10]} - no transcript survives before it. "
            f"cleanupPeriodDays is {retention_days}"
            + (f", but an earlier sweep already deleted everything before {iso(observed)[:10]}"
               if observed and observed > boundary else "")
            + f". A skill used only before {iso(horizon)[:10]} reads as never-used. The `typed` "
            f"column is unaffected - history.jsonl reaches {hstats['oldest'][:10]}."
        )

    excluded = [{
        "reason": "typed slash commands that are not skills or commands in any roster",
        "count": sum(non_skill.values()),
        "distinct": len(non_skill),
        "top": sorted(non_skill.items(), key=lambda kv: -kv[1])[:10],
    }]
    if tstats["parse_errors"]:
        excluded.append({"reason": "unparseable transcript lines", "count": tstats["parse_errors"]})
    if hstats["parse_errors"]:
        excluded.append({"reason": "unparseable history lines", "count": hstats["parse_errors"]})

    return {
        "window": {"since": iso(since), "until": iso(dt.datetime.now(dt.timezone.utc)), "days": args.days},
        "coverage": {
            "transcripts": tstats,
            "history": hstats,
            "roster_size": len(roster),
            "retention_days": retention_days,
            "full_invoked_coverage_since": iso(horizon),
            "on_disk_never_listed": sorted(
                name for name in set(on_disk) - set(listed_first) if on_disk[name][3]
            ),
            "user_invocable_only": sorted(n for n, v in on_disk.items() if not v[3]),
            "excluded": excluded,
            "warnings": warnings,
        },
        "skills": rows,
    }


def suppressed(row):
    return row["denied"] or row["name_only"] or row["plugin_disabled"]


def owned(row):
    """Skills whose history we can date, so a verdict about them is falsifiable."""
    return row["source"] in ("user", "project")


def print_rows(rows, show_born=False, all_time=False):
    for row in rows:
        last = (row["all_time"]["last_used"] or "-")[:10]
        born = (row["born"] or "-")[:10] if show_born else ""
        counts = row["all_time"] if all_time else row["window"]
        flags = ",".join(f for f, on in (
            ("denied", row["denied"]),
            ("name-only", row["name_only"]),
            ("plugin-off", row["plugin_disabled"]),
            ("user-only", row["reachable"] == "user-only"),
        ) if on)
        print(f"  {row['skill']:<40} {row['source']:<18} "
              f"{counts['invoked']:>4} {counts['typed']:>4} "
              f"{born:<11} {last:<11} {flags}")


def header(title, count):
    print(f"\n{title} ({count})")
    print(f"  {'skill':<40} {'source':<18} {'inv':>4} {'typ':>4} {'added':<11} {'last used':<11} flags")
    print("  " + "-" * 96)


def render_table(report):
    rows = report["skills"]
    coverage = report["coverage"]
    window = report["window"]
    counts = defaultdict(int)
    for row in rows:
        counts[row["verdict"]] += 1

    print(f"window {window['since'][:10]} -> {window['until'][:10]} ({window['days']}d) "
          f"| roster {coverage['roster_size']}")
    for warning in coverage["warnings"]:
        print(f"WARNING: {warning}")
    print("verdicts: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))

    live = [r for r in rows if not suppressed(r)]
    never = [r for r in live if r["verdict"] == "never-used"]
    quiet = [r for r in live if r["verdict"] == "dormant"]

    header("NEVER USED - yours, newness certain", sum(1 for r in never if owned(r)))
    print_rows(sorted((r for r in never if owned(r)), key=lambda r: r["born"] or ""), show_born=True)

    others = [r for r in never if not owned(r)]
    header("NEVER USED - plugin / built-in (newness unknown)", len(others))
    print_rows(sorted(others, key=lambda r: r["skill"]))

    header("QUIET - used before, silent this window", len(quiet))
    print("  (inv/typ are ALL-TIME here - window counts are 0 by definition. inv=0 with"
          "\n   typ>0 means the skill only enters play when you type it; `user-only` means"
          "\n   it CANNOT be model-invoked, so inv=0 is structural, not neglect)")
    print_rows(sorted(quiet, key=lambda r: r["all_time"]["last_used"] or ""), all_time=True)

    active = sorted(live, key=lambda r: -(r["window"]["invoked"] + r["window"]["typed"]))
    header("ACTIVE - top 15 of %d" % sum(1 for r in live if r["verdict"] == "active"), 15)
    print_rows([r for r in active if r["verdict"] == "active"][:15])

    # what this view leaves out - the same report the JSON carries, so a
    # scheduled run is as honest as a narrated one
    print("\nNOT SHOWN ABOVE")
    sup = [r for r in rows if suppressed(r)]
    by_reason = defaultdict(list)
    for row in sup:
        reason = ("denied" if row["denied"] else
                  "plugin-off" if row["plugin_disabled"] else "name-only")
        by_reason[reason].append(row["skill"])
    for reason, names in sorted(by_reason.items()):
        print(f"  suppressed by config ({reason}): {len(names)} - {', '.join(sorted(names)[:6])}"
              f"{' ...' if len(names) > 6 else ''}")
    print(f"  too-new (added inside the window): {counts['too-new']}")
    print(f"  retired (no file, absent from rosters for 7+ days): {counts['retired']}")
    if coverage["user_invocable_only"]:
        print(f"  not model-invocable by declaration: {', '.join(coverage['user_invocable_only'])}")
    for item in coverage["excluded"]:
        print(f"  {item['reason']}: {item['count']}"
              + (f" ({item['distinct']} distinct)" if "distinct" in item else ""))
    print(f"\nrun with --all for every row, or without --table for JSON")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=30, help="window length in days (default 30)")
    parser.add_argument("--since", help="ISO date overriding --days, e.g. 2026-06-20")
    parser.add_argument("--table", action="store_true", help="human table instead of JSON")
    parser.add_argument("--all", action="store_true", help="with --table, print every row")
    parser.add_argument("--out", help="also write the JSON to this path")
    args = parser.parse_args()

    if args.since:
        try:
            base = dt.datetime.fromisoformat(args.since)
        except ValueError:
            print(f"bad --since: {args.since}", file=sys.stderr)
            return 3
        args.since = base if base.tzinfo else base.replace(tzinfo=dt.timezone.utc)
        args.days = (dt.datetime.now(dt.timezone.utc) - args.since).days
    else:
        args.since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=args.days)

    report = build(args)
    if not report["skills"]:
        print("no skills found in any roster", file=sys.stderr)
        return 2
    if args.out:
        with open(args.out, "w") as handle:
            json.dump(report, handle, indent=1, ensure_ascii=False)
    if args.table:
        if args.all:
            header("ALL SKILLS", len(report["skills"]))
            print_rows(report["skills"], show_born=True)
        else:
            render_table(report)
    else:
        json.dump(report, sys.stdout, indent=1, ensure_ascii=False)
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
