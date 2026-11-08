import AppKit

/// The character's line in the text view's own coordinates, laid out first.
/// `firstRect` answers in screen coordinates and gives a zero rect for text
/// TextKit 2 has not laid out yet, which a slow runner reaches after an update.
@MainActor
func laidOutRect(of index: Int, in text: NSTextView) -> NSRect? {

    guard let layout = text.textLayoutManager, let content = layout.textContentManager,
          let location = content.location(content.documentRange.location, offsetBy: index) else { return nil }
    layout.ensureLayout(for: NSTextRange(location: location))
    guard let fragment = layout.textLayoutFragment(for: location) else { return nil }
    return fragment.layoutFragmentFrame.offsetBy(dx: text.textContainerOrigin.x, dy: text.textContainerOrigin.y)
}

/// The first character of the line at a point in the text view's coordinates.
@MainActor
func characterIndex(at point: NSPoint, in text: NSTextView) -> Int? {

    guard let layout = text.textLayoutManager, let content = layout.textContentManager else { return nil }
    let inContainer = NSPoint(x: point.x - text.textContainerOrigin.x, y: point.y - text.textContainerOrigin.y)
    layout.ensureLayout(for: CGRect(origin: inContainer, size: CGSize(width: 1, height: 1)))
    guard let fragment = layout.textLayoutFragment(for: inContainer) else { return nil }
    return content.offset(from: content.documentRange.location, to: fragment.rangeInElement.location)
}

/// The bounds of the line that holds `part`, in the text view.
@MainActor
func lineFrame(of part: String, in text: NSTextView) -> NSRect? {

    let location = (text.string as NSString).range(of: part).location
    guard location != NSNotFound,
          let layout = text.textLayoutManager,
          let content = layout.textContentManager,
          let start = content.location(content.documentRange.location, offsetBy: location),
          let fragment = layout.textLayoutFragment(for: start),
          let line = fragment.textLineFragments.first(where: {
              $0.characterRange.contains(location - content.offset(from: content.documentRange.location, to: fragment.rangeInElement.location))
          })
    else { return nil }

    let origin = fragment.layoutFragmentFrame.origin
    return line.typographicBounds.offsetBy(dx: origin.x + text.textContainerOrigin.x, dy: origin.y + text.textContainerOrigin.y)
}
