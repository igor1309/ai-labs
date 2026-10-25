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
    private var listener: Task<Void, Never>?
    private var operation: Task<Void, Never>?
    private var enabled = false
    private var ending = false
    private var generation = 0
    private var heardThrough = 0.0
    private var sampleRate = 1.0
    private var shownThrough = 0.0
    private var latest: [Text] = []
    private var later: [Range<Double>] = []

    /// Each activation gets its own filling-in run, using the same live text.
    public init(
        audio: any LiveAudio, text: any LiveText,
        fillIn: @escaping @Sendable () -> any FillingIn
    ) {

        self.init(audio: audio, text: text, fillIn: fillIn, inputQueued: {})
    }

    init(
        audio: any LiveAudio, text: any LiveText,
        fillIn: @escaping @Sendable () -> any FillingIn,
        inputQueued: @escaping @Sendable () -> Void
    ) {

        self.audio = audio
        self.text = text
        makeFillIn = fillIn
        self.inputQueued = inputQueued
        (updates, continuation) = AsyncStream.makeStream(bufferingPolicy: .bufferingNewest(1))
    }

    public func start(enabled: Bool = true) {

        guard listener == nil, !ending else { return }
        listener = Task { [weak self, audio] in
            await audio.listen { [weak self] chunk in await self?.receive(chunk) }
            await self?.audioEnded()
        }
        if enabled { activate(writtenLater: false) } else { publish() }
    }

    /// Freezes visible text while retaining live text for the next switch on.
    /// In-flight work may finish invisibly so its consumed cursor is retained.
    public func setEnabled(_ enabled: Bool) {

        guard listener != nil, !ending, enabled != self.enabled else { return }
        if enabled {
            activate(writtenLater: true)
        } else {
            self.enabled = false
            generation += 1
            state.status = .off
            publish()
        }
    }

    private func activate(writtenLater: Bool) {

        enabled = true
        generation += 1
        let turn = generation
        let boundary = audio.capturedThrough
        if writtenLater, shownThrough < boundary { later.append(shownThrough..<boundary) }
        let run = makeFillIn()
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
        latest = progress.text
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
            latest = heard
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

        await operation?.value
        guard enabled, !ending else { return }
        let turn = generation
        do {
            let finished = try await text.finish()
            guard current(turn) else { return }
            latest = finished
            show()
            ending = true
            enabled = false
            await text.stop()
            state.status = .finished
            publish()
            continuation.finish()
        } catch {
            await fail(.finishing(String(describing: error)), turn: turn)
        }
    }

    private func fail(_ failure: State.Failure, turn: Int) async {

        guard current(turn) else { return }
        ending = true
        enabled = false
        generation += 1
        listener?.cancel()
        await text.stop()
        state.status = .failed(failure)
        publish()
        continuation.finish()
    }

    private func show() {

        state.entries = latest.map { segment in
            State.Entry(text: segment, writtenLater: later.contains {
                ((segment.end - $0.lowerBound) * sampleRate).rounded() > 0
                    && (($0.upperBound - segment.start) * sampleRate).rounded() > 0
            })
        }
        shownThrough = heardThrough
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
