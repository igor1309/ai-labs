import Dispatch
import Foundation
import Synchronization

/// A process with audio open.
public struct AudioProcess: Equatable, Sendable {

    public var pid: Int32
    public var bundleID: String?
    public var name: String
    public var isAudelin: Bool

    public init(pid: Int32, bundleID: String?, name: String, isAudelin: Bool) {

        self.pid = pid
        self.bundleID = bundleID
        self.name = name
        self.isAudelin = isAudelin
    }
}

/// A call starting or ending, with the call-app entry its first app matched.
public enum CallEvent: Equatable, Sendable {

    case started(app: String)
    case ended(app: String)
}

/// Lists the processes with audio open and tells calls starting and ending,
/// from Core Audio's notifications.
public final class CoreAudioProcesses: Sendable {

    /// Calls starting and ending, until stopped or a binding failure.
    public let calls: AsyncThrowingStream<CallEvent, any Error>

    private struct Watched {

        var pid: Int32
        var identity: UUID
        var app: String?
        var input: Bool
        var listener: Cancellation
    }

    private struct State {

        var listening = false
        var stopped = false
        var listListener: Cancellation?
        var order: [ProcessObject] = []
        var watched: [ProcessObject: Watched] = [:]
        var firstApp: String?
        var end: Cancellation?
        var generation = 0
        var retired: [Cancellation] = []
    }

    private let binding: any ProcessBinding
    private let clock: any CallClock
    private let continuation: AsyncThrowingStream<CallEvent, any Error>.Continuation
    private let state = Mutex(State())
    // Callers reach Core Audio, which blocks, only through this queue; its notifications arrive on its own threads.
    private let queue = DispatchSerialQueue(label: "audelin.CoreAudioProcesses")

    public init(binding: any ProcessBinding, clock: any CallClock) {

        self.binding = binding
        self.clock = clock
        (calls, continuation) = AsyncThrowingStream.makeStream(of: CallEvent.self)
    }

    deinit {

        state.withLock { finish(&$0) }
        cancelRetired()
    }

    /// The processes with audio open, or the binding's failure. Asking does
    /// not change the call or sample microphone use.
    public func processes() async throws -> [AudioProcess] {

        try await onQueue { [self] in try listProcesses() }
    }

    private func listProcesses() throws -> [AudioProcess] {

        try binding.processObjects().compactMap { object in
            guard let pid = binding.pid(of: object) else { return nil }
            return AudioProcess(
                pid: pid, bundleID: binding.bundleID(of: object),
                name: binding.name(of: object), isAudelin: pid == getpid()
            )
        }
    }

    /// Starts listening once; a call already on is told at once.
    public func start() async throws {

        try await onQueue { [self] in try startListening() }
    }

    private func startListening() throws {

        defer { cancelRetired() }
        try state.withLock { state in
            guard !state.listening, !state.stopped else { return }
            state.listening = true
            do {
                state.listListener = try binding.onProcessListChange { [weak self] in
                    guard let self else { return }
                    self.receive { try self.refresh(&$0) }
                }
                try refresh(&state)
            } catch {
                finish(&state, error: error)
                throw error
            }
        }
    }

    /// Removes listeners and ends the stream, keeping buffered events.
    public func stop() async {

        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            queue.async { [self] in
                state.withLock { finish(&$0) }
                cancelRetired()
                done.resume()
            }
        }
    }

    private func onQueue<Value: Sendable>(_ work: @escaping @Sendable () throws -> Value) async throws -> Value {

        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Value, any Error>) in
            queue.async { done.resume(with: Result { try work() }) }
        }
    }

    private func receive(_ update: (inout State) throws -> Void) {

        state.withLock { state in
            guard state.listening else { return }
            do { try update(&state) } catch { finish(&state, error: error) }
        }
        cancelRetired()
    }

    private func refresh(_ state: inout State) throws {

        let objects = try binding.processObjects()
        let members = Set(objects)
        for object in state.order where !members.contains(object) {
            if let removed = state.watched.removeValue(forKey: object) {
                state.retired.append(removed.listener)
            }
        }
        state.order = objects
        for object in objects {
            let pid = binding.pid(of: object)
            if state.watched[object]?.pid != pid {
                if let removed = state.watched.removeValue(forKey: object) {
                    state.retired.append(removed.listener)
                }
            }
            guard let pid else { continue }
            if state.watched[object] == nil {
                let identity = UUID()
                let listener: Cancellation
                do {
                    listener = try binding.onProcessChange(object) { [weak self] in
                        guard let self else { return }
                        self.receive { state in
                            guard let watched = state.watched[object], watched.identity == identity,
                                  self.binding.pid(of: object) == watched.pid else { return }
                            let input = self.binding.isRunningInput(object)
                            guard self.binding.pid(of: object) == watched.pid else { return }
                            state.watched[object]?.input = input
                            self.reconcile(&state)
                        }
                    }
                } catch {
                    // An object may leave between listing it and subscribing.
                    if binding.pid(of: object) == nil { continue }
                    throw error
                }
                state.watched[object] = Watched(
                    pid: pid, identity: identity,
                    app: binding.bundleID(of: object).flatMap(Self.callApp),
                    input: false, listener: listener
                )
            }
            let input = binding.isRunningInput(object)
            guard binding.pid(of: object) == pid else { continue }
            state.watched[object]?.input = input
        }
        reconcile(&state)
    }

    private func reconcile(_ state: inout State) {

        let active = state.order.compactMap { object -> String? in
            guard let process = state.watched[object], process.input else { return nil }
            return process.app
        }.first
        if let active {
            if let end = state.end {
                state.retired.append(end)
                state.end = nil
                state.generation += 1
            }
            if state.firstApp == nil {
                state.firstApp = active
                continuation.yield(.started(app: active))
            }
        } else if state.firstApp != nil, state.end == nil {
            state.generation += 1
            let generation = state.generation
            state.end = clock.after(.seconds(30)) { [weak self] in
                guard let self else { return }
                self.receive { state in
                    guard state.generation == generation, let app = state.firstApp else { return }
                    state.end = nil
                    state.firstApp = nil
                    self.continuation.yield(.ended(app: app))
                }
            }
        }
    }

    private func finish(_ state: inout State, error: (any Error)? = nil) {

        guard !state.stopped else { return }
        state.listening = false
        state.stopped = true
        if let list = state.listListener { state.retired.append(list) }
        if let end = state.end { state.retired.append(end) }
        state.retired.append(contentsOf: state.watched.values.map(\.listener))
        state.listListener = nil
        state.end = nil
        state.watched.removeAll()
        state.order.removeAll()
        continuation.finish(throwing: error)
    }

    private func cancelRetired() {

        let retired = state.withLock { state in
            let retired = state.retired
            state.retired.removeAll()
            return retired
        }
        retired.forEach { $0.cancel() }
    }

    /// The name a person knows a detected call app by, from the bundle ID detection reports.
    public static func callAppName(_ app: String) -> String? {

        callApps.first { $0.bundleID == app }?.name
    }

    private static func callApp(_ bundleID: String) -> String? {

        // The list's first matching entry represents its helpers too.
        callApps.first { bundleID.hasPrefix($0.bundleID) }?.bundleID
    }

    static let callApps: [(bundleID: String, name: String)] = [
        ("us.zoom.xos", "Zoom"), ("ru.yandex.desktop.telemost", "Telemost"),
        ("com.google.Chrome", "Chrome"), ("com.google.Chrome.helper", "Chrome"),
        ("org.mozilla.firefox", "Firefox"), ("com.apple.Safari", "Safari"), ("com.apple.WebKit.GPU", "Safari"),
        ("company.thebrowser.Browser", "Arc"), ("com.brave.Browser", "Brave"), ("com.microsoft.edgemac", "Edge"),
        ("com.operasoftware.Opera", "Opera"), ("com.vivaldi.Vivaldi", "Vivaldi"), ("org.chromium.Chromium", "Chromium"),
        ("ru.yandex.desktop.yandex-browser", "Yandex Browser"), ("com.duckduckgo.macos.browser", "DuckDuckGo"),
        ("com.kagi.kagimacOS", "Orion"), ("app.zen-browser.zen", "Zen"), ("company.thebrowser.dia", "Dia"),
        ("ai.perplexity.comet", "Comet"),
    ]
}
