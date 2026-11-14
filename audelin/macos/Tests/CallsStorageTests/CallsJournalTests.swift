import Calls
import CallsStorage
import Foundation
import Testing

@Suite struct CallsJournalTests {
    private let id = "1970.01.01-0000"
    private let source = URL(fileURLWithPath: "/calls/source", isDirectory: true)
    private let destination = URL(fileURLWithPath: "/calls/destination", isDirectory: true)

    private func move(_ change: (inout Calls.Move) -> Void = { _ in }) -> Calls.Move {
        var move = Calls.Move(source: source.appendingPathComponent(id), target: destination.appendingPathComponent(id),
                              temporary: destination.appendingPathComponent(".audelin-move-1"), phase: .publishing)
        change(&move)
        return move
    }
    private func encoded(_ journal: CallsJournal) throws -> Data { try JSONEncoder().encode(journal) }
    private let noRoots: (URL) throws -> [String] = { _ in Issue.record("read a root"); return [] }

    @Test func savedJournalReadsBackUnmigrated() throws {
        let journal = CallsJournal(moves: [id: move()], retainedRoots: [destination], owners: ["1970.01.01-0001": source])
        let read = try CallsJournal.read(encoded(journal), callIDs: noRoots)
        #expect(read.journal == journal)
        #expect(!read.migrated)
    }

    @Test func journalWithoutRootsOrOwnersReadsThemAsEmpty() throws {
        let read = try CallsJournal.read(Data(#"{"moves":{}}"#.utf8), callIDs: noRoots)
        #expect(read.journal == CallsJournal())
    }

    @Test func legacyRootListMigratesEachRootsCallsToItsOwner() throws {
        let data = try JSONEncoder().encode([destination, source])
        let read = try CallsJournal.read(data) { root in root == self.destination ? ["A"] : ["B", "C"] }
        #expect(read.migrated)
        #expect(read.journal == CallsJournal(retainedRoots: [destination, source], owners: ["A": destination, "B": source, "C": source]))
    }

    @Test func legacyRootThatCannotBeReadRefusesTheMigration() throws {
        struct Offline: Error {}
        let data = try JSONEncoder().encode([destination, source])
        #expect(throws: Offline.self) {
            _ = try CallsJournal.read(data) { root in if root == self.source { throw Offline() }; return ["A"] }
        }
    }

    @Test func legacyListThatIsEmptyRepeatedOrSharesACallIsCorrupt() throws {
        let cases: [([URL], (URL) throws -> [String])] = [
            ([], noRoots),
            ([source, source.appendingPathComponent(".")], { _ in [] }),
            ([source, destination], { _ in ["A"] }),
        ]
        for (roots, callIDs) in cases {
            #expect(throws: CocoaError.self) { _ = try CallsJournal.read(JSONEncoder().encode(roots), callIDs: callIDs) }
        }
    }

    @Test func journalWithAnUnsafeMoveOrNonFileLocationIsCorrupt() throws {
        let web = URL(string: "https://example.com/calls")!
        let corrupt = [
            CallsJournal(owners: [id: web]),
            CallsJournal(retainedRoots: [web]),
            CallsJournal(moves: ["1970.01.01-0001": move()]),
            CallsJournal(moves: [id: move { $0.target = self.source.appendingPathComponent(self.id) }]),
            CallsJournal(moves: [id: move { $0.target = $0.source.appendingPathComponent("nested/" + self.id) }]),
            CallsJournal(moves: [id: move { $0.temporary = $0.target }]),
            CallsJournal(moves: [id: move { $0.temporary = self.source.appendingPathComponent(".audelin-move-1") }]),
            CallsJournal(moves: [id: move { $0.temporary = self.destination.appendingPathComponent("tmp") }]),
        ]
        for journal in corrupt {
            #expect(throws: CocoaError.self) { _ = try CallsJournal.read(encoded(journal), callIDs: noRoots) }
        }
    }
}
