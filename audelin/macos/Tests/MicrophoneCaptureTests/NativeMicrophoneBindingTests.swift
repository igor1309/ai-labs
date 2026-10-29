import AVFoundation
import CoreAudio
import Testing
@testable import MicrophoneCapture

private let microphoneSkipReason: String? = {
    // A hosted CI runner reports a default input with access granted, yet
    // none of its captures ever ended (PR 1262); these run in the local test step.
    guard ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == nil else {
        return "A hosted CI runner has no microphone that delivers audio."
    }
    guard (try? NativeMicrophoneBinding.readDefaultInput()) != nil else {
        return "The Mac has no accessible default input device."
    }
    guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
        return "Microphone access is unavailable; tests do not request permission."
    }
    return nil
}()

@Suite(.serialized, .timeLimit(.minutes(1)), .disabled(
    if: microphoneSkipReason != nil,
    Comment(rawValue: microphoneSkipReason ?? "Default microphone available.")
))
struct NativeMicrophoneBindingTests {

    /// Contract test: AVAudioEngine reads the Mac's default input without voice processing.
    @Test func theDefaultInputDeliversLiveAudioWithoutVoiceProcessing() async throws {

        let binding = NativeMicrophoneBinding.system()
        let capture = try await MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        #expect(!binding.voiceProcessingEnabled)
        try await hearAndStop(capture)
    }

    /// Contract test: native engine resources permit a second microphone capture after stop.
    @Test func aRealCaptureCanFollowAStoppedCapture() async throws {

        let first = try await MicrophoneCapture()
        defer { first.stop() }
        try await hearAndStop(first)
        let second = try await MicrophoneCapture()
        defer { second.stop() }
        try await hearAndStop(second)
    }

    private func hearAndStop(_ capture: MicrophoneCapture) async throws {

        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                var heard = false
                for try await piece in capture.audio {
                    #expect(piece.sampleRate.isFinite && piece.sampleRate > 0)
                    #expect(!piece.samples.isEmpty)
                    #expect(piece.samples.allSatisfy { $0.isFinite })
                    heard = true
                    capture.stop()
                }
                #expect(heard)
            }
            group.addTask {
                try await Task.sleep(for: .seconds(30))
                capture.stop()
                throw MicrophoneSilent(input: defaultInputDescription())
            }
            defer { group.cancelAll() }
            try await group.next()
        }
    }
}

/// Names the default input, so a silent run says which device heard nothing:
/// AirPods as the input delivered no audio at all (LAB-680).
private struct MicrophoneSilent: Error, CustomStringConvertible {

    let input: String
    var description: String { "No audio within 30 s from the default input: \(input)" }
}

private func defaultInputDescription() -> String {

    guard let device = try? NativeMicrophoneBinding.readDefaultInput() else { return "unknown" }
    var nameAddress = AudioObjectPropertyAddress(
        mSelector: kAudioObjectPropertyName,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var name: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    let named = AudioObjectGetPropertyData(device, &nameAddress, 0, nil, &size, &name) == noErr
    var transportAddress = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyTransportType,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var transport: UInt32 = 0
    size = UInt32(MemoryLayout<UInt32>.size)
    _ = AudioObjectGetPropertyData(device, &transportAddress, 0, nil, &size, &transport)
    let kind = switch transport {
    case kAudioDeviceTransportTypeBuiltIn: "built-in"
    case kAudioDeviceTransportTypeBluetooth, kAudioDeviceTransportTypeBluetoothLE: "Bluetooth"
    case kAudioDeviceTransportTypeUSB: "USB"
    case kAudioDeviceTransportTypeVirtual: "virtual"
    default: "transport \(transport)"
    }
    let label = named ? (name?.takeRetainedValue() as String? ?? "device \(device)") : "device \(device)"
    return "\(label) (\(kind))"
}
