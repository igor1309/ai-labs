import AppKit
import GlassLedger
import SwiftUI
import Testing
@testable import PanelUI

/// Main-thread cost of one live update to a long log (LAB-759). Opt-in:
/// `AUDELIN_BENCH=1 swift test --filter TranscriptLogBenchmark`.
@MainActor
struct TranscriptLogBenchmark {

    @Test(.enabled(if: ProcessInfo.processInfo.environment["AUDELIN_BENCH"] != nil),
          arguments: [50, 200, 600, 1200])
    func liveUpdateCost(entries count: Int) throws {

        let config = PanelConfig.glassLedger
        func view(_ lines: PanelState.Lines) -> AnyView {
            AnyView(TranscriptLog(lines: lines, tokens: .light, config: config, event: { _ in })
                .frame(width: config.panelWidth, height: 420)
                .environment(\.colorScheme, .light))
        }

        var entries = (0..<count).map { index in
            PanelState.Entry(
                id: index, time: String(format: "%02d:%02d", index / 60, index % 60),
                speaker: index.isMultiple(of: 2) ? .me : .them,
                settled: "Фраза номер \(index): обсуждаем deployment pipeline и rollout на staging, кто accountable.")
        }
        let host = Offscreen.host(view(.init(entries: entries)))
        let text = try #require(Offscreen.textView(in: host))
        // A reader holds a selection near the top while lines stream in.
        text.setSelectedRange(NSRange(location: 40, length: 30))

        let words = "и ещё немного слов про feature flag и canary release".split(separator: " ")
        let style = Transcript.Style(tokens: .light, config: config)
        var build: [Duration] = [], total: [Duration] = []
        let clock = ContinuousClock()

        for tick in 0..<60 {
            // A partial grows by a word; every eighth tick it settles and a new line starts.
            var last = entries[entries.count - 1]
            if tick % 8 == 7 {
                last.settled += " " + last.pending; last.pending = ""
                entries[entries.count - 1] = last
                entries.append(.init(id: entries.count, time: "99:99", speaker: tick % 16 == 7 ? .me : .them, settled: ""))
            } else {
                last.pending += (last.pending.isEmpty ? "" : " ") + words[tick % words.count]
                entries[entries.count - 1] = last
            }
            let lines = PanelState.Lines(entries: entries)

            build.append(clock.measure { _ = Transcript(lines: lines, style: style) })
            total.append(clock.measure {
                host.rootView = view(lines)
                host.layoutSubtreeIfNeeded()
                host.displayIfNeeded()
            })
        }

        func ms(_ d: Duration) -> Double { Double(d.components.attoseconds) / 1e15 + Double(d.components.seconds) * 1000 }
        func stats(_ xs: [Duration]) -> String {
            let v = xs.map(ms).sorted()
            return String(format: "median %.2f ms, p95 %.2f ms, max %.2f ms", v[v.count / 2], v[v.count * 95 / 100], v.last!)
        }
        print("BENCH entries=\(count) chars=\(text.string.count) build: \(stats(build)) | update+layout+draw: \(stats(total))")
    }
}
