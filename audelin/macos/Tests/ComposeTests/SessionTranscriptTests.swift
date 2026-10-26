import Foundation
import Session
import Synchronization
import Testing
import TranscriptFile
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionTranscriptTests {

    @Test(arguments: TranscriptOperation.allCases)
    fileprivate func writeFailureReachesSessionOnceAndRecordingContinues(operation: TranscriptOperation) async throws {

        let failed = Mutex(false)
        let binding = TranscriptBindingSpy()
        let message = "transcript \(operation.rawValue)"
        let news = Values<String>()
        var construction = SessionConstruction()
        construction.openTranscript = { url in
            ControlledTranscript(base: try WritingTranscript(file: TranscriptFile(url: url, binding: binding)), beforeWrite: { state in
                if state.entries.count == 2, !failed.withLock({ value in
                    let previous = value
                    value = true
                    return previous
                }) { binding.arm(operation) }
            })
        }
        try await withSessionRig(construction: construction, beforeForward: { event in
            if case let .pieceFailed(.transcript, error) = event { news.append(error) }
        }) { rig, folder in
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            let state = try await rig.state { $0.health(of: .transcript) == .failed(message) }
            #expect(binding.failures.all == [operation])
            #expect(state.failures == [.init(piece: "transcript", message: message)])
            #expect(state.phase == .recording)
            #expect(state.microphoneCapture == .up)
            #expect(state.callCapture == .up)
            #expect(state.health(of: .callText) == .fine)
            #expect(rig.microphone.stops.all.isEmpty)
            #expect(rig.call.stops.all.isEmpty)
            rig.microphone.source.continuation.yield(.init(samples: [0.625], sampleRate: 48_000))
            rig.call.source.continuation.yield(.init(samples: [-0.625], sampleRate: 48_000))
            rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures == state.failures)
            #expect(ended.callText == .closed)
            #expect(ended.transcript == .closed)
            await rig.subscription.value
            #expect(news.all.isEmpty)
            #expect(try recordedSamples(folder.appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.625, 0.125])
            #expect(try recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.625, -0.125])
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
                == "# Transcript\n\n**Me** 00:00:00\nmine final\n\n**Them** 00:00:00\ntheirs final\n")
        }
    }

    @Test(arguments: TranscriptOperation.allCases)
    fileprivate func lastWriteFailurePrecedesEndWithSubscriptionForwardingHeld(operation: TranscriptOperation) async throws {

        let binding = TranscriptBindingSpy()
        let message = "transcript \(operation.rawValue)"
        let forwarded = Values<SessionEvent>(), forwarding = Signal(), release = DrainGate()
        defer { forwarding.end(); release.release() }
        var construction = SessionConstruction()
        construction.openTranscript = { url in
            ControlledTranscript(base: try WritingTranscript(file: TranscriptFile(url: url, binding: binding)), beforeWrite: { state in
                if state.status == .finished { binding.arm(operation) }
            })
        }
        try await withSessionRig(construction: construction, beforeForward: { event in
            forwarding.send()
            await release.wait()
            forwarded.append(event)
        }) { rig, _ in
            defer { release.release() }
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await rig.pieces.news.continuation.yield(.liveTextChanged(true))
            await forwarding.next()
            rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(forwarded.all.isEmpty)
            #expect(binding.failures.all == [operation])
            #expect(ended.failures == [.init(piece: "transcript", message: message)])
            #expect(ended.health(of: .transcript) == .failed(message))
            #expect(ended.callText == .closed)
            #expect(ended.transcript == .closed)
            let text = try #require(await rig.pieces.text)
            #expect(await text.state.status == .finished)
            release.release()
            await rig.subscription.value
            #expect(forwarded.all == [.liveTextChanged(true)])
            #expect(await rig.session.snapshot() == ended)
        }
    }

    @Test(arguments: TranscriptOperation.allCases)
    fileprivate func manualEventForwardingReceivesLastWriteFailureWithoutHoldingStop(operation: TranscriptOperation) async throws {

        let binding = TranscriptBindingSpy()
        let message = "transcript \(operation.rawValue)"
        let news = Values<SessionEvent>(), reported = Signal(), release = DrainGate()
        defer { reported.end(); release.release() }
        var construction = SessionConstruction()
        construction.openTranscript = { url in
            ControlledTranscript(base: try WritingTranscript(file: TranscriptFile(url: url, binding: binding)), beforeWrite: { state in
                if state.status == .finished { binding.arm(operation) }
            })
        }
        try await withSessionRig(construction: construction, connect: { pieces, session in
            Task {
                for await event in pieces.events {
                    news.append(event)
                    reported.send()
                    await release.wait()
                    guard !Task.isCancelled else { return }
                    session.send(event)
                }
            }
        }) { rig, _ in
            defer { release.release() }
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            rig.session.send(.end)
            await reported.next()
            let ended = try await rig.state { $0.phase == .ended }
            let text = try #require(await rig.pieces.text)
            #expect(await text.state.status == .finished)
            #expect(ended.callText == .closed)
            #expect(ended.transcript == .closed)
            #expect(ended.failures.isEmpty)
            #expect(binding.failures.all == [operation])
            release.release()
            await rig.subscription.value
            #expect(news.all == [.pieceFailed(.transcript, error: message)])
        }
    }

    @Test(arguments: [false, true])
    func failedTranscriptOpenStillStartsSwitchesAndStopsCallText(enabled: Bool) async throws {

        var construction = SessionConstruction()
        construction.openTranscript = { url in
            try Data("existing transcript".utf8).write(to: url)
            return try WritingTranscript(file: TranscriptFile(url: url))
        }
        try await withSessionRig(construction: construction) { rig, folder in
            rig.session.send(.begin(liveText: enabled))
            let recording = try await rig.state { $0.phase == .recording }
            #expect(recording.failures.map(\.piece) == ["transcript"])
            #expect(recording.callText == .up)
            #expect(await rig.pieces.transcriptFile == nil)
            let text = try #require(await rig.pieces.text)
            if !enabled { #expect(await text.state.status == .off) }
            rig.session.send(.liveTextChanged(!enabled))
            _ = try await rig.state { $0.pendingLiveText == nil && $0.wantedLiveText == !enabled }
            if enabled { #expect(await text.state.status == .off) }
            rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures == recording.failures)
            #expect(ended.callText == .closed)
            #expect(await text.state.status == .finished)
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) == "existing transcript")
            #expect(rig.microphone.stops.all == [true])
            #expect(rig.call.stops.all == [true])
        }
    }
}

private enum TranscriptOperation: String, CaseIterable, Sendable {

    case create, write, flush, rename
}

private struct TranscriptOperationFailure: Error, CustomStringConvertible {

    let operation: TranscriptOperation

    var description: String { "transcript \(operation.rawValue)" }
}

private final class TranscriptBindingSpy: TranscriptFileBinding {

    private let disk = DiskTranscriptBinding()
    private let fault = Mutex<TranscriptOperation?>(nil)
    let failures = Values<TranscriptOperation>()

    func arm(_ operation: TranscriptOperation) { fault.withLock { $0 = operation } }

    func check(_ operation: TranscriptOperation) throws {

        let fails = fault.withLock { value in
            guard value == operation else { return false }
            value = nil
            return true
        }
        if fails {
            failures.append(operation)
            throw TranscriptOperationFailure(operation: operation)
        }
    }

    func create(at url: URL) throws -> any TranscriptFileHandle {

        try check(.create)
        return Handle(base: try disk.create(at: url), binding: self)
    }

    func rename(from source: URL, to target: URL) throws {

        try check(.rename)
        try disk.rename(from: source, to: target)
    }

    func remove(at url: URL) { disk.remove(at: url) }

    private struct Handle: TranscriptFileHandle {

        let base: any TranscriptFileHandle
        let binding: TranscriptBindingSpy

        func write(_ data: Data) throws {

            try binding.check(.write)
            try base.write(data)
        }

        func flush() throws {

            try binding.check(.flush)
            try base.flush()
        }
    }
}
