import Testing
@testable import MicrophoneCapture

@Suite(.timeLimit(.minutes(1)))
struct MicrophoneCaptureTests {

    @Test(arguments: [0.0, 7_200.0])
    func nativeBufferTimesIncludeSleepAndPreserveTheFirstSampleTime(sleep: Double) {

        #expect(NativeMicrophoneBinding.timestamp(hostTime: 10, hostNow: 10.25, clockNow: 10.25 + sleep, duration: 0.25) == 10 + sleep)
        #expect(NativeMicrophoneBinding.timestamp(hostTime: nil, hostNow: 10.25, clockNow: 10.25 + sleep, duration: 0.25) == 10 + sleep)
    }

    @Test func allChannelsAreMixedAndReadLiveAtTheDeviceRate() async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        var audio = capture.audio.makeAsyncIterator()
        for samples: [Float] in [[2, 4], [6, 8], [10, 12]] {
            binding.send([[0, 0], samples])
            #expect(try await audio.next() == AudioPiece(samples: samples.map { $0 / 2 }, sampleRate: 8))
            #expect(binding.state.withLock { $0.receive != nil })
        }
        capture.stop()
        #expect(try await audio.next() == nil)
    }

    @Test(arguments: [1, 3, 6])
    func theMeanIncludesEveryChannel(channelCount: Int) async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        binding.send((1...channelCount).map { [Float($0), -Float($0)] })
        capture.stop()
        let mean = Float(channelCount + 1) / 2
        #expect(try await drain(capture) == [AudioPiece(samples: [mean, -mean], sampleRate: 8)])
    }

    @Test func aHeldDefaultInputRebuildsOnlyAfterSettling() async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        binding.send([[1, 2]])
        binding.changeDefault(to: 2)
        await capture.synchronize()
        #expect(binding.state.withLock { $0.timers.values.map(\.0) } == [1.75])
        for first in stride(from: 3, through: 11, by: 2) {
            binding.send([[Float(first), Float(first + 1)]])
        }
        binding.advance(0)
        await capture.synchronize()
        #expect(binding.state.withLock { $0.starts } == [1])
        binding.send([[13, 14]])
        binding.state.withLock { $0.rate = 4 }
        binding.advance(0)
        await capture.synchronize()
        #expect(binding.state.withLock { $0.starts } == [1, 2])
        binding.advance(2)
        binding.send([[8]])
        capture.stop()
        let pieces = try await drain(capture)
        let earlier = stride(from: 1, through: 13, by: 2).map {
            AudioPiece(samples: [Float($0), Float($0 + 1)], sampleRate: 8)
        }
        #expect(pieces == earlier + [
            AudioPiece(samples: Array(repeating: 0, count: 8), sampleRate: 4),
            AudioPiece(samples: [8], sampleRate: 4),
        ])
    }

    @Test(arguments: [2.0, 600.0])
    func aConfigurationGapIsPaddedWholeAtTheNewRate(gap: Double) async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        binding.send([[1, 2]])
        let rate = gap == 2 ? 24_000.0 : 4.0
        binding.configure(rate: rate)
        await capture.synchronize()
        binding.advance(gap)
        binding.send([[9, 10]])
        capture.stop()
        let pieces = try await drain(capture)
        #expect(pieces.first == AudioPiece(samples: [1, 2], sampleRate: 8))
        #expect(pieces.last == AudioPiece(samples: [9, 10], sampleRate: rate))
        let padding = pieces.dropFirst().dropLast()
        #expect(padding.allSatisfy { $0.sampleRate == rate })
        #expect(padding.flatMap(\.samples) == Array(repeating: Float(0), count: Int(gap * rate)))
        #expect(Double(padding.flatMap(\.samples).count) / rate == gap)
    }

    @Test func aGapOverTenMinutesFailsWithoutPaddingAfterEarlierAudio() async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        binding.send([[1, 2]])
        binding.send([[3, 4]])
        binding.configure()
        await capture.synchronize()
        binding.advance(600.5)
        binding.send([[9, 10]])
        let result = await readUntilFailure(capture)
        #expect(result.pieces == [AudioPiece(samples: [1, 2], sampleRate: 8), AudioPiece(samples: [3, 4], sampleRate: 8)])
        #expect(result.error as? CaptureError == .gapTooLong)
        #expect(binding.state.withLock { $0.receive == nil && $0.defaultChanged == nil })
    }

    @Test(arguments: [false, true])
    func aRefusedStartCleansEveryInstalledResource(refuseWatch: Bool) throws {

        let binding = FakeMicrophoneBinding()
        binding.state.withLock {
            $0.refuseWatch = refuseWatch
            $0.refuseStart = !refuseWatch
        }
        #expect(throws: Refusal.self) { try MicrophoneCapture(binding: binding) }
        #expect(binding.state.withLock { $0.receive == nil && $0.changed == nil && $0.defaultChanged == nil })
    }

    @Test(arguments: [false, true])
    func aRefusedRebuildFailsAfterEveryEarlierPiece(defaultChange: Bool) async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        for value: Float in [1, 2, 3] { binding.send([[value]]) }
        binding.state.withLock { $0.refuseStart = true }
        if defaultChange {
            binding.changeDefault(to: 2)
            await capture.synchronize()
            binding.advance(1.5)
        } else {
            binding.configure()
        }
        let result = await readUntilFailure(capture)
        #expect(result.pieces == [1, 2, 3].map { AudioPiece(samples: [Float($0)], sampleRate: 8) })
        #expect(result.error is Refusal)
        #expect(binding.state.withLock { $0.receive == nil && $0.defaultChanged == nil })
    }

    @Test func stoppingReadsABufferDeliveredDuringStopAndIsIdempotent() async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        binding.send([[1]])
        binding.state.withLock { $0.onStop = { binding.send([[2]]) } }
        capture.stop()
        capture.stop()
        #expect(try await drain(capture) == [1, 2].map { AudioPiece(samples: [Float($0)], sampleRate: 8) })
        #expect(binding.state.withLock { $0.stops } == 1)
        #expect(binding.state.withLock { $0.receive == nil && $0.changed == nil && $0.defaultChanged == nil })
    }

    @Test func anotherCaptureCanFollowAStoppedOne() async throws {

        let binding = FakeMicrophoneBinding()
        let first = try MicrophoneCapture(binding: binding)
        first.stop()
        #expect(try await drain(first).isEmpty)
        let second = try MicrophoneCapture(binding: binding)
        defer { second.stop() }
        binding.send([[7, 8]])
        var audio = second.audio.makeAsyncIterator()
        #expect(try await audio.next() == AudioPiece(samples: [7, 8], sampleRate: 8))
        second.stop()
        #expect(try await audio.next() == nil)
        #expect(binding.state.withLock { $0.starts } == [1, 1])
    }

    @Test func stoppingBeforeAnyBufferEndsCleanly() async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        capture.stop()
        #expect(try await drain(capture).isEmpty)
    }

    @Test func aRevertedDefaultInputKeepsTheWholeRampWithoutPadding() async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        binding.send([[1, 2]])
        binding.changeDefault(to: 2)
        await capture.synchronize()
        for first in stride(from: 3, through: 9, by: 2) {
            binding.send([[Float(first), Float(first + 1)]])
        }
        binding.changeDefault(to: 1)
        await capture.synchronize()
        for first in stride(from: 11, through: 19, by: 2) {
            binding.send([[Float(first), Float(first + 1)]])
        }
        binding.advance(0)
        await capture.synchronize()
        capture.stop()
        #expect(try await drain(capture).flatMap(\.samples) == (1...20).map { Float($0) })
        #expect(binding.state.withLock { $0.starts } == [1])
        #expect(binding.state.withLock { $0.timers.isEmpty })
    }

    @Test func aDifferentCandidateMustSettleForItsOwnFullInterval() async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        binding.changeDefault(to: 2)
        await capture.synchronize()
        binding.advance(1)
        binding.changeDefault(to: 3)
        await capture.synchronize()
        binding.advance(0.5)
        await capture.synchronize()
        #expect(binding.state.withLock { $0.starts } == [1])
        binding.advance(0.75)
        binding.changeDefault(to: 3)
        await capture.synchronize()
        binding.advance(0.25)
        await capture.synchronize()
        #expect(binding.state.withLock { $0.starts } == [1, 3])
        binding.send([[7]])
        capture.stop()
        #expect(try await drain(capture).last == AudioPiece(samples: [7], sampleRate: 8))
    }

    @Test func aCancelledSettleCallbackCannotRebuildAfterReversionOrStop() async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        binding.changeDefault(to: 2)
        await capture.synchronize()
        let callback = try #require(binding.state.withLock { $0.timers.values.first?.1 })
        binding.changeDefault(to: 1)
        await capture.synchronize()
        callback()
        await capture.synchronize()
        #expect(binding.state.withLock { $0.starts } == [1])
        capture.stop()
        #expect(try await drain(capture).isEmpty)
        callback()
        await capture.synchronize()
        #expect(binding.state.withLock { $0.starts } == [1])
    }

    @Test func anOldEngineNotificationCannotRebuildItsReplacement() async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        defer { capture.stop() }
        let oldConfiguration = try #require(binding.state.withLock { $0.changed })
        binding.configure()
        await capture.synchronize()
        oldConfiguration()
        await capture.synchronize()
        #expect(binding.state.withLock { $0.starts } == [1, 2])
    }

    @Test func cancellingAReaderReleasesTheTapAndPendingTimer() async throws {

        let binding = FakeMicrophoneBinding()
        let capture = try MicrophoneCapture(binding: binding)
        binding.changeDefault(to: 2)
        await capture.synchronize()
        let reader = Task { try await drain(capture) }
        reader.cancel()
        _ = try await reader.value
        await capture.synchronize()
        #expect(binding.state.withLock { $0.receive == nil && $0.defaultChanged == nil && $0.timers.isEmpty })
    }

    @Test func releasingTheCaptureFinishesItsAudioAndResources() async throws {

        let binding = FakeMicrophoneBinding()
        var capture: MicrophoneCapture? = try MicrophoneCapture(binding: binding)
        let audio = try #require(capture?.audio)
        binding.send([[1, 2]])
        capture = nil
        var pieces: [AudioPiece] = []
        for try await piece in audio { pieces.append(piece) }
        #expect(pieces == [AudioPiece(samples: [1, 2], sampleRate: 8)])
        #expect(binding.state.withLock { $0.receive == nil && $0.defaultChanged == nil })
    }
}

func drain(_ capture: MicrophoneCapture) async throws -> [AudioPiece] {

    var pieces: [AudioPiece] = []
    for try await piece in capture.audio { pieces.append(piece) }
    return pieces
}

func readUntilFailure(_ capture: MicrophoneCapture) async -> (pieces: [AudioPiece], error: (any Error)?) {

    var pieces: [AudioPiece] = []
    do {
        for try await piece in capture.audio { pieces.append(piece) }
        return (pieces, nil)
    } catch { return (pieces, error) }
}
