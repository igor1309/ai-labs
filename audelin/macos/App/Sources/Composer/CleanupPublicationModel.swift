import CleanupPublication
import Foundation
import IMRxObservation

@MainActor final class CleanupPublicationModel {
    private let model = SyncModel(initialState: CleanupPublicationState(), reduce: CleanupPublicationReducer().reduce)
    private let feed = StateFeed<CleanupPublicationState>()
    private var doer: CleanupPublicationDoer!
    init(publications: any CleanupPublications) {
        doer = CleanupPublicationDoer(publications: publications, send: { [weak self] in self?.send($0) })
    }
    func send(_ event: CleanupPublicationEvent) {
        model.event(event)
        feed.publish(model.state)
        doer.act(on: model.state)
    }
    func complete(_ id: UUID, as publication: Publication) -> Bool {
        send(.completed(id, publication))
        return model.state.runs[id] == .publishing(publication)
    }
    func wait(_ id: UUID) async {
        for await state in feed.subscribe(from: model.state) where state.runs[id] == nil { return }
    }
    func shutdown() async {
        send(.shutdown)
        let completion = Task {
            for await state in feed.subscribe(from: model.state) where state.runs.isEmpty { return }
        }
        await completion.value
    }
}
