"""Reference Silero v6.2.1 (ONNX Runtime, CPU) per-32 ms probabilities.
usage: silero_probs.py <in.f32> <out.json>"""
import json, sys, time
import numpy as np, torch
from silero_vad import load_silero_vad

torch.set_num_threads(1)
audio = np.fromfile(sys.argv[1], dtype="<f4")
model = load_silero_vad(onnx=True)
x = torch.from_numpy(audio)
model(x[:512], 16000); model.reset_states()
t = time.perf_counter()
probs = [float(model(x[i:i + 512], 16000)) for i in range(0, len(x) - 511, 512)]
wall = time.perf_counter() - t
json.dump({"engine": "silero-v6.2.1-onnx", "hop": 512 / 16000, "wall": wall,
           "audio": len(audio) / 16000, "probs": probs}, open(sys.argv[2], "w"))
print(f"silero {len(probs)} hops, {wall:.1f} s wall, RTFx {len(audio)/16000/wall:.0f}")
