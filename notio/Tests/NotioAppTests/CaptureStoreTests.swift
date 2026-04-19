import Foundation
import Testing
@testable import NotioApp

@Suite("CaptureStore")
struct CaptureStoreTests {
    @Test func test_save_shouldForwardItemToStore() async throws {
        let spy = SpyCaptureStore()
        let item = CapturedItem(from: IngressResult(primaryURL: "https://example.com", note: "test"))

        try await spy.save(item)

        #expect(spy.savedItems.count == 1)
        #expect(spy.savedItems.first?.kind == .link)
        #expect(spy.savedItems.first?.url == "https://example.com")
        #expect(spy.savedItems.first?.note == "test")
    }

    @Test func test_config_shouldReadSupabaseFromEnv() throws {
        let config = try Config.fromEnvironment([
            "NOTIO_WEBHOOK_PATH": "hook",
            "NOTIO_SUPABASE_URL": "https://xxx.supabase.co",
            "NOTIO_SUPABASE_KEY": "secret-key",
        ])
        #expect(config.supabaseURL == "https://xxx.supabase.co")
        #expect(config.supabaseKey == "secret-key")
    }

    @Test func test_config_shouldHaveNilSupabaseByDefault() throws {
        let config = try Config.fromEnvironment(["NOTIO_WEBHOOK_PATH": "hook"])
        #expect(config.supabaseURL == nil)
        #expect(config.supabaseKey == nil)
    }
}

// MARK: - Helpers

final class SpyCaptureStore: CaptureStore, @unchecked Sendable {
    private(set) var savedItems: [CapturedItem] = []

    func save(_ item: CapturedItem) async throws {
        savedItems.append(item)
    }
}
