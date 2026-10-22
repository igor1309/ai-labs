// Cuts a 16 kHz mono WAV into Audelin's own recognition windows and runs
// FluidAudio's AsrManager.transcribe on each one, as ADR-001 decision 7 sets.
// Each window covers a chunk plus left and right context; every window is
// decoded with a fresh decoder state. Prints one JSON line per window:
// {"window", "start", "end", "chunkStart", "rightContextFrom", "text",
//  "words": [{"w", "s", "e", "c"}]}, with times in the recording's clock.
//
// usage: audelin-windows <wav> <shiftSeconds> [chunk=4] [left=2] [right=2]
import AVFoundation
import FluidAudio
import Foundation

let args = CommandLine.arguments
guard args.count >= 3, let shift = Double(args[2]) else {
    FileHandle.standardError.write("usage: audelin-windows <wav> <shiftSeconds> [chunk=4] [left=2] [right=2]\n".data(using: .utf8)!)
    exit(2)
}
let chunk = args.count > 3 ? Double(args[3])! : 4.0
let left = args.count > 4 ? Double(args[4])! : 2.0
let right = args.count > 5 ? Double(args[5])! : 2.0

let file = try AVAudioFile(forReading: URL(fileURLWithPath: args[1]))
let rate = file.processingFormat.sampleRate
guard rate == 16_000, file.processingFormat.channelCount == 1 else {
    FileHandle.standardError.write("need 16 kHz mono\n".data(using: .utf8)!)
    exit(2)
}
let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))!
try file.read(into: buffer)
let samples = Array(UnsafeBufferPointer(start: buffer.floatChannelData![0], count: Int(buffer.frameLength)))
let total = Double(samples.count) / rate

let manager = AsrManager(config: .default)
try await manager.loadModels(try await AsrModels.downloadAndLoad(version: .v3))

func words(_ timings: [TokenTiming], offset: Double) -> [[String: Any]] {
    var out: [[String: Any]] = []
    var word = "", start = 0.0, end = 0.0, conf: [Float] = []
    func flush() {
        guard !word.isEmpty else { return }
        out.append(["w": word, "s": ((offset + start) * 1000).rounded() / 1000,
                    "e": ((offset + end) * 1000).rounded() / 1000,
                    "c": Double(conf.reduce(0, +) / Float(conf.count))])
    }
    for t in timings {
        if t.token.hasPrefix(" ") || word.isEmpty {
            flush()
            word = t.token.trimmingCharacters(in: .whitespaces); start = t.startTime; conf = []
        } else {
            word += t.token
        }
        end = t.endTime; conf.append(t.confidence)
    }
    flush()
    return out
}

var k = 0
var chunkStart = shift
while chunkStart < total {
    let chunkEnd = min(chunkStart + chunk, total)
    let start = max(0, chunkStart - left), end = min(total, chunkEnd + right)
    let window = Array(samples[Int(start * rate)..<Int(end * rate)])
    var state = TdtDecoderState.make()
    let result = try await manager.transcribe(window, decoderState: &state)
    let object: [String: Any] = [
        "window": k, "start": start, "end": end, "chunkStart": chunkStart,
        "rightContextFrom": chunkEnd, "text": result.text,
        "words": words(result.tokenTimings ?? [], offset: start),
    ]
    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
    k += 1
    chunkStart += chunk
}
