import AVFoundation
import Foundation
import SessionRehearsal
import Testing

@Suite(.timeLimit(.minutes(1)))
struct ReplaySpeechTests {
    @Test func eachSideHearsItsOwnFile() throws {
        try withSpeech([(0.25, 8_000, 4), (0.5, 8_000, 4)]) { paths in
            let voices = try makeVoices(speech: paths[0], theirSpeech: paths[1])
            #expect(voices.mine(from: 0, count: 2).samples == [0.25, 0.25])
            #expect(voices.theirs(from: 0, count: 2).samples == [0.5, 0.5])
        }
    }

    @Test func withoutTheirFileBothSidesHearTheSpeech() throws {
        try withSpeech([(0.25, 8_000, 4)]) { paths in
            let voices = try makeVoices(speech: paths[0], theirSpeech: nil)
            #expect(voices.theirs(from: 0, count: 2).samples == [0.25, 0.25])
        }
    }

    @Test func theReplayLastsAsLongAsTheShorterFile() throws {
        try withSpeech([(0.25, 8_000, 8_000), (0.5, 8_000, 4_000)]) { paths in
            let shorterTheirs = try makeVoices(speech: paths[0], theirSpeech: paths[1])
            let shorterMine = try makeVoices(speech: paths[1], theirSpeech: paths[0])
            #expect(shorterTheirs.length == 0.5)
            #expect(shorterMine.length == 0.5)
        }
    }

    @Test func filesAtDifferentRatesAreRefused() throws {
        try withSpeech([(0.25, 8_000, 4), (0.5, 16_000, 4)]) { paths in
            #expect(throws: RehearsalOptions.Failure.self) {
                try makeVoices(speech: paths[0], theirSpeech: paths[1])
            }
        }
    }

    @Test func optionsKeepTheirSpeech() throws {
        let options = try RehearsalOptions(["--speech", "mine.caf", "--their-speech", "theirs.caf"])
        #expect(options.speech == "mine.caf")
        #expect(options.theirSpeech == "theirs.caf")
    }

    @Test func optionsRefuseTheirSpeechWithoutSpeech() {
        #expect(throws: RehearsalOptions.Failure.self) {
            try RehearsalOptions(["--their-speech", "theirs.caf"])
        }
    }

    @Test func optionsRefuseTheirSpeechWithoutAFile() {
        #expect(throws: RehearsalOptions.Failure.self) {
            try RehearsalOptions(["--speech", "mine.caf", "--their-speech"])
        }
    }
}

private func makeVoices(speech: String, theirSpeech: String?) throws -> SpeechVoices {

    try SpeechVoices(speech: speech, theirSpeech: theirSpeech,
                     mine: SessionRecognizer(name: "mine"), theirs: SessionRecognizer(name: "theirs"),
                     modelLoad: nil)
}

/// Writes one constant-valued mono file per `(value, rate, frames)` in a temp folder.
private func withSpeech(_ files: [(value: Float, rate: Double, frames: Int)], _ body: ([String]) throws -> Void) throws {

    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: folder) }

    let paths = try files.enumerated().map { index, file in
        let url = folder.appendingPathComponent("\(index).caf")
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: file.rate, channels: 1))
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(file.frames)))
        buffer.frameLength = AVAudioFrameCount(file.frames)
        let channel = try #require(buffer.floatChannelData?[0])
        for frame in 0..<file.frames { channel[frame] = file.value }
        try AVAudioFile(forWriting: url, settings: format.settings).write(from: buffer)
        return url.path
    }
    try body(paths)
}
