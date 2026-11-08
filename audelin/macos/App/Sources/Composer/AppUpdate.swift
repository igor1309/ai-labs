import AppUpdate
import AppUpdateInstallation
import Foundation
import IMRxObservation
import Recording

public struct InstalledUpdates: Sendable {
    public let running: String
    public let watch: @Sendable () async -> AsyncStream<Void>
    public let read: @Sendable () async -> String?
    public let relaunch: @Sendable () async throws -> Void

    public init(running: String, watch: @escaping @Sendable () async -> AsyncStream<Void>,
                read: @escaping @Sendable () async -> String?, relaunch: @escaping @Sendable () async throws -> Void) {
        self.running = running
        self.watch = watch
        self.read = read
        self.relaunch = relaunch
    }
}

public func runningBuildID(in bundle: Bundle) -> String {
    guard let id = bundle.object(forInfoDictionaryKey: "AudelinBuildID") as? String, !id.isEmpty else { return "unknown" }
    return id
}

public func installedUpdates(running: String, pid: Int32,
                             installedBundle: URL = URL(filePath: "/Applications/Audelin.app")) -> InstalledUpdates {
    let installed = Installation(bundle: installedBundle, pid: pid)
    return InstalledUpdates(running: running, watch: { await installed.watch() },
                            read: { await installed.readBuildID() }, relaunch: { try await installed.relaunch() })
}

@MainActor
final class AudelinAppUpdate {
    private let model: ObservableModel<AppUpdate.State, AppUpdate.Event, AppUpdate.Effect>
    private let handler: AppUpdate.EffectHandler

    init(ports: InstalledUpdates, sleep: @escaping @Sendable (Duration) async throws -> Void,
         terminate: @escaping @Sendable () async -> Void) {
        let reducer = AppUpdate.Reducer(disabledReason: "Доступно после звонка")
        let handler = AppUpdate.EffectHandler(watch: ports.watch,
            read: { await ports.read().map(AppUpdate.Read.build) ?? .unreadable },
            relaunch: ports.relaunch, terminate: terminate, sleep: sleep)
        self.handler = handler
        model = ObservableModel(initialState: .init(running: ports.running), reduce: reducer.reduce,
                                handleEffect: handler.handle)
    }

    var state: AppUpdate.State { model.state }
    func send(_ event: AppUpdate.Event) { model.event(event) }
    deinit { handler.end() }
}

func updateCall(_ phase: RecordingState.Phase) -> AppUpdate.Call {
    switch phase {
    case .idle: .idle
    case .beginning, .recording: .inCall
    case .ending: .finishingSave
    }
}
