import AVFoundation
import CallDiarizer
import Foundation
import BlockingTestWork
import Testing
@testable import Composer

extension CallDiarizer {

    /// For tests whose calls never reach the after-call pass; one that does fails loudly.
    static let unused = CallDiarizer(binding: UnusedDiarization())
}

extension CallDiarizer {

    /// For composition tests: a recorded call reaches the after-call pass, which finds no
    /// model and leaves the far side as plain Them.
    static let unavailable = CallDiarizer(binding: UnavailableDiarization())
}

private struct UnavailableDiarization: DiarizationBinding {

    struct Unavailable: Error {}

    var nemotronSlots: Int { 8 }
    func loadNemotron() async throws -> @Sendable ([Float]) async throws -> [EngineTurn] { throw Unavailable() }
    func vbx(_ samples: [Float], speakers: Int?) async throws -> [EngineTurn] { throw Unavailable() }
}

private struct UnusedDiarization: DiarizationBinding {

    struct Unused: Error {}

    var nemotronSlots: Int { 8 }

    func loadNemotron() async throws -> @Sendable ([Float]) async throws -> [EngineTurn] {
        Issue.record("the test's call reached diarization")
        throw Unused()
    }

    func vbx(_ samples: [Float], speakers: Int?) async throws -> [EngineTurn] {
        Issue.record("the test's call reached diarization")
        throw Unused()
    }
}

/// A short 16 kHz mono call track in a temporary folder.
func withCallTrack(_ body: (URL) async throws -> Void) async throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
    try await withCleanup {
        let track = folder.appendingPathComponent("call.wav")
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 16_000, channels: 1))
        do {
            let file = try AVAudioFile(forWriting: track, settings: format.settings)
            let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 160))
            buffer.frameLength = 160
            let samples = try #require(buffer.floatChannelData?[0])
            samples.initialize(repeating: 0.25, count: 160)
            try file.write(from: buffer)
        }
        try await body(track)
    } cleanup: {
        try FileManager.default.removeItem(at: folder)
    }
}
