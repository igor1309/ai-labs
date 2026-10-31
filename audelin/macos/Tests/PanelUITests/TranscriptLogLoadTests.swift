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

    @Test(arguments: [800, 6_000])
    func anUpdateLateInALongCallCostsTheLogAboutWhatAnEarlyOneDoes(entries: Int) {

        // The quickest of three runs each, so a busy machine slows neither side alone.
        var early = Cost.slowest, late = Cost.slowest
        for _ in 0..<3 {
            early = early.quicker(cost(entries: 20))
            late = late.quicker(cost(entries: entries))
        }
        let line = report("\(early.line) at 20 entries, \(late.line) at \(entries) entries; at 20 \(probe(entries: 20)); at \(entries) \(probe(entries: entries))")
        FileHandle.standardError.write(Data(line.utf8))
        #expect(late.update / early.update <= 3, "an update late in a long call costs the log \(late.update / early.update)x one early")
    }

    @Test func loadReportNamesTheCompiledBuild() {
        var build = "optimized"
        // The assertion's autoclosure runs only when debug assertions are enabled.
        assert({ build = "debug"; return true }())
        #expect(report("measurement") == "log load (\(build)): measurement\n")
    }

    private func report(_ measurement: String) -> String {
        let build = _isDebugAssertConfiguration() ? "debug" : "optimized"
        return "log load (\(build)): \(measurement)\n"
    }

    /// Hosts the log with `count` entries, then changes the last entry's
    /// pending words a few times; the time per update, with the part spent
    /// building the rows that changed.
    private func cost(entries count: Int) -> Cost {

        let config = PanelConfig.glassLedger
        let size = CGSize(width: config.panelWidth, height: 400)
        // Settled history keeps its strings while only the live entry changes.
        var lines = lines(count)
        let host = Offscreen.host(log(lines, config: config, size: size), size: size)
        let style = Transcript.Style(tokens: .light, config: config)
        let rows = Transcript.Rows()
        _ = rows.update(lines, style: style)
        var build = Duration.zero, update = Duration.zero, layout = Duration.zero
        let clock = ContinuousClock()
        for step in 1...Self.updates {
            lines.rows[count - 1] = .entry(.init(id: count, time: "12:35", speaker: .me, settled: "", pending: "w\(step)"))
            build += clock.measure { _ = rows.update(lines, style: style) }
            let handed = clock.measure { host.rootView = log(lines, config: config, size: size) }
            let laid = clock.measure { host.layoutSubtreeIfNeeded() }
            update += handed + laid
            layout += laid
        }
        #expect(Offscreen.textView(in: host)?.string.contains("w\(Self.updates)") == true, "the log does not show the last update")
        return Cost(
            update: update.seconds / Double(Self.updates),
            build: build.seconds / Double(Self.updates),
            layout: layout.seconds / Double(Self.updates)
        )
    }

    /// Times each step of the log's layout pass alone at `count` entries, so
    /// a run that grows names the step that grows.
    private func probe(entries count: Int) -> String {

        let config = PanelConfig.glassLedger
        let size = CGSize(width: config.panelWidth, height: 400)
        let same = lines(count)
        let host = Offscreen.host(log(same, config: config, size: size), size: size)
        guard let text = Offscreen.textView(in: host) as? LogTextView,
              let storage = text.textStorage,
              let layout = text.textLayoutManager
        else { return "no log to probe" }
        let clock = ContinuousClock()
        var edit = Duration.zero, scroll = Duration.zero, height = Duration.zero, rest = Duration.zero, rules = Duration.zero
        var looks = Duration.zero, select = Duration.zero, fits = Duration.zero, unchanged = Duration.zero
        // Each step of an update alone, after an edit to the last line as an update makes.
        for step in 1...Self.updates {
            let last = NSRange(location: storage.length - 2, length: 2)
            looks += clock.measure {
                // As an update hands them: new colour objects of the same colours.
                text.selectedTextAttributes = [.backgroundColor: NSColor(srgbRed: 0.2, green: 0.4, blue: 0.9, alpha: 1), .foregroundColor: NSColor(white: 1, alpha: 1)]
                text.ruleColor = NSColor(white: 0.5, alpha: 1)
            }
            let selection = text.selectedRange()
            edit += clock.measure { storage.replaceCharacters(in: last, with: "w\(step % 10)") }
            select += clock.measure { text.setSelectedRange(NSIntersectionRange(selection, NSRange(location: 0, length: storage.length))) }
            scroll += clock.measure { text.scrollToEndOfDocument(nil) }
            height += clock.measure {
                let end = NSTextRange(location: layout.documentRange.endLocation)
                layout.ensureLayout(for: end)
                _ = layout.usageBoundsForTextContainer
                layout.enumerateTextSegments(in: end, type: .standard, options: .middleFragmentsExcluded) { _, _, _, _ in true }
            }
            fits += clock.measure {
                text.frame.size.width = size.width
                layout.ensureLayout(for: CGRect(x: 0, y: 0, width: size.width, height: size.height))
                _ = layout.textLayoutFragment(for: CGPoint(x: 0, y: size.height))
            }
            rest += clock.measure { host.layoutSubtreeIfNeeded() }
            rules += clock.measure { _ = text.ruleFrames(in: text.visibleRect) }
        }
        // SwiftUI's pass alone: the same lines handed again and laid out.
        host.layoutSubtreeIfNeeded()
        for _ in 1...Self.updates {
            unchanged += clock.measure {
                host.rootView = log(same, config: config, size: size)
                host.layoutSubtreeIfNeeded()
            }
        }
        let ms = { (d: Duration) in
            String(format: "%.2f", (Double(d.components.seconds) * 1000 + Double(d.components.attoseconds) / 1e15) / Double(Self.updates))
        }
        return "probe: looks \(ms(looks)), edit \(ms(edit)), select \(ms(select)), fits \(ms(fits)), scroll to end \(ms(scroll)), height \(ms(height)), layout \(ms(rest)), rule frames \(ms(rules)), unchanged lines \(ms(unchanged)) ms an update"
    }

    private func lines(_ count: Int) -> PanelState.Lines {

        let words = String(repeating: "слово ", count: 20)
        var rows: [PanelState.Row] = (0..<count - 1).map {
            .entry(.init(id: $0, time: "12:34", speaker: $0.isMultiple(of: 2) ? .me : .them, settled: words))
        }
        // As the app holds a long call: final rows sealed, the live one in the tail.
        let live: PanelState.Row = .entry(.init(id: count, time: "12:35", speaker: .me, settled: "", pending: "w0"))
        return .init(rows: .init(sealed: rows, tail: [live]), holds: [], newBelow: 0, followsLive: true)
    }

    private func log(_ lines: PanelState.Lines, config: PanelConfig, size: CGSize) -> AnyView {

        AnyView(
            // The panel stacks the log and lets it be as tall as its text,
            // so it proposes no height.
            VStack(spacing: 0) {
                TranscriptLog(lines: lines, tokens: .light, config: config, event: { _ in })
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(width: size.width, height: size.height, alignment: .top)
                .environment(\.colorScheme, .light)
        )
    }
}

private struct Cost {

    static let slowest = Cost(update: .infinity, build: .infinity, layout: .infinity)

    /// Seconds per update, from the new lines to the log laid out.
    let update: Double
    /// Seconds of it spent building the rows that changed.
    let build: Double
    /// Seconds of it spent laying the log out, after SwiftUI has the new view.
    let layout: Double

    var line: String { String(format: "%.2f ms an update (%.2f ms building rows, %.2f ms laying out)", update * 1000, build * 1000, layout * 1000) }

    func quicker(_ other: Cost) -> Cost { other.update < update ? other : self }
}

private extension Duration {

    var seconds: Double { Double(components.seconds) + Double(components.attoseconds) / 1e18 }
}
