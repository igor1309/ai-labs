// Feeds a 16 kHz mono WAV to FluidAudio's streaming Nemotron multilingual
// model in 0.1 s blocks, as a capture callback would, and records when text
// appears. Prints one JSON line per partial update:
// {"fed": seconds of audio fed so far, "ms": time spent in process(), "text"}
// and, last, {"final", "words": [{"w", "s", "e"}], "processMs", "maxBlockMs"}.
//
// usage: audelin-stream <wav> <language: ru | auto | ...> [modelDir]
import AVFoundation
import FluidAudio
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: audelin-stream <wav> <language> [modelDir]\n".data(using: .utf8)!)
    exit(2)
}
let modelDir = URL(fileURLWithPath: args.count > 3 ? args[3]
    : NSHomeDirectory() + "/Library/Application Support/FluidAudio/Models/nemotron-multilingual/multilingual/1120ms")

let file = try AVAudioFile(forReading: URL(fileURLWithPath: args[1]))
let rate = file.processingFormat.sampleRate
guard rate == 16_000, file.processingFormat.channelCount == 1 else {
    FileHandle.standardError.write("need 16 kHz mono\n".data(using: .utf8)!)
    exit(2)
}
let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))!
try file.read(into: buffer)
let samples = Array(UnsafeBufferPointer(start: buffer.floatChannelData![0], count: Int(buffer.frameLength)))

final class Box: @unchecked Sendable { var fed = 0.0; var last = "" }
let box = Box()

func emit(_ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}

let manager = StreamingNemotronMultilingualAsrManager()
try await manager.loadModels(from: modelDir)
await manager.setLanguage(args[2])
await manager.setPartialCallback { text in
    guard text != box.last else { return }
    box.last = text
    emit(["fed": (box.fed * 1000).rounded() / 1000, "text": text])
}

let block = Int(rate / 10)
var processMs = 0.0, maxBlockMs = 0.0
var i = 0
while i < samples.count {
    let end = min(i + block, samples.count)
    box.fed = Double(end) / rate
    let started = Date()
    _ = try await manager.process(samples: Array(samples[i..<end]))
    let ms = Date().timeIntervalSince(started) * 1000
    processMs += ms; maxBlockMs = max(maxBlockMs, ms)
    i = end
}
let (final, timings) = try await manager.finishWithTokenTimings()

var words: [[String: Any]] = []
var word = "", start = 0.0, stop = 0.0
func flush() {
    guard !word.isEmpty else { return }
    words.append(["w": word, "s": (start * 1000).rounded() / 1000, "e": (stop * 1000).rounded() / 1000])
}
for t in timings {
    if t.token.hasPrefix(" ") || t.token.hasPrefix("▁") || word.isEmpty {
        flush()
        word = t.token.trimmingCharacters(in: CharacterSet(charactersIn: " ▁")); start = t.startTime
    } else {
        word += t.token
    }
    stop = t.endTime
}
flush()
emit(["final": final, "words": words, "processMs": processMs.rounded(), "maxBlockMs": maxBlockMs.rounded(),
      "audioSeconds": Double(samples.count) / rate, "detected": await manager.detectedLanguage() ?? ""])
