import Foundation
import Session
import Synchronization
import Testing
import TranscriptFile
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionTranscriptTests {

    @Test(arguments: TranscriptOperation.allCases)
    fileprivate func writeFailureIsTranscriptNewsAndRecordingContinues(operation: TranscriptOperation) async throws {

        let failed = Mutex(false)
        let binding = TranscriptBindingSpy()
        let message = "transcript \(operation.rawValue)"
        let news = Values<String>()
        var hooks = SessionPieces.Hooks()
        hooks.openTranscript = { try TranscriptFile(url: $0, binding: binding) }
        hooks.beforeTranscriptWrite = { state in
            if state.entries.count == 2, !failed.withLock({ value in
                let previous = value
                value = true
                return previous
            }) { binding.arm(operation) }
        }
        try await withSessionRig(hooks: hooks, beforeForward: { event in
            if case let .pieceFailed(.transcript, error) = event { news.append(error) }
        }) { rig, folder in
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            let state = try await rig.state { $0.health(of: .transcript) == .failed(message) }
            #expect(news.all == [message])
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
            #expect(try recordedSamples(folder.appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.625, 0.125])
            #expect(try recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.625, -0.125])
            #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
                == "# Transcript\n\n**Me** 00:00:00\nmine final\n\n**Them** 00:00:00\ntheirs final\n")
        }
    }

    @Test(arguments: TranscriptOperation.allCases)
    fileprivate func lastWriteFailurePrecedesEndWhileForwardingIsHeld(operation: TranscriptOperation) async throws {

        let binding = TranscriptBindingSpy()
        let message = "transcript \(operation.rawValue)"
        let news = Values<String>(), reported = Signal(), release = DrainGate()
        defer { reported.end(); release.release() }
        var hooks = SessionPieces.Hooks()
        hooks.openTranscript = { try TranscriptFile(url: $0, binding: binding) }
        hooks.beforeTranscriptWrite = { state in
            if state.status == .finished { binding.arm(operation) }
        }
        try await withSessionRig(hooks: hooks, beforeForward: { event in
            if case let .pieceFailed(.transcript, error) = event {
                news.append(error)
                reported.send()
                await release.wait()
            }
        }) { rig, _ in
            defer { release.release() }
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            rig.session.send(.end)
            await reported.next()
            let ending = await rig.session.snapshot()
            #expect(ending.phase == .ending)
            #expect(ending.callText == .stopping)
            #expect(await rig.pieces.textStopped == false)
            release.release()
            let ended = try await rig.state { $0.phase == .ended }
            #expect(news.all == [message])
            #expect(binding.failures.all == [operation])
            #expect(ended.failures == [.init(piece: "transcript", message: message)])
            #expect(ended.health(of: .transcript) == .failed(message))
            #expect(ended.callText == .closed)
            #expect(ended.transcript == .closed)
            #expect(await rig.pieces.textStopped == true)
        }
    }

    @Test func stopWaitsForSubscriptionToForwardTheFinalWriteFailure() async throws {

        let executor = DrainExecutor(), completed = Values<Bool>()
        let forwarding = DrainGate(onEntry: executor.notify)
        let binding = TranscriptBindingSpy()
        var hooks = SessionPieces.Hooks()
        hooks.executor = executor
        hooks.openTranscript = { try TranscriptFile(url: $0, binding: binding) }
        hooks.beforeTranscriptWrite = { state in
            if state.status == .finished { binding.arm(.write) }
        }
        let configured = hooks
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            try await withDrainRig(hooks: configured, beforeForward: { _ in await forwarding.wait() }) { rig, _ in
                try await rig.pieces.stopCapture(.microphone)
                try await rig.pieces.stopCapture(.call)
                try await rig.pieces.microphoneTrack.close()
                try await rig.pieces.callTrack.close()
                try await rig.pieces.stop()
                completed.append(true)
                try await rig.pieces.transcript.close()
            }
        }
        defer { forwarding.release(); executor.run() }
        await executor.run(until: { forwarding.entered })
        #expect(forwarding.entered)
        #expect(completed.all.isEmpty)
        forwarding.release()
        await executor.finish()
        try await task.value
        #expect(completed.all == [true])
        #expect(binding.failures.all == [.write])
    }

    @Test(arguments: [false, true])
    func failedTranscriptOpenStillStartsSwitchesAndStopsCallText(enabled: Bool) async throws {

        var hooks = SessionPieces.Hooks()
        hooks.openTranscript = { url in
            try Data("existing transcript".utf8).write(to: url)
            return try TranscriptFile(url: url)
        }
        try await withSessionRig(hooks: hooks) { rig, folder in
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
