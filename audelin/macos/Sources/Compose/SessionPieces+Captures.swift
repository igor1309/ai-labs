import Darwin
import Session
import struct MicrophoneCapture.AudioPiece
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection
import TrackFile

extension SessionPieces {

    func startMicrophoneCapture() async throws {

        let track = try captureTrack(.microphone)
        do {
            let capture = try await startMicrophone()
            let beforeWrite = hooks.beforeWrite
            let feed = CaptureFeed(stream: capture.stream, track: track, unpack: { ($0.samples, $0.sampleRate) },
                                   beforeWrite: { try await beforeWrite(.microphone, $0) })
            attach(feed, stop: capture.stop, side: .microphone)
        } catch {
            sides[.microphone]?.captureStarting = false
            sides[.microphone]?.audio.finish()
            throw error
        }
    }

    func startCallCapture(selection: SessionProcessSelection?) async throws {

        let resolved: SystemAudioCapture.ProcessSelection
        if let selection {
            guard let known = selections[selection.id] else { throw Failure.unknownSelection(selection.id) }
            resolved = known
        } else {
            resolved = .allExcept([getpid()])
        }
        let track = try captureTrack(.call)
        do {
            let capture = try await startCall(resolved)
            let beforeWrite = hooks.beforeWrite
            let feed = CaptureFeed(stream: capture.stream, track: track, unpack: { ($0.samples, $0.sampleRate) },
                                   beforeWrite: { try await beforeWrite(.call, $0) })
            attach(feed, stop: capture.stop, side: .call)
        } catch {
            sides[.call]?.captureStarting = false
            sides[.call]?.audio.finish()
            throw error
        }
    }

    func stopCapture(_ side: SessionSide) async throws {

        guard let destination = sides[side], !destination.captureStopping,
              let stop = destination.stop, let feed = destination.feed else {
            throw Failure.outOfOrder("\(side) capture is not running")
        }
        sides[side]?.captureStopping = true
        defer { sides[side]?.stop = nil }
        // Even a failed stop joins the feed before Session can close its track.
        do { try await stop() }
        catch {
            feed.endInput()
            _ = try? await hooks.joinCapture(side, feed)
            throw error
        }
        try await hooks.joinCapture(side, feed)
    }

    private func captureTrack(_ side: SessionSide) throws -> TrackFile {

        guard let destination = sides[side], let track = destination.track, !destination.closed else {
            throw Failure.outOfOrder("\(side) track is not open")
        }
        guard !destination.captureAttempted else { throw Failure.outOfOrder("\(side) capture already started") }
        guard !textStopped, !textStopping else { throw Failure.outOfOrder("call text already stopped") }
        sides[side]?.captureAttempted = true
        sides[side]?.captureStarting = true
        return track
    }

    private func attach(_ feed: CaptureFeed, stop: @escaping @Sendable () async throws -> Void, side: SessionSide) {

        sides[side]?.feed = feed
        sides[side]?.stop = stop
        sides[side]?.captureStarting = false
        sides[side]?.audio.attach(feed)
    }
}
