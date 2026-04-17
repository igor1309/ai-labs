import Foundation

func makeSomeHTTPURLResponse(
    statusCode: Int = 200
) -> HTTPURLResponse {

    .init(url: makeSomeURL(), statusCode: statusCode, httpVersion: nil, headerFields: nil)!
}
