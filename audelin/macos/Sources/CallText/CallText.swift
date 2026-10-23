/// Reads both sides of a call through the audio and text it is given.
public actor CallText {

    /// The latest snapshot, replacing unread snapshots, until text ends.
    public nonisolated let updates: AsyncStream<State>
    public private(set) var state = State(status: .off, entries: [])

    private let continuation: AsyncStream<State>.Continuation
    private let inputs: [Track]
    private var tracks = [Progress(), Progress()]
    private var listeners: [Task<Void, Never>] = []
    private var started = false
    private var enabled = false
    private var ended = false
    private var generation = 0

    private enum Phase {

        case loading, catchingUp, listening, finished
    }

    private struct Progress {

        var phase = Phase.loading
        var receivedThrough = 0.0
        var heardThrough = 0.0
        var heardSampleRate = 1.0
        var shownThrough = 0.0
        var text: [Text] = []
        var visible: [State.Entry] = []
        var later: [Range<Double>] = []
        var operation: Task<Void, Never>?
    }

    public init(microphone: Track, call: Track) {

        inputs = [microphone, call]
        (updates, continuation) = AsyncStream.makeStream(bufferingPolicy: .bufferingNewest(1))
    }

    /// Subscribes once, including while text is off, to retain call position.
    public func start(enabled: Bool = true) {

        guard !started, !ended else { return }
        started = true
        listeners = inputs.enumerated().map { index, input in
            Task { [weak self] in
                await input.audio.listen { [weak self] audio in
                    await self?.receive(audio, on: index)
                }
                await self?.audioEnded(on: index)
            }
        }
        if enabled { activate(writtenLater: false) } else { publish() }
    }

    /// Switching off freezes the client text; it does not stop capture.
    public func setEnabled(_ enabled: Bool) {

        guard started, !ended, enabled != self.enabled else { return }
        if enabled {
            activate(writtenLater: true)
        } else {
            self.enabled = false
            generation += 1
            for track in tracks { track.operation?.cancel() }
            state.status = .off
            publish()
        }
    }

    /// Ends subscriptions and waits for this reader's work to finish.
    public func stop() async {

        ended = true
        enabled = false
        generation += 1
        for task in listeners { task.cancel() }
        for track in tracks { track.operation?.cancel() }
        for task in listeners { await task.value }
        for track in tracks { await track.operation?.value }
        if case .failed = state.status {} else { state.status = .finished }
        publish()
        continuation.finish()
    }

    private func activate(writtenLater: Bool) {

        enabled = true
        generation += 1
        let turn = generation
        state.status = .gettingReady
        for index in inputs.indices {
            tracks[index].phase = .loading
            let previous = tracks[index].operation
            tracks[index].operation = Task { [weak self] in
                await withTaskCancellationHandler {
                    await previous?.value
                    await self?.prepare(index, turn: turn, writtenLater: writtenLater)
                } onCancel: {
                    previous?.cancel()
                }
            }
        }
        publish()
    }

    private func current(_ turn: Int) -> Bool {

        enabled && !ended && turn == generation
    }

    private func prepare(_ index: Int, turn: Int, writtenLater: Bool) async {

        guard current(turn) else { return }
        do {
            try await inputs[index].text.prepare()
            guard current(turn) else { return }
            let boundary = tracks[index].receivedThrough
            let from = tracks[index].heardThrough
            if writtenLater, tracks[index].shownThrough < boundary {
                tracks[index].later.append(tracks[index].shownThrough..<boundary)
            }
            // Deliveries during the read queue behind this operation. The
            // written prefix ends at this boundary, so they cannot overlap it.
            tracks[index].phase = .catchingUp
            if from < boundary {
                let audio = try await inputs[index].written.read(from: from, through: boundary)
                for chunk in audio {
                    guard current(turn) else { return }
                    try await hear(chunk, on: index, turn: turn, through: boundary)
                }
                guard current(turn) else { return }
                let missing = (boundary - tracks[index].heardThrough) * tracks[index].heardSampleRate
                guard missing.rounded() <= 0 else { throw IncompleteTrack() }
            }
            guard current(turn) else { return }
            tracks[index].phase = .listening
            show(index)
            updateStatus()
            publish()
        } catch {
            fail(error, turn: turn)
        }
    }

    private func receive(_ audio: Audio, on index: Int) async {

        tracks[index].receivedThrough = max(tracks[index].receivedThrough, audio.end)
        guard enabled, !ended, tracks[index].phase != .loading else { return }
        let turn = generation
        let previous = tracks[index].operation
        let operation = Task { [weak self] in
            await withTaskCancellationHandler {
                await previous?.value
                await self?.take(audio, on: index, turn: turn)
            } onCancel: {
                previous?.cancel()
            }
        }
        tracks[index].operation = operation
        await operation.value
    }

    private func take(_ audio: Audio, on index: Int, turn: Int) async {

        guard current(turn) else { return }
        do {
            try await hear(audio, on: index, turn: turn, through: audio.end)
        } catch {
            fail(error, turn: turn)
        }
    }

    private func hear(_ audio: Audio, on index: Int, turn: Int, through: Double) async throws {

        let cursor = tracks[index].heardThrough
        guard audio.sampleRate.isFinite, audio.sampleRate > 0,
              audio.start.isFinite, audio.end.isFinite else { throw IncompleteTrack() }
        // Compare sample positions: separate sums of chunk durations can
        // differ by a fraction of a sample in floating-point call time.
        let lowerFrame = ((cursor - audio.start) * audio.sampleRate).rounded()
        let upperFrame = min(Double(audio.samples.count), ((through - audio.start) * audio.sampleRate).rounded())
        guard lowerFrame >= 0 else { throw IncompleteTrack() }
        guard lowerFrame < upperFrame else { return }
        let lower = Int(lowerFrame)
        let upper = Int(upperFrame)
        let chunk = Audio(
            start: audio.start + Double(lower) / audio.sampleRate,
            samples: Array(audio.samples[lower..<upper]),
            sampleRate: audio.sampleRate
        )
        let text = try await inputs[index].text.hear(chunk)
        // An in-flight hearing may complete after a switch. Remember what
        // the engine consumed, while leaving the client's frozen text alone.
        tracks[index].heardThrough = chunk.end
        tracks[index].heardSampleRate = chunk.sampleRate
        tracks[index].text = text
        guard current(turn) else { return }
        show(index)
        publish()
    }

    private func show(_ index: Int) {

        let speaker: State.Speaker = index == 0 ? .mine : .theirs
        let sampleRate = tracks[index].heardSampleRate
        tracks[index].visible = tracks[index].text.map { text in
            State.Entry(
                speaker: speaker,
                text: text,
                writtenLater: tracks[index].later.contains {
                    ((text.end - $0.lowerBound) * sampleRate).rounded() > 0
                        && (($0.upperBound - text.start) * sampleRate).rounded() > 0
                }
            )
        }
        tracks[index].shownThrough = tracks[index].heardThrough
    }

    private func audioEnded(on index: Int) async {

        guard enabled, !ended else { return }
        let turn = generation
        let previous = tracks[index].operation
        let operation = Task { [weak self] in
            await withTaskCancellationHandler {
                await previous?.value
                await self?.finish(index, turn: turn)
            } onCancel: {
                previous?.cancel()
            }
        }
        tracks[index].operation = operation
        await operation.value
    }

    private func finish(_ index: Int, turn: Int) async {

        guard current(turn) else { return }
        do {
            let text = try await inputs[index].text.finish()
            guard current(turn) else { return }
            tracks[index].text = text
            tracks[index].phase = .finished
            show(index)
            updateStatus()
            publish()
            if state.status == .finished {
                enabled = false
                ended = true
                continuation.finish()
            }
        } catch {
            fail(error, turn: turn)
        }
    }

    private func updateStatus() {

        if tracks.allSatisfy({ $0.phase == .finished }) {
            state.status = .finished
        } else if tracks.allSatisfy({ $0.phase == .listening || $0.phase == .finished }) {
            state.status = .listening
        }
    }

    private func fail(_ error: any Error, turn: Int) {

        guard current(turn) else { return }
        enabled = false
        ended = true
        generation += 1
        for track in tracks { track.operation?.cancel() }
        state.status = .failed(String(describing: error))
        publish()
        continuation.finish()
    }

    private func publish() {

        state.entries = tracks.flatMap(\.visible).sorted {
            if $0.text.start != $1.text.start { return $0.text.start < $1.text.start }
            return $0.speaker == .mine && $1.speaker == .theirs
        }
        continuation.yield(state)
    }

    private struct IncompleteTrack: Error, CustomStringConvertible {

        var description: String { "The written track does not cover the missed audio" }
    }
}
