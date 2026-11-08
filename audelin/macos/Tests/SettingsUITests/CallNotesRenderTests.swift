import BlockingTestWork
import RenderedText
import SwiftUI
import Testing
@testable import SettingsUI

@MainActor @Suite(.serialized)
struct CallNotesRenderTests {

    @Test(arguments: SettingsState.summaryPreviews.map(\.name), [ColorScheme.light, .dark])
    func everySummaryShowsItsFormattedValues(name: String, scheme: ColorScheme) async throws {
        let state = try #require(SettingsState.summaryPreviews.first { $0.name == name }?.state)
        let host = Offscreen.host(SettingsPreview(state: state, scheme: scheme), scheme: scheme)
        host.window?.isReleasedWhenClosed = false
        defer { host.window?.close() }
        let image = try #require(Offscreen.sharpSnapshot(host))
        let text = normalized(try await readText(in: image))
        #expect(!text.shows("Папка данных"), "\(name): \(text)")
        switch state.callNotes {
        case let .loading(message):
            #expect(text.shows(message), "\(name): \(text)")
            expectNoDefaults(text)
        case let .loadFailed(banner, action):
            #expect(text.shows(banner.title), "\(text)")
            #expect(text.shows(banner.detail), "\(text)")
            #expect(text.shows(action.title), "\(text)")
            expectNoDefaults(text)
        case let .loaded(draft):
            #expect(text.shows("Составлять итоги после звонка"), "\(name): \(text)")
            #expect(text.shows("Пробовать определить имена участников"), "\(name): \(text)")
            #expect(text.shows(draft.disclosure), "\(name): \(text)")
            #expect(text.shows(draft.status), "\(name): \(text)")
            #expect(text.shows(draft.validate.title), "\(name): \(text)")
            #expect(text.shows(draft.save.title), "\(name): \(text)")
            for runtime in draft.runtimes {
                #expect(text.shows(runtime.title), "\(name): \(text)")
                #expect(text.shows(runtime.disclosure), "\(name): \(text)")
                for field in runtime.fields {
                    #expect(text.shows(field.label), "\(name): \(text)")
                    #expect(text.shows(field.value.isEmpty ? field.placeholder : field.value), "\(name): \(text)")
                }
            }
            if let banner = draft.banner {
                #expect(text.shows(banner.title), "\(name): \(text)")
                #expect(text.shows(banner.detail), "\(name): \(text)")
            }
        }
    }

    @Test func viewUsesSuppliedDisclosuresAndStatus() async throws {
        var state = try #require(SettingsState.summaryPreviews.first?.state)
        guard case var .loaded(draft) = state.callNotes else { Issue.record("Missing draft"); return }
        draft.disclosure = "Получатель и стоимость заданы состоянием"
        draft.status = "Новый статус из машины"
        draft.runtimes[0].disclosure = "Другой получатель"
        state.callNotes = .loaded(draft)
        let host = Offscreen.host(SettingsPreview(state: state, scheme: .light))
        host.window?.isReleasedWhenClosed = false
        defer { host.window?.close() }
        let image = try #require(Offscreen.sharpSnapshot(host))
        let text = normalized(try await readText(in: image))
        #expect(text.shows(draft.disclosure), "\(text)")
        #expect(text.shows(draft.status), "\(text)")
        #expect(text.shows(draft.runtimes[0].disclosure), "\(text)")
        #expect(!text.shows("Anthropic"), "\(text)")
    }

    // Vision reads the Latin I in mixed Russian/API labels as Ukrainian І.
    // Native control tests assert their exact values; OCR checks visible copy.
    private func normalized(_ text: RenderedText) -> RenderedText {
        RenderedText(lines: text.lines.map {
            $0.replacingOccurrences(of: "І", with: "I").replacingOccurrences(of: "і", with: "i")
        })
    }

    private func expectNoDefaults(_ text: RenderedText) {
        for word in ["sonnet", "claude", "gpt-4.1-mini", "OPENAI_API_KEY", "Сохранить", "Составлять итоги"] {
            #expect(!text.shows(word), "\(text)")
        }
    }
}
