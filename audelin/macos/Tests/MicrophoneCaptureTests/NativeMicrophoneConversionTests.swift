import AVFAudio
import Testing
@testable import MicrophoneCapture

@Suite(.timeLimit(.minutes(1)))
struct NativeMicrophoneConversionTests {

    @Test(arguments: [false, true])
    func nativeChannelLayoutsProduceTheExactMonoMean(interleaved: Bool) async throws {

        let format = try #require(AVAudioFormat(
            commonFormat: .pcmFormatFloat32, sampleRate: 8, channels: 2, interleaved: interleaved
        ))
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4))
        buffer.frameLength = 2
        let buffers = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
        if interleaved {
            let data = try #require(buffers[0].mData).assumingMemoryBound(to: Float.self)
            for (index, sample): (Int, Float) in [0, 2, 0, 4].enumerated() { data[index] = sample }
        } else {
            let first = try #require(buffers[0].mData).assumingMemoryBound(to: Float.self)
            let second = try #require(buffers[1].mData).assumingMemoryBound(to: Float.self)
            first[0] = 0
            first[1] = 0
            second[0] = 2
            second[1] = 4
        }
        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        binding.send(try NativeMicrophoneBinding.channels(from: buffer))
        capture.stop()
        #expect(try await drain(capture) == [AudioPiece(samples: [1, 2], sampleRate: 8)])
    }
}
