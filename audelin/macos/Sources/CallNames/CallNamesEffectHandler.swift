/// One source of call-app evidence for a recording: Zoom's indicator or the browser extension.
public protocol CallAppObserver: Sendable {
    /// What the source observes, as CallNames events, until it is stopped or cannot observe.
    func observe() -> AsyncStream<CallNamesUpdate>
    /// Closes the source; its stream finishes.
    func stop() async
}

/// The concrete sources for one watch. Identity keeps two watches distinct
/// even when they use the same kinds of source.
public final class CallAppWatch: Equatable, Sendable {
    let sources: [any CallAppObserver]

    public init(sources: [any CallAppObserver]) { self.sources = sources }

    public static func == (lhs: CallAppWatch, rhs: CallAppWatch) -> Bool { lhs === rhs }
}

/// Hands each effect to its watch and delivers what its sources report.
public struct CallNamesEffectHandler: Sendable {

    public init() {}

    public func handle(_ effect: CallNamesEffect) -> AsyncStream<CallNamesEvent> {
        switch effect {
        case let .observe(id, watch):
            // Open the sources before a later stop effect can try to close them.
            let streams = watch.sources.map { $0.observe() }
            return AsyncStream { output in
                let task = Task {
                    await withTaskGroup(of: Void.self) { group in
                        for stream in streams {
                            group.addTask { for await event in stream { output.yield(.update(id, event)) } }
                        }
                    }
                    output.yield(.observationReportsEnded(id))
                    output.finish()
                }
                output.onTermination = { _ in task.cancel() }
            }
        case let .stopObserving(id, watch):
            return AsyncStream { output in
                let task = Task {
                    for source in watch.sources { await source.stop() }
                    output.yield(.observationStopped(id))
                    output.finish()
                }
                output.onTermination = { _ in task.cancel() }
            }
        }
    }
}
