import AppKit
import Foundation
import GlassLedger
import SwiftUI
import Testing
@testable import PanelUI

/// The log redraws on every text update while the reader watches. An update
/// late in a long call must cost about what one early does, or the main actor
/// falls behind as the call goes on however rarely the text changes.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct TranscriptLogLoadTests {

    static let updates = 5

    @Test func anUpdateLateInALongCallCostsTheLogAboutWhatAnEarlyOneDoes() {

        // The quickest of three runs each, so a busy machine slows neither side alone.
        var early = Cost.slowest, late = Cost.slowest
        for _ in 0..<3 {
            early = early.quicker(cost(entries: 20))
            late = late.quicker(cost(entries: 800))
        }
        let line = "log load: \(early.line) early, \(late.line) late\n"
        FileHandle.standardError.write(Data(line.utf8))
        #expect(late.update / early.update <= 3, "an update late in a long call costs the log \(late.update / early.update)x one early")
    }

    /// Hosts the log with `count` entries, then changes the last entry's
    /// pending words a few times; the time per update, with the part spent
    /// building the rows that changed.
    private func cost(entries count: Int) -> Cost {

        let config = PanelConfig.glassLedger
        let size = CGSize(width: config.panelWidth, height: 400)
        let host = Offscreen.host(log(lines(count, step: 0), config: config, size: size), size: size)
        let style = Transcript.Style(tokens: .light, config: config)
        let rows = Transcript.Rows()
        _ = rows.update(lines(count, step: 0), style: style)
        var build = Duration.zero, update = Duration.zero
        let clock = ContinuousClock()
        for step in 1...Self.updates {
            let lines = lines(count, step: step)
            build += clock.measure { _ = rows.update(lines, style: style) }
            update += clock.measure {
                host.rootView = log(lines, config: config, size: size)
                host.layoutSubtreeIfNeeded()
            }
        }
        #expect(Offscreen.textView(in: host)?.string.contains("w\(Self.updates)") == true, "the log does not show the last update")
        return Cost(update: update.seconds / Double(Self.updates), build: build.seconds / Double(Self.updates))
    }

    private func lines(_ count: Int, step: Int) -> PanelState.Lines {

        let words = String(repeating: "слово ", count: 20)
        var rows: [PanelState.Row] = (0..<count - 1).map {
            .entry(.init(id: $0, time: "12:34", speaker: $0.isMultiple(of: 2) ? .me : .them, settled: words))
        }
        rows.append(.entry(.init(id: count, time: "12:35", speaker: .me, settled: "", pending: "w\(step)")))
        return .init(rows: rows, holds: [], newBelow: 0, followsLive: true)
    }

    private func log(_ lines: PanelState.Lines, config: PanelConfig, size: CGSize) -> AnyView {

        AnyView(
            TranscriptLog(lines: lines, tokens: .light, config: config, event: { _ in })
                .frame(width: size.width, height: size.height)
                .environment(\.colorScheme, .light)
        )
    }
}

private struct Cost {

    static let slowest = Cost(update: .infinity, build: .infinity)

    /// Seconds per update, from the new lines to the log laid out.
    let update: Double
    /// Seconds of it spent building the rows that changed.
    let build: Double

    var line: String { String(format: "%.2f ms an update (%.2f ms building rows)", update * 1000, build * 1000) }

    func quicker(_ other: Cost) -> Cost { other.update < update ? other : self }
}

private extension Duration {

    var seconds: Double { Double(components.seconds) + Double(components.attoseconds) / 1e18 }
}
