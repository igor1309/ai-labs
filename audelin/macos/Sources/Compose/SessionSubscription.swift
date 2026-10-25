import Session

/// The caller cancels and joins this subscription when its Session ends.
public func subscribe(_ pieces: SessionPieces, to session: Session) -> Task<Void, Never> {

    let events = pieces.events
    return Task {
        for await event in events {
            guard !Task.isCancelled else { return }
            session.send(event)
        }
    }
}
