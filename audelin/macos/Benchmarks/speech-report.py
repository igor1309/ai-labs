#!/usr/bin/env python3
"""speech-report.py LINES=FILE [LINES=FILE...]: decoding, backlog and latency per length and side, from ProfileSpeech output. A tag's runs repeat a length."""
import statistics, sys


def read(path):
    """Returns (start time, hear rows per side, panel rows per side)."""
    start, hears, panels = None, {}, {}
    for line in open(path, errors="replace"):
        cells = line.split()
        if not cells:
            continue
        if cells[0] == "start":
            start = float(cells[1])
        elif cells[0] == "hear":
            hears.setdefault(cells[1], []).append(tuple(map(float, cells[2:7])))
        elif cells[0] == "panel":
            panels.setdefault(cells[1], []).append(tuple(map(float, cells[2:4])))
    return start, hears, panels


def metrics(start, hears, panels):
    """One side's figures. A hear row is (began, ended, audio end, final through, last word end); a panel row is (time, word end)."""
    audio = hears[-1][2] if hears else 0
    decoding = sum(ended - began for began, ended, *_ in hears) / audio if audio else 0
    # How far behind the live audio each chunk was when its read began.
    queue = [began - (start + end) for began, _, end, *_ in hears]
    third = max(len(queue) // 3, 1)
    window, final, seen, waiting = [], [], -1, []
    for (began, ended, end, final_through, last), delay in zip(hears, queue):
        if last > seen:
            seen = last
            window.append(ended - (start + last) - max(delay, 0))
            waiting.append(last)
        while waiting and final_through >= waiting[0]:
            final.append(ended - (start + waiting.pop(0)))
    panel = [time - (start + word) for time, word in panels]
    return {
        "decoding": decoding,
        "backlog_early": statistics.median(queue[:third]) if queue else 0,
        "backlog_late": statistics.median(queue[-third:]) if queue else 0,
        "window": statistics.median(window) if window else 0,
        "to_panel": statistics.median(panel) if panel else 0,
        "to_final": statistics.median(final) if final else 0,
        "words": len(panel),
    }


def main(pairs):
    print("| lines | side | decoding ÷ audio | backlog early s | backlog late s | window delay s | capture→panel s | capture→final s | words matched |")
    print("|---|---|---|---|---|---|---|---|---|")
    for pair in pairs:
        lines, path = pair.split("=", 1)
        start, hears, panels = read(path)
        for side in sorted(hears):
            m = metrics(start, hears[side], panels.get(side, []))
            print(f"| {int(lines):,} | {side} | {m['decoding']:.3f} | {m['backlog_early']:.2f} | {m['backlog_late']:.2f} | {m['window']:.2f} | {m['to_panel']:.2f} | {m['to_final']:.2f} | {m['words']} |")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)
    main(sys.argv[1:])
