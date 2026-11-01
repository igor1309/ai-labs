import Foundation

@MainActor public protocol FileObservation: AnyObject { func cancel() }
@MainActor public protocol FileChanges {
    func watch(path: String, onChange: @escaping @MainActor @Sendable () -> Void) -> any FileObservation
}

@MainActor public final class SettingsLoader {
    public let updates: AsyncStream<SettingsResult>
    private let continuation: AsyncStream<SettingsResult>.Continuation
    private let path: String
    private var observation: (any FileObservation)?

    public init(path: String, changes: any FileChanges) {
        self.path = path
        (updates, continuation) = AsyncStream.makeStream()
        observation = changes.watch(path: path) { [weak self] in
            guard let self else { return }
            continuation.yield(current())
        }
    }

    public func current() -> SettingsResult {
        do {
            let bytes = try Data(contentsOf: URL(filePath: path))
            return .valid(try JSONDecoder().decode(Settings.self, from: bytes))
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            return .unavailable(kind: .missing)
        } catch {
            return .unavailable(kind: .invalid)
        }
    }

    isolated deinit {
        observation?.cancel()
        continuation.finish()
    }
}
