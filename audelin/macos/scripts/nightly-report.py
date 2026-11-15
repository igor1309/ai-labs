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


REHEARSAL = "capture-rehearsal"
# Repeats of the composition rehearsal beyond the profiled one, unprofiled.
REPEATS = ("rehearsal-2", "rehearsal-3")
# Repeats spread wider than this are noise, not a measurement to compare.
REHEARSAL_SPREAD_PERCENT = 10
# The 1-minute load average after nightly.sh waited for the Mac to settle.
LOAD_LIMIT = 4.0
# Nights compared: the comparison point and the noise band behind it.
WINDOW = 7
LOOKBACK = 30


def median(values):
    ordered = sorted(values)
    middle = len(ordered) // 2
    return ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2


def rehearsal(run, workload, repeats=1):
    """The fast composition run with test recognisers: CPU of the app's own wiring, without the model.

    With repeats, CPU and peak footprint are medians and every run must be valid."""
    directories = (REHEARSAL,) + REPEATS[:max(0, repeats - 1)]
    runs = [one_rehearsal(run / name, workload) for name in directories]
    result = runs[0]
    for name, other in zip(directories[1:], runs[1:]):
        result["reasons"] += [f"{name}: {reason}" for reason in other["reasons"]]
        result["correct"] = result["correct"] and other["correct"]
        result["completed"] = result["completed"] and other["completed"]
    cpu = [one["cpu_seconds"] for one in runs if one["cpu_seconds"] is not None]
    peaks = [one["footprint_peak_mib"] for one in runs if one["footprint_peak_mib"] is not None]
    result["runs"] = len(runs)
    result["cpu_seconds_runs"] = cpu
    if len(cpu) == len(runs):
        result["cpu_seconds"] = median(cpu)
        result["cpu_spread_percent"] = round(100 * (max(cpu) - min(cpu)) / result["cpu_seconds"], 1) if result["cpu_seconds"] else None
    if len(peaks) == len(runs):
        result["footprint_peak_mib"] = median(peaks)
    spread = result.get("cpu_spread_percent")
    result["noisy"] = spread is not None and spread > REHEARSAL_SPREAD_PERCENT
    return result


def one_rehearsal(directory, workload):
    args = shlex.split(workload)
    indices = [n for n, arg in enumerate(args) if arg == "--minutes"]
    intended = number(args[indices[0] + 1]) if len(indices) == 1 else None
    if intended is not None and intended <= 0:
        raise ValueError("rehearsal minutes must be positive")
    try:
        log = (directory / "rehearsal.log").read_text()
    except OSError:
        log = ""
    result = endurance(log, intended)
    if not log:
        result["reasons"].insert(0, "rehearsal log missing")
        result["correct"] = False
    result["unmeasured"] = ["recognition by the real model", "real call audio"]
    return result


def load(path):
    """The 1-minute load average nightly.sh recorded once the Mac settled, if it did."""
    try:
        # Only the settled form counts: before it, the build's own load was measured.
        found = re.search(r"load before the run, settled after [0-9]+ s: \{ ?([0-9.,]+)", path.read_text())
    except OSError:
        return None
    return number(found[1]) if found else None


def noise(run):
    """Why this night's numbers cannot be compared, though its evidence is valid."""
    reasons = []
    value = run.get("load_before")
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value > LOAD_LIMIT:
        reasons.append(f"load {value:g} before the run exceeds {LOAD_LIMIT:g}")
    composition = run.get("rehearsal")
    if isinstance(composition, dict) and composition.get("noisy"):
        reasons.append(f"rehearsal repeats spread {composition.get('cpu_spread_percent')}% (over {REHEARSAL_SPREAD_PERCENT}%)")
    return reasons


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
        if "rehearsal" in identity["workload"]:
            new["rehearsal"] = rehearsal(run, identity["workload"]["rehearsal"],
                                         int(identity["workload"].get("rehearsal_runs", 1)))
        new["load_before"] = load(run / "endurance.log")
    except (OSError, ValueError, KeyError, TypeError, IndexError, AttributeError) as error:
        new["errors"].append(f"cannot parse run evidence: {error}")
    new["valid"] = (not new["errors"] and bool(new["endurance"] and new["endurance"]["correct"])
                    and (new.get("rehearsal") is None or new["rehearsal"]["correct"]))
    return new


def eligible(run):
    evidence = run.get("endurance")
    if not isinstance(evidence, dict) or not isinstance(run.get("identity"), dict):
        return False
    try:
        values = list(metrics(run).values())
        # Markdown consumes historical rows independently of summary metrics.
        # Invalid historical evidence must never prevent a current report.
        for field in ("at", "samples"):
            rows = evidence.get(field, {})
            if not isinstance(rows, dict) or any(not isinstance(row, dict) for row in rows.values()):
                return False
            values.extend(value for row in rows.values() for value in row.values())
        if any(value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))
                                     or not math.isfinite(value) or value < 0)
               for value in values):
            return False
    except (AttributeError, TypeError, ValueError, OverflowError):
        return False
    composition = run.get("rehearsal")
    if composition is not None and not (isinstance(composition, dict) and composition.get("correct") is True):
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
    composition = run.get("rehearsal")
    if isinstance(composition, dict):
        for key in ("cpu_seconds", "footprint_peak_mib"):
            values[f"rehearsal.{key}"] = composition.get(key)
    for name, capture in run.get("captures", {}).items():
        for key in ("hangs", "longest_hang_ms"):
            values[f"{name}.{key}"] = capture.get(key)
    return values


def differences(old, new):
    """Each differing identity field, from what to what, so a baseline reset explains itself."""
    def short(value):
        text = json.dumps(value, sort_keys=True)
        return text if len(text) <= 120 else text[:117] + "..."
    lines = []
    for field in mismatch(old, new):
        was, now = (old.get("identity") or {}).get(field), new["identity"].get(field)
        if isinstance(was, dict) and isinstance(now, dict):
            for key in sorted(was.keys() | now.keys()):
                if was.get(key) != now.get(key):
                    lines.append(f"{field}.{key}: {short(was.get(key))} → {short(now.get(key))}")
        else:
            lines.append(f"{field}: {short(was)} → {short(now)}")
    return lines


def comparison(new, old=None, window=None):
    """Compares with the newest matching night; with three or more, warns only above the band.

    The band is the last WINDOW matching valid nights: a metric warns when it is above all of
    them and more than 5% above their median, which catches a slow climb no single night shows.
    With fewer nights, it warns above 10% over the comparison point."""
    window = window if window is not None else ([old] if old is not None else [])
    old = window[0] if window else old
    result = {"baseline_commit": None, "baseline_started": None, "reason": None, "deltas": {}, "warnings": [],
              "identity_changes": [], "window": len(window)}
    noisy = noise(new)
    if old is None:
        result["reason"] = "Not compared: no earlier run."
    elif not eligible(old):
        result["reason"] = "Not compared: previous report has invalid or unverified evidence."
    elif mismatch(old, new):
        result["reason"] = f"Not compared with `{old.get('commit')}`: its {', '.join(mismatch(old, new))} differ."
        result["identity_changes"] = differences(old, new)
    elif noise(old):
        result["reason"] = f"Not compared with `{old.get('commit')}`: a noisy night, " + "; ".join(noise(old)) + "."
    elif not eligible(new):
        result["reason"] = "Not compared: current evidence is invalid."
    elif noisy:
        result["reason"] = "Not compared: noisy night, " + "; ".join(noisy) + "."
    else:
        result["baseline_commit"] = old.get("commit")
        result["baseline_started"] = old.get("started")
        before, after = metrics(old), metrics(new)
        for key in sorted(before.keys() | after.keys()):
            was, now = before.get(key), after.get(key)
            delta = now - was if was is not None and now is not None else None
            percent = 100 * delta / was if delta is not None and was > 0 else None
            band = [value for value in (metrics(night).get(key) for night in window) if value is not None]
            entry = {"baseline": was, "current": now, "delta": delta, "percent": percent}
            if len(band) >= 3:
                entry.update(band_median=median(band), band_max=max(band), band_nights=len(band))
                above = (now is not None and now > max(band)
                         and (now > 1.05 * median(band) + 1e-9 if median(band) > 0 else now > 0))
            else:
                above = (percent is not None and percent > 10 + 1e-9) or (was == 0 and now is not None and now > 0)
            result["deltas"][key] = entry
            if above:
                where = (f"above all {len(band)} matching nights and >5% over their median {median(band):g}"
                         if len(band) >= 3 else "more than 10% over the comparison point")
                result["warnings"].append(f"{key} increased ({where}): investigate and repeat before calling it a regression.")
    return result


def growth(old_run, new_run, top=8, threshold=1.0):
    """Frames whose share of sampled CPU grew most since the comparison night, in percentage points.

    Shares, not milliseconds: windows differ in length and in the samples they caught."""
    found = {}
    for path in sorted(new_run.glob("capture-*/summary.json")):
        before = old_run / path.parent.name / "summary.json"
        try:
            old, new = read_json(before), read_json(path)
            frames = {}
            for summary, sign in ((new, 1), (old, -1)):
                total = summary["sampled_cpu_ns"]
                if not total:
                    raise ValueError("no samples")
                for name, value in summary["inclusive_ns"].items():
                    frames[name] = frames.get(name, 0) + sign * 100 * value / total
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            continue
        grown = sorted(((round(pp, 1), name) for name, pp in frames.items() if pp >= threshold),
                       key=lambda item: (-item[0], item[1]))[:top]
        found[path.parent.name] = [{"frame": name, "percentage_points": pp} for pp, name in grown]
    return found


def history(directory, run):
    """Earlier reports in DIRECTORY, newest first by start time, at most LOOKBACK of them."""
    found = []
    for path in directory.glob("*/report.json"):
        if path.parent.resolve() == run.resolve():
            continue
        try:
            old = read_json(path)
        except (OSError, ValueError):
            continue
        if isinstance(old, dict) and isinstance(old.get("started"), str):
            found.append((old["started"], path.parent, old))
    found.sort(key=lambda item: item[0], reverse=True)
    return [(path, old) for _, path, old in found[:LOOKBACK]]


def window_for(new, earlier):
    """The matching valid quiet nights, newest first: [0] is the comparison point."""
    return [(path, old) for path, old in earlier
            if eligible(old) and not mismatch(old, new) and not noise(old)][:WINDOW]


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
    for reason in (new.get("rehearsal") or {}).get("reasons", []):
        lines.append(f"- rehearsal: {reason}")
    if new.get("load_before") is not None:
        lines.append(f"- 1-minute load once settled, before the run: {new['load_before']:g} (limit {LOAD_LIMIT:g})")
    if compared["reason"]:
        lines += ["", compared["reason"], ""]
        lines += [f"- changed: {line}" for line in compared.get("identity_changes", [])]
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
    composition = new.get("rehearsal")
    if composition:
        was = (old or {}).get("rehearsal") or {}
        lines += [f"### Composition rehearsal, test recognisers: {composition['minutes']} min at {change(None, composition['speed'])}x"
                  f"{'' if composition['completed'] else ', did not finish'}", "",
                  f"CPU seconds: {change(was.get('cpu_seconds'), composition['cpu_seconds'])}; "
                  f"CPU % of one core: {change(was.get('cpu_share_percent'), composition['cpu_share_percent'])}; "
                  f"peak footprint MiB: {change(was.get('footprint_peak_mib'), composition['footprint_peak_mib'])}. "
                  f"Runs: {composition.get('runs', 1)}, CPU seconds each {composition.get('cpu_seconds_runs')}, "
                  f"spread {composition.get('cpu_spread_percent')}%. "
                  f"The heaviest frames are in {REHEARSAL}/summary.txt.", ""]
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
        lines += ["", f"### Baseline → current (band: {compared.get('window', 1)} matching nights)", "",
                  "| metric | baseline | current | delta | % | band median | band max |", "|---|---|---|---|---|---|---|"]
        for key, delta in compared["deltas"].items():
            lines.append("| " + " | ".join([key] + [change(None, delta.get(k)) for k in
                         ("baseline", "current", "delta", "percent", "band_median", "band_max")]) + " |")
    for name, frames in (compared.get("frames") or {}).items():
        lines += ["", f"### {name}: frames whose share of sampled CPU grew most (percentage points)", ""]
        lines += [f"- +{frame['percentage_points']:g} {frame['frame']}" for frame in frames] or ["- none grew by 1 point or more"]
    lines += ["", "With three or more matching nights a metric warns when above all of them and more than 5% over their median;"
              " with fewer, above 10% over the comparison point. No absolute resource budgets. A zero baseline has no percentage."]
    lines += [f"- {warning}" for warning in compared["warnings"]]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run", type=Path)
    parser.add_argument("--previous", type=Path)
    parser.add_argument("--history", type=Path, help="directory of earlier runs; picks the comparison point and band")
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
    if args.history:
        matching = window_for(new, history(args.history, args.run))
        if matching:
            old = matching[0][1]
            new["comparison"] = comparison(new, window=[night for _, night in matching])
            if not new["comparison"]["reason"]:
                new["comparison"]["baseline_run"] = matching[0][0].name
                new["comparison"]["frames"] = growth(matching[0][0], args.run)
        else:
            newest = next(iter(history(args.history, args.run)), (None, None))[1]
            old = newest
            new["comparison"] = comparison(new, newest)
    else:
        new["comparison"] = comparison(new, old)
        if previous_error:
            new["comparison"]["reason"] = previous_error
        elif old is not None and not new["comparison"]["reason"]:
            new["comparison"]["frames"] = growth(args.previous, args.run)
    text = markdown(new, old)
    (args.run / "report.json").write_text(json.dumps(new, indent=2, sort_keys=True, allow_nan=False) + "\n")
    (args.run / "report.md").write_text(text)
    print(text, end="")
    return 0 if new["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
