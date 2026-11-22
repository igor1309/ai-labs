@testable import Composer
import Testing

@Suite struct UserNameTests {
    @Test(arguments: [
        (String?("Igor"), "Igor Malyarov", String?("Igor")),
        (nil, "Igor Malyarov", "Igor Malyarov"),
        ("  ", "Igor Malyarov", "Igor Malyarov"),
        (nil, " ", nil),
        ("", "", nil),
    ])
    func theZoomNameWinsOverTheAccountName(zoom: String?, account: String, expected: String?) {
        #expect(userName(zoom: zoom, account: account) == expected)
    }
}
