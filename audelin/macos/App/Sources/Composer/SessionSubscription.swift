import Session
import Synchronization

/// The caller cancels and joins this subscription when its Session ends.
func subscribe(_ pieces: SessionPieces, to session: SessionInputs) -> Task<Void, Never> {

    let news = pieces.news.continuation
    // Enqueue before stop returns; once forwarding ends the pieces no longer retain their Session.
    let delivery = Mutex<SessionInputs?>(session)
    pieces.transcriptFailures.connect(deliver: { event in
        if let session = delivery.withLock({ $0 }) { await session.send(event) }
        else { news.yield(event) }
    })
    let events = pieces.events
    return Task {
        defer { delivery.withLock { $0 = nil } }
        for await event in events {
            guard !Task.isCancelled else { return }
            await session.send(event)
        }
    }
}
