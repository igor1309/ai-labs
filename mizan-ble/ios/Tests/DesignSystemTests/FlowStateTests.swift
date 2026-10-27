import SwiftUI
import Testing
@testable import DesignSystem

struct FlowStateTests {
    @Test func pillsAndMessagesUseTheirStateColors() {
        let pills: [(StatusPill.State, Color, Color)] = [
            (.idle, Tokens.text2, Tokens.lineStrong),
            (.host, Tokens.host, Tokens.host), (.client, Tokens.client, Tokens.client),
            (.ok, Tokens.ok, Tokens.ok), (.bad, Tokens.bad, Tokens.bad),
        ]
        #expect(Set(pills.map(\.0)) == Set(StatusPill.State.allCases))
        for (state, color, border) in pills {
            #expect(state.color == color)
            #expect(state.border == border)
        }
        let tones: [(Message.Tone, Color, Color)] = [
            (.idle, Tokens.text2, Tokens.lineStrong),
            (.host, Tokens.host, Tokens.host), (.client, Tokens.client, Tokens.client),
            (.ok, Tokens.ok, Tokens.ok), (.bad, Tokens.bad, Tokens.bad),
        ]
        #expect(Set(tones.map(\.0)) == Set(Message.Tone.allCases))
        for (tone, color, arrow) in tones {
            #expect(tone.color == color)
            #expect(tone.arrowColor == arrow)
            #expect(tone.labelColor == (tone == .idle ? Tokens.text2 : Tokens.textBody))
        }
        #expect(Message.Direction.toClient.arrowSymbol == "chevron.right")
        #expect(Message.Direction.toHost.arrowSymbol == "chevron.left")
        #expect(DeviceChip.Kind.host.color == Tokens.host)
        #expect(DeviceChip.Kind.client.color == Tokens.client)
        #expect(DeviceChip.Kind.empty.color == Tokens.text2)
    }

    @Test func stepsUseTheirSidesColors() {
        for side in Side.allCases {
            let specs: [(StepState, Color, Color, Color, Color, Color)] = [
                (.done, side.accent, .clear, Tokens.text, Tokens.text2, side.accent),
                (.active, side.tint, side.accent, Tokens.text, side.accentHi, Tokens.line),
                (.failed, Tokens.bad, .clear, Tokens.text, Tokens.bad, Tokens.line),
                (.todo, .clear, Tokens.lineStrong, Tokens.text3, Tokens.text3, Tokens.line),
            ]
            #expect(Set(specs.map(\.0)) == Set(StepState.allCases))
            for (state, fill, border, title, detail, connector) in specs {
                #expect(state.fill(for: side) == fill)
                #expect(state.border(for: side) == border)
                #expect(state.titleColor == title)
                #expect(state.detailColor(for: side) == detail)
                #expect(state.connectorColor(for: side) == connector)
            }
        }
    }
}
