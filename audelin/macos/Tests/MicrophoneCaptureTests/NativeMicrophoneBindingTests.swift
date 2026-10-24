import AVFoundation
import Testing
@testable import MicrophoneCapture

private let microphoneSkipReason: String? = {
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

        let binding = NativeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        #expect(!binding.voiceProcessingEnabled)
        try await hearAndStop(capture)
    }

    /// Contract test: native engine resources permit a second microphone capture after stop.
    @Test func aRealCaptureCanFollowAStoppedCapture() async throws {

        let first = try MicrophoneCapture()
        defer { first.stop() }
        try await hearAndStop(first)
        let second = try MicrophoneCapture()
        defer { second.stop() }
        try await hearAndStop(second)
    }

    private func hearAndStop(_ capture: MicrophoneCapture) async throws {

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
}
