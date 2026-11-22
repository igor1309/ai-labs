import Foundation


/// The name notes use for the user: the Zoom name, else the Mac account's
/// full name, else none. A blank value counts as none.
func userName(zoom: String?, account: String) -> String? {
    for name in [zoom, account] {
        if let name = name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty { return name }
    }
    return nil
}
