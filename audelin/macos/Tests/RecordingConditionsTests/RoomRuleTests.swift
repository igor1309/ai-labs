import RecordingConditions
import Testing

struct RoomRuleTests {

    @Test(arguments: [
        (nil, false), (Int64(0), false), (29_999_999_999, false), (30_000_000_000, true), (30_000_000_001, true),
    ] as [(Int64?, Bool)])
    func roomRequiresAtLeastThirtyDecimalGigabytes(bytes: Int64?, room: Bool) {
        #expect(hasRoom(.init(folderExists: true, writable: true, availableCapacity: bytes)) == room)
    }

    @Test func missingFolderHasNoRoom() {
        #expect(!hasRoom(.init(folderExists: false, writable: false, availableCapacity: 40_000_000_000)))
    }
}
