import Foundation

struct SummaryCallbacks: Sendable {
    var waiting: @Sendable (URL) async -> Void
    static let disabled = Self(waiting: { _ in })
}
