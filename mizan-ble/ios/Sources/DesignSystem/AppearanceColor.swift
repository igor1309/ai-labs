import SwiftUI

/// Resolves through SwiftUI's environment so explicit colour-scheme overrides
/// work the same way as the device's appearance on every platform.
struct AppearanceColor: ShapeStyle, Hashable {

    let dark: Color
    let light: Color

    func resolve(in environment: EnvironmentValues) -> Color.Resolved {

        let color = environment.colorScheme == .light ? light : dark
        return color.resolve(in: environment)
    }
}
