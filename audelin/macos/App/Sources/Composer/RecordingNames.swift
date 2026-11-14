import CallNames
import SpeakerNaming
import Synchronization

/// One recording's names as its CallNames machine last published them, for the transcript
/// writer and the after-call pass, and the way the pass's speaker turns reach the machine.
/// The writer saves what was published last; it never waits for the machine.
public final class RecordingNames: Sendable {

    private struct Delivery: Sendable { let deliver: @Sendable ([DiarizedTurn], [Row]) async -> Void }

    private let latest = Mutex(CallNamesState())
    private let delivery = Mutex<Delivery?>(nil)

    public init() {}

    /// The names last published.
    func snapshot() -> CallNamesState { latest.withLock { $0 } }

    func published(_ names: CallNamesState) { latest.withLock { $0 = names } }

    /// Connects the recording's CallNames, which takes the pass's speaker turns.
    func connect(diarized deliver: @escaping @Sendable ([DiarizedTurn], [Row]) async -> Void) {

        delivery.withLock { $0 = Delivery(deliver: deliver) }
    }

    func diarized(_ turns: [DiarizedTurn], rows: [Row]) async {

        await delivery.withLock { $0 }?.deliver(turns, rows)
    }
}
