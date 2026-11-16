@testable import Composer

/// A Zoom name never shown and never saved.
let unknownZoomName = ZoomName(read: { nil }, remember: { _ in })
