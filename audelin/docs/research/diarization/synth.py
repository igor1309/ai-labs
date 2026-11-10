"""Synthetic group calls with speaker turns known by construction.

usage (from audelin/docs/research/diarization):
  uv run python synth.py [--seed 1130] [--per-count 6] [--out work/synth]

For each speaker count 2..6 it builds --per-count calls of 10-20 minutes and writes
  work/synth/<call>.f32    16 kHz mono float32, raw little-endian (audelin-diarize input)
  work/synth/<call>.rttm   reference speaker turns
  work/synth/<call>.json   how the call was built (speakers, sources, codec, gain, SNR)
The same seed and the same downloaded sets give the same calls.

How a call is built
  Turns: a 10-20 minute window of an AMI train or dev meeting (forced-alignment RTTMs)
  gives turn lengths, pauses, short back-channel turns and overlap as people really
  take turns. Four AMI speakers map to the call's N: for N < 4 the least active are
  dropped and pauses over 1.5 s are shortened; for N > 4 the most active AMI speakers'
  stretches between their own pauses of 3 s or more go alternately to a second speaker.
  Voices: each call speaker is a distinct reader from Russian LibriSpeech (RuLS); in a
  quarter of the calls one speaker reads English (LibriSpeech test-clean) instead.
  A turn is filled with that reader's speech, cut from where their voice starts; a turn
  under 0.6 s takes a single short word-like burst of their speech (back-channel stand-in).
  Line: each speaker's track passes through Opus (VoIP mode, 12-32 kbps, 20 ms frames)
  and 0-5 % packet loss (lost 20 ms frames replaced by the previous frame, fading),
  then a gain of -8..+8 dB and their own noise at 15-35 dB SNR, and the tracks are mixed.
  Reference: per speaker, 10 ms frames whose placed speech is within 35 dB of that
  speaker's peak level, gaps under 0.25 s bridged, written as RTTM. Speech pauses
  inside a read sentence are therefore not counted as speech, as in forced alignment.
"""
import argparse
import json
import random
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.signal import lfilter

SR = 16000
HERE = Path(__file__).resolve().parent
DATA = HERE / "work" / "Datasets"
AMI = DATA / "diar-forced-alignment" / "AMI"
RULS = DATA / "ruls_data"
LIBRI = DATA / "LibriSpeech" / "test-clean"


def load(path):
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).copy()


def readers(root, exts):
    """speaker id -> sorted utterance files; the speaker is the directory two levels up."""
    by = {}
    for ext in exts:
        for f in root.rglob(f"*.{ext}"):
            by.setdefault(f"{root.name}:{f.parent.parent.name}", []).append(f)
    return {k: sorted(v) for k, v in sorted(by.items()) if len(v) >= 20}


def ami_meetings():
    out = {}
    for part in ("train", "dev"):
        for f in sorted((AMI / part).glob("*.rttm")):
            turns = []
            for line in f.read_text().splitlines():
                x = line.split()
                if x and x[0] == "SPEAKER":
                    turns.append((x[7], float(x[3]), float(x[3]) + float(x[4])))
            out[f.stem] = turns
    return out


def frame_energy(x, hop=160):
    n = len(x) // hop
    return 10 * np.log10(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)


class Voice:
    """A reader's speech, handed out in order, each piece starting where speech starts."""

    def __init__(self, files, rng):
        self.files = list(files)
        rng.shuffle(self.files)
        self.buf = np.zeros(0, dtype=np.float32)
        self.used = []

    def _fill(self, n):
        while len(self.buf) < n:
            if not self.files:
                raise RuntimeError("reader ran out of speech")
            f = self.files.pop()
            self.used.append(str(f.relative_to(DATA)))
            x = load(f)
            x = x / (np.max(np.abs(x)) + 1e-9) * 0.5
            self.buf = np.concatenate([self.buf, x, np.zeros(int(0.2 * SR), np.float32)])

    def _onset(self):
        self._fill(SR * 3)
        e = frame_energy(self.buf[: SR * 3])
        on = np.flatnonzero(e > e.max() - 30)
        start = on[0] * 160 if len(on) else 0
        self.buf = self.buf[start:]

    def take(self, n):
        self._onset()
        self._fill(n)
        out, self.buf = self.buf[:n].copy(), self.buf[n:]
        return out

    def burst(self, n):
        """A short word-like burst: speech up to the first pause of 120 ms, at most n."""
        self._onset()
        self._fill(n)
        e = frame_energy(self.buf[:n])
        quiet = e < e.max() - 30
        end = n
        run = 0
        for i, q in enumerate(quiet):
            run = run + 1 if q else 0
            if run >= 12 and i * 160 > 0.15 * SR:
                end = (i - 11) * 160
                break
        out, self.buf = self.buf[:end].copy(), self.buf[end:]
        return out


def fade(x, ms=10):
    k = min(len(x) // 2, int(ms * SR / 1000))
    if k:
        w = np.linspace(0, 1, k, dtype=np.float32)
        x[:k] *= w
        x[-k:] *= w[::-1]
    return x


def map_turns(turns, start, length, n, rng):
    """AMI turns inside [start, start+length) mapped to n call speakers, times from 0."""
    turns = [(s, max(a, start) - start, min(b, start + length) - start)
             for s, a, b in turns if b > start and a < start + length]
    turns = [t for t in turns if t[2] - t[1] > 0.05]
    talk = {}
    for s, a, b in turns:
        talk[s] = talk.get(s, 0) + b - a
    order = sorted(talk, key=lambda s: -talk[s])
    if n <= len(order):
        keep = set(order[:n])
        turns = [t for t in turns if t[0] in keep]
        names = {s: i for i, s in enumerate(order[:n])}
        out = [(names[s], a, b) for s, a, b in turns]
    else:
        names = {s: i for i, s in enumerate(order)}
        extra = n - len(order)
        split = {s: len(order) + i for i, s in enumerate(order[:extra])}
        out, last_end, side = [], {}, {}
        for s, a, b in sorted(turns, key=lambda t: t[1]):
            sp = names[s]
            if s in split:
                if a - last_end.get(s, -1e9) >= 3.0:
                    side[s] = not side.get(s, rng.random() < 0.5)
                sp = split[s] if side[s] else sp
            last_end[s] = max(last_end.get(s, 0), b)
            out.append((sp, a, b))
    # shorten long pauses where nobody talks (dropping speakers leaves gaps)
    out.sort(key=lambda t: t[1])
    shifted, shift, reach = [], 0.0, 0.0
    for sp, a, b in out:
        gap = a - reach
        if gap > 1.5:
            shift += gap - rng.uniform(0.3, 1.5)
        shifted.append((sp, a - shift, b - shift))
        reach = max(reach, b)
    return shifted


def opus_line(x, kbps, loss, rng, tmp):
    src, enc, dec = (Path(tmp) / f for f in ("in.f32", "line.opus", "out.f32"))
    x.astype(np.float32).tofile(src)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", str(src),
                    "-c:a", "libopus", "-application", "voip", "-b:a", f"{kbps}k", "-frame_duration", "20",
                    "-packet_loss", str(max(1, round(loss * 100))), "-fec", "1", str(enc)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(enc), "-ac", "1", "-ar", str(SR),
                    "-f", "f32le", str(dec)], check=True)
    y = np.fromfile(dec, dtype=np.float32)[: len(x)]
    y = np.pad(y, (0, len(x) - len(y)))
    fr = SR // 50
    prev, gain, lost = None, 1.0, 0
    for i in range(0, len(y) - fr, fr):
        if prev is not None and rng.random() < loss:
            gain *= 0.5
            y[i:i + fr] = prev * gain
            lost += 1
        else:
            gain = 1.0
            prev = y[i:i + fr].copy()
    return y, lost


def noise(n, rng):
    """Pink-ish noise: white noise through a one-pole low-pass, mixed with white."""
    w = rng.standard_normal(n).astype(np.float32)
    p = lfilter([0.05], [1, -0.95], w).astype(np.float32)
    p /= np.std(p) + 1e-9
    return 0.7 * p + 0.3 * w


def reference(track, bridge=0.25):
    e = frame_energy(track)
    on = e > e.max() - 35
    segs, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]:
                j += 1
            segs.append([i * 0.01, j * 0.01])
            i = j
        else:
            i += 1
    merged = []
    for a, b in segs:
        if merged and a - merged[-1][1] < bridge:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    return [(a, b) for a, b in merged if b - a >= 0.05]


def build(name, n, rng, ru, en, meetings, english):
    meeting = rng.choice(sorted(m for m, t in meetings.items() if max(b for _, _, b in t) > 1300))
    turns = meetings[meeting]
    minutes = rng.uniform(10, 20)
    end = max(b for _, _, b in turns)
    start = rng.uniform(0, max(0.0, end - minutes * 60 * 1.6))
    mapped = []
    window = minutes * 60
    while True:  # a longer AMI window until the mapped turns cover the target length
        mapped = map_turns(turns, start, window, n, rng)
        if not mapped or max(b for _, _, b in mapped) >= minutes * 60 or start + window >= end:
            break
        window *= 1.2
    mapped = [(s, a, min(b, minutes * 60)) for s, a, b in mapped if a < minutes * 60 - 0.1]
    length = int(minutes * 60 * SR) + SR

    picks = rng.sample(sorted(ru), n)
    if english:
        picks[rng.randrange(n)] = rng.choice(sorted(en))
    pools = {**ru, **en}
    voices = [Voice(pools[p], rng) for p in picks]
    tracks = [np.zeros(length, np.float32) for _ in range(n)]
    for sp, a, b in mapped:
        i, k = int(a * SR), int((b - a) * SR)
        piece = voices[sp].burst(k) if b - a < 0.6 else voices[sp].take(k)
        piece = fade(piece[: length - i])
        tracks[sp][i:i + len(piece)] += piece

    nrng = np.random.default_rng(rng.randrange(2 ** 32))
    lines, mix = [], np.zeros(length, np.float32)
    ref = []
    with tempfile.TemporaryDirectory() as tmp:
        for sp in range(n):
            ref += [(f"spk{sp}", a, b) for a, b in reference(tracks[sp])]
            kbps, loss = rng.choice([12, 16, 20, 24, 32]), rng.uniform(0, 0.05)
            gain_db, snr = rng.uniform(-8, 8), rng.uniform(15, 35)
            y, lost = opus_line(tracks[sp], kbps, loss, nrng, tmp)
            speech = y[np.abs(tracks[sp]) > 1e-4]
            level = np.sqrt(np.mean(speech ** 2)) if len(speech) else 0.01
            y = y + noise(length, nrng) * level / (10 ** (snr / 20))
            mix += y * (10 ** (gain_db / 20))
            lines.append({"speaker": f"spk{sp}", "reader": picks[sp], "kbps": kbps, "loss": round(loss, 4),
                          "lostFrames": lost, "gainDb": round(gain_db, 2), "snrDb": round(snr, 2),
                          "sources": voices[sp].used})
    mix *= 0.7 / (np.max(np.abs(mix)) + 1e-9)
    return mix, sorted(ref, key=lambda t: t[1]), {
        "name": name, "speakers": n, "minutes": round(minutes, 3), "ami": meeting, "amiStart": round(start, 3),
        "english": english, "lines": lines}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=1130)
    ap.add_argument("--per-count", type=int, default=6)
    ap.add_argument("--out", default=str(HERE / "work" / "synth"))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    ru, en, meetings = readers(RULS, ("wav", "flac")), readers(LIBRI, ("flac",)), ami_meetings()
    print(f"{len(ru)} Russian readers, {len(en)} English readers, {len(meetings)} AMI meetings")
    for n in range(2, 7):
        for k in range(args.per_count):
            name = f"n{n}-{k:02d}"
            rng = random.Random(f"{args.seed}/{name}")  # each call stands on its own seed
            if (out / f"{name}.rttm").exists():
                continue
            mix, ref, meta = build(name, n, rng, ru, en, meetings, english=rng.random() < 0.25)
            mix.astype("<f4").tofile(out / f"{name}.f32")
            (out / f"{name}.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False))
            (out / f"{name}.rttm").write_text("".join(
                f"SPEAKER {name} 1 {a:.3f} {b - a:.3f} <NA> <NA> {s} <NA> <NA>\n" for s, a, b in ref))
            print(f"{name}: {meta['minutes']:.1f} min, {len(ref)} turns, ami {meta['ami']}", flush=True)


if __name__ == "__main__":
    main()
