import AVFAudio
import Synchronization
import Testing
@testable import MicrophoneCapture

@Suite(.timeLimit(.minutes(1)))
struct NativeMicrophoneConversionTests {

    @Test(arguments: [false, true])
    func nativeChannelLayoutsProduceTheExactMonoMean(interleaved: Bool) async throws {

        let buffer = try makeBuffer(interleaved: interleaved, rate: 8)
        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        binding.send(try NativeMicrophoneBinding.channels(from: buffer))
        capture.stop()
        #expect(try await drain(capture) == [AudioPiece(samples: [1, 2], sampleRate: 8)])
    }

    @Test(arguments: [false, true], [44_100.0, 48_000.0])
    func nativeDeliveryPreservesSamplesRateAndFirstSampleTime(interleaved: Bool, rate: Double) throws {

        let buffer = try makeBuffer(interleaved: interleaved, rate: rate)
        for hasHostTime in [false, true] {
            let delivery = Mutex<Result<InputBuffer, any Error>?>(nil)
            let tap = NativeTap { result in delivery.withLock { $0 = result } }
            let time = hasHostTime
                ? AVAudioTime(hostTime: AVAudioTime.hostTime(forSeconds: 10))
                : AVAudioTime(sampleTime: 0, atRate: rate)
            tap.deliver(buffer, time: time, hostNow: 10.5, clockNow: 7_200.5)
            tap.close()
            let input = try #require(delivery.withLock { $0 }).get()
            #expect(input.channels == [[0, 0], [2, 4]])
            #expect(input.sampleRate == rate)
            let expectedTime = hasHostTime ? 7_200 : 7_200.5 - 2 / rate
            #expect(abs(input.time - expectedTime) < 1e-9)
        }
    }

    private func makeBuffer(interleaved: Bool, rate: Double) throws -> AVAudioPCMBuffer {

        let format = try #require(AVAudioFormat(
            commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 2, interleaved: interleaved
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
        return buffer
    }
}
