import CoreAudio
import Foundation
import Synchronization
import Testing
@testable import CallAudioProbe

@Suite(.timeLimit(.minutes(1)))
struct CallAudioProbeTests {
    @Test func finiteNonzeroTapSampleIsHeard() async {
        let rig = ProbeRig()
        #expect(await rig.measure(samples: [0, 0.001, -0.001]) == .heard)
        #expect(rig.events.last == "destroy tap")
    }

    @Test func coveredZerosAfterSuccessfulRenderAreSilent() async {
        #expect(await ProbeRig().measure(samples: [0]) == .silent)
    }

    @Test func captureBlocksMayStraddleThePlaybackCompletionBoundary() async {
        for samples: [Float] in [[0], [0.001]] {
            #expect(await ProbeRig().measure(samples: samples, frames: 4_608) == (samples == [0] ? .silent : .heard))
        }
    }

    @Test func missingOutputAndIncompleteCoverageAreRefused() async {
        let missing = ProbeRig(failure: "output")
        #expect(isRefused(await missing.probe.measure()))
        #expect(missing.events == ["output", "player stop"])
        for coverage in [0, 1] {
            let rig = ProbeRig()
            #expect(isRefused(await rig.measure(samples: [0], coverage: coverage)))
        }
        #expect(isRefused(await ProbeRig().measure(samples: [0], gap: true)))
    }

    @Test func stimulusHeardUnderLoadNeedsNoCompleteCoverage() async {
        #expect(await ProbeRig().measure(samples: [0.001], coverage: 1) == .heard)
        #expect(await ProbeRig().measure(samples: [0.001], render: false) == .heard)
        #expect(await ProbeRig().measure(samples: [0.001], gap: true) == .heard)
    }

    @Test func renderAndEachNativeFailureAreRefused() async {
        for failure in ["output read", "prime", "process", "create tap", "format", "create aggregate", "create IO", "start", "tone",
                        "stop", "destroy IO", "destroy aggregate", "destroy tap"] {
            let rig = ProbeRig(failure: failure)
            if ["output read", "prime"].contains(failure) {
                #expect(isRefused(await rig.probe.measure()))
            } else if ["process", "create tap", "format", "create aggregate", "create IO", "start"].contains(failure) {
                let task = Task { await rig.probe.measure() }
                _ = await rig.clock.next(3)
                await rig.clock.next(0.3).fire()
                #expect(isRefused(await task.value))
            } else {
                #expect(isRefused(await rig.measure(samples: [0.001])))
            }
            let events = rig.events
            for release in ["player stop", "stop", "destroy IO", "destroy aggregate", "destroy tap"] {
                #expect(events.filter { $0 == release }.count <= 1)
            }
        }
        let notRendered = ProbeRig()
        #expect(isRefused(await notRendered.measure(samples: [0], render: false)))
        for invalidFormat in 0...8 {
            let rig = ProbeRig(formatVariant: invalidFormat)
            let task = Task { await rig.probe.measure() }
            _ = await rig.clock.next(3)
            await rig.clock.next(0.3).fire()
            #expect(isRefused(await task.value))
            #expect(!rig.events.contains("create aggregate"))
        }
    }

    @Test func nonfiniteSamplesCannotEstablishHeard() async {
        for samples: [Float] in [[.nan], [.infinity, -.infinity], [0, .nan]] {
            #expect(isRefused(await ProbeRig().measure(samples: samples)))
        }
    }

    @Test func toneStartsOnlyAfterMutingTapAndCaptureAreReady() async {
        let rig = ProbeRig()
        #expect(await rig.measure(samples: [0.001]) == .heard)
        #expect(Array(rig.events.prefix(9)) == ["output", "prime", "process", "create tap", "format", "create aggregate", "create IO", "start", "tone"])
        #expect(rig.configuration.withLock { $0 } == [true, true, true, true, true, true])
    }

    @Test func cancellationAndLateCallbacksReleaseResourcesOnce() async {
        let rig = ProbeRig()
        let task = Task { await rig.probe.measure() }
        let timeout = await rig.clock.next(3)
        await rig.clock.next(0.3).fire()
        let play = await rig.clock.next(0.2)
        task.cancel()
        #expect(isRefused(await task.value))
        let completed = rig.events
        play.fireEvenIfCancelled()
        timeout.fireEvenIfCancelled()
        rig.emit([0.001])
        rig.player.complete()
        // A second measurement is a queue barrier for the late work above.
        #expect(await rig.measure(samples: [0]) == .silent)
        #expect(Array(rig.events.prefix(completed.count)) == completed)
        #expect(rig.events.filter { $0 == "destroy tap" }.count == 2)
    }

    @Test func playerStopsBeforeTapRemoval() async {
        let rig = ProbeRig()
        _ = await rig.measure(samples: [0])
        #expect(Array(rig.events.suffix(5)) == ["player stop", "stop", "destroy IO", "destroy aggregate", "destroy tap"])
    }

    @Test func timeoutAndNonStimulusAudioCannotEstablishAccess() async {
        let rig = ProbeRig()
        let task = Task { await rig.probe.measure() }
        let timeout = await rig.clock.next(3)
        _ = await rig.clock.next(0.3)
        timeout.fire()
        #expect(await task.value == .refused("timeout"))
        #expect(await ProbeRig().measure(samples: [0], outsideTone: [0.001]) == .silent)
    }
}

func isRefused(_ result: ProbeResult) -> Bool {
    if case .refused = result { return true }
    return false
}

final class ProbeRig: Sendable {
    let clock = ProbeClock()
    let player: PlayerSpy
    let calls = Mutex<[String]>([])
    let configuration = Mutex<[Bool]>([])
    let callback = Mutex<ProbeIOBlock?>(nil)
    let tapUUID = Mutex<String?>(nil)
    let sampleTime = Mutex(0.0)
    let failure: String
    let formatVariant: Int?

    init(failure: String = "", formatVariant: Int? = nil) {
        self.failure = failure; self.formatVariant = formatVariant
        player = PlayerSpy(failure: failure)
        player.log.withLock { $0 = { [weak self] in self?.record($0) } }
    }

    var events: [String] { calls.withLock { $0 } }
    func record(_ event: String) { calls.withLock { $0.append(event) } }
    func status(_ event: String) -> OSStatus { record(event); return failure == event ? -1 : noErr }

    var probe: CallAudioProbe { CallAudioProbe(native: native, makePlayer: { [player] in player }, schedule: clock.schedule) }

    var native: ProbeNative {
        ProbeNative(defaultOutput: { [self] in
            record("output")
            if failure == "output read" { throw ProbeFailure("output read") }
            return failure == "output" ? 0 : 42
        }, ownProcess: { [self] in
            record("process")
            if failure == "process" { throw ProbeFailure("process") }
            return 123
        }, createTap: { [self] description, tap in
            tapUUID.withLock { $0 = description.uuid.uuidString }
            configuration.withLock { $0 = [description.process == 123, description.isPrivate, description.muted] }
            let status = status("create tap")
            if status == noErr { tap.pointee = 10 }
            return status
        }, format: { [self] _, value in
            value.pointee = AudioStreamBasicDescription(mSampleRate: 48_000, mFormatID: kAudioFormatLinearPCM,
                mFormatFlags: kAudioFormatFlagIsFloat, mBytesPerPacket: 8, mFramesPerPacket: 1,
                mBytesPerFrame: 8, mChannelsPerFrame: 2, mBitsPerChannel: 32, mReserved: 0)
            switch formatVariant {
            case 0: value.pointee.mBitsPerChannel = 16
            case 1: value.pointee.mFormatFlags = 0
            case 2: value.pointee.mSampleRate = .nan
            case 3: value.pointee.mFormatID = 0
            case 4: value.pointee.mFormatFlags |= kAudioFormatFlagIsBigEndian
            case 5: value.pointee.mBytesPerFrame = 16
            case 6: value.pointee.mFramesPerPacket = 2
            case 7: value.pointee.mSampleRate = Double.greatestFiniteMagnitude
            case 8: value.pointee.mFormatFlags |= kAudioFormatFlagIsSignedInteger
            default: break
            }
            return status("format")
        }, createAggregate: { [self] dictionary, device in
            let dictionary = dictionary as NSDictionary
            let taps = dictionary[kAudioAggregateDeviceTapListKey] as? [[String: Any]]
            configuration.withLock { $0 += [dictionary[kAudioAggregateDeviceIsPrivateKey] as? Bool == true,
                dictionary[kAudioAggregateDeviceTapAutoStartKey] as? Bool == false,
                taps?.count == 1 && taps?.first?[kAudioSubTapUIDKey] as? String == tapUUID.withLock { $0 } && dictionary[kAudioAggregateDeviceSubDeviceListKey] == nil] }
            let status = status("create aggregate")
            if status == noErr { device.pointee = 11 }
            return status
        }, createIO: { [self] io, _, receive in
            let status = status("create IO")
            if status == noErr { io.pointee = { _, _, _, _, _, _, _ in noErr }; callback.withLock { $0 = receive } }
            return status
        }, start: { [self] _, _ in status("start") }, stop: { [self] _, _ in status("stop") },
        destroyIO: { [self] _, _ in status("destroy IO") }, destroyAggregate: { [self] _ in status("destroy aggregate") },
        destroyTap: { [self] _ in status("destroy tap") })
    }

    func emit(_ samples: [Float], frames: Int = 4_800, gap: Bool = false) {
        let samples = (0..<(frames * 2)).map { samples[$0 % samples.count] }
        samples.withUnsafeBytes { bytes in
            var list = AudioBufferList(mNumberBuffers: 1, mBuffers: AudioBuffer(mNumberChannels: 2,
                mDataByteSize: UInt32(bytes.count), mData: UnsafeMutableRawPointer(mutating: bytes.baseAddress)))
            var time = AudioTimeStamp()
            time.mFlags = .sampleTimeValid
            time.mSampleTime = sampleTime.withLock { value in
                if gap { value += 1_000 }
                defer { value += Double(frames) }
                return value
            }
            var output = AudioBufferList()
            withUnsafePointer(to: &time) { time in
                callback.withLock { $0 }?(time, &list, time, &output, time)
            }
        }
    }

    func measure(samples: [Float], coverage: Int = 2, render: Bool = true, outsideTone: [Float] = [0], gap: Bool = false, frames: Int = 4_800) async -> ProbeResult {
        let probe = probe
        let task = Task { await probe.measure() }
        _ = await clock.next(3)
        await clock.next(0.3).fire()
        let toneTimer = await clock.next(0.2)
        emit(outsideTone)
        toneTimer.fire()
        if failure == "tone" { return await task.value }
        let observation = await clock.next(0.5)
        for index in 0..<coverage { emit(samples, frames: frames, gap: gap && index == 1) }
        if render { player.complete() }
        emit(outsideTone)
        observation.fire()
        return await task.value
    }
}

final class PlayerSpy: Sendable, ProbePlayer {
    let failure: String
    let log = Mutex<(@Sendable (String) -> Void)?>(nil)
    let rendered = Mutex<(@Sendable () -> Void)?>(nil)
    init(failure: String) { self.failure = failure }
    func prime() throws {
        log.withLock { $0 }?("prime")
        if failure == "prime" { throw ProbeFailure("prime") }
    }
    func tone(rendered: @escaping @Sendable () -> Void) throws {
        log.withLock { $0 }?("tone")
        if failure == "tone" { throw ProbeFailure("tone") }
        self.rendered.withLock { $0 = rendered }
    }
    func complete() { rendered.withLock { $0 }?() }
    func stop() { log.withLock { $0 }?("player stop") }
}

final class ProbeClock: Sendable {
    final class Timer: Sendable {
        let seconds: Double
        let action: @Sendable () -> Void
        let cancelled = Mutex(false)
        init(seconds: Double, action: @escaping @Sendable () -> Void) { self.seconds = seconds; self.action = action }
        func fire() { if !cancelled.withLock({ $0 }) { action() } }
        func fireEvenIfCancelled() { action() }
    }
    let stream: AsyncStream<Timer>
    let output: AsyncStream<Timer>.Continuation
    init() { (stream, output) = AsyncStream.makeStream() }
    func schedule(_ seconds: Double, _ action: @escaping @Sendable () -> Void) -> @Sendable () -> Void {
        let timer = Timer(seconds: seconds, action: action)
        output.yield(timer)
        return { timer.cancelled.withLock { $0 = true } }
    }
    func next(_ seconds: Double) async -> Timer {
        var iterator = stream.makeAsyncIterator()
        let timer = await iterator.next()!
        #expect(timer.seconds == seconds)
        return timer
    }
    deinit { output.finish() }
}
