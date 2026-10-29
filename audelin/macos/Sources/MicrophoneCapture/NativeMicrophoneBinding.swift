import AVFAudio
import AudioToolbox
import CoreAudio
import Darwin
import Foundation
import Synchronization

/// The audio engine the binding drives, so its restarts can be driven by a test.
protocol MicrophoneEngine: AnyObject, Sendable {

    var voiceProcessingEnabled: Bool { get }
    func disableVoiceProcessing() throws
    func use(device: UInt32) throws
    /// The hardware format of the input bus, read anew on each call.
    func inputFormat() -> AVAudioFormat
    func observeConfigurationChange(_ changed: @escaping @Sendable () -> Void) -> any NSObjectProtocol
    func installTap(format: AVAudioFormat, block: @escaping @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void)
    func removeTap()
    func start() throws
    func stop()
}

// Engine and listener ownership is confined to the capture's lifecycle queue,
// except a configuration change, which restarts the engine under its lock.
// Native callbacks own only immutable handlers and a separately locked tap.
final class NativeMicrophoneBinding: MicrophoneBinding, @unchecked Sendable {

    private enum Phase {
        case running
        // The first start was refused while the device changed its profile;
        // the configuration change that follows gets one more start.
        case awaitingFormat
        case ended
    }

    private let makeEngine: @Sendable () -> any MicrophoneEngine
    private let readClock: @Sendable () throws -> MicrophoneClockReading
    private var engine: (any MicrophoneEngine)?
    private var tap: NativeTap?
    private var phase = Phase.ended
    private var configurationObserver: (any NSObjectProtocol)?
    private var defaultListener: AudioObjectPropertyListenerBlock?
    private let notifications = DispatchQueue(label: "audelin.microphone-notifications")
    private let engineLock = NSLock()
    // Read without the engine lock, which configuration changes hold across native calls.
    private let voiceProcessing = Mutex(false)

    init(
        makeEngine: @escaping @Sendable () -> any MicrophoneEngine,
        readClock: @escaping @Sendable () throws -> MicrophoneClockReading
    ) {

        self.makeEngine = makeEngine
        self.readClock = readClock
    }

    static func system() -> NativeMicrophoneBinding {

        NativeMicrophoneBinding(makeEngine: { SystemMicrophoneEngine() }, readClock: readClock)
    }

    var now: Double { Self.clockSeconds }

    var voiceProcessingEnabled: Bool { voiceProcessing.withLock { $0 } }

    func defaultInput() throws -> UInt32 {

        try Self.readDefaultInput()
    }

    func inputAvailable(_ input: UInt32) -> Bool {

        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceIsAlive,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var alive: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        return AudioObjectGetPropertyData(input, &address, 0, nil, &size, &alive) == noErr && alive != 0
    }

    func watchDefaultInput(_ changed: @escaping @Sendable (UInt32) -> Void) throws {

        var address = Self.defaultInputAddress
        let listener: AudioObjectPropertyListenerBlock = { _, _ in
            // A missing device is reported as the unknown device, so a held
            // disappearance fails just like a rebuild without an input.
            changed((try? Self.readDefaultInput()) ?? kAudioObjectUnknown)
        }
        try Self.check(AudioObjectAddPropertyListenerBlock(
            AudioObjectID(kAudioObjectSystemObject), &address, notifications, listener
        ))
        defaultListener = listener
    }

    func unwatchDefaultInput() {

        guard let listener = defaultListener else { return }
        var address = Self.defaultInputAddress
        AudioObjectRemovePropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &address, notifications, listener)
        defaultListener = nil
    }

    func start(
        input device: UInt32,
        receive: @escaping @Sendable (Result<InputBuffer, any Error>) -> Void,
        configurationChanged: @escaping @Sendable () -> Void
    ) throws {

        engineLock.lock()
        defer { engineLock.unlock() }
        let engine = makeEngine()
        self.engine = engine
        phase = .ended
        try engine.disableVoiceProcessing()
        let enabled = engine.voiceProcessingEnabled
        voiceProcessing.withLock { $0 = enabled }
        try engine.use(device: device)
        configurationObserver = engine.observeConfigurationChange { [weak self, weak engine] in
            guard let self, let engine else { return }
            self.configurationChanged(engine, notify: configurationChanged)
        }
        let tap = NativeTap(receive: receive, readClock: readClock)
        self.tap = tap
        try installTap(tap, on: engine)
        do {
            try engine.start()
            phase = .running
        } catch let error as NSError where error.code == Int(kAudioUnitErr_FormatNotSupported) {
            // AirPods switch to their headset profile when their microphone
            // opens, so the format read a moment ago no longer holds.
            phase = .awaitingFormat
        }
    }

    // The device's format can change under a running engine, which then
    // delivers nothing at the old one; the tap follows the format it has now.
    private func configurationChanged(_ changed: any MicrophoneEngine, notify: @Sendable () -> Void) {

        engineLock.lock()
        guard engine === changed, let tap, phase != .ended else {
            engineLock.unlock()
            return
        }
        let retrying = phase == .awaitingFormat
        do {
            changed.removeTap()
            changed.stop()
            try installTap(tap, on: changed)
            try changed.start()
            phase = .running
            engineLock.unlock()
        } catch {
            phase = .ended
            engineLock.unlock()
            // The one retry is spent; a running capture lets the capture
            // decide whether its input is still there.
            if retrying { tap.fail(error) } else { notify() }
        }
    }

    // After switching the device the output format can still describe the
    // old one; a tap whose rate differs from the hardware's raises an
    // Objective-C exception that aborts the app (LAB-638), so tap in the
    // device's own format and refuse anything else as an error.
    private func installTap(_ tap: NativeTap, on engine: any MicrophoneEngine) throws {

        let hardware = engine.inputFormat()
        guard hardware.sampleRate.isFinite, hardware.sampleRate > 0, hardware.channelCount > 0,
              let format = AVAudioFormat(
                  standardFormatWithSampleRate: hardware.sampleRate, channels: hardware.channelCount
              ),
              format.commonFormat == .pcmFormatFloat32 else { throw CaptureError.unsupportedFormat }
        engine.installTap(format: format) { buffer, time in
            tap.deliver(buffer, time: time)
        }
    }

    func stop() {

        engineLock.lock()
        defer { engineLock.unlock() }
        phase = .ended
        if let observer = configurationObserver {
            NotificationCenter.default.removeObserver(observer)
            configurationObserver = nil
        }
        if let engine {
            if tap != nil { engine.removeTap() }
            engine.stop()
        }
        // Removing the tap prevents further delivery; closing waits behind any
        // callback currently copying or submitting a buffer.
        tap?.close()
        tap = nil
        engine = nil
    }

    func schedule(at deadline: Double, fire: @escaping @Sendable () -> Void) -> @Sendable () -> Void {

        let delay = max(0, deadline - now)
        let timer = Task {
            do {
                try await Task.sleep(for: .seconds(delay))
                try Task.checkCancellation()
                fire()
            } catch {}
        }
        return { timer.cancel() }
    }

    static func readDefaultInput() throws -> UInt32 {

        var address = defaultInputAddress
        var device = AudioObjectID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        try check(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device))
        guard device != kAudioObjectUnknown else { throw CaptureError.noInput }
        return device
    }

    static var clockSeconds: Double {

        AVAudioTime.seconds(forHostTime: mach_continuous_time())
    }

    static func readClock() throws -> MicrophoneClockReading {

        var host: UInt64 = 0
        var continuous: UInt64 = 0
        try check(microphoneGetTimes(&host, &continuous, nil))
        return MicrophoneClockReading(
            host: AVAudioTime.seconds(forHostTime: host),
            continuous: AVAudioTime.seconds(forHostTime: continuous)
        )
    }

    static func timestamp(hostTime: Double?, hostNow: Double, clockNow: Double, duration: Double) -> Double {

        // Audio host time pauses during sleep. Translate into the continuous
        // clock so sleeping cannot hide a gap longer than can be padded.
        clockNow - (hostTime.map { hostNow - $0 } ?? duration)
    }

    static func channels(from buffer: AVAudioPCMBuffer) throws -> [[Float]] {

        guard let data = buffer.floatChannelData else { throw CaptureError.unsupportedFormat }
        let count = Int(buffer.format.channelCount)
        let frames = Int(buffer.frameLength)
        return (0..<count).map { channel in
            if buffer.format.isInterleaved {
                return (0..<frames).map { data[0][$0 * count + channel] }
            }
            return Array(UnsafeBufferPointer(start: data[channel], count: frames))
        }
    }

    private static var defaultInputAddress: AudioObjectPropertyAddress {

        AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
    }

    private static func check(_ status: OSStatus) throws {

        guard status == noErr else { throw NativeMicrophoneError(status: status) }
    }
}

private struct NativeMicrophoneError: Error {

    let status: OSStatus
}

final class NativeTap: Sendable {

    private let readClock: @Sendable () throws -> MicrophoneClockReading
    private let receive: Mutex<(@Sendable (Result<InputBuffer, any Error>) -> Void)?>

    init(
        receive: @escaping @Sendable (Result<InputBuffer, any Error>) -> Void,
        readClock: @escaping @Sendable () throws -> MicrophoneClockReading
    ) {

        self.receive = Mutex(receive)
        self.readClock = readClock
    }

    func deliver(_ buffer: AVAudioPCMBuffer, time: AVAudioTime) {

        receive.withLock { receive in
            guard let receive else { return }
            receive(Result {
                let clock = try readClock()
                let rate = buffer.format.sampleRate
                let firstSample = NativeMicrophoneBinding.timestamp(
                    hostTime: time.isHostTimeValid ? AVAudioTime.seconds(forHostTime: time.hostTime) : nil,
                    hostNow: clock.host,
                    clockNow: clock.continuous,
                    duration: Double(buffer.frameLength) / rate
                )
                return try InputBuffer(
                    channels: NativeMicrophoneBinding.channels(from: buffer), sampleRate: rate, time: firstSample
                )
            })
        }
    }

    func fail(_ error: any Error) {

        receive.withLock { $0?(.failure(error)) }
    }

    func close() {

        receive.withLock { $0 = nil }
    }
}

// The binding serializes every call under its engine lock.
final class SystemMicrophoneEngine: MicrophoneEngine, @unchecked Sendable {

    private let engine = AVAudioEngine()

    var voiceProcessingEnabled: Bool { engine.inputNode.isVoiceProcessingEnabled }

    func disableVoiceProcessing() throws {

        try engine.inputNode.setVoiceProcessingEnabled(false)
    }

    func use(device: UInt32) throws {

        guard let unit = engine.inputNode.audioUnit else { throw CaptureError.noInput }
        // Setting the device, even to the one in use, raises a configuration
        // change; set it only when it differs (LAB-638).
        var device = device
        var current = AudioObjectID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<UInt32>.size)
        let read = AudioUnitGetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &current, &size)
        guard read != noErr || current != device else { return }
        let status = AudioUnitSetProperty(
            unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0,
            &device, UInt32(MemoryLayout<UInt32>.size)
        )
        guard status == noErr else { throw NativeMicrophoneError(status: status) }
    }

    func inputFormat() -> AVAudioFormat {

        engine.inputNode.inputFormat(forBus: 0)
    }

    func observeConfigurationChange(_ changed: @escaping @Sendable () -> Void) -> any NSObjectProtocol {

        NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
        ) { _ in changed() }
    }

    func installTap(format: AVAudioFormat, block: @escaping @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void) {

        engine.inputNode.installTap(onBus: 0, bufferSize: 1_024, format: format, block: block)
    }

    func removeTap() {

        engine.inputNode.removeTap(onBus: 0)
    }

    func start() throws {

        try engine.start()
    }

    func stop() {

        engine.stop()
    }
}

struct MicrophoneClockReading: Sendable {

    let host: Double
    let continuous: Double
}

// The SDK hides this declaration; the system function samples both clocks together.
@_silgen_name("mach_get_times")
private func microphoneGetTimes(
    _ host: UnsafeMutablePointer<UInt64>,
    _ continuous: UnsafeMutablePointer<UInt64>,
    _ calendar: UnsafeMutablePointer<timespec>?
) -> kern_return_t
