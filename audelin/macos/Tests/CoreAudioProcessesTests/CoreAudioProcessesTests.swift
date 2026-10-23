import Foundation
import Synchronization
import Testing
import CoreAudioProcesses

struct CoreAudioProcessesTests {

    @Test func audelinIsMarkedAsItself() throws {

        let binding = FakeBinding()
        binding.add(1, pid: 300, bundleID: "com.apple.Music", name: "Music")
        binding.add(2, pid: getpid(), bundleID: "com.example.Audelin", name: "Audelin")
        binding.add(3, pid: 301, bundleID: nil, name: "afplay")

        let processes = try CoreAudioProcesses(binding: binding, clock: FakeClock()).processes()

        #expect(processes == [
            AudioProcess(pid: 300, bundleID: "com.apple.Music", name: "Music", isAudelin: false),
            AudioProcess(pid: getpid(), bundleID: "com.example.Audelin", name: "Audelin", isAudelin: true),
            AudioProcess(pid: 301, bundleID: nil, name: "afplay", isAudelin: false),
        ])
    }

    @Test func aProcessGoneWhileListedIsLeftOut() throws {

        let binding = FakeBinding()
        binding.add(1, pid: 300, bundleID: "com.apple.Music", name: "Music")
        binding.add(2, pid: nil, bundleID: nil, name: "")

        let processes = try CoreAudioProcesses(binding: binding, clock: FakeClock()).processes()

        #expect(processes == [AudioProcess(pid: 300, bundleID: "com.apple.Music", name: "Music", isAudelin: false)])
    }

    @Test func aListTheSystemRefusesFails() {

        let binding = FakeBinding()
        binding.refuse(Refusal())
        let processes = CoreAudioProcesses(binding: binding, clock: FakeClock())

        #expect(throws: Refusal.self) { try processes.processes() }
        #expect(throws: Refusal.self) { try processes.start() }
    }

    @Test func zoomOnTheMicrophoneStartsACall() async throws {

        let binding = FakeBinding()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        let processes = try watch(binding, FakeClock())

        binding.record(1)

        #expect(try await told(processes) == [.started(app: "us.zoom.xos")])
    }

    @Test func anotherAppOnTheMicrophoneIsNotACall() async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 401, bundleID: "com.apple.VoiceMemos")
        binding.add(2, pid: 402, bundleID: "us.zoom.xos")
        let processes = try watch(binding, clock)

        binding.record(1)
        clock.advance(by: .seconds(60))

        #expect(try await told(processes) == [])

        let zoom = try watch(binding, clock)
        binding.record(2)
        #expect(try await told(zoom) == [.started(app: "us.zoom.xos")])
    }

    @Test(arguments: [(29, false), (30, true)])
    func aCallEndsThirtySecondsAfterTheMicrophone(seconds: Int, ended: Bool) async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        let processes = try watch(binding, clock)
        binding.record(1)

        binding.stopRecording(1)
        clock.advance(by: .seconds(seconds))

        #expect(try await told(processes) == [.started(app: "us.zoom.xos")] + (ended ? [.ended(app: "us.zoom.xos")] : []))
    }

    @Test func aShortSilenceDoesNotEndTheCall() async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        let processes = try watch(binding, clock)
        binding.record(1)

        binding.stopRecording(1)
        clock.advance(by: .seconds(10))
        binding.record(1)
        clock.advance(by: .seconds(50))

        #expect(try await told(processes) == [.started(app: "us.zoom.xos")])
    }

    @Test(arguments: [(29, false), (30, true)])
    func theWaitCountsFromTheLastSilence(seconds: Int, ended: Bool) async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        let processes = try watch(binding, clock)
        binding.record(1)

        binding.stopRecording(1)
        clock.advance(by: .seconds(10))
        binding.record(1)
        clock.advance(by: .seconds(10))
        binding.stopRecording(1)
        clock.advance(by: .seconds(seconds))

        #expect(try await told(processes) == [.started(app: "us.zoom.xos")] + (ended ? [.ended(app: "us.zoom.xos")] : []))
    }

    @Test func aSecondCallAppJoinsTheCall() async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        binding.add(2, pid: 402, bundleID: "com.google.Chrome.helper")
        let processes = try watch(binding, clock)
        binding.record(1)

        binding.record(2)
        binding.stopRecording(1)
        clock.advance(by: .seconds(60))

        #expect(try await told(processes) == [.started(app: "us.zoom.xos")])
    }

    @Test func anAppIsOnTheMicrophoneWhileAnyOfItsProcessesIs() async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 400, bundleID: "com.google.Chrome.helper")
        binding.add(2, pid: 401, bundleID: "com.google.Chrome.helper")
        let processes = try watch(binding, clock)
        binding.record(1)
        binding.record(2)

        binding.stopRecording(1)
        clock.advance(by: .seconds(60))

        #expect(try await told(processes) == [.started(app: "com.google.Chrome")])
    }

    @Test func telemostOnTheMicrophoneStartsACall() async throws {

        let binding = FakeBinding()
        binding.add(1, pid: 401, bundleID: "ru.yandex.desktop.telemost")
        let processes = try watch(binding, FakeClock())

        binding.setInput(1, true)
        binding.fireProcess(1, property: .devices)

        #expect(try await told(processes) == [.started(app: "ru.yandex.desktop.telemost")])
    }

    @Test(arguments: [
        ("com.google.Chrome.helper", "com.google.Chrome"),
        ("com.google.Chrome.helper.renderer", "com.google.Chrome"),
        ("com.google.Chrome", "com.google.Chrome"),
        ("org.mozilla.firefox.helper", "org.mozilla.firefox"),
        ("com.apple.Safari.helper", "com.apple.Safari"),
        ("com.apple.WebKit.GPU", "com.apple.WebKit.GPU"),
        ("company.thebrowser.Browser.helper", "company.thebrowser.Browser"),
        ("com.brave.Browser.helper", "com.brave.Browser"),
        ("com.microsoft.edgemac.helper", "com.microsoft.edgemac"),
        ("com.operasoftware.Opera.helper", "com.operasoftware.Opera"),
        ("com.vivaldi.Vivaldi.helper", "com.vivaldi.Vivaldi"),
        ("org.chromium.Chromium.helper", "org.chromium.Chromium"),
        ("ru.yandex.desktop.yandex-browser.helper", "ru.yandex.desktop.yandex-browser"),
        ("com.duckduckgo.macos.browser.helper", "com.duckduckgo.macos.browser"),
        ("com.kagi.kagimacOS.helper", "com.kagi.kagimacOS"),
        ("app.zen-browser.zen.helper", "app.zen-browser.zen"),
        ("company.thebrowser.dia.helper", "company.thebrowser.dia"),
        ("ai.perplexity.comet.helper", "ai.perplexity.comet"),
    ])
    func aBrowserOnTheMicrophoneStartsACall(helper: String, app: String) async throws {

        let binding = FakeBinding()
        binding.add(1, pid: 401, bundleID: helper)
        let processes = try watch(binding, FakeClock())

        binding.record(1)

        #expect(try await told(processes) == [.started(app: app)])
    }

    @Test(arguments: [(49, false), (50, true)])
    func aCallEndsThirtySecondsAfterTheLastCallAppLeaves(seconds: Int, ended: Bool) async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        binding.add(2, pid: 402, bundleID: "com.google.Chrome.helper")
        let processes = try watch(binding, clock)
        binding.record(1)
        binding.record(2)

        binding.stopRecording(1)
        clock.advance(by: .seconds(20))
        binding.stopRecording(2)
        clock.advance(by: .seconds(seconds - 20))

        #expect(try await told(processes) == [.started(app: "us.zoom.xos")] + (ended ? [.ended(app: "us.zoom.xos")] : []))
    }

    @Test func aCallAlreadyOnIsToldAtStart() async throws {

        let binding = FakeBinding()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos", input: true)

        let processes = try watch(binding, FakeClock())

        #expect(try await told(processes) == [.started(app: "us.zoom.xos")])
    }

    @Test func theMicrophoneIsReadOnlyWhenCoreAudioTells() async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        let processes = try watch(binding, clock)

        binding.setInput(1, true)
        _ = try processes.processes()
        clock.advance(by: .seconds(60))
        #expect(binding.inputReads == 1)

        binding.fireProcess(1)
        #expect(try await told(processes) == [.started(app: "us.zoom.xos")])
        #expect(binding.inputReads == 2)
    }

    @Test func aCallAppJoiningTheListOnTheMicrophoneStartsACall() async throws {

        let binding = FakeBinding()
        let processes = try watch(binding, FakeClock())

        binding.add(1, pid: 401, bundleID: "us.zoom.xos", input: true)
        binding.fireList()

        #expect(binding.listenedProcesses == [1])
        #expect(try await told(processes) == [.started(app: "us.zoom.xos")])
    }

    @Test func aCallAppLeavingTheListLeavesTheMicrophone() async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        let processes = try watch(binding, clock)
        binding.record(1)

        binding.remove(1)
        binding.fireList()
        clock.advance(by: .seconds(30))

        #expect(binding.listenedProcesses == [])
        #expect(try await told(processes) == [.started(app: "us.zoom.xos"), .ended(app: "us.zoom.xos")])
    }

    @Test func eachProcessIsListenedToWhileListed() throws {

        let binding = FakeBinding()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        binding.add(2, pid: 402, bundleID: nil)
        let processes = try watch(binding, FakeClock())
        #expect(binding.listenedProcesses == [1, 2])
        #expect(binding.listensToList)

        binding.remove(1)
        binding.add(3, pid: 403, bundleID: nil)
        binding.fireList()
        #expect(binding.listenedProcesses == [2, 3])

        processes.stop()
        #expect(binding.listenedProcesses == [])
        #expect(!binding.listensToList)
    }

    @Test func aRefusedNotificationFailsTheStreamAndRemovesListeners() async throws {

        let binding = FakeBinding()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        let processes = try watch(binding, FakeClock())
        binding.refuse(Refusal())

        binding.fireList()

        await #expect(throws: Refusal.self) { try await told(processes) }
        #expect(!binding.listensToList)
        #expect(binding.listenedProcesses == [])
    }

    @Test func stoppingCancelsTheEndAndIgnoresQueuedNotifications() async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        let processes = try watch(binding, clock)
        binding.record(1)
        binding.stopRecording(1)
        let queued = binding.queuedNotifications()

        processes.stop()
        clock.advance(by: .seconds(60))
        binding.setInput(1, true)
        queued.forEach { $0() }
        try processes.start()

        #expect(clock.pendingWaits == 0)
        #expect(!binding.listensToList)
        #expect(binding.listenedProcesses == [])
        #expect(try await told(processes) == [.started(app: "us.zoom.xos")])
    }

    @Test func aNewCallCanStartAfterThePreviousCallEnds() async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        binding.add(2, pid: 402, bundleID: "ru.yandex.desktop.telemost.helper")
        let processes = try watch(binding, clock)
        binding.record(1)
        binding.stopRecording(1)
        clock.advance(by: .seconds(30))
        binding.record(2)

        #expect(try await told(processes) == [
            .started(app: "us.zoom.xos"), .ended(app: "us.zoom.xos"),
            .started(app: "ru.yandex.desktop.telemost"),
        ])
    }

    @Test func repeatedNotificationsDoNotPostponeTheEnd() async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 401, bundleID: "us.zoom.xos")
        let processes = try watch(binding, clock)
        binding.record(1)
        binding.stopRecording(1)
        clock.advance(by: .seconds(20))
        binding.fireProcess(1, property: .devices)
        binding.fireList()
        clock.advance(by: .seconds(10))

        #expect(try await told(processes) == [.started(app: "us.zoom.xos"), .ended(app: "us.zoom.xos")])
    }

    @Test func aReusedObjectGetsItsNewProcessIdentity() async throws {

        let binding = FakeBinding()
        binding.add(1, pid: 400, bundleID: "us.zoom.xos")
        let processes = try watch(binding, FakeClock())

        binding.remove(1)
        binding.add(1, pid: 401, bundleID: "com.google.Chrome.helper", input: true)
        binding.fireList()

        #expect(try await told(processes) == [.started(app: "com.google.Chrome")])
    }

    @Test func aQueuedNotificationCannotSpeakForAReplacement() async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 400, bundleID: "us.zoom.xos")
        let processes = try watch(binding, clock)
        let queued = binding.queuedProcessNotifications()

        binding.remove(1)
        binding.fireList()
        binding.add(1, pid: 401, bundleID: "com.google.Chrome.helper")
        binding.fireList()
        binding.setInput(1, true)
        queued.forEach { $0() }
        clock.advance(by: .seconds(60))

        #expect(binding.listenedProcesses == [1])
        #expect(try await told(processes) == [])
    }

    @Test func aQueuedNotificationCannotSampleAReusedObjectBeforeTheListChanges() async throws {

        let binding = FakeBinding()
        binding.add(1, pid: 400, bundleID: "us.zoom.xos")
        let processes = try watch(binding, FakeClock())
        let queued = binding.queuedProcessNotifications()

        binding.remove(1)
        binding.add(1, pid: 401, bundleID: "com.apple.VoiceMemos", input: true)
        queued.forEach { $0() }

        #expect(try await told(processes) == [])
        #expect(binding.inputReads == 1)
    }

    @Test func aStartAndEndAreReadWhileTheAdapterIsRunning() async throws {

        let binding = FakeBinding()
        let clock = FakeClock()
        binding.add(1, pid: 400, bundleID: "us.zoom.xos")
        let processes = try watch(binding, clock)
        defer { processes.stop() }
        binding.record(1)
        let received = Mutex<[CallEvent]>([])
        let executor = StreamTestExecutor()

        let reader = Task(executorPreference: executor) {
            var iterator = processes.calls.makeAsyncIterator()
            if let start = try await iterator.next() { received.withLock { $0.append(start) } }
            binding.stopRecording(1)
            clock.advance(by: .seconds(30))
            if let end = try await iterator.next() { received.withLock { $0.append(end) } }
        }
        executor.runQueuedJobs()
        #expect(received.withLock { $0 } == [.started(app: "us.zoom.xos"), .ended(app: "us.zoom.xos")])
        #expect(binding.listensToList)
        #expect(binding.listenedProcesses == [1])

        processes.stop()
        reader.cancel()
        executor.runQueuedJobs()
        try await reader.value
    }

    private func watch(_ binding: FakeBinding, _ clock: FakeClock) throws -> CoreAudioProcesses {

        let processes = CoreAudioProcesses(binding: binding, clock: clock)
        try processes.start()
        return processes
    }

    /// Everything told so far: stopping ends the stream after what it holds.
    private func told(_ processes: CoreAudioProcesses) async throws -> [CallEvent] {

        processes.stop()
        var events: [CallEvent] = []
        for try await event in processes.calls { events.append(event) }
        return events
    }
}

private struct Refusal: Error {}

/// Hand-made process objects whose notifications fire on cue, at once.
final class FakeBinding: ProcessBinding {

    private struct Object {

        var pid: Int32?
        var bundleID: String?
        var name: String
        var input: Bool
    }

    private struct State {

        var order: [ProcessObject] = []
        var objects: [ProcessObject: Object] = [:]
        var refusal: (any Error)?
        var listListeners: [Int: @Sendable () -> Void] = [:]
        var processListeners: [Int: (object: ProcessObject, changed: @Sendable () -> Void)] = [:]
        var nextListener = 0
        var inputReads = 0
    }

    private let state = Mutex(State())

    var listenedProcesses: [ProcessObject] {

        state.withLock { $0.processListeners.values.map(\.object).sorted() }
    }

    var inputReads: Int {

        state.withLock { $0.inputReads }
    }

    var listensToList: Bool {

        state.withLock { !$0.listListeners.isEmpty }
    }

    func add(_ object: ProcessObject, pid: Int32?, bundleID: String?, name: String = "", input: Bool = false) {

        state.withLock {
            $0.order.append(object)
            $0.objects[object] = Object(pid: pid, bundleID: bundleID, name: name, input: input)
        }
    }

    func remove(_ object: ProcessObject) {

        state.withLock {
            $0.order.removeAll { $0 == object }
            $0.objects[object] = nil
        }
    }

    func refuse(_ error: any Error) {

        state.withLock { $0.refusal = error }
    }

    /// Changes the flag without telling, as Core Audio never tells it alone.
    func setInput(_ object: ProcessObject, _ input: Bool) {

        state.withLock { $0.objects[object]?.input = input }
    }

    func record(_ object: ProcessObject) {

        setInput(object, true)
        fireProcess(object)
    }

    func stopRecording(_ object: ProcessObject) {

        setInput(object, false)
        fireProcess(object)
    }

    func fireList() {

        state.withLock { Array($0.listListeners.values) }.forEach { $0() }
    }

    enum Property { case running, devices }

    func fireProcess(_ object: ProcessObject, property: Property = .running) {

        state.withLock { $0.processListeners.values.filter { $0.object == object }.map(\.changed) }.forEach { $0() }
    }

    func queuedProcessNotifications() -> [@Sendable () -> Void] {

        state.withLock { $0.processListeners.values.map(\.changed) }
    }

    func queuedNotifications() -> [@Sendable () -> Void] {

        state.withLock { Array($0.listListeners.values) + $0.processListeners.values.map(\.changed) }
    }

    func processObjects() throws -> [ProcessObject] {

        try state.withLock {
            if let refusal = $0.refusal { throw refusal }
            return $0.order
        }
    }

    func pid(of object: ProcessObject) -> Int32? {

        state.withLock { $0.objects[object]?.pid }
    }

    func bundleID(of object: ProcessObject) -> String? {

        state.withLock { $0.objects[object]?.bundleID }
    }

    func name(of object: ProcessObject) -> String {

        state.withLock { $0.objects[object]?.name ?? "" }
    }

    func isRunningInput(_ object: ProcessObject) -> Bool {

        state.withLock {
            $0.inputReads += 1
            return $0.objects[object]?.input ?? false
        }
    }

    func onProcessListChange(_ changed: @escaping @Sendable () -> Void) -> Cancellation {

        let id = state.withLock {
            $0.nextListener += 1
            $0.listListeners[$0.nextListener] = changed
            return $0.nextListener
        }
        return Cancellation { [weak self] in self?.state.withLock { _ = $0.listListeners.removeValue(forKey: id) } }
    }

    func onProcessChange(_ object: ProcessObject, _ changed: @escaping @Sendable () -> Void) -> Cancellation {

        let id = state.withLock {
            $0.nextListener += 1
            $0.processListeners[$0.nextListener] = (object, changed)
            return $0.nextListener
        }
        return Cancellation { [weak self] in self?.state.withLock { _ = $0.processListeners.removeValue(forKey: id) } }
    }
}

/// A clock whose time moves only when the test advances it.
final class FakeClock: CallClock {

    private struct Wait {

        var due: Duration
        var fire: @Sendable () -> Void
    }

    private struct State {

        var now: Duration = .zero
        var waits: [Int: Wait] = [:]
        var nextWait = 0
    }

    private let state = Mutex(State())

    var pendingWaits: Int {

        state.withLock { $0.waits.count }
    }

    func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation {

        let id = state.withLock {
            $0.nextWait += 1
            $0.waits[$0.nextWait] = Wait(due: $0.now + delay, fire: fire)
            return $0.nextWait
        }
        return Cancellation { [weak self] in self?.state.withLock { _ = $0.waits.removeValue(forKey: id) } }
    }

    /// Fires each wait that falls due, in order, at its own time.
    func advance(by duration: Duration) {

        let end = state.withLock { $0.now + duration }
        while let fire = nextDue(by: end) { fire() }
        state.withLock { $0.now = end }
    }

    private func nextDue(by end: Duration) -> (@Sendable () -> Void)? {

        state.withLock { state in
            guard let (id, wait) = state.waits.filter({ $0.value.due <= end }).min(by: { ($0.value.due, $0.key) < ($1.value.due, $1.key) }) else {
                return nil
            }
            state.waits[id] = nil
            state.now = wait.due
            return wait.fire
        }
    }
}

/// Runs stream consumption only when the test drains its queued jobs.
private final class StreamTestExecutor: TaskExecutor {

    private let jobs = Mutex<[UnownedJob]>([])

    func enqueue(_ job: consuming ExecutorJob) {

        let job = UnownedJob(job)
        jobs.withLock { $0.append(job) }
    }

    func runQueuedJobs() {

        while let job = jobs.withLock({ $0.isEmpty ? nil : $0.removeFirst() }) {
            job.runSynchronously(on: asUnownedTaskExecutor())
        }
    }
}
