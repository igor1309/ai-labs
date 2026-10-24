import Foundation
import TrackFile

let track = try TrackFile(url: URL(fileURLWithPath: CommandLine.arguments[1]))
for number in 1...4 {
    let samples = (0..<48_000).map { Float(0.6 * sin(2 * .pi * Double(200 + number * 100) * Double($0) / 48_000)) }
    try await track.write(samples, sampleRate: 48_000)
    if number <= 3 { try FileHandle.standardOutput.write(contentsOf: Data("\(number)\n".utf8)) }
}
// Keep the writer open until its parent kills it, even if the fourth write finishes.
_ = try FileHandle.standardInput.read(upToCount: 1)
