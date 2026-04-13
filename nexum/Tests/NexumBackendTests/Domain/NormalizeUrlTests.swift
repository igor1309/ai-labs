@testable import NexumBackend
import XCTest

final class NormalizeUrlTests: XCTestCase {

    func test_normalizeUrl_shouldReturnNormalizedGitHubUrl_onValidUrl() {
        let result = normalizeUrl("https://github.com/owner/repo")

        XCTAssertEqual(unwrapSuccess(result), "https://github.com/owner/repo")
    }

    func test_normalizeUrl_shouldStripTrailingSlash_onUrlWithTrailingSlash() {
        let result = normalizeUrl("https://github.com/owner/repo/")

        XCTAssertEqual(unwrapSuccess(result), "https://github.com/owner/repo")
    }

    func test_normalizeUrl_shouldStripDotGitSuffix_onUrlWithGitSuffix() {
        let result = normalizeUrl("https://github.com/owner/repo.git")

        XCTAssertEqual(unwrapSuccess(result), "https://github.com/owner/repo")
    }

    func test_normalizeUrl_shouldStripDotGitAndTrailingSlash_onUrlWithBoth() {
        let result = normalizeUrl("https://github.com/owner/repo.git/")

        XCTAssertEqual(unwrapSuccess(result), "https://github.com/owner/repo")
    }

    func test_normalizeUrl_shouldLowercaseSchemeAndHost_onUppercasedSchemeAndHost() {
        let result = normalizeUrl("HTTPS://GITHUB.COM/owner/repo")

        XCTAssertEqual(unwrapSuccess(result), "https://github.com/owner/repo")
    }

    func test_normalizeUrl_shouldReturnQueryOrFragmentError_onUrlWithQuery() {
        let result = normalizeUrl("https://github.com/owner/repo?tab=readme")

        XCTAssertEqual(unwrapFailure(result), .queryOrFragmentNotAllowed)
    }

    func test_normalizeUrl_shouldReturnQueryOrFragmentError_onUrlWithFragment() {
        let result = normalizeUrl("https://github.com/owner/repo#readme")

        XCTAssertEqual(unwrapFailure(result), .queryOrFragmentNotAllowed)
    }

    func test_normalizeUrl_shouldReturnInvalidPathError_onUrlWithSinglePathSegment() {
        let result = normalizeUrl("https://github.com/owner")

        XCTAssertEqual(unwrapFailure(result), .invalidPath)
    }

    func test_normalizeUrl_shouldReturnInvalidPathError_onUrlWithThreePathSegments() {
        let result = normalizeUrl("https://github.com/owner/repo/extra")

        XCTAssertEqual(unwrapFailure(result), .invalidPath)
    }

    func test_normalizeUrl_shouldReturnInvalidPathError_onUrlWithEmptyPathSegment() {
        let result = normalizeUrl("https://github.com//repo")

        XCTAssertEqual(unwrapFailure(result), .invalidPath)
    }

    func test_normalizeUrl_shouldReturnInvalidHostError_onUrlWithNonGithubHost() {
        let result = normalizeUrl("https://gitlab.com/owner/repo")

        XCTAssertEqual(unwrapFailure(result), .invalidHost)
    }

    func test_normalizeUrl_shouldReturnInvalidSchemeError_onUrlWithHttpScheme() {
        let result = normalizeUrl("http://github.com/owner/repo")

        XCTAssertEqual(unwrapFailure(result), .invalidScheme)
    }

    func test_normalizeUrl_shouldReturnEmptyInputError_onEmptyInput() {
        let result = normalizeUrl("")

        XCTAssertEqual(unwrapFailure(result), .emptyInput)
    }

    // MARK: - Helpers

    private func unwrapSuccess(
        _ result: Result<String, URLValidationError>,
        file: StaticString = #filePath,
        line: UInt = #line
    ) -> String {
        switch result {
        case let .success(value):
            return value
        case let .failure(error):
            XCTFail("Expected success, got failure: \(error)", file: file, line: line)
            return ""
        }
    }

    private func unwrapFailure(
        _ result: Result<String, URLValidationError>,
        file: StaticString = #filePath,
        line: UInt = #line
    ) -> URLValidationError {
        switch result {
        case .success:
            XCTFail("Expected failure, got success", file: file, line: line)
            return .invalidURL
        case let .failure(error):
            return error
        }
    }
}
