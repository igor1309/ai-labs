import struct CallText.State
import LiveText
import os
import PanelUI
import SwiftUI

/// A fresh ID for each call keeps overlapping hearings and writes distinct.
struct ProfileIntervals: Sendable {

    let begin: @Sendable (StaticString) -> @Sendable () -> Void

    static let system: Self = {
        let log = OSLog(subsystem: "dev.igor1309.audelin", category: .pointsOfInterest)
        return Self { name in
            let id = OSSignpostID(log: log)
            os_signpost(.begin, log: log, name: name, signpostID: id)
            return { os_signpost(.end, log: log, name: name, signpostID: id) }
        }
    }()
}

/// Measures a hosted panel update through the transcript's AppKit layout.
@MainActor
public struct SignpostedPanelUpdate<Content: View> {

    private let host: NSHostingView<Content>
    private let content: (PanelState) -> Content
    private let intervals: ProfileIntervals

    public init(host: NSHostingView<Content>, content: @escaping (PanelState) -> Content) {

        self.init(host: host, content: content, intervals: .system)
    }

    init(host: NSHostingView<Content>, content: @escaping (PanelState) -> Content, intervals: ProfileIntervals) {

        self.host = host
        self.content = content
        self.intervals = intervals
    }

    public func callAsFunction(_ state: PanelState) {

        let end = intervals.begin("PanelUpdate")
        defer { end() }
        host.rootView = content(state)
        host.layoutSubtreeIfNeeded()
    }
}

struct SignpostedTranscriptFile: SessionTranscriptFile {

    let base: any SessionTranscriptFile
    let intervals: ProfileIntervals

    func write(_ state: State) async throws {

        let end = intervals.begin("TranscriptWrite")
        defer { end() }
        try await base.write(state)
    }

    func close() async { await base.close() }
}

struct SignpostedRecognizer: Recognizer {

    let base: any Recognizer
    let intervals: ProfileIntervals

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        let end = intervals.begin("Hearing")
        defer { end() }
        return try await base.hear(chunk)
    }

    func finish() async throws -> Hearing { try await base.finish() }
}
