import Foundation
import Testing

class TestContext {
    private var teardownBlocks: [() -> Void] = []

    func addTeardownBlock(_ block: @escaping () -> Void) {
        teardownBlocks.append(block)
    }

    deinit {
        teardownBlocks.reversed().forEach { $0() }
    }
}

extension TestContext {

    func trackForMemoryLeaks(
        _ instance: AnyObject,
        sourceLocation: SourceLocation = #_sourceLocation
    ) {
        addTeardownBlock { [weak instance] in
            #expect(
                instance == nil,
                "Instance should have been deallocated. Potential memory leak",
                sourceLocation: sourceLocation
            )
        }
    }
}
