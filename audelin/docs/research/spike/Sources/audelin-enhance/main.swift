// LocalVQE probe for LAB-1102. Audio is 16 kHz mono float32, raw little-endian
// (`audelin-vad prep` writes it). Subcommands:
//   enhance <mic.f32> <ref.f32|none> <out.f32> [v1.3|v1.2]
//       whole-file LocalVQE (256 ms chunks, CPU); the reference is trimmed or
//       zero-padded to the mic's length; prints one JSON line of cost
//   denoise-batch <list> <outdir> [v1.3|v1.2]
//       each line of <list> is an audio file of any format; writes
//       <outdir>/<basename>.f32, enhanced with a silent reference
//   asr-batch <list> <out.jsonl>
//       Parakeet v3 over each listed file (.f32 raw, anything else converted);
//       one JSON line per file: {"path", "text", "audio", "wall"}
//   live <mic.f32> <ref.f32> <seconds>
//       feeds a LocalVqeStream (16 ms chunk) 10 ms blocks paced to the wall
//       clock for <seconds>, as a capture callback would; prints the per-push
//       latency distribution and the process CPU used
import Darwin
import FluidAudio
import Foundation

let rate = 16_000.0

func readF32(_ path: String) throws -> [Float] {
    let data = try Data(contentsOf: URL(fileURLWithPath: path))
    return data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
}

func writeF32(_ samples: [Float], _ path: String) throws {
    try samples.withUnsafeBufferPointer { try Data(buffer: $0).write(to: URL(fileURLWithPath: path)) }
}

func load(_ path: String) throws -> [Float] {
    path.hasSuffix(".f32") ? try readF32(path) : try AudioConverter().resampleAudioFile(URL(fileURLWithPath: path))
}

func now() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1e9 }

func cpuSeconds() -> Double {
    var usage = rusage()
    getrusage(RUSAGE_SELF, &usage)
    func s(_ t: timeval) -> Double { Double(t.tv_sec) + Double(t.tv_usec) / 1e6 }
    return s(usage.ru_utime) + s(usage.ru_stime)
}

func emit(_ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}

func variant(_ index: Int) -> LocalVqeVariant {
    CommandLine.arguments.count > index ? LocalVqeVariant(rawValue: CommandLine.arguments[index]) ?? .v13 : .v13
}

func fitted(_ reference: [Float], to count: Int) -> [Float] {
    reference.count >= count ? Array(reference.prefix(count))
        : reference + [Float](repeating: 0, count: count - reference.count)
}

let args = CommandLine.arguments
guard args.count >= 4 else {
    FileHandle.standardError.write("usage: audelin-enhance enhance|denoise-batch|asr-batch|live ...\n".data(using: .utf8)!)
    exit(2)
}

switch args[1] {
case "enhance":
    let mic = try readF32(args[2])
    let reference = args[3] == "none" ? [Float](repeating: 0, count: mic.count) : fitted(try readF32(args[3]), to: mic.count)
    let load0 = now()
    let manager = try await LocalVqeManager(config: LocalVqeConfig(variant: variant(5)))
    let loadWall = now() - load0
    let cpu0 = cpuSeconds(), start = now()
    let out = try await manager.process(mic: mic, reference: reference)
    let wall = now() - start, cpu = cpuSeconds() - cpu0
    try writeF32(out, args[4])
    let audio = Double(mic.count) / rate
    emit(["audio": audio, "wall": wall, "cpu": cpu, "rtfx": audio / wall, "load": loadWall,
          "cpuPerAudioSecond": cpu / audio, "variant": variant(5).rawValue, "reference": args[3] != "none"])

case "denoise-batch":
    let paths = try String(contentsOfFile: args[2], encoding: .utf8).split(separator: "\n").map(String.init)
    let manager = try await LocalVqeManager(config: LocalVqeConfig(variant: variant(4)))
    var audio = 0.0, wall = 0.0
    for path in paths where !path.isEmpty {
        let mic = try load(path)
        let start = now()
        let out = try await manager.process(mic: mic)
        wall += now() - start
        audio += Double(mic.count) / rate
        let name = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
        try writeF32(out, args[3] + "/" + name + ".f32")
    }
    emit(["files": paths.count, "audio": audio, "wall": wall, "rtfx": audio / wall])

case "asr-batch":
    let paths = try String(contentsOfFile: args[2], encoding: .utf8).split(separator: "\n").map(String.init)
    let models = try await AsrModels.downloadAndLoad(version: .v3)
    let manager = AsrManager(config: .default)
    try await manager.loadModels(models)
    let shortest = ASRConstants.minimumRequiredSamples(forSampleRate: 16_000)
    var lines: [String] = []
    for path in paths where !path.isEmpty {
        var samples = try load(path)
        let audio = Double(samples.count) / rate
        if samples.count < shortest { samples += [Float](repeating: 0, count: shortest - samples.count) }
        let start = now()
        var state = TdtDecoderState.make()
        let result = try await manager.transcribe(samples, decoderState: &state)
        let data = try JSONSerialization.data(
            withJSONObject: ["path": path, "text": result.text, "audio": audio, "wall": now() - start],
            options: [.sortedKeys])
        lines.append(String(data: data, encoding: .utf8)!)
    }
    try (lines.joined(separator: "\n") + "\n").write(toFile: args[3], atomically: true, encoding: .utf8)
    print("asr-batch \(lines.count) files")

case "live":
    let seconds = Double(args[4]) ?? 60
    let count = Int(seconds * rate)
    let mic = Array(try readF32(args[2]).prefix(count))
    let reference = fitted(try readF32(args[3]), to: mic.count)
    let manager = try await LocalVqeManager(config: LocalVqeConfig(chunk: .realtime16ms))
    let stream = try await manager.makeStream()
    let block = 160
    var latencies: [Double] = []
    var produced = 0
    let cpu0 = cpuSeconds(), start = now()
    var offset = 0
    while offset < mic.count {
        let due = start + Double(offset + block) / rate
        let wait = due - now()
        if wait > 0 { try await Task.sleep(nanoseconds: UInt64(wait * 1e9)) }
        let end = min(offset + block, mic.count)
        let t = now()
        produced += try await stream.enhance(mic: Array(mic[offset..<end]), reference: Array(reference[offset..<end])).count
        latencies.append((now() - t) * 1000)
        offset = end
    }
    produced += try await stream.flush().count
    let wall = now() - start, cpu = cpuSeconds() - cpu0
    let sorted = latencies.sorted()
    func pct(_ p: Double) -> Double { sorted[min(sorted.count - 1, Int(Double(sorted.count) * p))] }
    let lateBy = wall - Double(mic.count) / rate
    emit(["audio": Double(mic.count) / rate, "wall": wall, "cpu": cpu, "cpuShareOfOneCore": cpu / wall,
          "pushes": latencies.count, "p50ms": pct(0.5), "p90ms": pct(0.9), "p99ms": pct(0.99),
          "maxms": sorted.last ?? 0.0 as Double, "finishedLateBy": lateBy, "produced": produced])

default:
    exit(2)
}
