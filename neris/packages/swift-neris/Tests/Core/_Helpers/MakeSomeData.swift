import Foundation

func makeSomeData(
    _ string: String = makeSomeString()
) -> Data {

    Data(string.utf8)
}
