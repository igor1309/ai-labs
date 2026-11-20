// Runs Parakeet v3 over a list of 16 kHz mono WAVs, loading the model once,
// in one of two modes:
//   windows  Audelin's own windows: a 4 s chunk with 2 s of context on each
//            side, a fresh decoder per window, keeping the words whose middle
//            lies in the chunk, as the production recogniser settles them;
//   whole    one AsrManager.transcribe call over the whole file.
// Prints one JSON line per file: {"file", "seconds", "compute", "words":
// [{"w", "s", "e"}]}, times in the file's clock, compute in wall seconds.
//
// usage: audelin-final <windows|whole> <list of wav paths>
import AVFoundation
import FluidAudio
import Foundation

let args = CommandLine.arguments
guard args.count == 3, ["windows", "whole"].contains(args[1]) else {
    FileHandle.standardError.write("usage: audelin-final <windows|whole> <list>\n".data(using: .utf8)!)
    exit(2)
}
let mode = args[1]
let paths = try String(contentsOfFile: args[2], encoding: .utf8)
    .split(separator: "\n").map(String.init).filter { !$0.isEmpty }

let manager = AsrManager(config: .default)
try await manager.loadModels(try await AsrModels.downloadAndLoad(version: .v3))

let rate = 16_000.0
let chunk = 4.0, context = 2.0

struct Word { var w: String; var s: Double; var e: Double }

func read(_ path: String) throws -> [Float] {
    let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
    guard file.processingFormat.sampleRate == rate, file.processingFormat.channelCount == 1 else {
        throw NSError(domain: "audelin-final", code: 1, userInfo: [NSLocalizedDescriptionKey: "\(path): need 16 kHz mono"])
    }
    let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))!
    try file.read(into: buffer)
    return Array(UnsafeBufferPointer(start: buffer.floatChannelData![0], count: Int(buffer.frameLength)))
}

func words(_ timings: [TokenTiming], offset: Double) -> [Word] {
    var out: [Word] = []
    var current: Word?
    for t in timings {
        if t.token.hasPrefix(" ") || current == nil {
            if let c = current, !c.w.isEmpty { out.append(c) }
            current = Word(w: t.token.trimmingCharacters(in: .whitespaces), s: offset + t.startTime, e: offset + t.endTime)
        } else {
            current!.w += t.token
            current!.e = offset + t.endTime
        }
    }
    if let c = current, !c.w.isEmpty { out.append(c) }
    return out
}

func windows(_ samples: [Float]) async throws -> [Word] {
    let total = Double(samples.count) / rate
    var out: [Word] = []
    var chunkStart = 0.0
    while chunkStart < total {
        let chunkEnd = min(chunkStart + chunk, total)
        let start = max(0, chunkStart - context), end = min(total, chunkEnd + context)
        let window = Array(samples[Int(start * rate)..<min(samples.count, Int(end * rate))])
        if window.count >= Int(rate) {
            var state = TdtDecoderState.make()
            let result = try await manager.transcribe(window, decoderState: &state)
            let last = chunkEnd >= total
            out += words(result.tokenTimings ?? [], offset: start).filter {
                let middle = ($0.s + $0.e) / 2
                return middle >= chunkStart && (last || middle < chunkEnd)
            }
        }
        chunkStart = chunkEnd
    }
    return out
}

func whole(_ samples: [Float]) async throws -> [Word] {
    var padded = samples
    if padded.count < Int(rate) { padded += [Float](repeating: 0, count: Int(rate) - padded.count) }
    var state = TdtDecoderState.make()
    let result = try await manager.transcribe(padded, decoderState: &state)
    return words(result.tokenTimings ?? [], offset: 0)
}

for path in paths {
    let samples = try read(path)
    let clock = ContinuousClock()
    var found: [Word] = []
    let elapsed = try await clock.measure {
        found = mode == "windows" ? try await windows(samples) : try await whole(samples)
    }
    let compute = Double(elapsed.components.seconds) + Double(elapsed.components.attoseconds) / 1e18
    let object: [String: Any] = [
        "file": path, "seconds": Double(samples.count) / rate, "compute": compute,
        "words": found.map { ["w": $0.w, "s": ($0.s * 1000).rounded() / 1000, "e": ($0.e * 1000).rounded() / 1000] },
    ]
    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}
