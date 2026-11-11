import SwiftUI

extension GlassLedger {

    /// The colours remote speakers take in turn, starting with the plain Them colour.
    public var remoteSpeakers: [Color] { [them, them2, them3, them4] }

    /// The colour of the remote speaker at a 1-based `place` in the speakers list; plain
    /// Them without one. Places past the palette take its colours again in order.
    public func remoteSpeaker(_ place: Int?) -> Color {

        guard let place, place > 0 else { return them }
        return remoteSpeakers[(place - 1) % remoteSpeakers.count]
    }
}
