import CallNames
import SpeakerNaming
import Synchronization

/// One recording's names as its CallNames machine last published them, for the transcript
/// writer and the after-call pass, and the way the pass's speaker turns reach the machine.
/// The writer saves what was published last; it never waits for the machine.
public final class RecordingNames: Sendable {

    private struct Delivery: Sendable {
        let diarized: @Sendable ([DiarizedTurn], [Row]) async -> Void
        let finalized: @Sendable () async -> Void
    }

    private let latest = Mutex(CallNamesState())
    private let delivery = Mutex<Delivery?>(nil)
    private let changes = StateFeed<CallNamesState>()

    public init() {}

    /// The names last published.
    func snapshot() -> CallNamesState { latest.withLock { $0 } }

    func published(_ names: CallNamesState) {
        latest.withLock { $0 = names }
        changes.publish(names)
    }

    /// Reading follows the published names until this call is released.
    @MainActor
    func states() -> AsyncStream<CallNamesState> { changes.subscribe(from: snapshot()) }

    @MainActor
    func finish() {
        delivery.withLock { $0 = nil }
        changes.finish()
    }

    /// Connects the recording's CallNames, which takes the pass's speaker turns.
    func connect(diarized: @escaping @Sendable ([DiarizedTurn], [Row]) async -> Void,
                 finalized: @escaping @Sendable () async -> Void) {

        delivery.withLock { $0 = Delivery(diarized: diarized, finalized: finalized) }
    }

    func diarized(_ turns: [DiarizedTurn], rows: [Row]) async {

        await delivery.withLock { $0 }?.diarized(turns, rows)
    }

    func finalizationEnded() async {
        await delivery.withLock { $0 }?.finalized()
    }
}
