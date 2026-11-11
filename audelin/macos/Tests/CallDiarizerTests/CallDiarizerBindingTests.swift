import BlockingTestWork
import CallDiarizer
import Foundation
import Testing

/// The models share download folders, so their real binding tests run one at a time.
@Suite(.serialized)
struct CallDiarizerBindingTests {

    @Test func nemotronFindsTurnsInTheTrack() async throws {

        try await withTwoVoices { samples, boundary in
            let binding = FluidDiarizationBinding()
            #expect(binding.nemotronSlots == 8)
            let run = try await binding.loadNemotron()

            let turns = try await run(samples)

            try expectTurnsInsideTrack(turns, samples: samples)
            let first = try #require(dominantSpeaker(turns, from: 0, to: boundary))
            let second = try #require(dominantSpeaker(turns, from: boundary, to: Double(samples.count) / 16_000))
            #expect(first != second)
            #expect(turns.allSatisfy { Int($0.speaker).map { (0..<binding.nemotronSlots).contains($0) } == true })
        }
    }

    @Test func vbxFindsTurnsInTheTrack() async throws {

        try await withTwoVoices { samples, _ in
            let turns = try await FluidDiarizationBinding().vbx(samples, speakers: nil)

            try expectTurnsInsideTrack(turns, samples: samples)
        }
    }

    /// Asking for one speaker and then two shows the count reaches VBx either way.
    @Test func vbxKeepsToAKnownCount() async throws {

        try await withTwoVoices { samples, _ in
            let binding = FluidDiarizationBinding()
            for speakers in [1, 2] {
                let turns = try await binding.vbx(samples, speakers: speakers)

                try expectTurnsInsideTrack(turns, samples: samples)
                #expect(Set(turns.map(\.speaker)).count == speakers)
            }
        }
    }

    @Test(arguments: [CallDiarizer.Model.nemotron, .vbx])
    func aTrackWithoutSpeechHasNoTurns(model: CallDiarizer.Model) async throws {

        try await withAudioDirectory { directory in
            let track = directory.appendingPathComponent("silence.wav")
            try writeWave(track, channels: [Array(repeating: 0, count: 16_000)], rate: 16_000)
            let samples = try await audioFile(track).samples
            let binding = FluidDiarizationBinding()
            let turns: [EngineTurn]
            switch model {
            case .nemotron:
                let run = try await binding.loadNemotron()
                turns = try await run(samples)
            case .vbx:
                turns = try await binding.vbx(samples, speakers: nil)
            }

            #expect(turns.isEmpty)
        }
    }
}

private func withTwoVoices(_ body: ([Float], Double) async throws -> Void) async throws {

    try await withAudioDirectory { directory in
        let russian = try await spoken("Сегодня мы обсуждаем проект и планы на следующую неделю.", voice: "Milena", in: directory)
        let english = try await spoken("Let us review the project and agree on our plans for next week.", voice: "Fred", in: directory)
        try #require(!russian.isEmpty)
        try #require(!english.isEmpty)
        let track = directory.appendingPathComponent("two-voices.wav")
        try writeWave(track, channels: [russian + english], rate: 16_000)
        let audio = try await audioFile(track)
        #expect(audio.sampleRate == 16_000)
        #expect(audio.channelCount == 1)
        try await body(audio.samples, Double(russian.count) / 16_000)
    }
}

private func spoken(_ text: String, voice: String, in directory: URL) async throws -> [Float] {

    let url = directory.appendingPathComponent("\(voice).wav")
    let say = Process()
    say.executableURL = URL(fileURLWithPath: "/usr/bin/say")
    say.arguments = ["-v", voice, "-r", "180", "--file-format=WAVE", "--data-format=LEF32@16000", "-o", url.path, text]
    try #require(try await exitStatus(of: say) == 0)
    return try await audioFile(url).samples
}

private func expectTurnsInsideTrack(_ turns: [EngineTurn], samples: [Float]) throws {

    try #require(!turns.isEmpty)
    let duration = Double(samples.count) / 16_000
    for turn in turns {
        #expect(turn.start.isFinite && turn.end.isFinite)
        #expect(turn.start >= 0)
        #expect(turn.end > turn.start)
        #expect(turn.end <= duration)
        #expect(!turn.speaker.isEmpty)
    }
}

private func dominantSpeaker(_ turns: [EngineTurn], from start: Double, to end: Double) -> String? {

    var duration: [String: Double] = [:]
    for turn in turns {
        let overlap = max(0, min(end, turn.end) - max(start, turn.start))
        if overlap > 0 { duration[turn.speaker, default: 0] += overlap }
    }
    return duration.max { $0.value < $1.value }?.key
}
