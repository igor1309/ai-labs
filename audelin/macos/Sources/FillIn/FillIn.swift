/// Gets one side's live text ready and fills in its missed written audio once.
public actor FillIn {

    /// Latest snapshots, replacing unread ones, ending on completion or failure.
    public nonisolated let updates: AsyncStream<State>
    public private(set) var state = State(status: .idle, entries: [], heardThrough: 0)

    private let continuation: AsyncStream<State>.Continuation
    private let written: any WrittenTrack
    private let text: any LiveText
    private let audio: any LiveAudioPosition
    private var operation: Task<Void, Never>?
    private var ended = false
    private var later: Range<Double>?
    private var sampleRate = 1.0

    public init(written: any WrittenTrack, text: any LiveText, audio: any LiveAudioPosition) {

        self.written = written
        self.text = text
        self.audio = audio
        (updates, continuation) = AsyncStream.makeStream(bufferingPolicy: .bufferingNewest(1))
    }

    /// Starts once, from where this live text last heard. The caller serializes
    /// other hearing with this operation and retains any previously shown text.
    public func start(from: Double = 0, writtenLater: Bool = false) {

        guard operation == nil, !ended else { return }
        let boundary = audio.position.capturedThrough
        if writtenLater, from < boundary { later = from..<boundary }
        state.heardThrough = from
        state.status = .gettingReady
        publish()
        operation = Task { [weak self] in await self?.fill() }
    }

    /// Ends immediately, even if a collaborator does not honor cancellation.
    public func abandon() {

        guard !ended else { return }
        operation?.cancel()
        finish()
    }

    /// Joins collaborator work after it has been released, independently of the
    /// client's immediate abandonment result.
    func waitForWork() async { await operation?.value }

    private func fill() async {

        guard !ended else { return }
        do { try await text.prepare() }
        catch {
            fail(.gettingReady(String(describing: error)))
            return
        }
        guard !ended else { return }
        state.status = .catchingUp
        publish()
        var boundary = audio.position.capturedThrough
        while !ended {
            guard state.heardThrough.isFinite, state.heardThrough >= 0,
                  boundary.isFinite, boundary >= state.heardThrough else {
                fail(.reading(IncompleteTrack().description))
                return
            }
            if state.heardThrough < boundary {
                let from = state.heardThrough
                let chunks: [Audio]
                do { chunks = try await written.read(from: from, through: boundary) }
                catch {
                    fail(.reading(String(describing: error)))
                    return
                }
                for chunk in chunks {
                    guard !ended else { return }
                    let missed: Audio?
                    do { missed = try trim(chunk, through: boundary) }
                    catch {
                        fail(.reading(String(describing: error)))
                        return
                    }
                    guard let missed else { continue }
                    let heard: [Text]
                    do { heard = try await text.hear(missed) }
                    catch {
                        fail(.hearing(String(describing: error)))
                        return
                    }
                    guard !ended else { return }
                    state.heardThrough = missed.end
                    sampleRate = missed.sampleRate
                    state.entries = heard.map { segment in
                        State.Entry(text: segment, writtenLater: later.map {
                            ((segment.end - $0.lowerBound) * sampleRate).rounded() > 0
                                && (($0.upperBound - segment.start) * sampleRate).rounded() > 0
                        } ?? false)
                    }
                    publish()
                }
                guard !ended else { return }
                guard state.heardThrough > from,
                      ((boundary - state.heardThrough) * sampleRate).rounded() <= 0 else {
                    fail(.reading(IncompleteTrack().description))
                    return
                }
            }
            // Live deliveries resume after the original read boundary. Only
            // ended capture extends this read, since no live tail will follow it.
            let position = audio.position
            if position.ended, position.capturedThrough > boundary {
                boundary = position.capturedThrough
            } else {
                finish()
            }
        }
    }

    private func trim(_ chunk: Audio, through: Double) throws -> Audio? {

        guard chunk.sampleRate.isFinite, chunk.sampleRate > 0,
              chunk.start.isFinite, chunk.end.isFinite else { throw IncompleteTrack() }
        // Separate sums of chunk durations can differ by a fraction of a sample.
        let lower = ((state.heardThrough - chunk.start) * chunk.sampleRate).rounded()
        let upper = min(Double(chunk.samples.count), ((through - chunk.start) * chunk.sampleRate).rounded())
        guard lower >= 0 else { throw IncompleteTrack() }
        guard lower < upper else { return nil }
        return Audio(
            start: chunk.start + lower / chunk.sampleRate,
            samples: Array(chunk.samples[Int(lower)..<Int(upper)]),
            sampleRate: chunk.sampleRate
        )
    }

    private func fail(_ failure: State.Failure) {

        guard !ended else { return }
        state.status = .failed(failure)
        endUpdates()
    }

    private func finish() {

        state.status = .finished
        endUpdates()
    }

    private func endUpdates() {

        ended = true
        publish()
        continuation.finish()
    }

    private func publish() { continuation.yield(state) }

    deinit {

        operation?.cancel()
        continuation.finish()
    }

    private struct IncompleteTrack: Error, CustomStringConvertible {

        var description: String { "The written track does not cover the missed audio" }
    }
}
