import CoreText
import SwiftUI
import Testing
@testable import DesignSystem

struct TypeRoleTests {
    @Test func resolvesTheDesignsTypeScale() throws {
        let specs: [(TypeRole, String, CGFloat, CGFloat, CGFloat)] = [
            (.hero, "Space Grotesk", 72, 700, -2),
            (.display, "Space Grotesk", 56, 700, -1.5),
            (.heading, "Space Grotesk", 34, 600, -0.5),
            (.title, "Space Grotesk", 30, 600, -0.5),
            (.lead, "Inter", 20, 500, 0),
            (.label, "Inter", 16, 600, 0),
            (.labelS, "Inter", 15, 600, 0),
            (.body, "Inter", 16, 400, 0),
            (.small, "Inter", 13, 400, 0),
            (.micro, "Inter", 11, 400, 0),
            (.eyebrow, "JetBrains Mono", 12, 500, 1.5),
            (.code, "JetBrains Mono", 13, 700, 0),
            (.keypad, "Space Grotesk", 46, 500, 0),
            (.ring, "Space Grotesk", 84, 600, -2),
            (.wordmark, "Space Grotesk", 26, 700, 0),
        ]
        #expect(Set(specs.map(\.0)) == Set(TypeRole.allCases))
        for (role, family, size, weight, tracking) in specs {
            #expect(role.family == family)
            #expect(role.size == size)
            #expect(role.weight.rawValue == weight)
            #expect(role.tracking == tracking)
            let font = role.resolvedFont
            #expect(role.font == Font(font))
            #expect(CTFontCopyFamilyName(font) as String == family)
            #expect(CTFontGetSize(font) == size)
            let variation = try #require(CTFontCopyVariation(font) as? [UInt32: Double])
            let axes = CTFontCopyVariationAxes(font) as? [[CFString: Any]] ?? []
            let axis = axes.first { ($0[kCTFontVariationAxisIdentifierKey] as? NSNumber)?.uint32Value == wghtAxis }
            let defaultWeight = (axis?[kCTFontVariationAxisDefaultValueKey] as? NSNumber)?.doubleValue ?? 0
            #expect((variation[wghtAxis] ?? defaultWeight).rounded() == Double(weight))
            #expect(role.color == ([TypeRole.lead, .body, .micro, .eyebrow].contains(role) ? Tokens.text2 : Tokens.text))
        }
    }
}
