import Foundation

public enum Publication: Equatable, Sendable { case cleaned, raw }

public struct CleanupPublicationState: Equatable, Sendable {
    public enum Phase: Equatable, Sendable { case working, publishing(Publication) }
    public var stopping: Bool
    public var runs: [UUID: Phase]
    public init(stopping: Bool = false, runs: [UUID: Phase] = [:]) {
        self.stopping = stopping; self.runs = runs
    }
}

public enum CleanupPublicationEvent: Equatable, Sendable {
    case started(UUID), completed(UUID, Publication), published(UUID), shutdown
}

public struct CleanupPublicationReducer {
    public init() {}
    public func reduce(_ state: CleanupPublicationState, _ event: CleanupPublicationEvent) -> CleanupPublicationState {
        var next = state
        switch event {
        case let .started(id) where state.runs[id] == nil:
            next.runs[id] = state.stopping ? .publishing(.raw) : .working
        case let .completed(id, publication) where state.runs[id] == .working:
            next.runs[id] = .publishing(publication)
        case let .published(id): next.runs[id] = nil
        case .shutdown:
            next.stopping = true
            for (id, phase) in state.runs where phase == .working { next.runs[id] = .publishing(.raw) }
        default: break
        }
        return next
    }
}

@MainActor public protocol CleanupPublications {
    func cancel(_ id: UUID)
    func publish(_ id: UUID, as publication: Publication) async
}

/// A publication already under way owns its handoff, even when shutdown arrives.
@MainActor public final class CleanupPublicationDoer {
    private let publications: any CleanupPublications
    private let send: (CleanupPublicationEvent) -> Void
    private var cancelled: Set<UUID> = []
    private var started: Set<UUID> = []
    public init(publications: any CleanupPublications, send: @escaping (CleanupPublicationEvent) -> Void) {
        self.publications = publications; self.send = send
    }
    public func act(on state: CleanupPublicationState) {
        for (id, phase) in state.runs {
            if state.stopping, cancelled.insert(id).inserted { publications.cancel(id) }
            if case let .publishing(publication) = phase, started.insert(id).inserted {
                Task {
                    await publications.publish(id, as: publication)
                    send(.published(id))
                }
            }
        }
    }
}
