import NameCarry

/// Makes a replacement transcript in one sequence, keeping nothing between runs.
public struct ReRecognition: Sendable {
    public typealias Report = @Sendable (Wait) async -> Void
    public typealias Fraction = @Sendable (Double) async -> Void
    public typealias CarryNames = @Sendable ([OldSpeaker], [Speaker]) -> [Int: String]

    private let hear: @Sendable (String, Fraction) async throws -> Heard
    private let split: @Sendable (OriginalCall, [Word]) async throws -> Split?
    private let clean: @Sendable (OriginalCall, [Word], [Speaker]) async throws -> [Word]?
    private let readOld: @Sendable (String) async throws -> [OldSpeaker]
    private let names: CarryNames
    private let publish: @Sendable (String, Transcript) async throws -> Void

    /// Hear awaits each progress callback in order; ports return only after their work ends.
    /// Nil split/clean results mean nothing kept. Read uses only the current transcript,
    /// never archived original calls. Publishing replaces the current/previous pair atomically
    /// and must settle its commit even if this task is cancelled during the call.
    public init(
        hear: @escaping @Sendable (String, Fraction) async throws -> Heard,
        split: @escaping @Sendable (OriginalCall, [Word]) async throws -> Split?,
        clean: @escaping @Sendable (OriginalCall, [Word], [Speaker]) async throws -> [Word]?,
        readOld: @escaping @Sendable (String) async throws -> [OldSpeaker],
        names: @escaping CarryNames,
        publish: @escaping @Sendable (String, Transcript) async throws -> Void
    ) {
        self.hear = hear; self.split = split; self.clean = clean
        self.readOld = readOld; self.names = names; self.publish = publish
    }

    /// Cancelling the caller's task stops before publication, after the port in flight returns.
    /// A list preserves the input boundary for joining original calls; joining is not supported yet.
    public func run(call: String, originals: [OriginalCall], build: Build, report: @escaping Report) async -> Outcome {
        guard originals.count == 1, let original = originals.first else {
            return .failed(original: nil, reason: "Exactly one original call is supported.")
        }
        await report(.preparing)
        guard !Task.isCancelled else { return .stopped }
        let progress = HearingProgress(report: report)
        let far: Heard
        let microphone: Heard
        do {
            far = try await hear(original.farTrack) { await progress.accept($0, track: 0) }
            guard !Task.isCancelled else { return .stopped }
            await progress.accept(1, track: 0)
            guard !Task.isCancelled else { return .stopped }
            microphone = try await hear(original.microphoneTrack) { await progress.accept($0, track: 1) }
            guard !Task.isCancelled else { return .stopped }
            await progress.accept(1, track: 1)
            guard !Task.isCancelled else { return .stopped }
        } catch {
            return Task.isCancelled ? .stopped : .failed(original: original.id, reason: String(describing: error))
        }

        await report(.finishing)
        guard !Task.isCancelled else { return .stopped }
        let divided = try? await split(original, far.words)
        guard !Task.isCancelled else { return .stopped }
        var speakers = divided?.speakers ?? [.init(id: 0, name: nil, words: far.words)]
        let cleaned = try? await clean(original, microphone.words, speakers)
        guard !Task.isCancelled else { return .stopped }
        let old = (try? await readOld(call)) ?? []
        guard !Task.isCancelled else { return .stopped }
        let clipped = old.map { speaker in
            OldSpeaker(name: speaker.name, ranges: speaker.ranges.compactMap { range in
                let start = max(0, range.start), end = min(original.duration, range.end)
                return end > start ? TimeRange(start: start, end: end) : nil
            })
        }
        let carried = names(clipped, speakers)
        for index in speakers.indices { speakers[index].name = carried[speakers[index].id] }
        let transcript = Transcript(originals: [.init(
            original: original, far: speakers, microphone: cleaned ?? microphone.words,
            origin: .init(build: build, farModel: far.model, microphoneModel: microphone.model,
                          splitting: divided.map { .done(diarizer: $0.diarizer) } ?? .nothingKept,
                          cleaning: cleaned == nil ? .nothingKept : .done)
        )])
        guard !Task.isCancelled else { return .stopped }
        do {
            try await publish(call, transcript)
            return .made
        } catch {
            return .failed(original: original.id, reason: String(describing: error))
        }
    }

    /// The production name port: NameCarry owns the mutual-majority rule.
    public static func carryNames(old: [OldSpeaker], new: [Speaker]) -> [Int: String] {
        NameCarry.names(
            old: old.map { .init(name: $0.name, ranges: $0.ranges.map { .init(start: $0.start, end: $0.end) }) },
            new: new.map { speaker in
                .init(id: speaker.id, ranges: speaker.words.map { .init(start: $0.time.start, end: $0.time.end) })
            }
        )
    }
}

/// Maps each track's serial fractions onto one monotonically increasing run fraction.
private actor HearingProgress {
    private let report: ReRecognition.Report
    private var last: Double = -1
    init(report: @escaping ReRecognition.Report) { self.report = report }

    func accept(_ fraction: Double, track: Int) async {
        guard fraction.isFinite else { return }
        let next = (Double(track) + min(1, max(0, fraction))) / 2
        guard next > last else { return }
        last = next
        await report(.hearing(next))
    }
}
