"""WER of Parakeet v3 on raw vs LocalVQE-denoised speech, on public sets with human transcripts.

usage (from audelin/docs/research/enhance):
  uv run python labelled.py build <librispeech test-clean dir> <fleurs ru dir> <voices dir> <demand dir>
      writes work/lab/<set>/<id>.f32 (16 kHz mono float32) and work/lab/manifest.json
  uv run python labelled.py lists
      writes work/lab/raw.list (every input) and work/lab/enh.list (their denoised copies)
  uv run python labelled.py score
      reads work/lab/raw.jsonl and work/lab/enh.jsonl (audelin-enhance asr-batch output)

Noisy sets add a DEMAND recording (cafeteria, meeting room) at a fixed SNR measured
over the whole utterance; the noise offset is seeded by the utterance id, so a rebuild
gives the same mixes. VOiCES clips are real far-field room recordings with their own
distractor noise (none, babble, music, television).
"""
import json
import re
import sys
import zlib
from pathlib import Path

import numpy as np
import soundfile as sf

WORK = Path(__file__).resolve().parent / "work" / "lab"
PER_SET = 120
SNRS = (10, 0)
NOISES = {"cafe": "PCAFETER", "meeting": "OMEETING"}


def write_f32(path, samples):
    path.parent.mkdir(parents=True, exist_ok=True)
    np.asarray(samples, dtype="<f4").tofile(path)


def read16k(path):
    audio, rate = sf.read(path, dtype="float32", always_2d=True)
    audio = audio.mean(axis=1)
    if rate != 16000:
        raise SystemExit(f"{path}: {rate} Hz, expected 16 kHz")
    return audio


def mix(speech, noise, snr, key):
    rng = np.random.default_rng(zlib.crc32(key.encode()))
    start = rng.integers(0, len(noise) - len(speech))
    piece = noise[start:start + len(speech)]
    ps, pn = np.mean(speech**2), np.mean(piece**2) + 1e-12
    out = speech + piece * np.sqrt(ps / (pn * 10 ** (snr / 10)))
    peak = np.max(np.abs(out))
    return out / peak * 0.9 if peak > 0.99 else out


def librispeech(root):
    items = []
    for trans in sorted(Path(root).rglob("*.trans.txt")):
        for line in trans.read_text().splitlines():
            uid, text = line.split(" ", 1)
            items.append((uid, trans.parent / f"{uid}.flac", text))
    return items[:: max(1, len(items) // PER_SET)][:PER_SET]


def fleurs(root):
    root = Path(root)
    items = []
    for line in (root / "trans.txt").read_text().splitlines():
        uid, text = line.split(" ", 1)
        if (root / f"{uid}.wav").exists():
            items.append((uid, root / f"{uid}.wav", text))
    return items[:PER_SET]


def voices(root):
    root = Path(root)
    refs = {}
    for line in (root / "ref.csv").read_text().splitlines()[1:]:
        name, text = line.split(",", 1)
        refs[name.strip()] = text.strip()
    items = []
    for wav in sorted(root.rglob("*.wav")):
        if wav.stem in refs:
            items.append((wav.stem, wav, refs[wav.stem]))
    return items


def build(libri_dir, fleurs_dir, voices_dir, demand_dir):
    noises = {k: read16k(Path(demand_dir) / v / "ch01.wav") for k, v in NOISES.items()}
    manifest = []

    def add(set_name, uid, audio, ref, lang, condition):
        path = WORK / set_name / f"{uid}.f32"
        write_f32(path, audio)
        manifest.append({"set": set_name, "id": uid, "ref": ref, "lang": lang,
                         "condition": condition, "raw": str(path), "audio": len(audio) / 16000})

    for lang, items in (("en", librispeech(libri_dir)), ("ru", fleurs(fleurs_dir))):
        base = "libri" if lang == "en" else "fleurs"
        for uid, path, ref in items:
            speech = read16k(path)
            add(f"{base}-clean", uid, speech, ref, lang, "clean")
            for noise_name, noise in noises.items():
                for snr in SNRS:
                    add(f"{base}-{noise_name}-{snr}dB", uid, mix(speech, noise, snr, f"{uid}{noise_name}{snr}"),
                        ref, lang, f"{noise_name} {snr} dB")
    for uid, path, ref in voices(voices_dir):
        distractor = uid.split("-")[4]
        add(f"voices-{distractor}", uid, read16k(path), ref, "en", f"far-field, {distractor}")
    (WORK / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=0))
    print(f"{len(manifest)} files, {sum(m['audio'] for m in manifest) / 60:.1f} min")


def lists():
    manifest = json.loads((WORK / "manifest.json").read_text())
    (WORK / "raw.list").write_text("\n".join(m["raw"] for m in manifest) + "\n")
    (WORK / "enh.list").write_text("\n".join(enh_path(m) for m in manifest) + "\n")
    for set_name in sorted({m["set"] for m in manifest}):
        (WORK / "enh" / set_name).mkdir(parents=True, exist_ok=True)
        (WORK / f"denoise-{set_name}.list").write_text(
            "\n".join(m["raw"] for m in manifest if m["set"] == set_name) + "\n")


def enh_path(m):
    return str(WORK / "enh" / m["set"] / f"{m['id']}.f32")


def words(text):
    text = text.lower().replace("ё", "е")
    text = re.sub(r"[^\w\s']|_", " ", text)
    return text.split()


def edits(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        prev, d[0] = d[0], i
        for j, h in enumerate(hyp, 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r != h))
            prev, d[j] = d[j], cur
    return d[len(hyp)]


def score():
    manifest = json.loads((WORK / "manifest.json").read_text())
    hyps = {}
    for name in ("raw", "enh"):
        for line in (WORK / f"{name}.jsonl").read_text().splitlines():
            row = json.loads(line)
            hyps[row["path"]] = row["text"]
    sets = {}
    for m in manifest:
        ref = words(m["ref"])
        e_raw = edits(ref, words(hyps[m["raw"]]))
        e_enh = edits(ref, words(hyps[enh_path(m)]))
        s = sets.setdefault(m["set"], {"condition": m["condition"], "lang": m["lang"], "n": 0, "words": 0,
                                       "raw": 0, "enh": 0, "better": 0, "worse": 0})
        s["n"] += 1
        s["words"] += len(ref)
        s["raw"] += e_raw
        s["enh"] += e_enh
        s["better"] += e_enh < e_raw
        s["worse"] += e_enh > e_raw
    print("| Set | Language | Condition | Utterances | WER raw | WER LocalVQE (no ref) | Δ pt | better / worse |")
    print("|---|---|---|---:|---:|---:|---:|---:|")
    rows = []
    for name, s in sorted(sets.items()):
        raw, enh = 100 * s["raw"] / s["words"], 100 * s["enh"] / s["words"]
        rows.append({"set": name, **s, "werRaw": raw, "werEnh": enh})
        print(f"| {name} | {s['lang']} | {s['condition']} | {s['n']} | {raw:.1f} % | {enh:.1f} % | "
              f"{enh - raw:+.1f} | {s['better']} / {s['worse']} |")
    (WORK / "score.json").write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    {"build": lambda: build(*sys.argv[2:6]), "lists": lists, "score": score}[sys.argv[1]]()
