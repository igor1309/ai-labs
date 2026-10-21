// Feeds a 16 kHz mono WAV to FluidAudio's SlidingWindowAsrManager at real-time
// pace and prints every transcript update as JSON lines:
// {"t": seconds since start, "confirmed": Bool, "text": String}.
//
// usage: wisper-spike <wav> <chunkSeconds> <hypothesisSeconds> <none|ru>
import AVFoundation
import FluidAudio
import Foundation

let args = CommandLine.arguments
guard args.count == 5, let chunk = Double(args[2]), let hypothesis = Double(args[3]) else {
    FileHandle.standardError.write("usage: wisper-spike <wav> <chunkSeconds> <hypothesisSeconds> <none|ru>\n".data(using: .utf8)!)
    exit(2)
}
let language: Language? = args[4] == "ru" ? .russian : nil

let config = SlidingWindowAsrConfig(
    chunkSeconds: chunk,
    hypothesisChunkSeconds: hypothesis,
    leftContextSeconds: 2.0,
    rightContextSeconds: 2.0,
    language: language
)

func emit(_ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
    fflush(stdout)
}

let manager = SlidingWindowAsrManager(config: config)
let models = try await AsrModels.downloadAndLoad(version: .v3)
try await manager.loadModels(models)
try await manager.startStreaming(source: .system)

let file = try AVAudioFile(forReading: URL(fileURLWithPath: args[1]))
let format = file.processingFormat
let step = AVAudioFrameCount(format.sampleRate / 10)  // 100 ms buffers
let start = Date()

let listener = Task {
    for await update in await manager.transcriptionUpdates {
        emit([
            "t": (Date().timeIntervalSince(start) * 100).rounded() / 100,
            "confirmed": update.isConfirmed,
            "text": update.text,
        ])
    }
}

var fed: Double = 0
while file.framePosition < file.length {
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: step)!
    try file.read(into: buffer, frameCount: step)
    await manager.streamAudio(buffer)
    fed += Double(buffer.frameLength) / format.sampleRate
    let ahead = fed - Date().timeIntervalSince(start)
    if ahead > 0 { try await Task.sleep(nanoseconds: UInt64(ahead * 1_000_000_000)) }
}

let final = try await manager.finish()
listener.cancel()
emit(["t": (Date().timeIntervalSince(start) * 100).rounded() / 100, "final": true, "text": final])
