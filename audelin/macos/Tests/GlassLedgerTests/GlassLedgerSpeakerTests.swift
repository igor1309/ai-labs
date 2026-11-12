import SwiftUI
import Testing
import GlassLedger

struct GlassLedgerSpeakerTests {

    @Test(arguments: [GlassLedger.light, .dark])
    func remoteSpeakersStartWithThemAndDifferFromEachOtherAndFromMe(tokens: GlassLedger) {

        #expect(tokens.remoteSpeakers == [tokens.them, tokens.them2, tokens.them3, tokens.them4])
        #expect(Set(tokens.remoteSpeakers.map(\.description)).count == 4)
        #expect(!tokens.remoteSpeakers.contains(tokens.me))
    }

    @Test(arguments: [GlassLedger.light, .dark])
    func eachPlaceTakesItsColourInTurn(tokens: GlassLedger) {

        #expect(tokens.remoteSpeaker(nil) == tokens.them)
        #expect(tokens.remoteSpeaker(0) == tokens.them)
        #expect((1...4).map { tokens.remoteSpeaker($0) } == tokens.remoteSpeakers)
        #expect(tokens.remoteSpeaker(5) == tokens.them)
        #expect(tokens.remoteSpeaker(6) == tokens.them2)
    }

    @Test func lightAndDarkHaveTheirOwnSpeakerColours() {

        #expect(zip(GlassLedger.light.remoteSpeakers, GlassLedger.dark.remoteSpeakers).allSatisfy { $0 != $1 })
    }
}
