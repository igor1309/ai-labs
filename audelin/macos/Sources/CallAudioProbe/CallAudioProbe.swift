import CoreAudio
import Foundation
import Synchronization

public enum ProbeResult: Equatable, Sendable {
    case heard
    case silent
    case refused(String)
}

/// The audio system, tone player and clock a probe measures with.
public struct ProbeHardware: Sendable {
    let native: ProbeNative
    let makePlayer: @Sendable () -> any ProbePlayer
    let schedule: ProbeSchedule

    init(native: ProbeNative, makePlayer: @escaping @Sendable () -> any ProbePlayer, schedule: @escaping ProbeSchedule) {
        self.native = native
        self.makePlayer = makePlayer
        self.schedule = schedule
    }

    /// The Mac's own audio system.
    public static var live: ProbeHardware {
        ProbeHardware(native: .live, makePlayer: { TonePlayer() }, schedule: liveProbeSchedule)
    }
}

/// One measurement owns all its resources; its answer is delivered after teardown.
public final class CallAudioProbe: Sendable {
    private let native: ProbeNative
    private let makePlayer: @Sendable () -> any ProbePlayer
    private let schedule: ProbeSchedule
    private let measurements = MeasurementTurn()

    /// Measures with `hardware`: `.live` in the app.
    public init(hardware: ProbeHardware) {
        native = hardware.native
        makePlayer = hardware.makePlayer
        schedule = hardware.schedule
    }

    public func measure() async -> ProbeResult {
        await measurements.take()
        let cancelled = Atomic<Bool>(false)
        let operation = Mutex<Measurement?>(nil)
        let answer = await withTaskCancellationHandler {
            await withCheckedContinuation { done in
                let run = Measurement(native: native, player: makePlayer(), schedule: schedule) {
                    operation.withLock { $0 = nil }
                    done.resume(returning: $0)
                }
                operation.withLock { $0 = run }
                run.begin(cancelled: cancelled.load(ordering: .acquiring))
            }
        } onCancel: {
            cancelled.store(true, ordering: .releasing)
            operation.withLock { $0 }?.cancel()
        }
        measurements.give()
        return answer
    }
}

private final class MeasurementTurn: Sendable {
    private struct State {
        var taken = false
        var waiting: [CheckedContinuation<Void, Never>] = []
    }
    private let state = Mutex(State())
    func take() async {
        await withCheckedContinuation { done in
            let granted = state.withLock { state in
                if state.taken { state.waiting.append(done); return false }
                state.taken = true
                return true
            }
            if granted { done.resume() }
        }
    }
    func give() {
        let next = state.withLock { state -> CheckedContinuation<Void, Never>? in
            if !state.waiting.isEmpty { return state.waiting.removeFirst() }
            state.taken = false
            return nil
        }
        next?.resume()
    }
}

typealias ProbeSchedule = @Sendable (Double, @escaping @Sendable () -> Void) -> @Sendable () -> Void

func liveProbeSchedule(_ seconds: Double, _ fire: @escaping @Sendable () -> Void) -> @Sendable () -> Void {
    let timer = DispatchSource.makeTimerSource(queue: .global(qos: .userInitiated))
    timer.schedule(deadline: .now() + seconds)
    timer.setEventHandler(handler: fire)
    timer.resume()
    return { timer.cancel() }
}

protocol ProbePlayer: Sendable {
    func prime() throws
    func tone(rendered: @escaping @Sendable () -> Void) throws
    func stop()
}

/// IO writes atomics only: no allocation, locks, dispatch or native calls.
final class Reception: Sendable {
    let active = Atomic<Bool>(false)
    let stimulus = Atomic<Bool>(false)
    let callbacks = Atomic<Int>(0)
    let frames = Atomic<Int>(0)
    let heard = Atomic<Bool>(false)
    let invalid = Atomic<Bool>(false)
    let continuous = Atomic<Bool>(true)
    private let sampleEnd = Atomic<UInt64>(Double.nan.bitPattern)

    func receive(_ input: UnsafePointer<AudioBufferList>, time: UnsafePointer<AudioTimeStamp>) {
        guard active.load(ordering: .acquiring) else { return }
        let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
        var frameCount = 0
        for buffer in buffers {
            guard let data = buffer.mData, buffer.mNumberChannels > 0,
                  buffer.mDataByteSize % 4 == 0 else { invalid.store(true, ordering: .releasing); continue }
            let count = Int(buffer.mDataByteSize) / 4
            frameCount = max(frameCount, count / Int(buffer.mNumberChannels))
            let values = data.assumingMemoryBound(to: Float.self)
            for i in 0..<count where stimulus.load(ordering: .relaxed) {
                let value = values[i]
                if !value.isFinite { invalid.store(true, ordering: .releasing) }
                else if value != 0 { heard.store(true, ordering: .releasing) }
            }
        }
        if frameCount > 0 {
            let start = time.pointee.mSampleTime
            let expected = Double(bitPattern: sampleEnd.load(ordering: .relaxed))
            if !time.pointee.mFlags.contains(.sampleTimeValid) || !start.isFinite ||
                (expected.isFinite && abs(start - expected) > 1) {
                continuous.store(false, ordering: .releasing)
            }
            sampleEnd.store((start + Double(frameCount)).bitPattern, ordering: .relaxed)
            frames.wrappingAdd(frameCount, ordering: .releasing)
            callbacks.wrappingAdd(1, ordering: .releasing)
        }
    }
}

private final class Measurement: @unchecked Sendable {
    // All state except Reception is touched only while holding turn, so a late
    // callback has done its work, or found the measurement finished, when it returns.
    private let turn = Mutex<Void>(())
    let native: ProbeNative
    let player: any ProbePlayer
    let schedule: ProbeSchedule
    let done: @Sendable (ProbeResult) -> Void
    let reception = Reception()
    var timers: [@Sendable () -> Void] = []
    var tap: AudioObjectID = 0
    var device: AudioObjectID = 0
    var io: AudioDeviceIOProcID?
    var started = false
    var finished = false
    // Written by the render callback without turn: stopping the player may wait for that callback.
    let rendered = Atomic<Bool>(false)
    let atRenderEnd = Atomic<Int>(0)
    var rate = 0.0
    var beforeTone = 0
    var beforeFrames = 0

    init(native: ProbeNative, player: any ProbePlayer, schedule: @escaping ProbeSchedule,
         done: @escaping @Sendable (ProbeResult) -> Void) {
        self.native = native; self.player = player; self.schedule = schedule; self.done = done
    }

    func begin(cancelled: Bool) {
        turn.withLock { _ in if cancelled { finish(.refused("cancelled")) } else { start() } }
    }

    func cancel() {
        turn.withLock { _ in finish(.refused("cancelled")) }
    }

    private func later(_ seconds: Double, _ action: @escaping @Sendable (Measurement) -> Void) {
        timers.append(schedule(seconds) { [weak self] in
            guard let self else { return }
            turn.withLock { _ in if !finished { action(self) } }
        })
    }

    private func start() {
        do {
            guard try native.defaultOutput() != 0 else { throw ProbeFailure("no default output") }
            try player.prime()
            later(3) { $0.finish(.refused("timeout")) }
            later(0.3) { $0.install() }
        } catch { finish(.refused(String(describing: error))) }
    }

    func install() {
        do {
            let process = try native.ownProcess()
            guard process != 0 else { throw ProbeFailure("own process unavailable") }
            let description = ProbeTap(process: process, uuid: UUID(), isPrivate: true, muted: true)
            try check(native.createTap(description, &tap))
            guard tap != 0 else { throw ProbeFailure("missing tap") }
            var format = AudioStreamBasicDescription()
            try check(native.format(tap, &format))
            guard format.mFormatID == kAudioFormatLinearPCM, format.mBitsPerChannel == 32,
                  format.mFormatFlags & kAudioFormatFlagIsFloat != 0,
                  format.mFormatFlags & kAudioFormatFlagIsBigEndian == 0,
                  format.mFormatFlags & kAudioFormatFlagIsSignedInteger == 0,
                  format.mChannelsPerFrame > 0, format.mSampleRate.isFinite, format.mSampleRate > 0,
                  format.mSampleRate <= Double(UInt32.max), format.mFramesPerPacket == 1,
                  UInt64(format.mBytesPerFrame) == 4 * (format.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0 ? UInt64(format.mChannelsPerFrame) : 1),
                  format.mBytesPerPacket == format.mBytesPerFrame else {
                throw ProbeFailure("unsupported tap format")
            }
            rate = format.mSampleRate
            let composition: [String: Any] = [
                kAudioAggregateDeviceNameKey: "Audelin access probe",
                kAudioAggregateDeviceUIDKey: "audelin-access-probe-\(description.uuid.uuidString)",
                kAudioAggregateDeviceIsPrivateKey: true,
                kAudioAggregateDeviceTapAutoStartKey: false,
                kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: description.uuid.uuidString]],
            ]
            try check(native.createAggregate(composition as CFDictionary, &device))
            guard device != 0 else { throw ProbeFailure("missing aggregate") }
            let reception = reception
            try check(native.createIO(&io, device, { _, input, time, _, _ in reception.receive(input, time: time) }))
            guard io != nil else { throw ProbeFailure("missing IO proc") }
            reception.active.store(true, ordering: .releasing)
            try check(native.start(device, io))
            started = true
            later(0.2) { $0.play() }
        } catch { finish(.refused(String(describing: error))) }
    }

    func play() {
        do {
            beforeTone = reception.callbacks.load(ordering: .acquiring)
            beforeFrames = reception.frames.load(ordering: .acquiring)
            guard beforeTone > 0 else { throw ProbeFailure("no capture before stimulus") }
            // Only reception after scheduling the stimulus may establish access.
            reception.heard.store(false, ordering: .releasing)
            reception.continuous.store(true, ordering: .releasing)
            reception.stimulus.store(true, ordering: .releasing)
            try player.tone { [weak self] in
                guard let self else { return }
                reception.stimulus.store(false, ordering: .releasing)
                atRenderEnd.store(reception.callbacks.load(ordering: .acquiring), ordering: .relaxed)
                rendered.store(true, ordering: .releasing)
            }
            later(0.5) { $0.observe() }
        } catch { finish(.refused(String(describing: error))) }
    }

    func observe() {
        // Only our own process is tapped and it plays digital silence apart from the tone,
        // so a finite nonzero sample in the stimulus window is proof without full coverage.
        if reception.invalid.load(ordering: .acquiring) { finish(.refused("nonfinite or malformed samples")); return }
        if reception.heard.load(ordering: .acquiring) { finish(.heard); return }
        let callbacks = reception.callbacks.load(ordering: .acquiring)
        guard rendered.load(ordering: .acquiring) else { finish(.refused("stimulus not rendered")); return }
        let atRenderEnd = atRenderEnd.load(ordering: .relaxed)
        guard atRenderEnd - beforeTone >= 2, callbacks > atRenderEnd,
              reception.frames.load(ordering: .acquiring) - beforeFrames >= Int(rate * 0.2) else {
            finish(.refused("incomplete stimulus coverage")); return
        }
        guard reception.continuous.load(ordering: .acquiring) else { finish(.refused("discontinuous capture")); return }
        finish(.silent)
    }

    func finish(_ answer: ProbeResult) {
        guard !finished else { return }
        finished = true
        for cancel in timers { cancel() }
        timers.removeAll()
        player.stop()
        reception.active.store(false, ordering: .releasing)
        var failure: OSStatus?
        func cleanup(_ status: OSStatus) { if status != noErr { failure = failure ?? status } }
        if started { cleanup(native.stop(device, io)) }
        if let io { cleanup(native.destroyIO(device, io)) }
        if device != 0 { cleanup(native.destroyAggregate(device)) }
        if tap != 0 { cleanup(native.destroyTap(tap)) }
        done(failure.map { .refused("cleanup status \($0)") } ?? answer)
    }
}

struct ProbeFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

func check(_ status: OSStatus) throws {
    if status != noErr { throw ProbeFailure("Core Audio status \(status)") }
}
