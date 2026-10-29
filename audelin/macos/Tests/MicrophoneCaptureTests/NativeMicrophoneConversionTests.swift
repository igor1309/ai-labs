import AVFAudio
import Darwin
import Synchronization
import Testing
@testable import MicrophoneCapture

@Suite(.timeLimit(.minutes(1)))
struct NativeMicrophoneConversionTests {

    @Test(arguments: [false, true], [1, 2, 3, 6])
    func nativeChannelLayoutsProduceTheExactMonoMean(interleaved: Bool, channelCount: Int) async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try await MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        for soundingChannel in 0..<channelCount {
            var channels = Array(repeating: [Float(0), 0], count: channelCount)
            channels[soundingChannel] = [Float(channelCount), -Float(channelCount)]
            let buffer = try makeBuffer(interleaved: interleaved, rate: 8, channels: channels)
            binding.send(try NativeMicrophoneBinding.channels(from: buffer))
        }
        capture.stop()
        #expect(try await drain(capture) == Array(
            repeating: AudioPiece(samples: [1, -1], sampleRate: 8), count: channelCount
        ))
    }

    @Test(arguments: [false, true], [44_100.0, 48_000.0])
    func nativeDeliveryPreservesSamplesRateAndFirstSampleTime(interleaved: Bool, rate: Double) throws {

        let buffer = try makeBuffer(interleaved: interleaved, rate: rate)
        for hasHostTime in [false, true] {
            let delivery = Mutex<Result<InputBuffer, any Error>?>(nil)
            let tap = NativeTap(
                receive: { result in delivery.withLock { $0 = result } },
                readClock: { MicrophoneClockReading(host: 10.5, continuous: 7_200.5) }
            )
            let time = hasHostTime
                ? AVAudioTime(hostTime: AVAudioTime.hostTime(forSeconds: 10))
                : AVAudioTime(sampleTime: 0, atRate: rate)
            tap.deliver(buffer, time: time)
            tap.close()
            let input = try #require(delivery.withLock { $0 }).get()
            #expect(input.channels == [[0, 0], [2, 4]])
            #expect(input.sampleRate == rate)
            let expectedTime = hasHostTime ? 7_200 : 7_200.5 - 2 / rate
            #expect(abs(input.time - expectedTime) < 1e-9)
        }
    }

    /// Contract test: the native clock adapter reads the kernel's host and continuous clocks.
    @Test func nativeClockReadingContainsBothMonotonicClocks() throws {

        let hostBefore = AVAudioTime.seconds(forHostTime: mach_absolute_time())
        let continuousBefore = AVAudioTime.seconds(forHostTime: mach_continuous_time())
        let clock = try NativeMicrophoneBinding.readClock()
        let hostAfter = AVAudioTime.seconds(forHostTime: mach_absolute_time())
        let continuousAfter = AVAudioTime.seconds(forHostTime: mach_continuous_time())
        #expect((hostBefore...hostAfter).contains(clock.host))
        #expect((continuousBefore...continuousAfter).contains(clock.continuous))
        #expect(clock.continuous >= clock.host)
    }

    @Test func aDelayedClockReadingKeepsContiguousBuffersContiguous() async throws {

        let binding = FakeMicrophoneBinding()
        binding.state.withLock { $0.time = 7_200 }
        let capture = try await MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        let clock = Mutex((host: 10.0, reads: 0))
        let tap = NativeTap(
            receive: { result in binding.state.withLock { $0.receive }?(result) },
            readClock: {
                clock.withLock {
                    $0.host += 0.1
                    $0.reads += 1
                    return MicrophoneClockReading(host: $0.host, continuous: $0.host + 7_190)
                }
            }
        )
        for (index, samples) in [[Float(1), 2], [3, 4]].enumerated() {
            let host = 10 + Double(index) / 4
            clock.withLock { $0.host = host }
            let buffer = try makeBuffer(interleaved: false, rate: 8, channels: [samples])
            tap.deliver(buffer, time: AVAudioTime(hostTime: AVAudioTime.hostTime(forSeconds: host)))
        }
        tap.close()
        capture.stop()
        #expect(try await drain(capture) == [
            AudioPiece(samples: [1, 2], sampleRate: 8),
            AudioPiece(samples: [3, 4], sampleRate: 8),
        ])
        #expect(clock.withLock { $0.reads } == 2)
    }

    private func makeBuffer(
        interleaved: Bool, rate: Double, channels: [[Float]] = [[0, 0], [2, 4]]
    ) throws -> AVAudioPCMBuffer {

        let layout = try #require(AVAudioChannelLayout(
            layoutTag: kAudioChannelLayoutTag_DiscreteInOrder | UInt32(channels.count)
        ))
        let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32, sampleRate: rate,
            interleaved: interleaved, channelLayout: layout
        )
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4))
        buffer.frameLength = AVAudioFrameCount(channels[0].count)
        let buffers = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
        for (channel, samples) in channels.enumerated() {
            let data = try #require(buffers[interleaved ? 0 : channel].mData).assumingMemoryBound(to: Float.self)
            for (frame, sample) in samples.enumerated() {
                data[interleaved ? frame * channels.count + channel : frame] = sample
            }
        }
        return buffer
    }
}
