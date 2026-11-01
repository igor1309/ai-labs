# App icon

`Audelin.icon` is the Icon Composer source (LAB-609): the two-tracks design
as a dark fill and two glass groups (the recording dot; my track and their
track), each layer a transparent 1024 px PNG exported from the "Icon Composer
layers" of "Screen 9 — App icon, two tracks, Liquid Glass edition" in `../../../docs/design/visual-language.pen`. Open it in Icon Composer
(inside Xcode) to adjust glass, shadow and appearances.

The bundle script compiles it into the app:

    xcrun actool Audelin.icon --compile <Resources> --app-icon Audelin \
      --platform macosx --minimum-deployment-target <target> \
      --output-partial-info-plist <plist>

which writes `Assets.car` and a fallback `Audelin.icns`, and sets
`CFBundleIconName` and `CFBundleIconFile` to `Audelin`.
