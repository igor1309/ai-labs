// Diarization probe for LAB-1103. Audio is 16 kHz mono float32, raw little-endian
// (`audelin-vad prep` writes it). Subcommands:
//   vbx <in.f32> <out.json>
//       FluidAudio's offline VBx pipeline over the whole file; segments and cost
//   nemotron <in.f32> <out.json>
//       Nemotron 3 with the fast128 preset over the whole file; segments and cost
//   lseend <in.f32> <out.json> <ami|callhome|dihard2|dihard3> [paced]
//       LS-EEND fed in 0.1 s blocks, as a capture callback would, processing after
//       each block. After every update it reads the visible timeline (finalized and
//       tentative segments) and records, per 100 ms frame, the speakers first shown
//       and every later change; at the end it compares what was first shown with
//       the final labels. With `paced`, blocks are fed at the wall clock (real time)
//       and the per-block processing latency is reported.
import Darwin
import FluidAudio
import Foundation

let rate = 16_000.0

func readF32(_ path: String) throws -> [Float] {
    let data = try Data(contentsOf: URL(fileURLWithPath: path))
    return data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
}

func now() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1e9 }

func cpuSeconds() -> Double {
    var usage = rusage()
    getrusage(RUSAGE_SELF, &usage)
    func s(_ t: timeval) -> Double { Double(t.tv_sec) + Double(t.tv_usec) / 1e6 }
    return s(usage.ru_utime) + s(usage.ru_stime)
}

func writeJSON(_ value: Any, _ path: String) throws {
    try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]).write(to: URL(fileURLWithPath: path))
}

let args = CommandLine.arguments
guard args.count >= 4 else {
    FileHandle.standardError.write("usage: audelin-diarize vbx|lseend <in.f32> <out.json> ...\n".data(using: .utf8)!)
    exit(2)
}
let samples = try readF32(args[2])
let audio = Double(samples.count) / rate

switch args[1] {
case "vbx":
    let load0 = now()
    let manager = OfflineDiarizerManager(config: .default)
    try await manager.prepareModels()
    let load = now() - load0
    let cpu0 = cpuSeconds(), start = now()
    // A silent track (a muted or empty call) has no speech to cluster: zero speakers.
    let found: [TimedSpeakerSegment]
    do {
        found = try await manager.process(audio: samples).segments
    } catch OfflineDiarizationError.noSpeechDetected {
        found = []
    }
    let wall = now() - start, cpu = cpuSeconds() - cpu0
    let segments = found.map {
        ["speaker": $0.speakerId, "s": Double($0.startTimeSeconds), "e": Double($0.endTimeSeconds)] as [String: Any]
    }
    try writeJSON(["audio": audio, "wall": wall, "cpu": cpu, "load": load, "rtfx": audio / wall,
                   "segments": segments], args[3])
    print("vbx \(Set(found.map(\.speakerId)).count) speakers, RTFx \(audio / wall)")

case "nemotron":
    let load0 = now()
    let config = Nemotron3Config.fast128
    let models = try await Nemotron3Models.loadFromHuggingFace(config: config)
    let diarizer = Nemotron3Diarizer(config: config, models: models)
    let load = now() - load0
    let cpu0 = cpuSeconds(), start = now()
    let (probabilities, frames) = try diarizer.processComplete(samples)
    let found = Nemotron3Diarizer.segments(probabilities: probabilities, frameCount: frames,
                                           numSpeakers: config.numSpeakers)
    let wall = now() - start, cpu = cpuSeconds() - cpu0
    let segments = found.map {
        ["speaker": "\($0.speakerIndex)", "s": Double($0.startSeconds), "e": Double($0.endSeconds)] as [String: Any]
    }
    try writeJSON(["audio": audio, "wall": wall, "cpu": cpu, "load": load, "rtfx": audio / wall,
                   "segments": segments], args[3])
    print("nemotron \(Set(found.map(\.speakerIndex)).count) speakers, RTFx \(audio / wall)")

case "lseend":
    let variant: LSEENDVariant = {
        switch args.count > 4 ? args[4] : "dihard3" {
        case "ami": return .ami
        case "callhome": return .callhome
        case "dihard2": return .dihard2
        default: return .dihard3
        }
    }()
    let paced = args.count > 5 && args[5] == "paced"
    let load0 = now()
    let diarizer = try await LSEENDDiarizer(variant: variant, stepSize: .step100ms)
    let load = now() - load0
    let block = 1600
    var current: [UInt16] = []
    var first: [Int32] = []          // first shown mask, -1 while unseen
    var firstShownAt: [Double] = []  // audio fed when first shown
    var changes = 0, changedFrames = Set<Int>()
    var latencies: [Double] = []
    var frameSeconds = 0.1

    func visible(from lo: Int, to hi: Int) -> [UInt16] {
        var masks = [UInt16](repeating: 0, count: max(0, hi - lo))
        for (_, speaker) in diarizer.timeline.speakers {
            for seg in speaker.finalizedSegments + speaker.tentativeSegments where seg.endFrame > lo && seg.startFrame < hi {
                for f in max(lo, seg.startFrame)..<min(hi, seg.endFrame) { masks[f - lo] |= UInt16(1) << UInt16(seg.speakerIndex) }
            }
        }
        return masks
    }

    func observe(fed: Double) {
        frameSeconds = Double(diarizer.timeline.config.frameDurationSeconds)
        let hi = diarizer.timeline.numFrames
        if current.count < hi {
            current += [UInt16](repeating: 0, count: hi - current.count)
            first += [Int32](repeating: -1, count: hi - first.count)
            firstShownAt += [Double](repeating: 0, count: hi - firstShownAt.count)
        }
        let lo = max(0, hi - 600)
        let masks = visible(from: lo, to: hi)
        for f in lo..<hi {
            let m = masks[f - lo]
            if first[f] < 0 {
                first[f] = Int32(m)
                firstShownAt[f] = fed
            } else if m != current[f] {
                changes += 1
                changedFrames.insert(f)
            }
            current[f] = m
        }
    }

    let cpu0 = cpuSeconds(), start = now()
    var offset = 0
    while offset < samples.count {
        let end = min(offset + block, samples.count)
        if paced {
            let wait = start + Double(end) / rate - now()
            if wait > 0 { try await Task.sleep(nanoseconds: UInt64(wait * 1e9)) }
        }
        let t = now()
        _ = try diarizer.process(samples: samples[offset..<end], sourceSampleRate: rate)
        latencies.append((now() - t) * 1000)
        offset = end
        observe(fed: Double(end) / rate)
    }
    _ = try diarizer.finalizeSession()
    let wall = now() - start, cpu = cpuSeconds() - cpu0
    let total = diarizer.timeline.numFrames
    if current.count < total { observe(fed: audio) }
    let final = visible(from: 0, to: total)
    var speech = 0, firstWrong = 0, delays: [Double] = []
    for f in 0..<min(total, first.count) {
        let shown = first[f] < 0 ? UInt16(0) : UInt16(first[f])
        if final[f] != 0 || shown != 0 {
            speech += 1
            if shown != final[f] { firstWrong += 1 }
        }
        if final[f] != 0 && first[f] >= 0 { delays.append(firstShownAt[f] - Double(f + 1) * frameSeconds) }
    }
    var segments: [[String: Any]] = []
    for (_, speaker) in diarizer.timeline.speakers {
        for seg in speaker.finalizedSegments {
            segments.append(["speaker": "\(seg.speakerIndex)", "s": Double(seg.startTime), "e": Double(seg.endTime)])
        }
    }
    var shownSegments: [[String: Any]] = []
    for bit in 0..<16 {
        var runStart = -1
        for f in 0...first.count {
            let on = f < first.count && first[f] > 0 && (UInt16(first[f]) >> UInt16(bit)) & 1 == 1
            if on && runStart < 0 { runStart = f }
            if !on && runStart >= 0 {
                shownSegments.append(["speaker": "\(bit)", "s": Double(runStart) * frameSeconds, "e": Double(f) * frameSeconds])
                runStart = -1
            }
        }
    }
    let sortedLat = latencies.sorted(), sortedDelay = delays.sorted()
    func pct(_ a: [Double], _ p: Double) -> Double { a.isEmpty ? 0 : a[min(a.count - 1, Int(Double(a.count) * p))] }
    try writeJSON([
        "audio": audio, "wall": wall, "cpu": cpu, "load": load, "rtfx": audio / wall, "paced": paced,
        "variant": args.count > 4 ? args[4] : "dihard3", "frames": total, "speechFrames": speech,
        "firstShownWrong": firstWrong, "framesChangedAfterShown": changedFrames.count, "changes": changes,
        "shownDelayP50": pct(sortedDelay, 0.5), "shownDelayP90": pct(sortedDelay, 0.9),
        "blockP50ms": pct(sortedLat, 0.5), "blockP99ms": pct(sortedLat, 0.99), "blockMaxms": sortedLat.last ?? 0.0 as Double,
        "segments": segments, "shownSegments": shownSegments,
    ], args[3])
    print("lseend \(args.count > 4 ? args[4] : "dihard3") RTFx \(audio / wall), shown-wrong \(firstWrong)/\(speech), changed \(changedFrames.count)")

default:
    exit(2)
}
