import Session

/// The caller cancels and joins this subscription when its Session ends.
public func subscribe(_ pieces: SessionPieces, to session: Session) -> Task<Void, Never> {

    subscribe(pieces, to: session, beforeForward: { _ in })
}

func subscribe(
    _ pieces: SessionPieces, to session: Session,
    beforeForward: @escaping @Sendable (SessionEvent) async -> Void
) -> Task<Void, Never> {

    let news = pieces.news.continuation
    // Enqueue before stop returns, without making the pieces retain their Session.
    pieces.transcriptFailures.connect(deliver: { [weak session] event in
        if let session { session.send(event) }
        else { news.yield(event) }
    })
    let events = pieces.events
    return Task {
        for await event in events {
            await beforeForward(event)
            guard !Task.isCancelled else { return }
            session.send(event)
        }
    }
}
