import CallFolderName
import CryptoKit
import Darwin
import Foundation

/// Recorded folders, identified by the timestamp prefix that survives a title change.
public struct Calls: Sendable {

    public enum Track: String, CaseIterable, Sendable {
        case microphone, call
    }

    public struct MissingTrack: Equatable, Sendable {
        public let id: String
        public let track: Track

        public init(id: String, track: Track) {
            self.id = id; self.track = track
        }
    }

    public struct Call: Equatable, Sendable {
        public let id: String
        public let title: String
        public let start: Date
        public let duration: TimeInterval?
        public let hasPreviousTranscript: Bool
        public let missingTracks: [MissingTrack]

        public init(id: String, title: String, start: Date, duration: TimeInterval?, hasPreviousTranscript: Bool = false,
                    missingTracks: [MissingTrack] = []) {
            self.id = id; self.title = title; self.start = start; self.duration = duration
            self.hasPreviousTranscript = hasPreviousTranscript
            self.missingTracks = missingTracks
        }
    }

    /// A call's saved transcript lines.
    public struct Text: Equatable, Sendable {
        public struct Line: Equatable, Sendable {
            /// Seconds from the call's start.
            public let start: TimeInterval
            public let words: String
            /// The speaker label written in the saved transcript.
            public let label: String
            public init(start: TimeInterval, words: String, label: String = "") {
                self.start = start; self.words = words; self.label = label
            }
        }
        public let transcript: [Line]
        /// SHA-256 of the saved bytes, in lowercase hex; nil when the file is absent.
        public let identity: String?
        public init(transcript: [Line], identity: String? = nil) {
            self.transcript = transcript; self.identity = identity
        }
    }

    public struct Count: Equatable, Sendable {
        public let calls: Int
        public let bytes: Int64
    }

    // Synchronous disk operations finish while holding this lock; no async work is awaited.
    private let operation = NSRecursiveLock()
    private let folder: URL
    private let timeZone: TimeZone
    private let duration: @Sendable (URL) throws -> TimeInterval
    private let disk: CallsDisk
    private let transcript: @Sendable (String) -> [Text.Line]

    /// Reads track durations with `duration`, a saved transcript's lines with
    /// `transcript`, and touches folders through `disk`. Listing performs
    /// blocking disk work.
    public init(folder: URL, timeZone: TimeZone,
                duration: @escaping @Sendable (URL) throws -> TimeInterval,
                transcript: @escaping @Sendable (String) -> [Text.Line],
                disk: CallsDisk) {
        self.folder = folder
        self.timeZone = timeZone
        self.duration = duration
        self.transcript = transcript
        self.disk = disk
    }

    private func children(_ url: URL) throws -> [URL] { try disk.children(url) }
    private func values(_ url: URL) throws -> URLResourceValues { try disk.values(url) }
    private func rename(_ source: URL, _ target: URL) throws { try disk.rename(source, target) }
    private func copy(_ source: URL, _ target: URL) throws { try disk.copy(source, target) }
    private func remove(_ url: URL) throws { try disk.remove(url) }
    private func trash(_ url: URL) throws { try disk.trash(url) }

    public func list() throws -> [Call] {
        operation.lock(); defer { operation.unlock() }
        return try visibleFolders(in: folder).map { url, name in
            let audio = try audio(in: url, name: name)
            return Call(id: name.id, title: name.title, start: name.start, duration: audio.duration,
                        hasPreviousTranscript: try exists(url.appendingPathComponent(Self.previousTranscript)),
                        missingTracks: audio.missing)
        }.sorted { $0.id > $1.id }
    }

    /// A call's longer track; a merged call's span, from its start to the latest end of
    /// any part, a merged part's parts included. None when a part's length is unknown.
    /// A folder with a track of its own is a recorded call, never searched for parts.
    private func audio(in url: URL, name: CallFolderName) throws -> (duration: TimeInterval?, missing: [MissingTrack]) {
        let tracks = Track.allCases.map { track in
            (track, try? values(url.appendingPathComponent(track.rawValue + ".caf")))
        }
        if tracks.contains(where: { $0.1 != nil }) {
            let missing = tracks.filter { $0.1 == nil || $0.1?.isSymbolicLink == true }
                .map { MissingTrack(id: name.id, track: $0.0) }
            let duration = tracks.compactMap { track, info -> TimeInterval? in
                guard let info, info.isSymbolicLink != true,
                      let length = try? self.duration(url.appendingPathComponent(track.rawValue + ".caf")),
                      length.isFinite, length >= 0 else { return nil }
                return length
            }.max()
            return (duration, missing)
        }
        let parts = try folders(in: url)
        let start = try recordedStart(in: url)
        guard !parts.isEmpty else { return (start.map { _ in 0 }, Track.allCases.map { MissingTrack(id: name.id, track: $0) }) }
        var end: TimeInterval = 0
        var knownLength = true
        var missing: [MissingTrack] = []
        for (part, partName) in parts.sorted(by: { $0.1.id < $1.1.id }) {
            let audio = try audio(in: part, name: partName)
            missing += audio.missing
            if let length = audio.duration {
                let partStart = try recordedStart(in: part) ?? partName.start
                end = max(end, partStart.timeIntervalSince(start ?? name.start) + length)
            } else { knownLength = false }
        }
        return (knownLength ? end : nil, missing)
    }

    /// A recorded leaf's tracks and timing, in chronological order for a kept call.
    public struct Original: Equatable, Sendable {
        public let id: String
        public let start: Date
        /// Whether the start was saved with this recording at finer than folder-minute precision.
        public let hasRecordedStart: Bool
        public let duration: TimeInterval
        public let callTrack: URL
        public let microphoneTrack: URL
    }

    public func originals(id: String) throws -> [Original] {
        operation.lock(); defer { operation.unlock() }
        let url = try location(id: id)
        guard let name = CallFolderName(url.lastPathComponent, timeZone: timeZone) else { throw POSIXError(.EINVAL) }
        return try originals(in: url, name: name).sorted { $0.start < $1.start }
    }

    private func originals(in url: URL, name: CallFolderName) throws -> [Original] {
        let hasTrack = Track.allCases.contains { (try? values(url.appendingPathComponent($0.rawValue + ".caf"))) != nil }
        if hasTrack {
            guard let length = try audio(in: url, name: name).duration else { throw CallsFailure.unknownLength(id: name.id) }
            let recorded = try recordedStart(in: url)
            return [.init(id: name.id, start: recorded ?? name.start, hasRecordedStart: recorded != nil, duration: length,
                          callTrack: url.appendingPathComponent("call.caf"), microphoneTrack: url.appendingPathComponent("microphone.caf"))]
        }
        let parts = try folders(in: url)
        if parts.isEmpty {
            guard try recordedStart(in: url) != nil else { throw CallsFailure.unknownLength(id: name.id) }
            return []
        }
        return try parts.flatMap { try originals(in: $0.0, name: $0.1) }
    }

    /// Resolves afresh, including when the title has changed in Finder.
    public func location(id: String) throws -> URL {
        operation.lock(); defer { operation.unlock() }
        return try location(id: id, in: folder)
    }

    private func location(id: String, in root: URL) throws -> URL {
        let matches = try visibleFolders(in: root).filter { $0.1.id == id }
        guard matches.count == 1, let match = matches.first else {
            throw matches.isEmpty ? CallsFailure.notFound(id: id) : CallsFailure.ambiguous(id: id)
        }
        return match.0
    }

    public func rename(id: String, title: String) throws {
        operation.lock(); defer { operation.unlock() }
        guard !title.contains("\0") else { throw CallsFailure.invalidTitle }
        let source = try location(id: id)
        let target = folder.appendingPathComponent(CallFolderName.name(id: id, title: title), isDirectory: true)
        guard source != target else { return }
        try rename(source, target)
    }

    public func delete(id: String) throws {
        operation.lock(); defer { operation.unlock() }
        let source = try location(id: id)
        do { try trash(source) }
        catch { throw CallsFailure.trashFailed(folder: source.lastPathComponent, reason: error.localizedDescription) }
    }

    /// Reads the call's transcript; a missing file reads as no lines.
    public func text(id: String) throws -> Text {
        operation.lock(); defer { operation.unlock() }
        let folder = try location(id: id)
        let data = try disk.read(folder.appendingPathComponent("transcript.md"))
        let identity = data.map(Self.transcriptIdentity)
        return Text(transcript: transcript(data.map { String(decoding: $0, as: UTF8.self) } ?? ""), identity: identity)
    }

    /// A call's transcript identity and whether it keeps a previous transcript, without
    /// parsing the transcript or listing the other calls.
    public struct TranscriptFacts: Equatable, Sendable {
        /// SHA-256 of the saved bytes, in lowercase hex; nil when the file is absent.
        public let identity: String?
        public let hasPrevious: Bool
        public init(identity: String?, hasPrevious: Bool) { self.identity = identity; self.hasPrevious = hasPrevious }
    }

    public func transcriptFacts(id: String) throws -> TranscriptFacts {
        operation.lock(); defer { operation.unlock() }
        let folder = try location(id: id)
        let data = try disk.read(folder.appendingPathComponent("transcript.md"))
        let identity = data.map(Self.transcriptIdentity)
        return .init(identity: identity, hasPrevious: try exists(folder.appendingPathComponent(Self.previousTranscript)))
    }

    public static func transcriptIdentity(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// A call's saved `transcript.md` as written, for a merge to read back.
    public func savedTranscript(id: String) throws -> Data {
        operation.lock(); defer { operation.unlock() }
        let url = try location(id: id).appendingPathComponent("transcript.md")
        do {
            guard let data = try disk.read(url) else { throw CocoaError(.fileReadNoSuchFile) }
            return data
        } catch { throw CallsFailure.unreadableTranscript(id: id, reason: error.localizedDescription) }
    }

    /// A merge part's saved bytes and the starts of its original call folders.
    public struct Part: Equatable, Sendable {
        public let transcript: Data
        public let originalStarts: [Date]
        public init(transcript: Data, originalStarts: [Date]) {
            self.transcript = transcript; self.originalStarts = originalStarts
        }
    }

    public func part(id: String) throws -> Part {
        operation.lock(); defer { operation.unlock() }
        let url = try location(id: id)
        guard let name = CallFolderName(url.lastPathComponent, timeZone: timeZone) else { throw POSIXError(.EINVAL) }
        return Part(transcript: try savedTranscript(id: id), originalStarts: try originalStarts(in: url, start: name.start).sorted())
    }

    private func originalStarts(in url: URL, start: Date) throws -> [Date] {
        let tracks = ["microphone.caf", "call.caf"].map { url.appendingPathComponent($0) }
        // As for duration, a folder with its own track is an original recording.
        let recorded = try recordedStart(in: url)
        guard !tracks.contains(where: { (try? values($0)) != nil }) else { return [recorded ?? start] }
        let parts = try folders(in: url)
        if parts.isEmpty { return recorded == nil ? [start] : [] }
        return try parts.flatMap { try originalStarts(in: $0.0, start: $0.1.start) }
    }

    public enum TranscriptFailure: Error, Equatable, Sendable {
        case noPrevious(id: String)
        case changeFailed(id: String, reason: String)
    }

    /// Writes a new transcript at the fresh URL supplied to `write`, then publishes
    /// it with the old current as previous. The writer must finish before returning.
    public func publishTranscript(id: String, write: (URL) throws -> Void) throws {
        operation.lock(); defer { operation.unlock() }
        try changeTranscripts(id: id, restoring: false) { _, target in try write(target) }
    }

    /// Swaps the saved bytes without interpreting either transcript's format.
    public func restorePreviousTranscript(id: String) throws {
        operation.lock(); defer { operation.unlock() }
        try changeTranscripts(id: id, restoring: true) { source, target in try copy(source, target) }
    }

    private func changeTranscripts(id: String, restoring: Bool, write: (URL, URL) throws -> Void) throws {
        let call = try location(id: id)
        let current = call.appendingPathComponent("transcript.md")
        let previous = call.appendingPathComponent(Self.previousTranscript)
        let hadPrevious = try exists(previous)
        if restoring, !hadPrevious { throw TranscriptFailure.noPrevious(id: id) }
        // Refuse before preparing anything if there is no current transcript to keep.
        _ = try savedTranscript(id: id)
        let prepared = try prepare(transcripts: true)
        do {
            let record = prepared.appendingPathComponent("transcripts", isDirectory: true)
            try disk.makeFolder(record)
            let before = record.appendingPathComponent(call.lastPathComponent, isDirectory: true)
            try disk.makeFolder(before)
            if hadPrevious { try disk.makeFolder(record.appendingPathComponent("had-previous", isDirectory: true)) }
            let after = prepared.appendingPathComponent("after", isDirectory: true)
            try disk.makeFolder(after)
            let newCurrent = after.appendingPathComponent("transcript.md")
            try write(previous, newCurrent)
            try copy(current, after.appendingPathComponent(Self.previousTranscript))
            // Cancellation is admitted until the first move; the pair then settles as one commit.
            try Task.checkCancellation()
            try rename(current, before.appendingPathComponent("transcript.md"))
            if hadPrevious { try rename(previous, before.appendingPathComponent(Self.previousTranscript)) }
            try rename(newCurrent, current)
            try rename(after.appendingPathComponent(Self.previousTranscript), previous)
            try settle(prepared)
        } catch {
            let failure = TranscriptFailure.changeFailed(id: id, reason: error.localizedDescription)
            if try exists(prepared.appendingPathComponent("transcripts")) {
                try putBackTranscripts(from: prepared)
            } else { try removeIfPresent(prepared) }
            if error is CancellationError { throw error }
            throw failure
        }
    }

    private func putBackTranscripts(from prepared: URL) throws {
        let record = prepared.appendingPathComponent("transcripts", isDirectory: true)
        let hadPrevious = try exists(record.appendingPathComponent("had-previous"))
        for (before, name) in try folders(in: record) {
            let call = try location(id: name.id)
            for file in ["transcript.md", Self.previousTranscript] {
                let saved = before.appendingPathComponent(file)
                let target = call.appendingPathComponent(file)
                if try exists(saved) {
                    try removeIfPresent(target)
                    // Keep backups until rollback is settled, so rollback itself can restart.
                    try copy(saved, target)
                } else if file == Self.previousTranscript, !hadPrevious,
                          try exists(before.appendingPathComponent("transcript.md")) {
                    try removeIfPresent(target)
                }
            }
        }
        try settle(prepared)
    }

    /// Merges calls into one call folder named as the earliest part, holding each part's
    /// folder whole and what `write` puts in the folder it is given, beside the parts'
    /// folders in the order of `ids`, before any part moves.
    /// The folder is prepared under a name no listing shows, then renamed into place.
    /// Returns the merged call's id, the earliest part's. Every part needs a known
    /// length, checked before anything moves. A failure moves every part back out and
    /// removes the prepared folder, so a merge is whole or not at all.
    @discardableResult
    public func merge(ids: [String], write: (_ prepared: URL, _ parts: [URL]) throws -> Void) throws -> String {
        operation.lock(); defer { operation.unlock() }
        guard ids.count > 1 else { throw POSIXError(.EINVAL) }
        let parts = try ids.map { try location(id: $0) }
        let starts = try zip(ids, parts).map { id, part -> Date in
            guard let name = CallFolderName(part.lastPathComponent, timeZone: timeZone),
                  try audio(in: part, name: name).duration != nil else { throw CallsFailure.unknownLength(id: id) }
            return try recordedStart(in: part) ?? name.start
        }
        let earliest = starts.indices.min { (starts[$0], ids[$0]) < (starts[$1], ids[$1]) }!
        let prepared = try prepare()
        var step = CallsFailure.MergeStep.writingTranscript
        do {
            if let start = try recordedStart(in: parts[earliest]) { try saveStart(start, in: prepared) }
            try write(prepared, parts)
            for part in parts {
                step = .movingPart(folder: part.lastPathComponent)
                try rename(part, prepared.appendingPathComponent(part.lastPathComponent, isDirectory: true))
            }
            step = .publishing
            try rename(prepared, folder.appendingPathComponent(parts[earliest].lastPathComponent, isDirectory: true))
            return ids[earliest]
        } catch {
            let failure = CallsFailure.mergeFailed(step: step, reason: error.localizedDescription)
            try putBack(parts, from: prepared)
            throw failure
        }
    }

    /// Recovers interrupted transcript changes, merges and splits before the first listing.
    /// For a split, registration runs after publication and may be retried on recovery.
    public func recoverInterruptedMerges(registerSplit: (SplitReplacement) throws -> Void = { _ in }) throws {
        operation.lock(); defer { operation.unlock() }
        for prepared in try children(folder) {
            if prepared.lastPathComponent.hasPrefix(Self.settledPrefix) {
                try remove(prepared)
                continue
            }
            if prepared.lastPathComponent.hasPrefix(Self.splitPrefix) {
                if try isDirectory(prepared) { try recoverSplit(in: prepared, register: registerSplit) }
                continue
            }
            guard prepared.lastPathComponent.hasPrefix(Self.mergePrefix) else { continue }
            if prepared.lastPathComponent.hasPrefix(Self.transcriptPrefix) {
                if try exists(prepared.appendingPathComponent("transcripts")) {
                    try putBackTranscripts(from: prepared)
                } else { try remove(prepared) }
                continue
            }
            let parts = try folders(in: prepared).map { folder.appendingPathComponent($0.0.lastPathComponent, isDirectory: true) }
            try putBack(parts, from: prepared)
        }
    }

    private static let mergePrefix = ".audelin-merge-"
    private static let transcriptPrefix = mergePrefix + "transcripts-"
    private static let settledPrefix = ".audelin-settled-"
    private static let previousTranscript = "transcript-previous.md"

    private func prepare(transcripts: Bool = false) throws -> URL {
        let prefix = transcripts ? Self.transcriptPrefix : Self.mergePrefix
        let prepared = folder.appendingPathComponent(prefix + UUID().uuidString, isDirectory: true)
        try disk.makeFolder(prepared)
        return prepared
    }

    /// Retires the recovery record atomically before deleting any of its backups.
    private func settle(_ prepared: URL) throws {
        let settled = folder.appendingPathComponent(Self.settledPrefix + UUID().uuidString, isDirectory: true)
        try rename(prepared, settled)
        // Publication is committed; leftover backups can be removed at the next start.
        try? remove(settled)
    }

    /// Moves every part found in `prepared` back to its place and removes `prepared`.
    private func putBack(_ parts: [URL], from prepared: URL) throws {
        for part in parts {
            let inside = prepared.appendingPathComponent(part.lastPathComponent, isDirectory: true)
            if try exists(inside) { try rename(inside, part) }
        }
        try removeIfPresent(prepared)
    }

    public func bytes(id: String) throws -> Int64 {
        operation.lock(); defer { operation.unlock() }
        return try size(location(id: id))
    }

    /// The callback durably records ownership before a destructive disk step.
    @discardableResult
    public func move(id: String, to destination: URL,
                     record: (Move) throws -> Void = { _ in }) throws -> Int64 {
        operation.lock(); defer { operation.unlock() }
        let source = try location(id: id)
        let destination = destination.resolvingSymlinksInPath().standardizedFileURL
        let sourcePath = source.resolvingSymlinksInPath().standardizedFileURL.path
        guard destination.isFileURL, destination.path != sourcePath,
              !destination.path.hasPrefix(sourcePath + "/") else { throw POSIXError(.EINVAL) }
        let target = destination.appendingPathComponent(source.lastPathComponent, isDirectory: true)
        guard try !children(destination).contains(where: {
            $0.lastPathComponent == target.lastPathComponent || CallFolderName($0.lastPathComponent, timeZone: timeZone)?.id == id
        }) else { throw CocoaError(.fileWriteFileExists) }
        var move = Move(source: source, target: target,
                        temporary: destination.appendingPathComponent(".audelin-move-" + UUID().uuidString, isDirectory: true))
        try record(move)
        do {
            let original = try manifest(source)
            try copy(source, move.temporary)
            guard try manifest(move.temporary) == original, try manifest(source) == original else {
                throw CallsFailure.sizeMismatch
            }
            move.phase = .publishing
            try record(move)
            try rename(move.temporary, target)
            move.phase = .removingSource
            try record(move)
            // Retirement keeps a partially deleted source out of call lookup.
            // The verified destination can rebuild it if deletion fails.
            try rename(source, move.retired)
            do { try removeIfPresent(move.retired) }
            catch {
                move.phase = .restoringSource
                try record(move)
                throw error
            }
            move.phase = .destination
            // Source deletion completed; the durable removingSource record can
            // finish recovery if only this final journal write fails.
            try? record(move)
            return original.values.reduce(0) { $0 + max(0, $1) }
        } catch {
            let failure = error
            // A failed journal write leaves the last durable phase sufficient for recovery.
            if move.phase == .removingSource { move.phase = .publishing }
            _ = try recover(move, record: record)
            throw failure
        }
    }

    public struct Move: Codable, Equatable, Sendable {
        public enum Phase: String, Codable, Sendable {
            case copying, publishing, removingSource, restoringSource, removingCopy, source, destination
        }
        public var source: URL
        public var target: URL
        public var temporary: URL
        public var phase: Phase
        public init(source: URL, target: URL, temporary: URL, phase: Phase = .copying) {
            self.source = source; self.target = target; self.temporary = temporary; self.phase = phase
        }
        public var owner: URL {
            switch phase {
            case .removingSource, .restoringSource, .destination: target
            default: source
            }
        }
        public var retired: URL {
            source.deletingLastPathComponent().appendingPathComponent(temporary.lastPathComponent + "-source", isDirectory: true)
        }
    }

    /// Recovery follows the recorded owner, including a title changed in Finder.
    @discardableResult
    public func recover(_ given: Move, record: (Move) throws -> Void) throws -> Move {
        operation.lock(); defer { operation.unlock() }
        var move = given
        if ![.source, .destination].contains(move.phase) {
            guard let name = CallFolderName(move.owner.lastPathComponent, timeZone: timeZone) else { throw POSIXError(.EINVAL) }
            let owner = try location(id: name.id, in: move.owner.deletingLastPathComponent())
            if move.phase == .removingSource || move.phase == .restoringSource {
                if owner.lastPathComponent != move.target.lastPathComponent, move.phase == .restoringSource {
                    // A rename of the owning copy must survive recovery; finish its move.
                    move.phase = .removingSource
                }
                // Keep the recorded root spelling consistent with the temporary
                // path, even when a directory listing returns a different alias.
                if owner.lastPathComponent != move.target.lastPathComponent {
                    move.target = move.target.deletingLastPathComponent().appendingPathComponent(owner.lastPathComponent, isDirectory: true)
                }
            } else if owner.lastPathComponent != move.source.lastPathComponent {
                move.source = move.source.deletingLastPathComponent().appendingPathComponent(owner.lastPathComponent, isDirectory: true)
            }
            if move != given { try record(move) }
        }
        switch move.phase {
        case .copying:
            try removeIfPresent(move.temporary)
            move.phase = .source
            try record(move)
        case .publishing:
            // Exclusive rename consumes the temporary name only when publication succeeds.
            move.phase = try exists(move.temporary) ? .copying : .removingCopy
            try record(move)
            return try recover(move, record: record)
        case .removingSource:
            if try exists(move.source) { try rename(move.source, move.retired) }
            do { try removeIfPresent(move.retired) }
            catch {
                let failure = error
                move.phase = .restoringSource
                try record(move)
                _ = try recover(move, record: record)
                throw failure
            }
            move.phase = .destination
            try record(move)
        case .restoringSource:
            try restoreCopy(from: move.target, to: move.source)
            guard try manifest(move.source) == manifest(move.target) else { throw CocoaError(.fileReadCorruptFile) }
            move.phase = .removingCopy
            try record(move)
            return try recover(move, record: record)
        case .removingCopy:
            try removeIfPresent(move.target)
            try removeIfPresent(move.retired)
            move.phase = .source
            try record(move)
        case .source, .destination: break
        }
        return move
    }

    private func exists(_ url: URL) throws -> Bool {
        // Directory entries are fresh; URL resource values may cache a removed entry.
        try children(url.deletingLastPathComponent()).contains { $0.lastPathComponent == url.lastPathComponent }
    }
    private func removeIfPresent(_ url: URL) throws {
        if try exists(url) { try remove(url) }
    }

    private func manifest(_ root: URL) throws -> [String: Int64] {
        var result: [String: Int64] = [:]
        func visit(_ url: URL, _ path: String) throws {
            let info = try values(url)
            if info.isSymbolicLink == true { result[path] = -2 }
            else if info.isDirectory == true {
                result[path] = -1
                for child in try children(url) { try visit(child, path + "/" + child.lastPathComponent) }
            } else {
                guard let size = info.fileSize else { throw CocoaError(.fileReadUnknown) }
                result[path] = Int64(size)
            }
        }
        try visit(root, "")
        return result
    }

    private func restoreCopy(from copyURL: URL, to source: URL) throws {
        if try !exists(source) { try copy(copyURL, source); return }
        let saved = try values(copyURL), current = try values(source)
        if saved.isDirectory == true, saved.isSymbolicLink != true,
           current.isDirectory == true, current.isSymbolicLink != true {
            let savedChildren = try children(copyURL)
            let names = Set(savedChildren.map(\.lastPathComponent))
            for child in try children(source) where !names.contains(child.lastPathComponent) { try remove(child) }
            for child in savedChildren {
                try restoreCopy(from: child, to: source.appendingPathComponent(child.lastPathComponent))
            }
        } else {
            // Notes can change on the owning copy while restoration is pending.
            try remove(source)
            try copy(copyURL, source)
        }
    }

    public func count() throws -> Count {
        operation.lock(); defer { operation.unlock() }
        let calls = try visibleFolders(in: folder)
        return Count(calls: calls.count, bytes: try calls.reduce(0) { try $0 + size($1.0) })
    }

    private func size(_ url: URL) throws -> Int64 {
        let info = try values(url)
        if info.isSymbolicLink == true { return 0 }
        if info.isDirectory == true { return try children(url).reduce(0) { try $0 + size($1) } }
        return Int64(info.fileSize ?? 0)
    }

    private func folders(in root: URL) throws -> [(URL, CallFolderName)] {
        guard root.isFileURL else { throw POSIXError(.EINVAL) }
        return try callFolders(among: children(root))
    }

    private func callFolders(among entries: [URL]) throws -> [(URL, CallFolderName)] {
        try entries.compactMap { url in
            guard let name = CallFolderName(url.lastPathComponent, timeZone: timeZone) else { return nil }
            guard try isDirectory(url) else { return nil }
            return (url, name)
        }
    }

    private func isDirectory(_ url: URL) throws -> Bool {
        let info = try values(url)
        return info.isDirectory == true && info.isSymbolicLink != true
    }

    /// Extracts only names the call-folder writer can make, with a valid local timestamp.
    public static func id(in name: String, timeZone: TimeZone) -> String? {
        CallFolderName(name, timeZone: timeZone)?.id
    }

}

extension Calls {
    public struct SplitSource: Sendable {
        public let folder: URL
        public let folderStart: Date
        public let transcript: Data
        public let recordings: [Original]
    }

    public struct SplitTranscript: Equatable, Sendable {
        public let bytes: Data
        public let identity: String
        public let folderStart: Date
    }

    public func splitTranscript(id: String) throws -> SplitTranscript {
        operation.lock(); defer { operation.unlock() }
        let folder = try location(id: id)
        let name = try splitName(folder.lastPathComponent)
        let bytes = try savedTranscript(id: id)
        return .init(bytes: bytes, identity: Self.transcriptIdentity(bytes), folderStart: name.start)
    }

    public enum SplitSide: String, Codable, Sendable {
        case first, second
    }

    /// Each recorded leaf is placed once or cut once. The folder identifies the leaf even
    /// when recordings from different levels of a merge share a minute and id.
    public enum SplitRecording: Sendable {
        case whole(folder: URL, side: SplitSide)
        case cut(folder: URL, offset: TimeInterval)
    }

    public struct SplitPlan {
        public let firstStart: Date
        public let secondStart: Date
        public let recordings: [SplitRecording]
        public let write: (_ first: URL, _ second: URL) throws -> Void

        public init(firstStart: Date, secondStart: Date, recordings: [SplitRecording],
                    write: @escaping (_ first: URL, _ second: URL) throws -> Void) {
            self.firstStart = firstStart; self.secondStart = secondStart
            self.recordings = recordings; self.write = write
        }
    }

    public struct SplitReplacement: Equatable, Sendable {
        public let first: String
        public let second: String
    }

    public enum SplitFailure: Error, Equatable, Sendable {
        case expiredTranscript(id: String)
        case invalidPlan
        case occupiedID(String)
        case recoveryRequired(reason: String)
        case committed(SplitReplacement, reason: String)
    }

    /// Stages the caller's files and any cut tracks, then relocates whole recordings.
    /// The caller's synchronous callbacks must finish their writes before returning.
    /// Registration runs with both parts published and must be safe to repeat.
    public func split(id: String, expectedTranscript: String, firstTitle: String, secondTitle: String,
                      reservedIDs: Set<String> = [],
                      plan: (SplitSource) throws -> SplitPlan,
                      cut: (_ offset: TimeInterval, _ source: URL, _ first: URL, _ second: URL) throws -> Void,
                      register: (SplitReplacement) throws -> Void = { _ in }) throws -> SplitReplacement {
        operation.lock(); defer { operation.unlock() }
        guard !firstTitle.contains("\0"), !secondTitle.contains("\0") else { throw CallsFailure.invalidTitle }
        try Task.checkCancellation()
        let original = try location(id: id)
        let name = try splitName(original.lastPathComponent)
        let transcriptURL = original.appendingPathComponent("transcript.md")
        guard let transcript = try disk.read(transcriptURL), Self.transcriptIdentity(transcript) == expectedTranscript else {
            throw SplitFailure.expiredTranscript(id: id)
        }
        let leaves = try originals(in: original, name: name).sorted { ($0.start, $0.callTrack.path) < ($1.start, $1.callTrack.path) }
        let plan = try plan(.init(folder: original, folderStart: name.start, transcript: transcript, recordings: leaves))
        guard plan.firstStart.timeIntervalSinceReferenceDate.isFinite,
              plan.secondStart.timeIntervalSinceReferenceDate.isFinite,
              plan.firstStart < plan.secondStart else { throw SplitFailure.invalidPlan }
        let recordings = Dictionary(uniqueKeysWithValues: leaves.map { ($0.callTrack.deletingLastPathComponent().path, $0) })
        try validate(plan.recordings, against: recordings)

        var taken = try occupiedIDs(in: folder).union(reservedIDs)
        let second = try allocateID(at: plan.secondStart, taken: &taken)
        let prepared = folder.appendingPathComponent(Self.splitPrefix + UUID().uuidString, isDirectory: true)
        var record = SplitRecord(original: original.lastPathComponent,
                                 first: CallFolderName.name(id: id, title: firstTitle),
                                 second: CallFolderName.name(id: second, title: secondTitle), relocations: [])
        try disk.makeFolder(prepared)
        do {
            try validateSplitNames([record.first, record.second], in: prepared)
            let first = staged(.first, in: prepared), second = staged(.second, in: prepared)
            try disk.makeFolder(first)
            try disk.makeFolder(second)
            try saveStart(plan.firstStart, in: first)
            try saveStart(plan.secondStart, in: second)
            try plan.write(first, second)
            record.relocations = try stageRecordings(plan.recordings, leaves: recordings, original: original,
                                                      prepared: prepared, cut: cut)
            try disk.write(JSONEncoder().encode(record), prepared.appendingPathComponent(Self.splitRecord))

            // No source moves until the caller's files and the undo record are in place.
            try Task.checkCancellation()
            guard try disk.read(transcriptURL) == transcript else { throw SplitFailure.expiredTranscript(id: id) }
            try rename(original, backup(in: prepared))
            for move in record.relocations { try rename(source(of: move, in: prepared), target(of: move, in: prepared)) }
            let occupied = try occupiedIDs(in: folder)
            for id in [id, try splitName(record.second).id] where occupied.contains(id) {
                throw SplitFailure.occupiedID(id)
            }
            try Task.checkCancellation()
            // The exclusive creation is the commit decision. Recovery only publishes after it.
            try disk.makeFolder(prepared.appendingPathComponent(Self.splitCommit, isDirectory: true))
        } catch {
            do { try rollbackSplit(in: prepared, record: record) }
            catch { throw SplitFailure.recoveryRequired(reason: error.localizedDescription) }
            throw error
        }
        return try publishSplit(in: prepared, record: record, register: register)
    }

    /// Test the final components on the same filesystem without claiming a visible call name.
    private func validateSplitNames(_ names: [String], in prepared: URL) throws {
        for name in names {
            let probe = prepared.appendingPathComponent(name, isDirectory: true)
            do { try disk.makeFolder(probe) }
            catch {
                let failure = error as NSError
                let underlying = failure.userInfo[NSUnderlyingErrorKey] as? NSError
                if failure.domain == NSPOSIXErrorDomain && failure.code == Int(ENAMETOOLONG) ||
                    underlying?.domain == NSPOSIXErrorDomain && underlying?.code == Int(ENAMETOOLONG) ||
                    failure.domain == NSCocoaErrorDomain && failure.code == CocoaError.fileWriteInvalidFileName.rawValue {
                    throw CallsFailure.invalidTitle
                }
                throw error
            }
            try remove(probe)
        }
    }

    private static let splitPrefix = ".audelin-split-"
    private static let splitRecord = "split.json"
    private static let splitCommit = "committed"
    // A folder name carries only minutes. Keep the audio clock with each part
    // and each cut leaf, including when they later become nested in a merge.
    private static let startFile = ".audelin-start"

    private struct SplitRecord: Codable {
        struct Relocation: Codable {
            let source: [String]
            let side: SplitSide
            let target: String
        }
        let original: String
        let first: String
        let second: String
        var relocations: [Relocation]
    }

    private func recordedStart(in url: URL) throws -> Date? {
        guard let bytes = try disk.read(url.appendingPathComponent(Self.startFile)) else { return nil }
        return try JSONDecoder().decode(Date.self, from: bytes)
    }

    private func saveStart(_ start: Date, in url: URL) throws {
        try disk.write(JSONEncoder().encode(start), url.appendingPathComponent(Self.startFile))
    }

    private func occupiedIDs(in root: URL) throws -> Set<String> {
        Set(try children(root).compactMap { CallFolderName($0.lastPathComponent, timeZone: timeZone)?.id })
    }

    private func allocateID(at start: Date, taken: inout Set<String>) throws -> String {
        let base = CallFolderName.id(at: start, timeZone: timeZone)
        _ = try splitName(base)
        var number = 1
        var id = base
        while !taken.insert(id).inserted {
            number += 1
            id = "\(base)-\(number)"
        }
        return id
    }

    private func validate(_ placements: [SplitRecording], against leaves: [String: Original]) throws {
        var remaining = leaves
        for placement in placements {
            switch placement {
            case let .whole(folder, _):
                guard remaining.removeValue(forKey: folder.path) != nil else { throw SplitFailure.invalidPlan }
            case let .cut(folder, offset):
                guard let recording = remaining.removeValue(forKey: folder.path),
                      offset > 0, offset < recording.duration else { throw SplitFailure.invalidPlan }
            }
        }
        guard remaining.isEmpty else { throw SplitFailure.invalidPlan }
    }

    private func stageRecordings(_ placements: [SplitRecording], leaves: [String: Original], original: URL, prepared: URL,
                                 cut: (TimeInterval, URL, URL, URL) throws -> Void) throws -> [SplitRecord.Relocation] {
        var firstIDs = try occupiedIDs(in: staged(.first, in: prepared))
        var secondIDs = try occupiedIDs(in: staged(.second, in: prepared))
        var relocations: [SplitRecord.Relocation] = []
        for placement in placements {
            try Task.checkCancellation()
            switch placement {
            case let .whole(folder, side):
                guard let leaf = leaves[folder.path] else { throw SplitFailure.invalidPlan }
                let name = try splitName(folder.lastPathComponent)
                let id: String
                if side == .first { id = try reserveLeaf(name, start: leaf.start, taken: &firstIDs) }
                else { id = try reserveLeaf(name, start: leaf.start, taken: &secondIDs) }
                let target = CallFolderName.name(id: id, title: name.title)
                relocations.append(.init(source: Array(folder.pathComponents.dropFirst(original.pathComponents.count)),
                                         side: side, target: target))
            case let .cut(folder, offset):
                guard let leaf = leaves[folder.path] else { throw SplitFailure.invalidPlan }
                let title = try splitName(folder.lastPathComponent).title
                let after = leaf.start.addingTimeInterval(offset)
                let first = try stageLeaf(at: leaf.start, title: title, in: staged(.first, in: prepared), taken: &firstIDs)
                let second = try stageLeaf(at: after, title: title, in: staged(.second, in: prepared), taken: &secondIDs)
                let sourceNames = Set(try children(folder).map(\.lastPathComponent))
                for source in [leaf.callTrack, leaf.microphoneTrack] where sourceNames.contains(source.lastPathComponent) {
                    guard try values(source).isSymbolicLink != true else { continue }
                    try cut(offset, source, first.appendingPathComponent(source.lastPathComponent),
                            second.appendingPathComponent(source.lastPathComponent))
                }
            }
        }
        return relocations
    }

    private func reserveLeaf(_ name: CallFolderName, start: Date, taken: inout Set<String>) throws -> String {
        if taken.insert(name.id).inserted { return name.id }
        return try allocateID(at: start, taken: &taken)
    }

    private func stageLeaf(at start: Date, title: String, in part: URL, taken: inout Set<String>) throws -> URL {
        let id = try allocateID(at: start, taken: &taken)
        let leaf = part.appendingPathComponent(CallFolderName.name(id: id, title: title), isDirectory: true)
        try disk.makeFolder(leaf)
        try saveStart(start, in: leaf)
        return leaf
    }

    private func staged(_ side: SplitSide, in prepared: URL) -> URL {
        prepared.appendingPathComponent(side.rawValue, isDirectory: true)
    }

    private func backup(in prepared: URL) -> URL { prepared.appendingPathComponent("original", isDirectory: true) }

    private func source(of move: SplitRecord.Relocation, in prepared: URL) -> URL {
        move.source.reduce(backup(in: prepared)) { $0.appendingPathComponent($1, isDirectory: true) }
    }

    private func target(of move: SplitRecord.Relocation, in prepared: URL) -> URL {
        staged(move.side, in: prepared).appendingPathComponent(move.target, isDirectory: true)
    }

    private func rollbackSplit(in prepared: URL, record: SplitRecord) throws {
        for move in record.relocations {
            let target = target(of: move, in: prepared)
            if try exists(target) { try rename(target, source(of: move, in: prepared)) }
        }
        let backup = backup(in: prepared)
        if try exists(backup) { try rename(backup, folder.appendingPathComponent(record.original, isDirectory: true)) }
        try settle(prepared)
    }

    private func publishSplit(in prepared: URL, record: SplitRecord,
                              register: (SplitReplacement) throws -> Void) throws -> SplitReplacement {
        let replacement = try replacement(from: record)
        do {
            for (side, name, id) in [(SplitSide.first, record.first, replacement.first), (.second, record.second, replacement.second)] {
                let source = staged(side, in: prepared)
                if try exists(source) {
                    guard try !occupiedIDs(in: folder).contains(id) else { throw SplitFailure.occupiedID(id) }
                    try rename(source, folder.appendingPathComponent(name, isDirectory: true))
                } else {
                    // The consumed staging name tells us this part was published. Its title can change in Finder.
                    guard try folders(in: folder).filter({ $0.1.id == id }).count == 1 else {
                        throw CocoaError(.fileReadCorruptFile)
                    }
                }
            }
            try register(replacement)
            try settle(prepared)
            return replacement
        } catch { throw SplitFailure.committed(replacement, reason: error.localizedDescription) }
    }

    private func recoverSplit(in prepared: URL, register: (SplitReplacement) throws -> Void) throws {
        guard let record = try loadSplit(in: prepared) else { try settle(prepared); return }
        if try exists(prepared.appendingPathComponent(Self.splitCommit)) {
            _ = try publishSplit(in: prepared, record: record, register: register)
        } else {
            try rollbackSplit(in: prepared, record: record)
        }
    }

    private func loadSplit(in prepared: URL) throws -> SplitRecord? {
        guard let bytes = try disk.read(prepared.appendingPathComponent(Self.splitRecord)) else {
            guard try !exists(backup(in: prepared)), try !exists(prepared.appendingPathComponent(Self.splitCommit)) else {
                throw CocoaError(.fileReadCorruptFile)
            }
            return nil
        }
        let record = try JSONDecoder().decode(SplitRecord.self, from: bytes)
        let parts = try replacement(from: record)
        guard try splitName(record.original).id == parts.first, parts.first != parts.second else {
            throw CocoaError(.fileReadCorruptFile)
        }
        for move in record.relocations {
            _ = try splitName(move.target)
            for component in move.source { _ = try splitName(component) }
        }
        return record
    }

    private func replacement(from record: SplitRecord) throws -> SplitReplacement {
        try .init(first: splitName(record.first).id, second: splitName(record.second).id)
    }

    private func splitName(_ component: String) throws -> CallFolderName {
        guard !component.contains("/"), !component.contains("\0"),
              let name = CallFolderName(component, timeZone: timeZone) else { throw CocoaError(.fileReadCorruptFile) }
        return name
    }

    /// An interrupted split still owns its destination IDs.
    public func requireRecoveredSplits() throws {
        operation.lock(); defer { operation.unlock() }
        try requireRecoveredSplits(among: children(folder))
    }

    private func visibleFolders(in root: URL) throws -> [(URL, CallFolderName)] {
        guard root.isFileURL else { throw POSIXError(.EINVAL) }
        let entries = try children(root)
        try requireRecoveredSplits(among: entries)
        return try callFolders(among: entries)
    }

    private func requireRecoveredSplits(among entries: [URL]) throws {
        for prepared in entries where prepared.lastPathComponent.hasPrefix(Self.splitPrefix) {
            guard try isDirectory(prepared), let record = try loadSplit(in: prepared) else { continue }
            let reason = "A split must finish recovery before the calls folder can be read."
            if try exists(prepared.appendingPathComponent(Self.splitCommit)) {
                throw try SplitFailure.committed(replacement(from: record), reason: reason)
            }
            throw SplitFailure.recoveryRequired(reason: reason)
        }
    }
}

/// What `Calls` refuses or could not finish, with the data a sentence needs; the UI writes the sentence.
public enum CallsFailure: Error, Equatable, Sendable {
    /// No call folder has this id any more.
    case notFound(id: String)
    /// More than one call folder has this id.
    case ambiguous(id: String)
    /// The title cannot be used in a folder name.
    case invalidTitle
    /// Removing the folder stopped part way; some of it may remain.
    case trashFailed(folder: String, reason: String)
    /// The copy's file sizes differ from the source's.
    case sizeMismatch
    /// A call to merge has no known length, so its place in the merged call is unknown.
    case unknownLength(id: String)
    /// A call's saved transcript cannot be read.
    case unreadableTranscript(id: String, reason: String)
    /// A merge stopped at `step`; its parts were put back.
    case mergeFailed(step: MergeStep, reason: String)

    public enum MergeStep: Equatable, Sendable {
        case writingTranscript
        case movingPart(folder: String)
        case publishing
    }
}

/// The file system as `Calls` lists, renames, copies, trashes and removes folders.
public struct CallsDisk: Sendable {

    var children: @Sendable (URL) throws -> [URL]
    var values: @Sendable (URL) throws -> URLResourceValues
    var copy: @Sendable (URL, URL) throws -> Void
    public var rename: @Sendable (URL, URL) throws -> Void
    /// Moves a folder to the Trash of its volume, whole or not at all.
    public var trash: @Sendable (URL) throws -> Void
    var remove: @Sendable (URL) throws -> Void
    /// Creates an empty folder, failing when anything has its name.
    var makeFolder: @Sendable (URL) throws -> Void = { try FileManager.default.createDirectory(at: $0, withIntermediateDirectories: false) }
    /// A file's bytes, or nil when it does not exist.
    var read: @Sendable (URL) throws -> Data? = { url in
        do { return try Data(contentsOf: url) }
        catch CocoaError.fileReadNoSuchFile { return nil }
    }
    var write: @Sendable (Data, URL) throws -> Void = { try $0.write(to: $1, options: .atomic) }

    /// The local file system; a rename never replaces an existing folder.
    public static let system = CallsDisk(
        children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
        values: { try $0.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]) },
        copy: { try FileManager.default.copyItem(at: $0, to: $1) },
        rename: { source, target in
            guard renamex_np(source.path, target.path, UInt32(RENAME_EXCL)) == 0 else {
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
        },
        trash: { try FileManager.default.trashItem(at: $0, resultingItemURL: nil) },
        remove: { try FileManager.default.removeItem(at: $0) }
    )
}
