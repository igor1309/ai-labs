import AppKit

// AppKit doubles for TranscriptLogTests.

final class GeometryDocument: NSView {

    override var isFlipped: Bool { true }
}

final class ScrollingClipView: NSClipView {

    var didScroll: (() -> Void)?

    override func scroll(to newOrigin: NSPoint) {

        super.scroll(to: newOrigin)
        didScroll?()
    }
}

/// A text storage that records every range it is asked to style.
final class RecordingStorage: NSTextStorage {

    private let backing: NSMutableAttributedString
    private(set) var styled: [NSRange] = []
    private(set) var replaced: [NSRange] = []

    init(_ string: NSAttributedString) {
        backing = NSMutableAttributedString(attributedString: string)
        super.init()
    }

    required init?(coder: NSCoder) { fatalError() }
    required init?(pasteboardPropertyList propertyList: Any, ofType type: NSPasteboard.PasteboardType) { fatalError() }

    override var string: String { backing.string }

    override func attributes(at location: Int, effectiveRange range: NSRangePointer?) -> [NSAttributedString.Key: Any] {
        backing.attributes(at: location, effectiveRange: range)
    }

    override func replaceCharacters(in range: NSRange, with str: String) {
        replaced.append(range)
        backing.replaceCharacters(in: range, with: str)
        edited(.editedCharacters, range: range, changeInLength: (str as NSString).length - range.length)
    }

    override func setAttributes(_ attrs: [NSAttributedString.Key: Any]?, range: NSRange) {
        styled.append(range)
        backing.setAttributes(attrs, range: range)
        edited(.editedAttributes, range: range, changeInLength: 0)
    }
}
