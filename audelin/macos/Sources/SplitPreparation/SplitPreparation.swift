import Foundation

/// Prepares both parts inside the folder transaction that publishes them.
public struct SplitPreparation<Source: Sendable, Recording: Sendable, Transcript: Sendable>: Sendable {
    public struct Snapshot: Sendable {
        public let bytes: Data
        public let identity: String
        public let folderStart: Date

        public init(bytes: Data, identity: String, folderStart: Date) {
            self.bytes = bytes; self.identity = identity; self.folderStart = folderStart
        }
    }

    public struct Choice: Sendable {
        public let before: String
        public let after: String
        public let cut: Int
        public let gap: Int
        public let suggestsTransition: Bool
        public let secondPartMinute: Date

        public init(before: String, after: String, cut: Int, gap: Int, suggestsTransition: Bool, secondPartMinute: Date) {
            self.before = before; self.after = after; self.cut = cut; self.gap = gap
            self.suggestsTransition = suggestsTransition; self.secondPartMinute = secondPartMinute
        }
    }

    public struct Request: Sendable {
        public let id: String
        public let identity: String
        public let cut: Int
        public let firstTitle: String
        public let secondTitle: String

        public init(id: String, identity: String, cut: Int, firstTitle: String, secondTitle: String) {
            self.id = id; self.identity = identity; self.cut = cut
            self.firstTitle = firstTitle; self.secondTitle = secondTitle
        }
    }

    public struct Part: Sendable {
        public let start: Date
        public let transcript: Transcript

        public init(start: Date, transcript: Transcript) {
            self.start = start; self.transcript = transcript
        }
    }

    public struct Plan: Sendable {
        public let first: Part
        public let second: Part
        public let recordings: [Recording]

        public init(first: Part, second: Part, recordings: [Recording]) {
            self.first = first; self.second = second; self.recordings = recordings
        }
    }

    public typealias Prepare = @Sendable (Source) throws -> Staged
    public typealias CutTrack = @Sendable (TimeInterval, URL, URL, URL) throws -> Void
    public typealias Replace = @Sendable (Request, Prepare, CutTrack) async throws -> (first: String, second: String)
    public typealias StageNotes = @Sendable (Transcript, URL) throws -> Void
    public struct Staged: Sendable {
        public let firstStart: Date
        public let secondStart: Date
        public let recordings: [Recording]
        public let write: @Sendable (URL, URL) throws -> Void
    }

    private let read: @Sendable (String) async throws -> Snapshot
    private let suggest: @Sendable (Snapshot) -> [Choice]
    private let replace: Replace
    private let partition: @Sendable (Source, Int) throws -> Plan
    private let writeTranscript: @Sendable (Transcript, URL) throws -> Void
    private let readTags: @Sendable (Source) throws -> [String]
    private let writeTags: @Sendable ([String], URL) throws -> Void
    private let notes: @Sendable () -> StageNotes
    private let cutTrack: CutTrack

    public init(read: @escaping @Sendable (String) async throws -> Snapshot,
                suggest: @escaping @Sendable (Snapshot) -> [Choice], replace: @escaping Replace,
                partition: @escaping @Sendable (Source, Int) throws -> Plan,
                writeTranscript: @escaping @Sendable (Transcript, URL) throws -> Void,
                readTags: @escaping @Sendable (Source) throws -> [String],
                writeTags: @escaping @Sendable ([String], URL) throws -> Void,
                notes: @escaping @Sendable () -> StageNotes, cutTrack: @escaping CutTrack) {
        self.read = read; self.suggest = suggest; self.replace = replace; self.partition = partition
        self.writeTranscript = writeTranscript; self.readTags = readTags; self.writeTags = writeTags
        self.notes = notes; self.cutTrack = cutTrack
    }

    public func choices(id: String) async throws -> (identity: String, choices: [Choice]) {
        let snapshot = try await read(id)
        return (snapshot.identity, suggest(snapshot))
    }

    public func split(_ request: Request) async throws -> (first: String, second: String) {
        let stageNotes = notes()
        return try await replace(request, { source in
            let plan = try partition(source, request.cut)
            let tags = try readTags(source)
            return Staged(firstStart: plan.first.start, secondStart: plan.second.start, recordings: plan.recordings,
                          write: { first, second in
                for (part, folder) in [(plan.first, first), (plan.second, second)] {
                    try writeTranscript(part.transcript, folder)
                    try writeTags(tags, folder)
                    try stageNotes(part.transcript, folder)
                }
            })
        }, cutTrack)
    }
}
