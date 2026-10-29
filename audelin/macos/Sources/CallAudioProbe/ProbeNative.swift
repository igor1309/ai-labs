import AVFAudio
import CoreAudio
import Foundation

typealias ProbeIOBlock = @Sendable (UnsafePointer<AudioTimeStamp>, UnsafePointer<AudioBufferList>, UnsafePointer<AudioTimeStamp>, UnsafeMutablePointer<AudioBufferList>, UnsafePointer<AudioTimeStamp>) -> Void

/// What the probe's tap is; only the live binding turns it into a Core Audio description.
struct ProbeTap: Equatable, Sendable {
    let process: AudioObjectID
    let uuid: UUID
    let isPrivate: Bool
    let muted: Bool
}

/// No property-writing capability is supplied: the probe cannot alter a route or its volume.
struct ProbeNative: Sendable {
    var defaultOutput: @Sendable () throws -> AudioObjectID
    var ownProcess: @Sendable () throws -> AudioObjectID
    var createTap: @Sendable (ProbeTap, UnsafeMutablePointer<AudioObjectID>) -> OSStatus
    var format: @Sendable (AudioObjectID, UnsafeMutablePointer<AudioStreamBasicDescription>) -> OSStatus
    var createAggregate: @Sendable (CFDictionary, UnsafeMutablePointer<AudioObjectID>) -> OSStatus
    var createIO: @Sendable (UnsafeMutablePointer<AudioDeviceIOProcID?>, AudioObjectID, @escaping ProbeIOBlock) -> OSStatus
    var start: @Sendable (AudioObjectID, AudioDeviceIOProcID?) -> OSStatus
    var stop: @Sendable (AudioObjectID, AudioDeviceIOProcID?) -> OSStatus
    var destroyIO: @Sendable (AudioObjectID, AudioDeviceIOProcID) -> OSStatus
    var destroyAggregate: @Sendable (AudioObjectID) -> OSStatus
    var destroyTap: @Sendable (AudioObjectID) -> OSStatus

    static let live = ProbeNative(
        defaultOutput: defaultOutputDevice,
        ownProcess: {
            var pid = getpid()
            var result: AudioObjectID = 0
            var address = property(kAudioHardwarePropertyTranslatePIDToProcessObject)
            var size = UInt32(MemoryLayout<AudioObjectID>.size)
            try check(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address,
                UInt32(MemoryLayout<pid_t>.size), &pid, &size, &result))
            guard size == MemoryLayout<AudioObjectID>.size else { throw ProbeFailure("invalid process identity") }
            return result
        },
        createTap: { tap, result in
            let description = CATapDescription(stereoMixdownOfProcesses: [tap.process])
            description.uuid = tap.uuid
            description.isPrivate = tap.isPrivate
            description.muteBehavior = tap.muted ? .muted : .unmuted
            return AudioHardwareCreateProcessTap(description, result)
        },
        format: { tap, format in
            var address = property(kAudioTapPropertyFormat)
            var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
            let status = AudioObjectGetPropertyData(tap, &address, 0, nil, &size, format)
            return size == MemoryLayout<AudioStreamBasicDescription>.size ? status : kAudioHardwareBadPropertySizeError
        },
        createAggregate: { AudioHardwareCreateAggregateDevice($0, $1) },
        createIO: { AudioDeviceCreateIOProcIDWithBlock($0, $1, nil, $2) },
        start: { AudioDeviceStart($0, $1) },
        stop: { AudioDeviceStop($0, $1) },
        destroyIO: { AudioDeviceDestroyIOProcID($0, $1) },
        destroyAggregate: { AudioHardwareDestroyAggregateDevice($0) },
        destroyTap: { AudioHardwareDestroyProcessTap($0) }
    )
}

func property(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
}

public func defaultOutputDevice() throws -> UInt32 {
    var result: AudioObjectID = 0
    var address = property(kAudioHardwarePropertyDefaultOutputDevice)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    try check(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &result))
    guard size == MemoryLayout<AudioObjectID>.size else { throw ProbeFailure("invalid output identity") }
    return result
}

final class TonePlayer: @unchecked Sendable, ProbePlayer {
    // Measurement calls these only on its serial native queue.
    private var engine: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private var format: AVAudioFormat?

    func prime() throws {
        let engine = AVAudioEngine()
        self.engine = engine
        let rate = engine.outputNode.outputFormat(forBus: 0).sampleRate
        guard rate.isFinite, rate > 0, rate <= Double(UInt32.max),
              let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2),
              let silence = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(rate)) else {
            throw ProbeFailure("no player output format")
        }
        self.format = format
        let player = AVAudioPlayerNode()
        self.player = player
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        silence.frameLength = silence.frameCapacity
        for channel in 0..<2 {
            silence.floatChannelData![channel].initialize(repeating: 0, count: Int(silence.frameLength))
        }
        try engine.start()
        player.scheduleBuffer(silence, at: nil, options: .loops)
        player.play()
    }

    func tone(rendered: @escaping @Sendable () -> Void) throws {
        guard let player, let format, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(format.sampleRate * 0.2)) else {
            throw ProbeFailure("cannot render stimulus")
        }
        buffer.frameLength = buffer.frameCapacity
        let frames = Int(buffer.frameLength)
        let ramp = format.sampleRate * 0.01
        for i in 0..<frames {
            let gain = min(1, Double(min(i, frames - 1 - i)) / ramp)
            let value = Float(0.001 * gain * sin(2 * .pi * 1000 * Double(i) / format.sampleRate))
            buffer.floatChannelData![0][i] = value
            buffer.floatChannelData![1][i] = value
        }
        player.scheduleBuffer(buffer, at: nil, options: .interrupts, completionCallbackType: .dataPlayedBack) { _ in rendered() }
    }

    func stop() { player?.stop(); engine?.stop() }
}
