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
        return try folders(in: folder).map { url, name in
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
        guard !parts.isEmpty else { return (nil, Track.allCases.map { MissingTrack(id: name.id, track: $0) }) }
        var end: TimeInterval = 0
        var knownLength = true
        var missing: [MissingTrack] = []
        for (part, partName) in parts.sorted(by: { $0.1.id < $1.1.id }) {
            let audio = try audio(in: part, name: partName)
            missing += audio.missing
            if let length = audio.duration {
                end = max(end, partName.start.timeIntervalSince(name.start) + length)
            } else { knownLength = false }
        }
        return (knownLength ? end : nil, missing)
    }

    /// A recorded leaf's tracks and timing, in chronological order for a kept call.
    public struct Original: Equatable, Sendable {
        public let id: String
        public let start: Date
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
            return [.init(id: name.id, start: name.start, duration: length,
                          callTrack: url.appendingPathComponent("call.caf"), microphoneTrack: url.appendingPathComponent("microphone.caf"))]
        }
        let parts = try folders(in: url)
        guard !parts.isEmpty else { throw CallsFailure.unknownLength(id: name.id) }
        return try parts.flatMap { try originals(in: $0.0, name: $0.1) }
    }

    /// Resolves afresh, including when the title has changed in Finder.
    public func location(id: String) throws -> URL {
        operation.lock(); defer { operation.unlock() }
        return try location(id: id, in: folder)
    }

    private func location(id: String, in root: URL) throws -> URL {
        let matches = try folders(in: root).filter { $0.1.id == id }
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
        let identity = data.map { SHA256.hash(data: $0).map { String(format: "%02x", $0) }.joined() }
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
        let identity = data.map { SHA256.hash(data: $0).map { String(format: "%02x", $0) }.joined() }
        return .init(identity: identity, hasPrevious: try exists(folder.appendingPathComponent(Self.previousTranscript)))
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
        guard !tracks.contains(where: { (try? values($0)) != nil }) else { return [start] }
        let parts = try folders(in: url)
        if parts.isEmpty { return [start] }
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
        let parts = try ids.map { try location(id: $0) }
        guard parts.count > 1, let earliest = zip(ids, parts).min(by: { $0.0 < $1.0 }) else { throw POSIXError(.EINVAL) }
        for (id, part) in zip(ids, parts) {
            guard let name = CallFolderName(part.lastPathComponent, timeZone: timeZone),
                  try audio(in: part, name: name).duration != nil else { throw CallsFailure.unknownLength(id: id) }
        }
        let prepared = try prepare()
        var step = CallsFailure.MergeStep.writingTranscript
        do {
            try write(prepared, parts)
            for part in parts {
                step = .movingPart(folder: part.lastPathComponent)
                try rename(part, prepared.appendingPathComponent(part.lastPathComponent, isDirectory: true))
            }
            step = .publishing
            try rename(prepared, folder.appendingPathComponent(earliest.1.lastPathComponent, isDirectory: true))
            return earliest.0
        } catch {
            let failure = CallsFailure.mergeFailed(step: step, reason: error.localizedDescription)
            try putBack(parts, from: prepared)
            throw failure
        }
    }

    /// Puts back interrupted transcript changes and merges. A hidden prepared folder
    /// records each change before anything moves; a published merge has none.
    /// Run once as Calls starts, before its first listing, never during a change.
    public func recoverInterruptedMerges() throws {
        operation.lock(); defer { operation.unlock() }
        for prepared in try children(folder) {
            if prepared.lastPathComponent.hasPrefix(Self.settledPrefix) {
                try remove(prepared)
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
        let calls = try folders(in: folder)
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
        return try children(root).compactMap { url in
            guard let name = CallFolderName(url.lastPathComponent, timeZone: timeZone) else { return nil }
            let info = try values(url)
            guard info.isDirectory == true, info.isSymbolicLink != true else { return nil }
            return (url, name)
        }
    }

    /// Extracts only names the call-folder writer can make, with a valid local timestamp.
    public static func id(in name: String, timeZone: TimeZone) -> String? {
        CallFolderName(name, timeZone: timeZone)?.id
    }

}

/// What `Calls` refuses or could not finish, with the data a sentence needs; the UI writes the sentence.
public enum CallsFailure: Error, Equatable, Sendable {
    /// No call folder has this id any more.
    case notFound(id: String)
    /// More than one call folder has this id.
    case ambiguous(id: String)
    /// The title has a character a folder name cannot hold.
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
