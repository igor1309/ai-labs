import Calls
import Foundation

/// The durable record of calls that live outside the recording folder: moves
/// still in progress, and the folder that owns each call moved before.
public struct CallsJournal: Codable, Equatable, Sendable {
    public var moves: [String: Calls.Move]
    public var retainedRoots: [URL]
    public var owners: [String: URL]

    public init(moves: [String: Calls.Move] = [:], retainedRoots: [URL] = [], owners: [String: URL] = [:]) {
        self.moves = moves; self.retainedRoots = retainedRoots; self.owners = owners
    }
    private enum CodingKeys: CodingKey { case moves, retainedRoots, owners }
    public init(from decoder: any Decoder) throws {
        let saved = try decoder.container(keyedBy: CodingKeys.self)
        moves = try saved.decode([String: Calls.Move].self, forKey: .moves)
        retainedRoots = try saved.decodeIfPresent([URL].self, forKey: .retainedRoots) ?? []
        owners = try saved.decodeIfPresent([String: URL].self, forKey: .owners) ?? [:]
    }

    /// Reads a saved journal. A legacy file, a bare list of retained roots, is
    /// migrated by reading the calls of every root: `migrated` is true and the
    /// caller saves the result before relying on it. Any root that cannot be
    /// read throws, so an unavailable volume does not lose its ownership.
    public static func read(_ data: Data, callIDs: (URL) throws -> [String]) throws -> (journal: CallsJournal, migrated: Bool) {
        let journal: CallsJournal, migrated: Bool
        if let roots = try? JSONDecoder().decode([URL].self, from: data) {
            guard !roots.isEmpty, roots.allSatisfy(\.isFileURL),
                  Set(roots.map(directory)).count == roots.count else { throw CocoaError(.fileReadCorruptFile) }
            var legacy = CallsJournal(retainedRoots: roots.map(directory))
            for root in legacy.retainedRoots {
                for id in try callIDs(root) {
                    guard legacy.owners[id] == nil else { throw CocoaError(.fileReadCorruptFile) }
                    legacy.owners[id] = root
                }
            }
            journal = legacy; migrated = true
        } else {
            journal = try JSONDecoder().decode(CallsJournal.self, from: data); migrated = false
        }
        try journal.validate()
        return (journal, migrated)
    }

    /// Refuses a journal whose moves could not have been written by a safe move.
    func validate() throws {
        guard retainedRoots.allSatisfy(\.isFileURL), owners.values.allSatisfy(\.isFileURL) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        guard moves.allSatisfy({ id, move in
            let source = move.source.resolvingSymlinksInPath().standardizedFileURL.path
            let target = move.target.resolvingSymlinksInPath().standardizedFileURL.path
            return !target.hasPrefix(source + "/") && !source.hasPrefix(target + "/") &&
            move.source.isFileURL && move.target.isFileURL && move.temporary.isFileURL &&
            Calls.id(in: move.source.lastPathComponent, timeZone: .gmt) == id &&
            Calls.id(in: move.target.lastPathComponent, timeZone: .gmt) == id &&
            !sameRoot(move.source, move.target) && move.temporary != move.target &&
            sameRoot(move.temporary.deletingLastPathComponent(), move.target.deletingLastPathComponent()) &&
            move.temporary.lastPathComponent.hasPrefix(".audelin-move-")
        }) else { throw CocoaError(.fileReadCorruptFile) }
    }
}

func directory(_ url: URL) -> URL { URL(fileURLWithPath: url.standardizedFileURL.path, isDirectory: true) }
func sameRoot(_ left: URL, _ right: URL) -> Bool {
    left.resolvingSymlinksInPath().standardizedFileURL.path == right.resolvingSymlinksInPath().standardizedFileURL.path
}
