"""Delay between the microphone and call tracks of Audelin recordings (LAB-1133).

For each call, GCC-PHAT over 8 s windows every 15 s, at 48 kHz, lags within
±250 ms. A positive delay means the call track's audio reaches the microphone
that much later. Only windows whose peak stands clear of the rest (peak / mean
of |cc| >= PEAK) count: without bleed there is no echo path to find.

usage: uv run python align.py "<call folder>"...
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

RATE = 48_000
WINDOW, HOP, MAX_LAG = 8.0, 15.0, 0.25
PEAK = 12.0


def gcc_phat(mic, ref, max_lag):
    n = 1 << (len(mic) + len(ref)).bit_length()
    cross = np.fft.rfft(mic, n) * np.conj(np.fft.rfft(ref, n))
    cc = np.fft.irfft(cross / (np.abs(cross) + 1e-12), n)
    cc = np.concatenate((cc[-max_lag:], cc[: max_lag + 1]))
    i = int(np.argmax(np.abs(cc)))
    # Parabolic interpolation for a sub-sample peak.
    if 0 < i < len(cc) - 1:
        a, b, c = np.abs(cc[i - 1 : i + 2])
        frac = 0.5 * (a - c) / (a - 2 * b + c) if a - 2 * b + c else 0.0
    else:
        frac = 0.0
    return (i - max_lag + frac) / RATE, float(np.abs(cc[i]) / (np.mean(np.abs(cc)) + 1e-12))


def read(path):
    """Decodes with Core Audio's afconvert: libsndfile rejects some Audelin CAFs."""
    with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as tmp:
        wav = Path(tmp) / "a.wav"
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEF32", str(path), str(wav)], check=True)
        return sf.read(wav, dtype="float32")


def measure(folder):
    mic, rm = read(folder / "microphone.caf")
    ref, rr = read(folder / "call.caf")
    assert rm == rr == RATE, (rm, rr)
    n, w, lag = min(len(mic), len(ref)), int(WINDOW * RATE), int(MAX_LAG * RATE)
    found = []
    for s in range(0, n - w, int(HOP * RATE)):
        r = ref[s : s + w]
        if np.sqrt(np.mean(r**2)) < 1e-3:
            continue
        d, p = gcc_phat(mic[s : s + w], r, lag)
        if p >= PEAK:
            found.append((s / RATE, d * 1000, p))
    return len(mic) / RATE, len(ref) / RATE, found


def main():
    print("| Call | mic s | call s | windows with echo | median ms | min ms | max ms | drift ms/min |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|")
    for arg in sys.argv[1:]:
        folder = Path(arg)
        try:
            lm, lr, found = measure(folder)
        except (sf.LibsndfileError, subprocess.CalledProcessError):
            print(f"| {folder.name} | unreadable | | | | | | |")
            continue
        if not found:
            print(f"| {folder.name} | {lm:.2f} | {lr:.2f} | 0 | – | – | – | – |")
            continue
        if os.environ.get("VERBOSE"):
            for f in found:
                print(f"  {f[0]:7.1f} s  {f[1]:8.2f} ms  peak {f[2]:.1f}")
        t, d = np.array([f[0] for f in found]), np.array([f[1] for f in found])
        drift = np.polyfit(t / 60, d, 1)[0] if len(found) > 2 else float("nan")
        print(f"| {folder.name} | {lm:.2f} | {lr:.2f} | {len(found)} | {np.median(d):.2f} | "
              f"{d.min():.2f} | {d.max():.2f} | {drift:.2f} |")


if __name__ == "__main__":
    main()
