import Observation
import Recordings
import Testing
@testable import Composer

@MainActor
struct MergeAvailabilityWiringTests {
    @Test func recordingsHearsTheCurrentValueAndEachChangeOnce() async throws {
        let source = IdleSource()
        let sent = SentEvents()
        let subscription = subscribeMergeAvailability({ source.recording && source.notes }, to: sent.append)
        defer { subscription.cancel() }
        try await waitUntil("the current value is sent") { sent.events == [.mergeAvailability(true)] }
        source.recording = false
        try await waitUntil("busy is sent") { sent.events.count == 2 }
        source.notes = false
        source.recording = true
        source.notes = true
        try await waitUntil("idle again is sent") { sent.events.count == 3 }
        #expect(sent.events == [.mergeAvailability(true), .mergeAvailability(false), .mergeAvailability(true)])
    }
}

@MainActor @Observable
private final class IdleSource {
    var recording = true
    var notes = true
}

@MainActor
private final class SentEvents {
    private(set) var events: [RecordingsEvent] = []
    func append(_ event: RecordingsEvent) { events.append(event) }
}
