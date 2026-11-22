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
    /// never archived original calls. Publishing may throw CancellationError during preparation;
    /// once moving the current/previous pair begins it must settle that commit even if cancelled.
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

    /// Cancellation stops before the pair starts moving, after the port in flight returns.
    /// Originals are a nonempty, flat list ordered by start, including merges of merges.
    /// Publish owns joining and rendering, so this component never handles transcript format.
    public func run(call: String, originals: [OriginalCall], build: Build, report: @escaping Report) async -> Outcome {
        guard !originals.isEmpty else {
            return .failed(original: nil, reason: "At least one original call is required.")
        }
        await report(.preparing)
        guard !Task.isCancelled else { return .stopped }
        let progress = HearingProgress(tracks: originals.count * 2, report: report)
        var heard: [(original: OriginalCall, far: Heard, microphone: Heard)] = []
        for (index, original) in originals.enumerated() {
            do {
                let far = try await hear(original.farTrack) { await progress.accept($0, track: index * 2) }
                guard !Task.isCancelled else { return .stopped }
                await progress.accept(1, track: index * 2)
                guard !Task.isCancelled else { return .stopped }
                let microphone = try await hear(original.microphoneTrack) {
                    await progress.accept($0, track: index * 2 + 1)
                }
                guard !Task.isCancelled else { return .stopped }
                await progress.accept(1, track: index * 2 + 1)
                guard !Task.isCancelled else { return .stopped }
                heard.append((original, far, microphone))
            } catch {
                return Task.isCancelled ? .stopped : .failed(original: original.id, reason: String(describing: error))
            }
        }

        await report(.finishing)
        guard !Task.isCancelled else { return .stopped }
        var finished: [FinishedCall] = []
        for (original, far, microphone) in heard {
            let divided = try? await split(original, far.words)
            guard !Task.isCancelled else { return .stopped }
            let speakers = divided?.speakers ?? [.init(id: 0, name: nil, words: far.words)]
            let cleaned = try? await clean(original, microphone.words, speakers)
            guard !Task.isCancelled else { return .stopped }
            finished.append(.init(
                original: original, far: speakers, microphone: cleaned ?? microphone.words,
                origin: .init(build: build, farModel: far.model, microphoneModel: microphone.model,
                              splitting: divided.map { .done(diarizer: $0.diarizer) } ?? .nothingKept,
                              cleaning: cleaned == nil ? .nothingKept : .done)
            ))
        }
        let old = (try? await readOld(call)) ?? []
        guard !Task.isCancelled else { return .stopped }
        let named = finished.map { part in
            let clipped = old.map { speaker in
                OldSpeaker(name: speaker.name, ranges: speaker.ranges.compactMap { range in
                    let start = max(0, range.start - part.original.start)
                    let end = min(part.original.duration, range.end - part.original.start)
                    return end > start ? TimeRange(start: start, end: end) : nil
                })
            }
            var speakers = part.far
            let carried = names(clipped, speakers)
            for index in speakers.indices { speakers[index].name = carried[speakers[index].id] }
            return FinishedCall(original: part.original, far: speakers, microphone: part.microphone, origin: part.origin)
        }
        let transcript = Transcript(originals: named, merger: originals.count > 1 ? build : nil)
        guard !Task.isCancelled else { return .stopped }
        do {
            try await publish(call, transcript)
            return .made
        } catch {
            if error is CancellationError { return .stopped }
            return .failed(original: originals.count == 1 ? originals[0].id : nil, reason: String(describing: error))
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
    private let tracks: Int
    private var last: Double = -1
    init(tracks: Int, report: @escaping ReRecognition.Report) { self.tracks = tracks; self.report = report }

    func accept(_ fraction: Double, track: Int) async {
        guard fraction.isFinite else { return }
        let next = (Double(track) + min(1, max(0, fraction))) / Double(tracks)
        guard next > last else { return }
        last = next
        await report(.hearing(next))
    }
}
