"""Focused fixed-window VAD experiment; private inputs/outputs stay in work/.

Run with uv run python hallucinations.py --call '<recording folder>'. Requires
ffmpeg, macOS say, and ../spike/.build/release/audelin-vad. No capture devices
are opened. Speech is synthesized or taken from the committed English fixture.
"""
import argparse
import csv
import json
import subprocess
from pathlib import Path

import numpy as np


HERE = Path(__file__).resolve().parent
PROBE = HERE.parent / "spike/.build/release/audelin-vad"
RATE = 16000
SIZE = 8 * RATE
THRESHOLDS = (0.3, 0.5, 0.7, 0.9, 0.95)


def run(*args):
    subprocess.run([str(a) for a in args], check=True)


def decode(path, start=0, duration=8):
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", str(start), "-t", str(duration),
         "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "pipe:1"],
        check=True, capture_output=True,
    )
    return np.frombuffer(result.stdout, dtype="<f4").copy()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--call", type=Path, required=True)
    args = parser.parse_args()
    out = HERE / "work/hallucinations"
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(1107)
    cases = []

    def add(name, samples, expected, kind):
        if len(samples) != SIZE:
            raise ValueError(f"{name}: expected eight seconds, got {len(samples)/RATE}")
        path = out / f"{name}.f32"
        samples.astype("<f4").tofile(path)
        cases.append(dict(name=name, expected=expected, kind=kind, path=path))

    for start in (50, 70):
        add(f"reported-silence-{start}", decode(args.call / "microphone.caf", start),
            "", "owner-reported silence")
    add("digital-silence", np.zeros(SIZE), "", "synthetic non-speech")
    for level in (-69, -50):
        noise = rng.normal(size=SIZE)
        noise *= 10 ** (level / 20) / np.sqrt(np.mean(noise ** 2))
        add(f"noise-{abs(level)}", noise, "", "synthetic non-speech")

    texts = {
        "russian": ("Milena", "Давайте проверим запись разговора и обсудим следующий шаг."),
        "english-terms": ("Samantha", "Please review the API and pull request before deployment."),
    }
    sources = []
    for name, (voice, text) in texts.items():
        path = out / f"{name}.aiff"
        run("say", "-v", voice, "-r", "160", "-o", path, text)
        sources.append((name, decode(path, duration=20), text, "synthetic speech"))
    fixture = HERE.parents[2] / "macos/Tests/ParakeetRecognizerTests/Fixtures/diff-means.wav"
    sources.append(("english-human", decode(fixture), "Diff means comparing", "human speech"))
    for name, speech, text, kind in sources:
        if len(speech) > SIZE - RATE:
            raise ValueError(f"{name}: speech does not fit; refusing to truncate")
        speech_rms = np.sqrt(np.mean(speech ** 2))
        for level in (-30, -45, -55, -65):
            samples = rng.normal(0, 10 ** (-69 / 20), SIZE)
            samples[RATE:RATE + len(speech)] += speech * 10 ** (level / 20) / speech_rms
            add(f"{name}-{abs(level)}", samples, text, kind)

    # One ASR model load, but each eight-second window has fresh decoder state.
    # Gating never crops samples: retained windows reuse exactly this baseline.
    joined = np.concatenate([np.fromfile(c["path"], dtype="<f4") for c in cases])
    joined.tofile(out / "all.f32")
    spans = [[8 * i, 8 * (i + 1)] for i in range(len(cases))]
    (out / "windows.json").write_text(json.dumps(spans))
    run(PROBE, "asr", out / "all.f32", out / "asr.json", out / "windows.json")
    words = json.loads((out / "asr.json").read_text())["words"]
    rows = []
    for i, case in enumerate(cases):
        name = case["name"]
        baseline = " ".join(w["w"] for w in words if 8*i <= w["s"] < 8*(i+1))
        for engine in ("fluid", "silero"):
            path = out / f"{name}.{engine}.json"
            if engine == "fluid":
                run(PROBE, "vad", case["path"], path)
            else:
                run("python", HERE / "silero_probs.py", case["path"], path)
            probs = json.loads(path.read_text())["probs"]
            peak = max(probs, default=0)
            rows.append(dict(name=name, kind=case["kind"], expected=case["expected"],
                             baseline=baseline, engine=engine, peak=peak,
                             kept={str(t): peak >= t for t in THRESHOLDS}))
    (out / "results.json").write_text(json.dumps(rows, indent=2) + "\n")
    # Share measurements without recording names, audio or private transcripts.
    with (out / "summary.csv").open("w", newline="") as stream:
        fields = ["name", "kind", "engine", "peak", "reference_words", "baseline_words",
                  *[f"keep_{t}" for t in THRESHOLDS]]
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow(dict(name=row["name"], kind=row["kind"], engine=row["engine"],
                                 peak=f'{row["peak"]:.6f}',
                                 reference_words=len(row["expected"].split()),
                                 baseline_words=len(row["baseline"].split()),
                                 **{f"keep_{t}": int(keep) for t, keep in row["kept"].items()}))
    print(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
