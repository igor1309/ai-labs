import AVFAudio
import AudioToolbox
import CoreAudio
import Darwin
import Foundation
import Synchronization

// Engine and listener ownership is confined to the capture's lifecycle queue.
// Native callbacks own only immutable handlers and a separately locked tap.
final class NativeMicrophoneBinding: MicrophoneBinding, @unchecked Sendable {

    private var engine: AVAudioEngine?
    private var tap: NativeTap?
    private var configurationObserver: (any NSObjectProtocol)?
    private var defaultListener: AudioObjectPropertyListenerBlock?
    private let notifications = DispatchQueue(label: "audelin.microphone-notifications")
    private let engineLock = NSLock()

    var now: Double { Self.clockSeconds }

    var voiceProcessingEnabled: Bool {

        engineLock.lock()
        defer { engineLock.unlock() }
        return engine?.inputNode.isVoiceProcessingEnabled ?? false
    }

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
        let engine = AVAudioEngine()
        self.engine = engine
        let input = engine.inputNode
        try input.setVoiceProcessingEnabled(false)
        guard let unit = input.audioUnit else { throw CaptureError.noInput }
        var device = device
        try Self.check(AudioUnitSetProperty(
            unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0,
            &device, UInt32(MemoryLayout<UInt32>.size)
        ))
        configurationObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
        ) { _ in configurationChanged() }
        // After switching the device the output format can still describe the
        // old one; a tap whose rate differs from the hardware's raises an
        // Objective-C exception that aborts the app (LAB-638), so tap in the
        // device's own format and refuse anything else as an error.
        let hardware = input.inputFormat(forBus: 0)
        guard hardware.sampleRate.isFinite, hardware.sampleRate > 0, hardware.channelCount > 0,
              let format = AVAudioFormat(
                  standardFormatWithSampleRate: hardware.sampleRate, channels: hardware.channelCount
              ),
              format.commonFormat == .pcmFormatFloat32 else { throw CaptureError.unsupportedFormat }
        let tap = NativeTap(receive: receive, readClock: Self.readClock)
        self.tap = tap
        input.installTap(onBus: 0, bufferSize: 1_024, format: format) { buffer, time in
            tap.deliver(buffer, time: time)
        }
        try engine.start()
    }

    func stop() {

        engineLock.lock()
        defer { engineLock.unlock() }
        if let observer = configurationObserver {
            NotificationCenter.default.removeObserver(observer)
            configurationObserver = nil
        }
        if let engine {
            if tap != nil { engine.inputNode.removeTap(onBus: 0) }
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

    func close() {

        receive.withLock { $0 = nil }
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
