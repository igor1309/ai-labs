import SwiftUI
import Testing
@testable import DesignSystem

struct ComponentTests {

    @Test func cardPaddingIsFixedPerSizeClass() {

        let compact = Card(isCompact: true) { EmptyView() }
        let regular = Card(isCompact: false) { EmptyView() }
        let list = Card(isCompact: true, padding: .list) { EmptyView() }

        #expect([compact.horizontal, compact.vertical] == [Tokens.space4, Tokens.space4])
        #expect([regular.horizontal, regular.vertical] == [Tokens.space7, Tokens.space7])
        #expect([list.horizontal, list.vertical] == [Tokens.space4, Tokens.space1])
    }

    @Test func statusPanelUsesOneTitleRolePerLevel() {

        let panel = StatusPanel("T", detail: "", level: .panel) { EmptyView() } value: { EmptyView() } footer: { EmptyView() }
        let screen = StatusPanel("T", detail: "", level: .screen) { EmptyView() } value: { EmptyView() } footer: { EmptyView() }

        #expect(panel.titleRole == .lead)
        #expect(screen.titleRole == .title)
    }

    @Test func exchangeModelShowsAnEmptyClientAsEmpty() {

        let model = ExchangeStrip.Model(
            hostCode: "H2", hostDetail: "Ready", message: "amount", clientCode: "—", clientDetail: "",
            tone: .idle, direction: .toClient, symbol: "lock", clientIsEmpty: true
        )

        #expect(ExchangeStrip(model).client.kind == .empty)
        #expect(ExchangeStrip(ExchangeStrip.Model(
            hostCode: "H2", hostDetail: "", message: "", clientCode: "C1", clientDetail: "",
            tone: .idle, direction: .toClient, symbol: "lock"
        )).client.kind == .client)
    }

    @Test func motionKindsResolveToTheirSpecs() {

        for reduced in [false, true] {
            #expect(Motion.Kind.fast.spec(reduced: reduced) == Motion.fast(reduced: reduced))
            #expect(Motion.Kind.standard.spec(reduced: reduced) == Motion.standard(reduced: reduced))
            #expect(Motion.Kind.panel.spec(reduced: reduced) == Motion.panel(reduced: reduced))
        }
    }
}
