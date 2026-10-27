import CoreText
import Foundation
import SwiftUI
import Testing
@testable import DesignSystem

struct TokensTests {

    @Test(arguments: [ColorScheme.light, .dark])
    func matchTheDesignsVariables(scheme: ColorScheme) throws {

        let design = try designTokens()

        #expect(Set(Tokens.byName.keys) == Set(design.keys))
        for (name, entry) in design {
            let token = try #require(Tokens.byName[name], "\(name) has no token")
            switch (token, entry["value"]) {
            case let (.color(color), value):
                let hex: String
                if let unthemed = value as? String {
                    hex = unthemed
                } else {
                    let entries = try #require(value as? [[String: Any]], "\(name)")
                    let mode = scheme == .dark ? "dark" : "light"
                    let matches = entries.filter { ($0["theme"] as? [String: String]) == ["mode": mode] }
                    #expect(matches.count == 1, "\(name): expected one \(mode) value")
                    hex = try #require(matches.first?["value"] as? String, "\(name)")
                }
                #expect(rgba(color, scheme: scheme) == rgba(hex), "\(name) in \(scheme)")
            case let (.number(number), value as NSNumber):
                #expect(number == CGFloat(value.doubleValue), "\(name)")
            case let (.string(string), value as String):
                #expect(string == value, "\(name)")
            default:
                Issue.record("\(name): \(token) does not match the design's \(entry)")
            }
        }
    }

    @Test func bundleTheFontsAtTheirWeights() throws {

        let fonts: [(String, Tokens.Weight)] = [
            (Tokens.fontDisplay, .semibold),
            (Tokens.fontText, .regular),
            (Tokens.fontText, .bold),
            (Tokens.fontMono, .medium),
        ]

        for (family, weight) in fonts {
            let font = Tokens.ctFont(family, 20, weight)
            let variation = try #require(CTFontCopyVariation(font) as? [UInt32: Double], "\(family) is not variable")

            #expect(CTFontCopyFamilyName(font) as String == family)
            let wght = (variation[wghtAxis] ?? defaultWeight(font)).rounded()
            #expect(wght == Double(weight.rawValue), "\(family) is at \(wght)")
        }
    }
}

/// The font's weight when its variation leaves `wght` out: the axis default.
private func defaultWeight(_ font: CTFont) -> Double {

    let axes = CTFontCopyVariationAxes(font) as? [[CFString: Any]] ?? []
    let wght = axes.first { ($0[kCTFontVariationAxisIdentifierKey] as? NSNumber)?.uint32Value == wghtAxis }
    return (wght?[kCTFontVariationAxisDefaultValueKey] as? NSNumber)?.doubleValue ?? 0
}

/// The design file's `mz-*` variables, by name.
private func designTokens() throws -> [String: [String: Any]] {

    let snapshot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .appendingPathComponent("../../../docs/design/tokens.json")
    let json = try JSONSerialization.jsonObject(with: Data(contentsOf: snapshot)) as? [String: Any]
    let variables = try #require(json?["variables"] as? [String: [String: Any]])
    return variables.filter { $0.key.hasPrefix("mz-") }
}

private struct RGBA: Equatable {

    let red, green, blue, alpha: Int
}

private func rgba(_ color: Color, scheme: ColorScheme) -> RGBA {

    var environment = EnvironmentValues()
    environment.colorScheme = scheme
    let resolved = color.resolve(in: environment)
    func byte(_ value: Float) -> Int { Int((value * 255).rounded()) }
    return RGBA(
        red: byte(resolved.red),
        green: byte(resolved.green),
        blue: byte(resolved.blue),
        alpha: byte(resolved.opacity)
    )
}

private func rgba(_ hex: String) -> RGBA {

    let digits = hex.dropFirst()
    let value = UInt32(digits, radix: 16) ?? 0
    let alpha = digits.count == 8 ? Int(value & 0xFF) : 255
    let rgb = digits.count == 8 ? value >> 8 : value
    return RGBA(red: Int(rgb >> 16 & 0xFF), green: Int(rgb >> 8 & 0xFF), blue: Int(rgb & 0xFF), alpha: alpha)
}
