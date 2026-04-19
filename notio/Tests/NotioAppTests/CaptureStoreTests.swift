import Foundation
import Testing
@testable import NotioApp

@Suite("CaptureStore")
struct CaptureStoreTests {
    @Test func test_save_shouldForwardItemToStore() async throws {
        let spy = SpyCaptureStore()
        let item = CapturedItem(from: IngressResult(primaryURL: "https://example.com", note: "test"))

        try await spy.save(item)

        let savedItems = await spy.savedItems
        #expect(savedItems.count == 1)
        #expect(savedItems.first?.kind == .link)
        #expect(savedItems.first?.url == "https://example.com")
        #expect(savedItems.first?.note == "test")
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

    @Test func test_supabaseRow_shouldEncodeNewEnrichmentFields() throws {
        let item = CapturedItem(from: IngressResult(primaryURL: "https://example.com", note: nil))
        let row = SupabaseRow(from: item)
        let data = try JSONEncoder().encode(row)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(json.keys.contains("captured_title"))
        #expect(json.keys.contains("captured_description"))
        #expect(json["enrichment"] as? String == "none")
    }
}

// MARK: - Helpers

actor SpyCaptureStore: CaptureStore {
    private(set) var savedItems: [CapturedItem] = []
    private var continuation: CheckedContinuation<CapturedItem, Never>?

    func save(_ item: CapturedItem) async throws {
        savedItems.append(item)
        continuation?.resume(returning: item)
        continuation = nil
    }

    func waitForSave() async -> CapturedItem {
        if let item = savedItems.last { return item }
        return await withCheckedContinuation { self.continuation = $0 }
    }
}

struct ThrowingCaptureStore: CaptureStore {
    struct Failure: Error {}

    func save(_ item: CapturedItem) async throws {
        throw Failure()
    }
}
