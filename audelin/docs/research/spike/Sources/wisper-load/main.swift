// Measures the cost of running several live Parakeet v3 streams at once.
// Feeds the same 16 kHz mono WAV to <streams> SlidingWindowAsrManagers (4 s
// chunks, shared models), either at real-time pace or as fast as possible,
// and prints JSON lines: one per update {"s", "t", "confirmed"}, then a
// summary {"wall", "audio", "cpuUser", "cpuSys", "maxRssMB"}.
//
// usage: wisper-load <streams> <realtime|fast> <wav>
import AVFoundation
import FluidAudio
import Foundation

let args = CommandLine.arguments
guard args.count == 4, let streams = Int(args[1]), ["realtime", "fast"].contains(args[2]) else {
    FileHandle.standardError.write("usage: wisper-load <streams> <realtime|fast> <wav>\n".data(using: .utf8)!)
    exit(2)
}
let realtime = args[2] == "realtime"
let url = URL(fileURLWithPath: args[3])

func emit(_ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
    fflush(stdout)
}
func round2(_ x: Double) -> Double { (x * 100).rounded() / 100 }

let config = SlidingWindowAsrConfig(
    chunkSeconds: 4, hypothesisChunkSeconds: 4,
    leftContextSeconds: 2.0, rightContextSeconds: 2.0, language: nil
)
let models = try await AsrModels.downloadAndLoad(version: .v3)
var managers: [SlidingWindowAsrManager] = []
for _ in 0..<streams {
    let manager = SlidingWindowAsrManager(config: config)
    try await manager.loadModels(models)
    try await manager.startStreaming(source: .system)
    managers.append(manager)
}

let start = Date()
var listeners: [Task<Void, Never>] = []
for (s, manager) in managers.enumerated() {
    listeners.append(Task {
        for await update in await manager.transcriptionUpdates {
            emit(["s": s, "t": round2(Date().timeIntervalSince(start)), "confirmed": update.isConfirmed])
        }
    })
}

var audio: Double = 0
try await withThrowingTaskGroup(of: Double.self) { group in
    for manager in managers {
        group.addTask {
            let file = try AVAudioFile(forReading: url)
            let format = file.processingFormat
            let step = AVAudioFrameCount(format.sampleRate / 10)  // 100 ms buffers
            var fed: Double = 0
            while file.framePosition < file.length {
                let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: step)!
                try file.read(into: buffer, frameCount: step)
                await manager.streamAudio(buffer)
                fed += Double(buffer.frameLength) / format.sampleRate
                if realtime {
                    let ahead = fed - Date().timeIntervalSince(start)
                    if ahead > 0 { try await Task.sleep(nanoseconds: UInt64(ahead * 1_000_000_000)) }
                }
            }
            _ = try await manager.finish()
            return fed
        }
    }
    for try await fed in group { audio = fed }
}
let wall = Date().timeIntervalSince(start)
for listener in listeners { listener.cancel() }

var usage = rusage()
getrusage(RUSAGE_SELF, &usage)
func seconds(_ t: timeval) -> Double { Double(t.tv_sec) + Double(t.tv_usec) / 1_000_000 }
emit([
    "wall": round2(wall), "audio": round2(audio),
    "cpuUser": round2(seconds(usage.ru_utime)), "cpuSys": round2(seconds(usage.ru_stime)),
    "maxRssMB": usage.ru_maxrss / 1_048_576,
])
