import Foundation
import TrackFile

let track = try TrackFile(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let rate = Int(CommandLine.arguments[2])!
let frames = CommandLine.arguments.count > 3 ? Int(CommandLine.arguments[3])! : rate
for number in 1...4 {
    let samples = (0..<frames).map { Float(0.6 * sin(2 * .pi * Double(200 + number * 100) * Double($0) / Double(rate))) }
    try await track.write(samples, sampleRate: Double(rate))
    if number <= 3 { try FileHandle.standardOutput.write(contentsOf: Data("\(number)\n".utf8)) }
}
// Keep the writer open until its parent kills it, even if the fourth write finishes.
_ = try FileHandle.standardInput.read(upToCount: 1)
