// VAD comparison probe. Subcommands:
//   prep <in.caf> <out.f32>            16 kHz mono float32, raw little-endian
//   vad  <in.f32> <out.json>           FluidAudio Silero per-hop probabilities
//   asr  <in.f32> <out.json> [spans]   Parakeet words over the whole file, or
//                                      only over the spans in a JSON [[s,e],...]
import FluidAudio
import Foundation

let rate = 16_000.0

func readF32(_ path: String) throws -> [Float] {
    let data = try Data(contentsOf: URL(fileURLWithPath: path))
    return data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
}

func writeJSON(_ value: Any, _ path: String) throws {
    let data = try JSONSerialization.data(withJSONObject: value)
    try data.write(to: URL(fileURLWithPath: path))
}

func now() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1e9 }

let args = CommandLine.arguments
guard args.count >= 4 else {
    FileHandle.standardError.write("usage: audelin-vad prep|vad|asr <in> <out> [spans]\n".data(using: .utf8)!)
    exit(2)
}

switch args[1] {
case "prep":
    let samples = try AudioConverter().resampleAudioFile(URL(fileURLWithPath: args[2]))
    try samples.withUnsafeBufferPointer { try Data(buffer: $0).write(to: URL(fileURLWithPath: args[3])) }
    print("prep \(samples.count) samples, \(Double(samples.count) / rate) s")

case "vad":
    let samples = try readF32(args[2])
    let manager = try await VadManager(config: VadConfig(defaultThreshold: 0.5))
    _ = try await manager.process(Array(samples.prefix(16_000)))  // warm up
    let start = now()
    let results = try await manager.process(samples)
    let wall = now() - start
    let hop = Double(samples.count) / rate / Double(max(results.count, 1))
    try writeJSON([
        "engine": "fluidaudio-silero-v6.2.1-coreml",
        "hop": hop,
        "wall": wall,
        "audio": Double(samples.count) / rate,
        "probs": results.map { Double($0.probability) },
    ], args[3])
    print("vad \(results.count) hops of \(hop) s, \(wall) s wall, RTFx \(Double(samples.count) / rate / wall)")

case "asr":
    let samples = try readF32(args[2])
    var spans: [[Double]] = [[0, Double(samples.count) / rate]]
    if args.count > 4 {
        let data = try Data(contentsOf: URL(fileURLWithPath: args[4]))
        spans = try JSONSerialization.jsonObject(with: data) as! [[Double]]
    }
    let models = try await AsrModels.downloadAndLoad(version: .v3)
    let manager = AsrManager(config: .default)
    try await manager.loadModels(models)
    let shortest = ASRConstants.minimumRequiredSamples(forSampleRate: 16_000)
    var words: [[String: Any]] = []
    var processed = 0.0
    let start = now()
    for span in spans {
        let a = max(0, Int(span[0] * rate)), b = min(samples.count, Int(span[1] * rate))
        guard b > a else { continue }
        var chunk = Array(samples[a..<b])
        processed += Double(chunk.count) / rate
        if chunk.count < shortest { chunk += [Float](repeating: 0, count: shortest - chunk.count) }
        var state = TdtDecoderState.make()
        let timings = try await manager.transcribe(chunk, decoderState: &state).tokenTimings ?? []
        for w in buildWordTimings(from: timings) where w.startTime < span[1] - span[0] {
            words.append(["w": w.word, "s": span[0] + w.startTime, "e": span[0] + w.endTime])
        }
    }
    let wall = now() - start
    try writeJSON(["wall": wall, "processed": processed, "words": words], args[3])
    print("asr \(words.count) words over \(processed) s audio, \(wall) s wall")

default:
    exit(2)
}
