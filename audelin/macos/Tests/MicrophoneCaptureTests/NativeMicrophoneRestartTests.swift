import AVFAudio
import AudioToolbox
import Foundation
import Synchronization
import Testing
@testable import MicrophoneCapture

@Suite(.timeLimit(.minutes(1)))
struct NativeMicrophoneRestartTests {

    @Test func aFormatChangeMidCaptureReinstallsTheTapAndKeepsTheStream() async throws {

        let engine = FakeMicrophoneEngine(formats: [48_000, 16_000])
        let clock = ManualMicrophoneClock()
        let capture = try MicrophoneCapture(binding: SeamBinding(engine: engine, clock: clock))
        defer { capture.stop() }
        var audio = capture.audio.makeAsyncIterator()
        try clock.deliver(through: engine, value: 1)
        #expect(try await audio.next() == AudioPiece(samples: [1, 1], sampleRate: 48_000))
        engine.changeConfiguration()
        #expect(engine.taps == [48_000, 16_000])
        #expect(engine.starts == 2)
        try clock.deliver(through: engine, value: 2)
        #expect(try await audio.next() == AudioPiece(samples: [2, 2], sampleRate: 16_000))
    }

    @Test func aStartRefusedForItsFormatStartsOnceMoreAfterTheChange() async throws {

        let engine = FakeMicrophoneEngine(formats: [48_000, 16_000], refusals: 1)
        let clock = ManualMicrophoneClock()
        let capture = try MicrophoneCapture(binding: SeamBinding(engine: engine, clock: clock))
        defer { capture.stop() }
        var audio = capture.audio.makeAsyncIterator()
        #expect(engine.starts == 1)
        engine.changeConfiguration()
        #expect(engine.taps == [48_000, 16_000])
        #expect(engine.starts == 2)
        try clock.deliver(through: engine, value: 3)
        #expect(try await audio.next() == AudioPiece(samples: [3, 3], sampleRate: 16_000))
    }

    @Test func aSecondRefusalEndsTheCaptureWithTheError() async throws {

        let engine = FakeMicrophoneEngine(formats: [48_000, 16_000, 8_000], refusals: 2)
        let capture = try MicrophoneCapture(binding: SeamBinding(engine: engine, clock: ManualMicrophoneClock()))
        defer { capture.stop() }
        engine.changeConfiguration()
        engine.changeConfiguration()
        let error = await #expect(throws: NSError.self) {
            for try await _ in capture.audio {}
        }
        #expect(error?.code == Int(kAudioUnitErr_FormatNotSupported))
        #expect(engine.starts == 2)
    }
}

/// The capture's device following stays out of the way: one input that is
/// always there, and an engine whose every step the test drives.
private final class SeamBinding: MicrophoneBinding, Sendable {

    private let native: NativeMicrophoneBinding

    init(engine: FakeMicrophoneEngine, clock: ManualMicrophoneClock) {

        native = NativeMicrophoneBinding(makeEngine: { engine }, readClock: { clock.reading })
    }

    var now: Double { 0 }
    func defaultInput() throws -> UInt32 { 7 }
    func inputAvailable(_ input: UInt32) -> Bool { true }
    func watchDefaultInput(_ changed: @escaping @Sendable (UInt32) -> Void) throws {}
    func unwatchDefaultInput() {}

    func start(
        input: UInt32,
        receive: @escaping @Sendable (Result<InputBuffer, any Error>) -> Void,
        configurationChanged: @escaping @Sendable () -> Void
    ) throws {

        try native.start(input: input, receive: receive, configurationChanged: configurationChanged)
    }

    func stop() { native.stop() }

    func schedule(at deadline: Double, fire: @escaping @Sendable () -> Void) -> @Sendable () -> Void { {} }
}

/// Each buffer's first sample follows the last one's end, so the capture pads nothing.
private final class ManualMicrophoneClock: Sendable {

    private let time = Mutex(0.0)

    var reading: MicrophoneClockReading {

        let now = time.withLock { $0 }
        return MicrophoneClockReading(host: now, continuous: now)
    }

    func deliver(through engine: FakeMicrophoneEngine, value: Float) throws {

        let rate = try #require(engine.taps.last)
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1))
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2))
        buffer.frameLength = 2
        buffer.floatChannelData![0][0] = value
        buffer.floatChannelData![0][1] = value
        time.withLock { $0 += 2 / rate }
        engine.deliver(buffer, time: AVAudioTime(sampleTime: 0, atRate: rate))
    }
}

private final class FakeMicrophoneEngine: MicrophoneEngine, @unchecked Sendable {

    private struct State {
        var formats: [Double]
        var refusals: Int
        var taps: [Double] = []
        var block: (@Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void)?
        var changed: (@Sendable () -> Void)?
        var starts = 0
    }

    private let state: Mutex<State>

    init(formats: [Double], refusals: Int = 0) {

        state = Mutex(State(formats: formats, refusals: refusals))
    }

    var taps: [Double] { state.withLock { $0.taps } }
    var starts: Int { state.withLock { $0.starts } }

    var voiceProcessingEnabled: Bool { false }
    func disableVoiceProcessing() throws {}
    func use(device: UInt32) throws {}

    func inputFormat() -> AVAudioFormat {

        let rate = state.withLock { $0.formats[min($0.taps.count, $0.formats.count - 1)] }
        return AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
    }

    func observeConfigurationChange(_ changed: @escaping @Sendable () -> Void) -> any NSObjectProtocol {

        state.withLock { $0.changed = changed }
        return NSObject()
    }

    func installTap(format: AVAudioFormat, block: @escaping @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void) {

        state.withLock {
            $0.taps.append(format.sampleRate)
            $0.block = block
        }
    }

    func removeTap() {

        state.withLock { $0.block = nil }
    }

    func start() throws {

        let refusal: NSError? = state.withLock {
            $0.starts += 1
            guard $0.refusals > 0 else { return nil }
            $0.refusals -= 1
            return NSError(domain: NSOSStatusErrorDomain, code: Int(kAudioUnitErr_FormatNotSupported))
        }
        if let refusal { throw refusal }
    }

    func stop() {}

    func changeConfiguration() {

        state.withLock { $0.changed }?()
    }

    func deliver(_ buffer: AVAudioPCMBuffer, time: AVAudioTime) {

        state.withLock { $0.block }?(buffer, time)
    }
}
