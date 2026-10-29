import CoreGraphics
import Foundation
import ImageIO
import SwiftUI
import Testing
import UniformTypeIdentifiers
@testable import DesignSystem

@MainActor
struct RenderTests {

    /// Points in the sign's view box: the first ones lie on its strokes, the
    /// rest in the gaps between them.
    @Test func drawsTheSignsStrokesAndLeavesItsGaps() throws {

        let image = try #require(render(MizanSign().fill(.white).frame(width: 83, height: 158), scale: 1))

        for point in [(36, 6), (50, 25), (6, 100), (-5, 95), (-5, 107)] {
            #expect(alpha(image, at: point) > 0.9, "no ink at \(point)")
        }
        for point in [(20, 25), (20, 50), (40, 100), (-5, 101), (6, -20)] {
            #expect(alpha(image, at: point) < 0.1, "ink at \(point)")
        }
    }

    @Test func emptiesTheRingAsTimeRunsOut() {

        #expect(CountdownRing(secondsLeft: 47, total: 60).fraction == 47.0 / 60)
        #expect(CountdownRing(secondsLeft: 0, total: 60).fraction == 0)
        #expect(CountdownRing(secondsLeft: 90, total: 60).fraction == 1)
        #expect(CountdownRing(secondsLeft: 5, total: 0).fraction == 0)
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func rendersEveryComponent(scheme: ColorScheme) throws {

        for (name, view) in components {
            let image = try #require(render(view.environment(\.colorScheme, scheme)), "\(name) did not render")
            #expect(image.width > 0 && image.height > 0, "\(name)")
            #expect(hasInk(image), "\(name) drew nothing")
        }

        let gallery = try #require(render(DesignSystemGallery().environment(\.colorScheme, scheme)))
        try save(gallery, "gallery-\(scheme == .dark ? "dark" : "light")")
    }

    @Test func galleryDrawsTheGroundForEachAppearance() throws {

        var samples: [[UInt8]] = []
        for scheme in [ColorScheme.light, .dark] {
            let image = try #require(render(DesignSystemGallery().environment(\.colorScheme, scheme), scale: 1))
            // The gallery's padding leaves this pixel entirely on its ground.
            let offset = (2 * image.width + 2) * 4
            let sample = Array(pixels(image)[offset..<(offset + 4)])
            var environment = EnvironmentValues()
            environment.colorScheme = scheme
            let ground = Tokens.ground.resolve(in: environment)
            let expected = [ground.red, ground.green, ground.blue, ground.opacity]
                .map { UInt8(($0 * 255).rounded()) }
            #expect(sample == expected, "ground in \(scheme)")
            samples.append(sample)
        }
        #expect(samples[0] != samples[1])
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func typeRolesApplyDefaultsAndAllowForegroundOverrides(scheme: ColorScheme) throws {
        for role in TypeRole.allCases {
            let styles = [
                AnyShapeStyle(role.color),
                AnyShapeStyle(Tokens.bad),
                AnyShapeStyle(LinearGradient(colors: [Tokens.host, Tokens.client], startPoint: .leading, endPoint: .trailing)),
            ]
            for (index, style) in styles.enumerated() {
                let base = Text("Mizan 47").typeRole(role)
                let styled = index == 0 ? base : base.foregroundStyle(style)
                let explicit = Text("Mizan 47").font(role.font).tracking(role.tracking).foregroundStyle(style)
                let actual = try #require(render(styled.environment(\.colorScheme, scheme)))
                let expected = try #require(render(explicit.environment(\.colorScheme, scheme)))
                #expect(actual.width == expected.width && actual.height == expected.height, "\(role)")
                let matches = pixels(actual) == pixels(expected)
                #expect(matches, "\(role): style \(index) in \(scheme)")
            }
        }
    }

    @Test func railOmitsTheFinalConnector() throws {
        let step = SessionStep(.done, title: "Amount", detail: "Locked")
        let connected = try #require(render(HostRailStep(step, number: 1).frame(width: 244), scale: 1))
        let last = try #require(render(HostRailStep(step, number: 1, isLast: true).frame(width: 244), scale: 1))
        #expect(connected.height == 76)
        #expect(last.height == 52)
        #expect(pixels(connected)[(60 * connected.width + 14) * 4 + 3] > 0)
        #expect(pixels(last)[(48 * last.width + 14) * 4 + 3] == 0)
        let rail = try #require(render(HostRail([step, step]).frame(width: 244), scale: 1))
        #expect(rail.height == 128)
        #expect(pixels(rail)[(124 * rail.width + 14) * 4 + 3] == 0)
    }

    @Test func stepperOmitsTheFinalConnector() throws {
        let step = SessionStep(.done, title: "Find", detail: "Ready")
        let connected = try #require(render(ClientStepperStep(step, number: 1).frame(width: 100), scale: 1))
        let last = try #require(render(ClientStepperStep(step, number: 1, isLast: true).frame(width: 100), scale: 1))
        #expect(pixels(connected)[(12 * connected.width + 80) * 4 + 3] > 0)
        #expect(pixels(last)[(12 * last.width + 80) * 4 + 3] == 0)
        let row = try #require(render(ClientStepper([step, step]).frame(width: 200), scale: 1))
        #expect(pixels(row)[(12 * row.width + 80) * 4 + 3] > 0)
        #expect(pixels(row)[(12 * row.width + 180) * 4 + 3] == 0)
    }

    @Test func compactHeaderShowsTheActiveOrFailedStepAndTheLastCompletedStep() {
        for index in 0..<5 {
            for state in [StepState.active, .failed] {
                let steps = (0..<5).map {
                    SessionStep($0 < index ? .done : ($0 == index ? state : .todo), title: "Step", detail: "Detail")
                }
                #expect(CompactHostSteps(steps, onSettings: {}).currentStepIndex == index)
            }
        }
        let done = Array(repeating: SessionStep(.done, title: "Step", detail: "Done"), count: 5)
        #expect(CompactHostSteps(done, onSettings: {}).currentStepIndex == 4)
        #expect(CompactHostSteps([], onSettings: {}).currentStepIndex == nil)
    }

    @Test func compactKeysKeepTheirTouchTargetWithinAColumn() throws {
        for key in [AnyView(KeypadKey("9", size: .compact) {}),
                    AnyView(KeypadKey(systemImage: "delete.left", accessibilityLabel: "Delete", size: .compact) {})] {
            let image = try #require(render(key.frame(width: 96), scale: 1))
            #expect(image.width == 96)
            #expect(image.height == 48)
            #expect(hasInk(image))
        }
    }

    private var components: [(String, AnyView)] {

        var views: [(String, AnyView)] = []
        for kind in ActionButtonStyle.Kind.allCases {
            let button = Button {} label: { Label("Label", systemImage: "lock") }
                .buttonStyle(.action(kind))
                .frame(width: 300)
            views.append(("button \(kind)", AnyView(button)))
        }
        for size in AmountView.Size.allCases {
            views.append(("amount \(size)", AnyView(AmountView("124.50", size: size))))
        }
        for side in Side.allCases {
            views.append(("countdown \(side)", AnyView(CountdownRing(secondsLeft: 47, total: 60, side: side))))
            views.append(("rail header \(side)", AnyView(ModeHeader(side: side, layout: .rail) { _ in })))
            views.append(("bar header \(side)", AnyView(ModeHeader(side: side, layout: .bar) { _ in }.frame(width: 353))))
        }
        for outcome in Outcome.allCases {
            views.append(("result card \(outcome)", AnyView(ResultCard(outcome, title: "Title").frame(width: 320))))
            views.append(("compact result card \(outcome)", AnyView(ResultCard(outcome, title: "Title", isCompact: true) {
                Button("New amount") {}.buttonStyle(.action(.host))
            }.frame(width: 353))))
        }
        views.append(("compact countdown", AnyView(CountdownRing(secondsLeft: 47, total: 60, isCompact: true))))
        for role in TypeRole.allCases {
            views.append(("type \(role)", AnyView(Text("Mizan 47").typeRole(role))))
        }
        for state in StatusPill.State.allCases {
            views.append(("pill \(state)", AnyView(StatusPill("Status", state: state))))
        }
        let steps = StepState.allCases.map { SessionStep($0, title: "Step", detail: "Detail") }
        for (index, step) in steps.enumerated() {
            views.append(("rail \(step.state)", AnyView(HostRailStep(step, number: index + 1).frame(width: 244))))
            views.append(("stepper \(step.state)", AnyView(ClientStepperStep(step, number: index + 1).frame(width: 120))))
        }
        views.append(("host rail", AnyView(HostRail(steps).frame(width: 244))))
        for enabled in [true, false] {
            views.append(("compact host steps \(enabled)", AnyView(
                CompactHostSteps(steps, isSettingsEnabled: enabled, onSettings: {}).frame(width: 353)
            )))
        }
        for state in [StepState.active, .failed, .done] {
            views.append(("compact host step \(state)", AnyView(CompactHostSteps([
                SessionStep(state, title: "Client approval", detail: "On their iPhone")
            ], onSettings: {}).frame(width: 353))))
        }
        views.append(("client stepper", AnyView(ClientStepper(steps).frame(width: 353))))
        for kind in DeviceChip.Kind.allCases {
            views.append(("chip \(kind)", AnyView(DeviceChip(kind, code: "H2", state: "Ready"))))
        }
        for direction in Message.Direction.allCases {
            for tone in Message.Tone.allCases {
                views.append(("message \(direction) \(tone)", AnyView(
                    Message("Handshake", direction: direction, tone: tone).frame(width: 240)
                )))
            }
        }
        views.append(("exchange strip", AnyView(ExchangeStrip(
            host: DeviceChip(.host, code: "H2", state: "Advertising"),
            message: Message("advertise · on lock", tone: .host),
            client: DeviceChip(.client, code: "C1", state: "Ready")
        ).frame(width: 560))))
        views.append(("compact exchange strip", AnyView(ExchangeStrip(
            host: DeviceChip(.host, code: "H4", state: "Awaiting client"),
            message: Message("amount sent", tone: .host),
            client: DeviceChip(.client, code: "C3", state: "Reviewing"), isCompact: true
        ).frame(width: 353))))
        views.append(("digit key", AnyView(KeypadKey("7") {})))
        views.append(("icon key", AnyView(KeypadKey(systemImage: "delete.left", accessibilityLabel: "Delete") {})))
        for size in [(1194.0, 834.0), (1024.0, 768.0)] {
            views.append(("iPad shell \(size)", AnyView(IPadShell(
                eyebrow: "STEP 2 OF 5 · ADVERTISE", status: StatusPill("Advertising", state: .host),
                deviceCode: "MIZAN-7F3A", deviceMeta: "Advertised name · 60 s", onSwitch: { _ in }, onSettings: {}
            ) { HostRail(steps) } content: { Text("Content").typeRole(.body) }
                .frame(width: size.0, height: size.1))))
        }
        for size in [(393.0, 852.0), (430.0, 932.0)] {
            views.append(("compact host shell \(size)", AnyView(IPhoneShell(
                side: .host, eyebrow: "STEP 1 OF 5 · AMOUNT", status: StatusPill("Idle"),
                onSwitch: { _ in }, headerTopPadding: Tokens.space2, contentBottomPadding: Tokens.space4
            ) { CompactHostSteps(steps, onSettings: {}) } content: { Text("Content").typeRole(.body) }
                .frame(width: size.0, height: size.1))))
            views.append(("iPhone shell \(size)", AnyView(IPhoneShell(
                eyebrow: "STEP 1 OF 4 · FIND", status: StatusPill("Idle"), onSwitch: { _ in }
            ) { ClientStepper(steps) } content: { Text("Content").typeRole(.body) }
                .frame(width: size.0, height: size.1))))
        }
        return views
    }
}

@MainActor
private func render(_ view: some View, scale: CGFloat = 2) -> CGImage? {

    let renderer = ImageRenderer(content: view)
    renderer.scale = scale
    return renderer.cgImage
}

/// The image in premultiplied RGBA bytes, top row first.
private func pixels(_ image: CGImage) -> [UInt8] {

    var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
    let context = CGContext(
        data: &bytes,
        width: image.width,
        height: image.height,
        bitsPerComponent: 8,
        bytesPerRow: image.width * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB),
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
    )
    context?.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return bytes
}

/// The opacity at a point in the sign's view box, for an image of the box
/// drawn at one pixel per unit.
private func alpha(_ image: CGImage, at point: (Int, Int)) -> Double {

    let x = point.0 - Int(MizanSign.box.minX)
    let y = point.1 - Int(MizanSign.box.minY)
    return Double(pixels(image)[(y * image.width + x) * 4 + 3]) / 255
}

private func hasInk(_ image: CGImage) -> Bool {

    let bytes = pixels(image)
    return stride(from: 3, to: bytes.count, by: 4).contains { bytes[$0] > 0 }
}

/// Writes the image only when `MIZAN_SNAPSHOTS` names a folder, for comparing
/// the components with the design by eye.
private func save(_ image: CGImage, _ name: String) throws {

    guard let folder = ProcessInfo.processInfo.environment["MIZAN_SNAPSHOTS"] else { return }

    let url = URL(fileURLWithPath: folder).appendingPathComponent("\(name).png") as CFURL
    let destination = try #require(CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil))
    CGImageDestinationAddImage(destination, image, nil)
    #expect(CGImageDestinationFinalize(destination))
}
