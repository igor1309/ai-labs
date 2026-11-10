import Foundation
import Synchronization

/// The live tier's names for the current recording, shared by the panel (which gives them)
/// and the transcript writer (which saves them as tentative). Participant IDs are handed out
/// in the order names first appear, so a row saved final never has its ID reassigned.
final class LiveNameBoard: Sendable {

    static let shared = LiveNameBoard()

    struct Names: Sendable {

        var rows: [Int: String] = [:]
        var ids: [String: String] = [:]
        var order: [String] = []
        /// What Zoom showed over the whole recording, kept past its end for the after-call pass.
        var roster: [String] = []
        var spoken: [(name: String, start: Double, end: Double?)] = []
        var through = 0.0
        var callTrack: URL?
        var confirmed = false
    }

    private let names = Mutex(Names())

    private struct Listener: Sendable { let deliver: @Sendable ([Int: String]) async -> Void }
    private let listener = Mutex<Listener?>(nil)

    /// The panel's reading model, told when the after-call pass confirms names.
    func listen(_ deliver: @escaping @Sendable ([Int: String]) async -> Void) {

        listener.withLock { $0 = Listener(deliver: deliver) }
    }

    func announce(_ confirmed: [Int: String]) async {

        await listener.withLock { $0 }?.deliver(confirmed)
    }

    func reset() { names.withLock { $0 = Names() } }

    func record(roster: [String], spoken: [(name: String, start: Double, end: Double?)], through: Double) {

        names.withLock { $0.roster = roster; $0.spoken = spoken; $0.through = through }
    }

    func callTrack(_ url: URL) { names.withLock { $0.callTrack = url } }

    /// Replaces live names with the after-call result; `confirmed` maps rows to names.
    func confirm(_ confirmed: [Int: String]) {

        names.withLock { names in
            names.rows = confirmed
            for name in confirmed.values.sorted() where names.ids[name] == nil {
                names.order.append(name)
                names.ids[name] = "z\(names.order.count)"
            }
            names.confirmed = true
        }
    }

    func give(_ given: [Int: String]) {

        names.withLock { names in
            for (row, name) in given.sorted(by: { $0.key < $1.key }) where names.rows[row] == nil {
                names.rows[row] = name
                if names.ids[name] == nil {
                    names.order.append(name)
                    names.ids[name] = "z\(names.order.count)"
                }
            }
        }
    }

    func snapshot() -> Names { names.withLock { $0 } }
}
