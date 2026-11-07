import Foundation
import IMRxObservation
import Observation

struct FolderMoveState: Equatable, Sendable {
    enum Phase: Equatable, Sendable { case idle, confirming, moving, failed }
    var phase: Phase = .idle
    var destination: URL?
}
enum FolderMoveEvent: Sendable { case choose(URL), confirm, cancel, moved, failed }
enum FolderMoveEffect: Sendable { case move(URL) }
func reduceFolderMove(_ state: FolderMoveState, _ event: FolderMoveEvent) -> (FolderMoveState, FolderMoveEffect?) {
    var next = state
    switch event {
    case let .choose(url) where state.phase != .moving:
        next.destination = url; next.phase = .confirming
    case .confirm where state.phase == .confirming || state.phase == .failed:
        guard let destination = state.destination else { return (state, nil) }
        next.phase = .moving; return (next, .move(destination))
    case .cancel where state.phase != .moving: next = .init()
    case .moved where state.phase == .moving: next = .init()
    case .failed where state.phase == .moving: next.phase = .failed
    default: break
    }
    return (next, nil)
}
struct FolderMoveHandler {
    let reserve: @MainActor () async -> Bool
    let release: @MainActor () async -> Void
    let move: @MainActor (URL) async throws -> Void
    @MainActor func handle(_ effect: FolderMoveEffect) async -> FolderMoveEvent {
        guard await reserve() else { return .failed }
        do {
            switch effect { case let .move(url): try await move(url) }
            await release(); return .moved
        } catch { await release(); return .failed }
    }
}
@MainActor @Observable
final class AudelinFolderSettings {
    private let model: ObservableModel<FolderMoveState, FolderMoveEvent, FolderMoveEffect>
    init(handler: FolderMoveHandler) {
        model = ObservableModel(initialState: .init(), reduce: reduceFolderMove, handleEffect: { effect in
            AsyncStream { output in
                let task = Task { output.yield(await handler.handle(effect)); output.finish() }
                output.onTermination = { _ in task.cancel() }
            }
        })
    }
    var state: FolderMoveState { model.state }
    func send(_ event: FolderMoveEvent) { model.event(event) }
    func drain() async { for await state in Observations({ self.model.state }) where state.phase != .moving { return } }
}
