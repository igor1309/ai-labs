import BlockingTestWork
import Foundation
import Session
import Testing
import TranscriptFile
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionDrainTests {

    @Test(arguments: [SessionSide.microphone, .call], [false, true])
    func captureStopWaitsForDeferredAudioDelivery(side: SessionSide, stopFails: Bool) async throws {

        let delivery = DrainGate(), captureStopped = Signal()
        let stopped = Values<Bool>(), captureStops = Values<Bool>(), delivered = Values<Float>()
        var construction = SessionConstruction()
        construction.makeCallText = { ReadyCallText(text: $0) }
        construction.makeCaptureAudio = { captured, live in
            HeldCaptureAudio(base: LiveCaptureAudio(capture: live), release: { await delivery.wait() }, delivered: { audio in
                if captured == side { delivered.append(contentsOf: audio.samples) }
            })
        }
        let configured = construction
        let task = Task {
            try await withSessionRig(construction: configured, stopFailure: stopFails ? side : nil) { rig, _ in
                let folder = try await rig.pieces.create()
                try await rig.pieces.microphoneTrack.open(in: folder)
                try await rig.pieces.callTrack.open(in: folder)
                try await rig.pieces.start(enabled: true)
                if side == .microphone {
                    try await rig.pieces.microphoneCapture.start()
                    rig.microphone.source.continuation.onTermination = { _ in captureStops.append(true); captureStopped.send() }
                } else {
                    try await rig.pieces.callCapture.start(selection: .everyAppButAudelin)
                    rig.call.source.continuation.onTermination = { _ in captureStops.append(true); captureStopped.send() }
                }
                let recognizer = side == .microphone ? rig.mine : rig.theirs
                let expected: [Float] = side == .microphone ? [0.25, -0.5, 0.125] : [-0.25, 0.5, -0.125]
                let stop = Task {
                    if stopFails {
                        await #expect(throws: ScriptFailure.failed) { try await rig.pieces.stopCapture(side) }
                    } else {
                        try await rig.pieces.stopCapture(side)
                    }
                    stopped.append(true)
                    #expect(delivered.all == expected)
                }
                try await stop.value
                try await rig.pieces.microphoneTrack.close()
                try await rig.pieces.callTrack.close()
                try await rig.pieces.stop()
                #expect(await recognizer.chunks.flatMap(\.samples) == expected)
            }
        }
        defer { delivery.release() }
        await delivery.waitUntilEntered()
        await captureStopped.next()
        #expect(captureStops.all == [true])
        #expect(stopped.all.isEmpty)
        delivery.release()
        try await task.value
        #expect(stopped.all == [true])
    }

    @Test(arguments: [SessionSide.microphone, .call])
    func throwingStopEndsAnOpenStreamAndNamesTheFailure(side: SessionSide) async throws {

        try await withSessionRig(stopFailure: side, stopEndsStream: false) { rig, folder in
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            await rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures == [SessionFailure(piece: "\(side) capture", message: "failed")])
            #expect(ended.microphoneTrack == .closed)
            #expect(ended.callTrack == .closed)
            #expect(ended.callText == .closed)
            #expect(ended.transcript == .closed)
            #expect(try await recordedSamples(folder.appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.125])
            #expect(try await recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
        }
    }

    @Test func stopWaitsForFinalTranscriptWriteAndCloseKeepsText() async throws {

        let snapshot = DrainGate()
        let stopped = Values<Bool>()
        var construction = SessionConstruction()
        construction.openTranscript = { url in
            ControlledTranscript(base: try await WritingTranscript(file: TranscriptFile(url: url)), beforeWrite: { state in
                if state.status == .finished { await snapshot.wait() }
            })
        }
        let configured = construction
        let task = Task {
            try await withDrainRig(construction: configured) { rig, folder in
                try await rig.pieces.stopCapture(.microphone)
                try await rig.pieces.stopCapture(.call)
                try await rig.pieces.microphoneTrack.close()
                try await rig.pieces.callTrack.close()
                try await rig.pieces.stop()
                stopped.append(true)
                let url = folder.appendingPathComponent("transcript.md")
                let expected = "# Transcript\n\n**Me** 00:00:00\nmine final\n\n**Them** 00:00:00\ntheirs final\n"
                #expect(try await offPool { try String(contentsOf: url, encoding: .utf8) } == expected)
                try await rig.pieces.transcript.close()
                #expect(try await offPool { try String(contentsOf: url, encoding: .utf8) } == expected)
            }
        }
        defer { snapshot.release() }
        await snapshot.waitUntilEntered()
        #expect(stopped.all.isEmpty)
        snapshot.release()
        try await task.value
        #expect(stopped.all == [true])
    }
}
