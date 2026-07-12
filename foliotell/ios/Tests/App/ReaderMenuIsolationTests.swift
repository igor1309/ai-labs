import Foundation
@testable import FolioTellApp
import Testing

struct ReaderMenuIsolationTests {

    @Test func test_readerBottomBar_shouldIsolateVoiceMenuFromPlaybackProgress() throws {

        let source = try String(contentsOf: readerViewSourceURL, encoding: .utf8)

        #expect(source.contains("ReaderVoiceMenu(state: state.voiceMenuState, event: event)"))
    }

    @Test func test_readerBottomBar_shouldIsolatePlaybackMenuFromPlaybackProgress() throws {

        let source = try String(contentsOf: readerViewSourceURL, encoding: .utf8)

        #expect(source.contains("ReaderPlaybackMenu(state: state.playbackMenuState, event: event)"))
    }

    private var readerViewSourceURL: URL {

        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/App/ReaderView.swift")
    }
}
