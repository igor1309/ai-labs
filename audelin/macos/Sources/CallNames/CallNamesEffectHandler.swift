/// One source of call-app evidence for a recording: Zoom's indicator or the browser extension.
public protocol CallAppObserver: Sendable {
    /// What the source observes, as CallNames events, until it is stopped or cannot observe.
    func observe() -> AsyncStream<CallNamesEvent>
    /// Closes the source; its stream finishes.
    func stop() async
}

/// Hands each effect to the call-app sources and delivers what they report; it keeps nothing.
public struct CallNamesEffectHandler: Sendable {

    private let sources: [any CallAppObserver]

    public init(sources: [any CallAppObserver]) { self.sources = sources }

    public func handle(_ effect: CallNamesEffect) -> AsyncStream<CallNamesEvent> {
        let sources = sources
        switch effect {
        case .observe:
            return AsyncStream { output in
                let task = Task {
                    await withTaskGroup(of: Void.self) { group in
                        for source in sources {
                            group.addTask { for await event in source.observe() { output.yield(event) } }
                        }
                    }
                    output.finish()
                }
                output.onTermination = { _ in task.cancel() }
            }
        case .stopObserving:
            return AsyncStream { output in
                let task = Task {
                    for source in sources { await source.stop() }
                    output.yield(.observationStopped)
                    output.finish()
                }
                output.onTermination = { _ in task.cancel() }
            }
        }
    }
}
