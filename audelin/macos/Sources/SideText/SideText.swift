/// Reads one side through its live audio, retained live text and filling in.
public actor SideText {

    /// Latest snapshots, replacing unread ones, until text ends.
    public nonisolated let updates: AsyncStream<State>
    public private(set) var state = State(status: .off, entries: [])

    private let continuation: AsyncStream<State>.Continuation
    private let audio: any LiveAudio
    private let text: any LiveText
    private let makeFillIn: @Sendable () -> any FillingIn
    private let inputQueued: @Sendable () -> Void
    private let audioEndReceived: @Sendable () -> Void
    private let stopRequested: @Sendable () -> Void
    private let identifiedEntry: @Sendable (Text) -> Void
    private let shownEntry: @Sendable (Text) -> Void
    private var listener: Task<Void, Never>?
    private var operation: Task<Void, Never>?
    private var enabled = false
    private var ending = false
    private var ended = false
    private var stopping = false
    private var sourceEnded = false
    private var endWaiters: [CheckedContinuation<Void, Never>] = []
    private var fills: [Int: any FillingIn] = [:]
    private var generation = 0
    private var heardThrough = 0.0
    private var sampleRate = 1.0
    private var shownThrough = 0.0
    private var latest: [Text] = []
    private var acceptedFinalCount = 0
    // A hearing can return while switched off. Keep its final text hidden
    // until showing resumes, when the recovered-audio ranges are known.
    private var pendingFinal: [Text] = []
    private var heardNoTextBefore: Double?
    private var shownIDs: [Int: Int] = [:]
    private var highestID = -1
    private var later: [Range<Double>] = []

    /// Each activation gets its own filling-in run, using the same live text.
    public init(
        audio: any LiveAudio, text: any LiveText,
        fillIn: @escaping @Sendable () -> any FillingIn
    ) {

        self.init(
            audio: audio, text: text, fillIn: fillIn,
            inputQueued: {}, audioEndReceived: {}, stopRequested: {}
        )
    }

    init(
        audio: any LiveAudio, text: any LiveText,
        fillIn: @escaping @Sendable () -> any FillingIn,
        inputQueued: @escaping @Sendable () -> Void,
        audioEndReceived: @escaping @Sendable () -> Void,
        stopRequested: @escaping @Sendable () -> Void,
        identifiedEntry: @escaping @Sendable (Text) -> Void = { _ in },
        shownEntry: @escaping @Sendable (Text) -> Void = { _ in }
    ) {

        self.audio = audio
        self.text = text
        makeFillIn = fillIn
        self.inputQueued = inputQueued
        self.audioEndReceived = audioEndReceived
        self.stopRequested = stopRequested
        self.identifiedEntry = identifiedEntry
        self.shownEntry = shownEntry
        (updates, continuation) = AsyncStream.makeStream(bufferingPolicy: .bufferingNewest(1))
    }

    public func start(enabled: Bool = true) {

        guard listener == nil, !ending, !stopping else { return }
        listener = Task { [weak self, audio] in
            await audio.listen { [weak self] chunk in await self?.receive(chunk) }
            await self?.audioEnded()
        }
        if enabled { activate(writtenLater: false) } else { publish() }
    }

    /// Freezes visible text while retaining live text for the next switch on.
    /// Abandons filling in and cancels hearing; late results stay invisible.
    public func setEnabled(_ enabled: Bool) async {

        guard listener != nil, !ending, !stopping, enabled != self.enabled else { return }
        if enabled {
            activate(writtenLater: true)
        } else {
            self.enabled = false
            generation += 1
            state.status = .off
            publish()
            let abandoned = Array(fills.values)
            for run in abandoned { await run.abandon() }
            await text.cancelHearing()
            if sourceEnded { await end(.finished) }
        }
    }

    /// Drains live audio; held filling in is abandoned instead of awaited.
    /// Concurrent callers all wait for the same ending and live-text stop.
    public func stop() async {

        stopping = true
        stopRequested()
        if !ending, !fills.isEmpty || listener == nil {
            await end(.finished)
        } else {
            await waitUntilEnded()
        }
    }

    /// Keeps the visible text without waiting for audio or filling in.
    public func abandon() async { await end(.finished) }

    private func activate(writtenLater: Bool) {

        enabled = true
        generation += 1
        let turn = generation
        let boundary = audio.capturedThrough
        if writtenLater, shownThrough < boundary { later.append(shownThrough..<boundary) }
        let run = makeFillIn()
        fills[turn] = run
        state.status = .fillingIn
        let previous = operation
        operation = Task { [weak self] in
            await previous?.value
            await self?.fillIn(run, turn: turn)
        }
        publish()
    }

    private func current(_ turn: Int) -> Bool {

        enabled && !ending && turn == generation
    }

    private func fillIn(_ run: any FillingIn, turn: Int) async {

        defer { fills[turn] = nil }
        guard current(turn) else { return }
        do {
            try await run.fillIn(from: heardThrough) { [weak self] progress in
                await self?.filled(progress, turn: turn)
            }
            guard current(turn) else { return }
            state.status = .listening
            show()
            publish()
        } catch {
            await fail(.fillingIn(String(describing: error)), turn: turn)
        }
    }

    private func filled(_ progress: FilledText, turn: Int) {

        // A run can finish consuming audio after switching off. Its cursor
        // still belongs to the retained engine, but its text stays hidden.
        heardThrough = progress.heardThrough
        sampleRate = progress.sampleRate
        latest = identified(progress.text.dropFirst(acceptedFinalCount))
        guard current(turn) else { return }
        show()
        publish()
    }

    private func receive(_ chunk: Audio) async {

        guard enabled, !ending else { return }
        let turn = generation
        let previous = operation
        let next = Task { [weak self] in
            await previous?.value
            await self?.hear(chunk, turn: turn)
        }
        operation = next
        inputQueued()
        await next.value
    }

    private func hear(_ audio: Audio, turn: Int) async {

        guard current(turn) else { return }
        do {
            guard let chunk = try trim(audio) else { return }
            let heard = try await text.hear(chunk)
            heardThrough = chunk.end
            sampleRate = chunk.sampleRate
            accept(heard)
            guard current(turn) else { return }
            show()
            publish()
        } catch {
            await fail(.hearing(String(describing: error)), turn: turn)
        }
    }

    private func trim(_ audio: Audio) throws -> Audio? {

        guard audio.sampleRate.isFinite, audio.sampleRate > 0,
              audio.start.isFinite, audio.end.isFinite else { throw IncompleteAudio() }
        // Compare sample positions, since separate sums of chunk durations
        // can differ by a fraction of a sample in floating-point call time.
        let lower = ((heardThrough - audio.start) * audio.sampleRate).rounded()
        guard lower >= 0 else { throw IncompleteAudio() }
        guard lower < Double(audio.samples.count) else { return nil }
        return Audio(
            start: audio.start + lower / audio.sampleRate,
            samples: Array(audio.samples[Int(lower)...]), sampleRate: audio.sampleRate
        )
    }

    private func audioEnded() async {

        sourceEnded = true
        audioEndReceived()
        guard !ending else { return }
        if !enabled {
            await end(.finished)
            return
        }
        await operation?.value
        guard enabled, !ending else { return }
        let turn = generation
        do {
            let finished = try await text.finish()
            guard current(turn) else { return }
            accept(finished)
            show()
            await end(.finished)
        } catch {
            await fail(.finishing(String(describing: error)), turn: turn)
        }
    }

    private func fail(_ failure: State.Failure, turn: Int) async {

        guard current(turn) else { return }
        await end(.failed(failure))
    }

    private func end(_ status: State.Status) async {

        guard !ending else {
            await waitUntilEnded()
            return
        }
        ending = true
        enabled = false
        generation += 1
        listener?.cancel()
        operation?.cancel()
        let abandoned = Array(fills.values)
        for run in abandoned { await run.abandon() }
        await text.stop()
        state.status = status
        publish()
        continuation.finish()
        ended = true
        for waiter in endWaiters { waiter.resume() }
        endWaiters.removeAll()
    }

    private func waitUntilEnded() async {

        guard !ended else { return }
        await withCheckedContinuation { endWaiters.append($0) }
    }

    private func show() {

        if !pendingFinal.isEmpty {
            // One batch append can copy the prefix when a consumer holds a
            // snapshot. Tail-only hearings never mutate that shared array.
            state.finalEntries.append(contentsOf: pendingFinal.map(entry))
            pendingFinal.removeAll(keepingCapacity: true)
        }
        state.tailEntries = latest.map(entry)
        // Shown with the text it covers: hidden final text starts before it.
        state.noTextBefore = heardNoTextBefore
        shownThrough = heardThrough
    }

    private func entry(_ segment: Text) -> State.Entry {

        shownEntry(segment)
        return State.Entry(text: segment, writtenLater: later.contains {
            ((segment.end - $0.lowerBound) * sampleRate).rounded() > 0
                && (($0.upperBound - segment.start) * sampleRate).rounded() > 0
        })
    }

    private func accept(_ update: TextUpdate) {

        pendingFinal.append(contentsOf: update.final.dropFirst(acceptedFinalCount).map(identify))
        acceptedFinalCount = update.final.count
        latest = identified(update.tail)
        heardNoTextBefore = update.noTextBefore ?? heardNoTextBefore
    }

    /// Updates replace unread ones, so an id live text leaves out and then
    /// brings back for other words gets a new id here, where every hearing
    /// is seen; an id kept from one hearing to the next keeps its id.
    private func identified(_ texts: some Collection<Text>) -> [Text] {

        var next: [Int: Int] = [:]
        let identified = texts.map { text in
            let result = identify(text)
            next[text.id] = result.id
            return result
        }
        shownIDs = next
        return identified
    }

    private func identify(_ text: Text) -> Text {

        identifiedEntry(text)
        let id = shownIDs[text.id] ?? (text.id > highestID ? text.id : highestID + 1)
        highestID = max(highestID, id)
        return Text(id: id, start: text.start, end: text.end, settled: text.settled, pending: text.pending)
    }

    private func publish() { continuation.yield(state) }

    /// Joins queued work independently of whether capture is still open.
    func waitForWork() async { await operation?.value }

    func waitForAudioEnd() async { await listener?.value }

    deinit {

        listener?.cancel()
        operation?.cancel()
        continuation.finish()
    }

    private struct IncompleteAudio: Error, CustomStringConvertible {

        var description: String { "Live audio does not cover the next unheard sample" }
    }
}
