import CallDiarizer
import Foundation
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct TranscriptStorageTests {

    @Test func openingATranscriptStartsLoadingTheDiarizer() async throws {

        let loads = AsyncStream<Void>.makeStream()
        let storage = FileTranscriptStorage(diarizer: CallDiarizer(binding: LoadSignal { loads.continuation.yield() }))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let file = try await storage.open(at: directory.appendingPathComponent("transcript.md"), sink: TestLogSink())

        var iterator = loads.stream.makeAsyncIterator()
        await iterator.next()
        await file.close()
    }
}

private struct LoadSignal: DiarizationBinding {

    struct NotLoaded: Error {}

    let loaded: @Sendable () -> Void
    var nemotronSlots: Int { 8 }
    func loadNemotron() async throws -> @Sendable ([Float]) async throws -> [EngineTurn] { loaded(); throw NotLoaded() }
    func vbx(_ samples: [Float], speakers: Int?) async throws -> [EngineTurn] { throw NotLoaded() }
}
