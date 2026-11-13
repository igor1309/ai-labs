import CallObservation

/// Turns the extension's messages into call-observation events, the input the
/// Zoom adapter also feeds. Each connection is its own epoch, since a
/// restarted extension numbers its messages afresh. A participant renamed in
/// the page arrives as a new tile ID, so their speaking before and after the
/// rename stays apart. The end of a call is an empty roster; the extension has
/// already stopped everyone speaking.
public enum BrowserObservation {
    /// Nil when the browser time cannot be placed on the call clock yet.
    public static func event(
        _ message: BrowserMessage,
        connection: Int,
        callTime: (Double) -> Double?
    ) -> Event? {
        let (at, kind): (Double, Event.Kind) = switch message.event {
        case .roster(let at, let participants):
            (at, .roster(participants.map { Member(id: $0.id, name: $0.name, isLocal: $0.isSelf) }))
        case .speakingStarted(let at, let id): (at, .speaking(memberID: id, true))
        case .speakingStopped(let at, let id): (at, .speaking(memberID: id, false))
        case .callEnded(let at): (at, .roster([]))
        }
        guard let time = callTime(at) else { return nil }
        return Event(epoch: connection, sequence: message.sequence, time: time, kind: kind)
    }
}
