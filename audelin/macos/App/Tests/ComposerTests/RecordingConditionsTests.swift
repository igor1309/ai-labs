import BlockingTestWork
import Composer
import Foundation
import Recording
import Synchronization
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RecordingConditionsTests {
    @Test(arguments: [nil, Int64(0), 29_999_999_999, 30_000_000_000, 30_000_000_001])
    func roomRequiresAtLeastThirtyDecimalGigabytes(bytes: Int64?) async throws {
        let reads = Values<URL>()
        try await withComposition(configure: { boundary in
            boundary.capacity = FixtureCapacity(read: { url in reads.append(url); return bytes })
        }) { rig in
            let state = try await rig.state { $0.phase == .idle }
            #expect(state.missing.contains(.room) == (bytes == nil || bytes! < 30_000_000_000))
            #expect(state.missing.subtracting([.room]).isEmpty)
            #expect(!reads.all.isEmpty && reads.all.allSatisfy { $0 == rig.root })
        }
    }

    @Test func missingFolderHasNoRoomWithoutReadingCapacity() async throws {
        let reads = Values<URL>()
        try await withComposition(preferences: { .init(automaticRecording: false, callsFolder: $0.appendingPathComponent("missing")) },
            configure: { boundary in boundary.capacity = FixtureCapacity(read: { reads.append($0); return Int64.max }) }) { rig in
            let state = try await rig.state { $0.phase == .idle }
            #expect(state.missing == [.callsFolder, .room])
            #expect(reads.all.isEmpty)
            await rig.menu.perform(.start)
            #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
        }
    }

    @Test func refreshSendsChangesOnceAndRestoresAvailableConditions() async throws {
        let permission = Mutex(true), room = Mutex(true)
        let binding = CallBinding(fails: false, input: false)
        let deadlines = Values<@Sendable () -> Void>(), scheduled = Signal()
        defer { scheduled.end() }
        try await withComposition(configure: { boundary in
            boundary.processes = FixtureProcesses(binding: binding)
            let time = boundary.time
            boundary.time = ComposerTime(now: time.now, timeZone: time.timeZone,
                monotonicNow: time.monotonicNow, sleep: time.sleep, after: { _, fire in
                    deadlines.append(fire); scheduled.send(); return BoundaryCancellation {}
                }, ticks: time.ticks)
            boundary.microphonePermission = FixturePermission(status: { permission.withLock { $0 } }, prompt: {})
            boundary.capacity = FixtureCapacity(read: { _ in room.withLock { $0 } ? Int64.max : 0 })
        }) { rig in
            await rig.log.wait { $0.category == .conditions && $0.message == "condition=room available=true" }
            permission.withLock { $0 = false }; room.withLock { $0 = false }
            binding.setInput(true)
            _ = try await rig.state { $0.callOn && $0.missing == [.microphoneAccess, .room] }
            let blocked = rig.log.entries.all.filter { $0.category == .conditions && $0.message.hasSuffix("available=false") }
            #expect(blocked.map(\.message) == ["condition=microphoneAccess available=false", "condition=room available=false"])
            #expect(rig.microphone.starts.all.isEmpty)
            binding.setInput(false)
            await scheduled.next()
            for fire in deadlines.all { fire() }
            _ = try await rig.state { !$0.callOn }
            permission.withLock { $0 = true }; room.withLock { $0 = true }
            binding.setInput(true)
            _ = try await rig.state { $0.callOn && $0.missing.isEmpty }
            let logs = rig.log.entries.all.filter { $0.category == .conditions }
            for condition in ["microphoneAccess", "room"] {
                #expect(logs.filter { $0.message.hasPrefix("condition=\(condition) ") }.map(\.message) == [
                    "condition=\(condition) available=true", "condition=\(condition) available=false", "condition=\(condition) available=true",
                ])
            }
            for condition in ["callAudioAccess", "callsFolder"] {
                #expect(logs.filter { $0.message.hasPrefix("condition=\(condition) ") }.map(\.message) == ["condition=\(condition) available=true"])
            }
        }
    }
}
