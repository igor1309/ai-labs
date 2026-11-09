#!/usr/bin/env python3
"""Report a nightly run, comparing only valid evidence from an identical setup.

    python3 -I scripts/nightly-report.py RUN_DIR [--previous OLD_RUN_DIR]

Writes report.json and report.md before returning nonzero for invalid current
evidence. Performance warnings request investigation and never fail the run.
"""

import argparse
import json
import math
import re
import shlex
from pathlib import Path

IDENTITY = ("workload", "build", "models", "machine", "toolchain")
MINUTES = (1, 30, 90, 180)
# Grouping is accepted only in groups of three; malformed numbers cannot be
# rescued by matching a numeric suffix or by silently dropping punctuation.
INTEGER = r"(?:[0-9]{1,3}(?:[ \u00a0\u202f][0-9]{3})+|[0-9]+)"
NUMBER = INTEGER + r"(?:[.,][0-9]+)?"
LINE = re.compile(
    rf"rehearsal: (?P<minute>{INTEGER}) min of audio in (?P<wall>{NUMBER}) s, "
    rf"at most (?P<behind>{NUMBER}) s behind, now (?P<backlog>{NUMBER}) s"
    r"(?:; newest word trails by (?P<newest>.+?), final text by (?P<final>.+?))?"
    rf", footprint (?P<footprint>-?{INTEGER}) MiB, peak (?P<peak>-?{INTEGER}) MiB")
MEAN = re.compile(rf"{NUMBER}–{NUMBER} s, mean (?P<mean>{NUMBER}) s over {INTEGER}")
DONE = re.compile(
    rf"rehearsal: done: (?P<minutes>{INTEGER}) min at (?P<speed>{NUMBER})x in (?P<wall>{NUMBER}) s; "
    rf".*?; recognisers at most {NUMBER} s behind; cpu (?P<cpu>{NUMBER}) s, "
    rf"(?P<share>{NUMBER})% of one core; footprint (?P<end>-?{INTEGER}) MiB at the end, "
    rf"peak (?P<peak>-?{INTEGER}) MiB")
WRITTEN = re.compile(
    r"rehearsal: written: microphone (?P<microphone>.+?), call (?P<call>.+?) "
    rf"of (?P<fed>{NUMBER}) s fed; (?P<transcript>.+)")
SPEAKERS = re.compile(rf"transcript Me (?P<me>{INTEGER}) words, Them (?P<them>{INTEGER}) words")
TOLERANCE_S = 0.1


def read_json(path):
    def finite(text):
        value = float(text)
        if not math.isfinite(value):
            raise ValueError("non-finite JSON number")
        return value
    return json.loads(path.read_text(), parse_float=finite, parse_constant=finite)


def number(text):
    """Read a finite locale number; never infer a zero from missing evidence."""
    if not re.fullmatch(r"-?" + NUMBER, text):
        raise ValueError(f"invalid number: {text!r}")
    value = float(re.sub(r"[ \u00a0\u202f]", "", text).replace(",", "."))
    if not math.isfinite(value):
        raise ValueError("non-finite number")
    return value


def footprint(text):
    value = number(text)
    return value if value >= 0 else None


def mean(text):
    if text is None or text == "no reports":
        return None
    match = MEAN.fullmatch(text)
    if not match:
        raise ValueError(f"invalid lag measurement: {text!r}")
    return number(match["mean"])


def samples(log, errors=None):
    """Minute means pooled across tracks, not acoustic percentiles or UI latency."""
    errors = errors if errors is not None else []
    found = {}
    for line in log.splitlines():
        if not re.match(r"rehearsal: \S.* min of audio", line):
            continue
        match = LINE.fullmatch(line)
        try:
            if not match:
                raise ValueError("malformed minute sample")
            minute = int(number(match["minute"]))
            if minute <= 0 or minute in found:
                raise ValueError("nonpositive or duplicate minute sample")
            found[minute] = {
                "wall_s": number(match["wall"]),
                "behind_s": number(match["behind"]),
                "backlog_s": number(match["backlog"]),
                "newest_lag_mean_s": mean(match["newest"]),
                "final_lag_mean_s": mean(match["final"]),
                "footprint_mib": footprint(match["footprint"]),
                "peak_mib": footprint(match["peak"]),
            }
        except ValueError as error:
            errors.append(str(error))
    return dict(sorted(found.items()))


def slope(points):
    """Least-squares descriptive slope, unavailable without three distinct minutes."""
    if len(points) < 3:
        return None
    xmean = sum(x for x, _ in points) / len(points)
    ymean = sum(y for _, y in points) / len(points)
    denominator = sum((x - xmean) ** 2 for x, _ in points)
    return sum((x - xmean) * (y - ymean) for x, y in points) / denominator if denominator else None


def endurance(log, intended_minutes=None):
    errors = []
    found = samples(log, errors)
    done_lines = [line for line in log.splitlines() if line.startswith("rehearsal: done:")]
    done = DONE.fullmatch(done_lines[0]) if len(done_lines) == 1 else None
    if not done:
        errors.append("expected one valid done line")
    intended_s = intended_minutes * 60 if intended_minutes is not None else None
    if intended_s is None:
        errors.append("intended workload duration unavailable (requires --minutes)")
    written_lines = [line for line in log.splitlines() if line.startswith("rehearsal: written:")]
    written = WRITTEN.fullmatch(written_lines[0]) if len(written_lines) == 1 else None
    fed = number(written["fed"]) if written else None
    tracks = {}
    words = {"Me": None, "Them": None}
    if not written:
        errors.append("expected one valid written result with microphone and call durations")
    else:
        if fed <= 0:
            errors.append("fed duration must be positive")
        speakers = SPEAKERS.fullmatch(written["transcript"])
        if speakers:
            words = {"Me": int(number(speakers["me"])), "Them": int(number(speakers["them"]))}
        if any(count is None or count <= 0 for count in words.values()):
            errors.append("both transcript speakers require positive word counts")
        for track in ("microphone", "call"):
            value = re.fullmatch(rf"(?P<duration>{NUMBER}) s", written[track])
            duration = number(value["duration"]) if value else None
            loss = max(0, round(fed - duration, 6)) if duration is not None else None
            tracks[track] = {
                "written_s": duration,
                "duration_difference_s": round(duration - fed, 6) if duration is not None else None,
                "shortfall_s": loss,
                "loss_percent": 100 * loss / fed if loss is not None and fed > 0 else None,
            }
            if duration is None:
                errors.append(f"{track} written duration unavailable or malformed")
            elif duration <= 0 or abs(duration - fed) > TOLERANCE_S + 1e-6:
                errors.append(f"{track} written duration disagrees with fed duration (audio loss or excess)")
    reached = (intended_s is not None and fed is not None and fed + TOLERANCE_S + 1e-6 >= intended_s
               and done is not None and number(done["minutes"]) == int(intended_minutes))
    if not reached:
        errors.append("intended workload duration not reached or not evidenced")
    if "endurance failed:" in log:
        errors.append("harness reported failure")
    completed = done is not None and reached
    post_warm = [(n, at["footprint_mib"]) for n, at in found.items()
                 if n >= 30 and at["footprint_mib"] is not None]
    backlogs = [(n, at["backlog_s"]) for n, at in found.items()]
    footprint_slope = slope(post_warm)
    return {
        "completed": completed,
        "correct": not errors,
        "reasons": errors,
        "intended_duration_s": intended_s,
        "fed_duration_s": fed,
        "workload_shortfall_s": max(0, round(intended_s - fed, 6)) if intended_s is not None and fed is not None else None,
        "tracks": tracks,
        "speaker_words": words,
        "minutes": max(found, default=0),
        "samples": {str(n): at for n, at in found.items()},
        "at": {str(n): {k: v for k, v in found[n].items() if k != "wall_s"} for n in MINUTES if n in found},
        "wall_s": number(done["wall"]) if done else None,
        "speed": number(done["speed"]) if done else None,
        "cpu_seconds": number(done["cpu"]) if done else None,
        "cpu_share_percent": number(done["share"]) if done else None,
        "footprint_end_mib": footprint(done["end"]) if done else None,
        "footprint_peak_mib": footprint(done["peak"]) if done else None,
        "trends": {
            "footprint_from_minute": 30,
            "footprint_samples": len(post_warm),
            "footprint_mib_per_hour": footprint_slope * 60 if footprint_slope is not None else None,
            "backlog_s_per_minute": slope(backlogs),
            "backlog_max_s": max((y for _, y in backlogs), default=None),
        },
        "unmeasured": ["per-track acoustic partial/final p50/p95", "screen-drawing latency",
                       "source frame continuity and gap counts", "real call audio interference"],
    }


def measured(summary, key):
    value = summary.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError(f"invalid capture measurement {key}")
    return value


def captures(run):
    found = {}
    for path in sorted(run.glob("capture-*/summary.json")):
        summary = read_json(path)
        total = measured(summary, "sampled_cpu_ns")
        main = measured(summary, "main_thread_ns")
        hangs = summary.get("hangs", {})
        longest = measured(hangs, "longest_ns")
        found[path.parent.name] = {
            "main_thread_percent": round(100 * main / total, 1) if total and main is not None else None,
            "hangs": measured(hangs, "count"),
            "longest_hang_ms": round(longest / 1e6) if longest is not None else None,
        }
    return found


def mismatch(old, new):
    identity = old.get("identity")
    identity = identity if isinstance(identity, dict) else {}
    return [field for field in IDENTITY if identity.get(field) != new["identity"].get(field)]


def report(run):
    new = {"identity": {}, "commit": None, "started": None, "endurance": None, "captures": {}, "errors": []}
    try:
        identity = read_json(run / "identity.json")
        new.update(identity={field: identity[field] for field in IDENTITY},
                   commit=identity.get("commit"), started=identity.get("started"))
        if any(not new["identity"][field] for field in IDENTITY):
            raise ValueError("incomplete run identity")
        workload = identity["workload"]["endurance"]
        args = shlex.split(workload)
        indices = [n for n, arg in enumerate(args) if arg == "--minutes"]
        intended = number(args[indices[0] + 1]) if len(indices) == 1 else None
        if intended is not None and intended <= 0:
            raise ValueError("workload minutes must be positive")
        new["endurance"] = endurance((run / "endurance.log").read_text(), intended)
        new["captures"] = captures(run)
    except (OSError, ValueError, KeyError, TypeError, IndexError, AttributeError) as error:
        new["errors"].append(f"cannot parse run evidence: {error}")
    new["valid"] = not new["errors"] and bool(new["endurance"] and new["endurance"]["correct"])
    return new


def eligible(run):
    evidence = run.get("endurance")
    if not isinstance(evidence, dict) or not isinstance(run.get("identity"), dict):
        return False
    try:
        if any(value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))
                                     or not math.isfinite(value) or value < 0)
               for value in metrics(run).values()):
            return False
    except (AttributeError, TypeError, ValueError, OverflowError):
        return False
    return (run.get("valid") is True and evidence.get("completed") is True and evidence.get("correct") is True
            and not evidence.get("reasons") and not run.get("errors")
            and all(run.get("identity", {}).get(field) for field in IDENTITY))


def metrics(run):
    evidence = run.get("endurance") or {}
    all_samples = evidence.get("samples") or {}
    intended = evidence.get("intended_duration_s")
    final = all_samples.get(str(int(intended / 60)), {}) if intended is not None else {}
    values = {key: evidence.get(key) for key in ("cpu_seconds", "cpu_share_percent", "footprint_peak_mib")}
    values.update({key: final.get(key) for key in ("newest_lag_mean_s", "final_lag_mean_s", "backlog_s")})
    for name, capture in run.get("captures", {}).items():
        for key in ("hangs", "longest_hang_ms"):
            values[f"{name}.{key}"] = capture.get(key)
    return values


def comparison(new, old=None):
    result = {"baseline_commit": None, "baseline_started": None, "reason": None, "deltas": {}, "warnings": []}
    if old is None:
        result["reason"] = "Not compared: no earlier run."
    elif not eligible(old):
        result["reason"] = "Not compared: previous report has invalid or unverified evidence."
    elif mismatch(old, new):
        result["reason"] = f"Not compared with `{old.get('commit')}`: its {', '.join(mismatch(old, new))} differ."
    elif not eligible(new):
        result["reason"] = "Not compared: current evidence is invalid."
    else:
        result["baseline_commit"] = old.get("commit")
        result["baseline_started"] = old.get("started")
        before, after = metrics(old), metrics(new)
        for key in sorted(before.keys() | after.keys()):
            was, now = before.get(key), after.get(key)
            delta = now - was if was is not None and now is not None else None
            percent = 100 * delta / was if delta is not None and was > 0 else None
            result["deltas"][key] = {"baseline": was, "current": now, "delta": delta, "percent": percent}
            if (percent is not None and percent > 10 + 1e-9) or (was == 0 and now is not None and now > 0):
                result["warnings"].append(f"{key} increased: investigate and repeat before calling it a regression.")
    return result


def change(old, new):
    if new is None:
        return "unavailable"
    if old is None:
        return f"{new:g}"
    return f"{new:g} (was {old:g}, {new - old:+g})"


def markdown(new, old=None):
    compared = new.get("comparison") or comparison(new, old)
    lines = ["## Audelin nightly long run", "", f"Commit `{new['commit']}`, started {new['started']}.", ""]
    for field in IDENTITY:
        lines.append(f"- **{field}**: {json.dumps(new['identity'].get(field), sort_keys=True)}")
    lines += ["", "Evidence: " + ("valid" if new["valid"] else "INVALID"), ""]
    evidence = new["endurance"]
    for reason in new["errors"] + ((evidence or {}).get("reasons", [])):
        lines.append(f"- {reason}")
    if compared["reason"]:
        lines += ["", compared["reason"], ""]
        old = None
    else:
        lines += ["", f"Compared with `{compared['baseline_commit']}` from {compared['baseline_started']}, an identical setup.", ""]
    if evidence:
        lines += [f"### Real-model run at 1x: {evidence['minutes']} min{'' if evidence['completed'] else ', did not finish'}", "",
                  "Lag values are pooled per-minute means; throughput/backlog are raw harness measures, not p95 or screen-drawing latency.", "",
                  "| audio minute | behind s | backlog s | newest word mean lag s | final text mean lag s | footprint MiB |",
                  "|---|---|---|---|---|---|"]
        before = (old or {}).get("endurance") or {}
        for minute, at in evidence["at"].items():
            was = before.get("at", {}).get(minute, {})
            lines.append("| " + " | ".join([minute] + [change(was.get(key), at[key])
                         for key in ("behind_s", "backlog_s", "newest_lag_mean_s", "final_lag_mean_s", "footprint_mib")]) + " |")
        lines += ["", f"CPU seconds: {change(None, evidence['cpu_seconds'])}; CPU % of one core: {change(None, evidence['cpu_share_percent'])}; "
                  f"peak footprint MiB: {change(None, evidence['footprint_peak_mib'])}.",
                  f"Fed seconds: {change(None, evidence['fed_duration_s'])}; intended seconds: {change(None, evidence['intended_duration_s'])}; "
                  f"workload shortfall seconds: {change(None, evidence['workload_shortfall_s'])}.",
                  f"Transcript words: Me {change(None, evidence['speaker_words']['Me'])}, Them {change(None, evidence['speaker_words']['Them'])}."]
        for track in ("microphone", "call"):
            value = evidence["tracks"].get(track, {})
            lines.append(f"- {track}: written {change(None, value.get('written_s'))} s; shortfall "
                         f"{change(None, value.get('shortfall_s'))} s ({change(None, value.get('loss_percent'))}%).")
        trends = evidence["trends"]
        lines += ["", f"Descriptive footprint slope from minute 30 ({trends['footprint_samples']} samples): "
                  f"{change(None, trends['footprint_mib_per_hour'])} MiB/hour. Retained transcript growth is not evidence of a leak.",
                  f"Backlog trend: {change(None, trends['backlog_s_per_minute'])} s/min; maximum: {change(None, trends['backlog_max_s'])} s.",
                  "Unavailable / unmeasured: " + "; ".join(evidence["unmeasured"]) + ".", ""]
    if not new["captures"]:
        lines.append("Time Profiler CPU and hangs: unavailable.")
    for name, capture in new["captures"].items():
        was = ((old or {}).get("captures") or {}).get(name)
        def value(key):
            current = capture[key] if capture[key] is not None else "unavailable"
            return f"{current} (was {was.get(key)})" if was else f"{current}"
        lines.append(f"### {name}: main thread {value('main_thread_percent')}% of sampled CPU, "
                     f"{value('hangs')} hangs, longest {value('longest_hang_ms')} ms")
    if compared["deltas"]:
        lines += ["", "### Baseline → current", "", "| metric | baseline | current | delta | % |", "|---|---|---|---|---|"]
        for key, delta in compared["deltas"].items():
            lines.append("| " + " | ".join([key] + [change(None, delta[k]) for k in ("baseline", "current", "delta", "percent")]) + " |")
    lines += ["", "Changes above 10% request investigation and a repeat; no absolute resource budgets. A zero baseline has no percentage."]
    lines += [f"- {warning}" for warning in compared["warnings"]]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run", type=Path)
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args()
    new = report(args.run)
    old = None
    previous_error = None
    if args.previous and (args.previous / "report.json").exists():
        try:
            old = read_json(args.previous / "report.json")
            if not isinstance(old, dict):
                raise ValueError("previous report is not an object")
        except (OSError, ValueError) as error:
            old = None
            previous_error = f"Not compared: cannot parse previous report: {error}"
    new["comparison"] = comparison(new, old)
    if previous_error:
        new["comparison"]["reason"] = previous_error
    text = markdown(new, old)
    (args.run / "report.json").write_text(json.dumps(new, indent=2, sort_keys=True, allow_nan=False) + "\n")
    (args.run / "report.md").write_text(text)
    print(text, end="")
    return 0 if new["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
