/// One source of call-app evidence for a recording: Zoom's indicator or the browser extension.
public protocol CallAppObserver: Sendable {
    /// What the source observes, as CallNames events, until it is stopped or cannot observe.
    func observe() -> AsyncStream<CallNamesEvent>
    /// Closes the source; its stream finishes.
    func stop() async
}

/// Hands each effect to the call-app sources and delivers what they report; it keeps nothing.
public struct CallNamesEffectHandler: Sendable {

    private let zoom: any CallAppObserver
    private let browser: any CallAppObserver

    public init(zoom: any CallAppObserver, browser: any CallAppObserver) {
        self.zoom = zoom
        self.browser = browser
    }

    public func handle(_ effect: CallNamesEffect) -> AsyncStream<CallNamesEvent> {
        switch effect {
        case .observeBrowser:
            return browser.observe()
        case .observeZoom:
            return zoom.observe()
        case .stopObserving:
            return AsyncStream { output in
                let task = Task {
                    await zoom.stop()
                    await browser.stop()
                    output.yield(.observationStopped)
                    output.finish()
                }
                output.onTermination = { _ in task.cancel() }
            }
        }
    }
}
