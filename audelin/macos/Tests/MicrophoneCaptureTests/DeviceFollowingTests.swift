import Testing
@testable import MicrophoneCapture

@Suite(.timeLimit(.minutes(1)))
struct DeviceFollowingTests {

    @Test func repeatedNotificationsKeepTheOriginalDeadline() async throws {
        let binding = FakeMicrophoneBinding()
        let capture = try await MicrophoneCapture(hardware: .init(binding: binding))
        defer { capture.stop() }
        binding.changeDefault(to: 2)
        await capture.synchronize()
        binding.advance(1)
        binding.changeDefault(to: 2)
        await capture.synchronize()
        binding.advance(0.49)
        await capture.synchronize()
        #expect(binding.state.withLock { $0.starts } == [1])
        binding.advance(0.01)
        await capture.synchronize()
        #expect(binding.state.withLock { $0.starts } == [1, 2])
        binding.send([[9]])
        capture.stop()
        #expect(try await drain(capture) == [
            AudioPiece(samples: Array(repeating: 0, count: 6), sampleRate: 4),
            AudioPiece(samples: [9], sampleRate: 4),
        ])
    }

    @Test func configurationPreservesAnAvailableInputWhileTheDefaultIsMissing() async throws {
        let binding = FakeMicrophoneBinding()
        let capture = try await MicrophoneCapture(hardware: .init(binding: binding))
        defer { capture.stop() }
        binding.changeDefault(to: 0)
        await capture.synchronize()
        binding.configure(input: 0)
        await capture.synchronize()
        #expect(binding.state.withLock { $0.starts } == [1, 1])
        binding.advance(1.375)
        binding.send([[7]])
        await capture.synchronize()
        binding.advance(0)
        let result = await readUntilFailure(capture)
        #expect(result.pieces == [
            AudioPiece(samples: Array(repeating: 0, count: 11), sampleRate: 8),
            AudioPiece(samples: [7], sampleRate: 8),
        ])
        #expect(result.error as? CaptureError == .noInput)
        #expect(binding.state.withLock { $0.starts } == [1, 1])
    }

    @Test(arguments: [UInt32(2), 3])
    func configurationUsesTheLatestDefaultWithoutANotification(input: UInt32) async throws {
        let binding = FakeMicrophoneBinding()
        let capture = try await MicrophoneCapture(hardware: .init(binding: binding))
        defer { capture.stop() }
        binding.send([[1, 2]])
        binding.state.withLock { $0.unavailableInputs = [1] }
        let rate = input == 2 ? 4.0 : 16.0
        binding.configure(input: input, rate: rate)
        await capture.synchronize()
        binding.send([[3, 4]])
        capture.stop()
        #expect(try await drain(capture) == [
            AudioPiece(samples: [1, 2], sampleRate: 8),
            AudioPiece(samples: [3, 4], sampleRate: rate),
        ])
        #expect(binding.state.withLock { $0.starts } == [1, input])
    }

    @Test func aRefusedRebuildCannotBeRevivedByPendingCallbacks() async throws {
        let binding = FakeMicrophoneBinding()
        let capture = try await MicrophoneCapture(hardware: .init(binding: binding))
        defer { capture.stop() }
        binding.send([[1, 2]])
        binding.changeDefault(to: 2)
        await capture.synchronize()
        let settle = try #require(binding.state.withLock { $0.timers.values.first?.1 })
        let configuration = try #require(binding.state.withLock { $0.changed })
        let defaultChanged = try #require(binding.state.withLock { $0.defaultChanged })
        binding.state.withLock { $0.refuseStart = true }
        configuration()
        let result = await readUntilFailure(capture)
        #expect(result.pieces == [AudioPiece(samples: [1, 2], sampleRate: 8)])
        #expect(result.error is Refusal)
        binding.state.withLock { $0.refuseStart = false }
        binding.advance(2)
        settle()
        configuration()
        defaultChanged(3)
        await capture.synchronize()
        #expect(binding.state.withLock { $0.starts } == [1, 1])
        #expect(binding.state.withLock { $0.receive == nil && $0.defaultChanged == nil && $0.timers.isEmpty })
    }
}
