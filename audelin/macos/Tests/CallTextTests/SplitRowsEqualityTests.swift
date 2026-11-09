import SplitRows
import Testing

@Suite struct SplitRowsEqualityTests {

    @Test func theSameElementsSplitDifferentlyAreEqual() {

        #expect(SplitRows(sealed: [1, 2], tail: [3, 4]) == SplitRows(sealed: [1], tail: [2, 3, 4]))
    }

    @Test(arguments: [0, 1, 2, 3])
    func oneDifferentElementSplitDifferentlyIsNotEqual(position: Int) {

        var other = [1, 2, 3, 4]
        other[position] = 9
        #expect(SplitRows(sealed: [1, 2], tail: [3, 4]) != SplitRows(sealed: Array(other[..<1]), tail: Array(other[1...])))
    }

    @Test func oneMoreElementSplitDifferentlyIsNotEqual() {

        #expect(SplitRows(sealed: [1, 2], tail: [3]) != SplitRows(sealed: [1], tail: [2, 3, 4]))
    }
}
