import SwiftUI

/// The host session rail beside the current stage. Its parent supplies the size.
/// It fills the screen to its edges; the rail and the stage keep the design's
/// insets, or clear the status bar and home indicator where those are larger.
public struct IPadShell<Steps: View, Content: View>: View {
    let side: Side
    let eyebrow: String
    let status: StatusPill
    let deviceCode: String
    let deviceMeta: String
    let onSwitch: (Side) -> Void
    let onSettings: () -> Void
    let isSettingsEnabled: Bool
    let steps: Steps
    let content: Content

    public init(
        side: Side = .host, eyebrow: String, status: StatusPill,
        deviceCode: String, deviceMeta: String,
        onSwitch: @escaping (Side) -> Void, onSettings: @escaping () -> Void,
        isSettingsEnabled: Bool = true,
        @ViewBuilder steps: () -> Steps, @ViewBuilder content: () -> Content
    ) {
        self.side = side
        self.eyebrow = eyebrow
        self.status = status
        self.deviceCode = deviceCode
        self.deviceMeta = deviceMeta
        self.onSwitch = onSwitch
        self.onSettings = onSettings
        self.isSettingsEnabled = isSettingsEnabled
        self.steps = steps()
        self.content = content()
    }

    public var body: some View {
        GeometryReader { proxy in layout(proxy.safeAreaInsets) }
            .ignoresSafeArea(.container)
    }

    private func layout(_ safe: EdgeInsets) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: Tokens.space8) {
                ModeHeader(side: side, layout: .rail, onSwitch: onSwitch)
                VStack(alignment: .leading, spacing: Tokens.space5) {
                    Text("THIS SESSION").font(TypeRole.eyebrow.font).tracking(TypeRole.eyebrow.tracking)
                        .foregroundStyle(Tokens.text3)
                    steps
                }
                Spacer(minLength: 0)
                deviceFooter
            }
            .padding(.top, clear(Tokens.space18, safe.top))
            .padding(.leading, clear(Tokens.space7, safe.leading))
            .padding(.trailing, Tokens.space7)
            .padding(.bottom, clear(Tokens.space7, safe.bottom))
            .frame(width: 300 + safe.leading)
            .frame(maxHeight: .infinity, alignment: .top)
            .background(Tokens.rail)
            VStack(alignment: .leading, spacing: Tokens.space6) {
                HStack {
                    Text(eyebrow).font(Tokens.mono(Tokens.sizeSmall, .medium)).tracking(1.5)
                        .foregroundStyle(Tokens.text2)
                    Spacer(minLength: Tokens.space2)
                    status
                }
                content.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .padding(.top, clear(Tokens.space18, safe.top))
            .padding(.leading, Tokens.space14)
            .padding(.trailing, clear(Tokens.space14, safe.trailing))
            .padding(.bottom, clear(Tokens.space12, safe.bottom))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.ground)
    }

    private var deviceFooter: some View {
        HStack {
            VStack(alignment: .leading, spacing: Tokens.space1) {
                Text(deviceCode).font(Tokens.mono(Tokens.sizeSmall, .semibold)).foregroundStyle(Tokens.text)
                Text(deviceMeta).font(Tokens.text(Tokens.sizeEyebrow)).foregroundStyle(Tokens.text3)
            }
            Spacer(minLength: Tokens.space1)
            SettingsGear(isEnabled: isSettingsEnabled, action: onSettings)
        }
        .padding(.top, Tokens.space5)
        .overlay(alignment: .top) { Rectangle().fill(Tokens.line).frame(height: 1) }
    }
}

struct SettingsGear: View {
    let isEnabled: Bool
    let action: () -> Void

    @Environment(\.isEnabled) private var environmentIsEnabled

    private var enabled: Bool { isEnabled && environmentIsEnabled }

    var body: some View {
        Button {
            guard enabled else { return }
            action()
        } label: {
            Image(systemName: "gearshape").font(.system(size: 20))
                .foregroundStyle(enabled ? Tokens.text : Tokens.text3)
                .frame(width: Tokens.space10, height: Tokens.space10)
                .background(Tokens.overlay, in: RoundedRectangle(cornerRadius: Tokens.radiusMd))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .allowsHitTesting(enabled)
        .accessibilityLabel("Settings")
    }
}

/// The session header above the current stage. Its parent supplies the size.
/// It fills the screen to its edges; the header and the stage keep their
/// insets, or clear the status bar and home indicator where those are larger.
public struct IPhoneShell<Steps: View, Content: View>: View {
    let side: Side
    let eyebrow: String
    let status: StatusPill
    let onSwitch: (Side) -> Void
    let headerTopPadding: CGFloat
    let contentBottomPadding: CGFloat
    let steps: Steps
    let content: Content

    public init(
        side: Side = .client, eyebrow: String, status: StatusPill,
        onSwitch: @escaping (Side) -> Void, headerTopPadding: CGFloat = Tokens.space14,
        contentBottomPadding: CGFloat = Tokens.space8,
        @ViewBuilder steps: () -> Steps, @ViewBuilder content: () -> Content
    ) {
        self.side = side
        self.eyebrow = eyebrow
        self.status = status
        self.onSwitch = onSwitch
        self.headerTopPadding = headerTopPadding
        self.contentBottomPadding = contentBottomPadding
        self.steps = steps()
        self.content = content()
    }

    public var body: some View {
        GeometryReader { proxy in layout(proxy.safeAreaInsets) }
            .ignoresSafeArea(.container)
    }

    private func layout(_ safe: EdgeInsets) -> some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: Tokens.space5) {
                ModeHeader(side: side, layout: .bar, onSwitch: onSwitch)
                steps
            }
            .padding(.top, clear(headerTopPadding, safe.top))
            .padding(.leading, clear(Tokens.space5, safe.leading))
            .padding(.trailing, clear(Tokens.space5, safe.trailing))
            .padding(.bottom, Tokens.space5)
            .frame(maxWidth: .infinity)
            .background(Tokens.rail, in: UnevenRoundedRectangle(
                bottomLeadingRadius: 28, bottomTrailingRadius: 28
            ))
            VStack(alignment: .leading, spacing: Tokens.space4) {
                HStack {
                    Text(eyebrow).font(Tokens.mono(Tokens.sizeMicro, .medium)).tracking(1.5)
                        .foregroundStyle(Tokens.text2)
                    Spacer(minLength: Tokens.space2)
                    status
                }
                content.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .padding(.top, Tokens.space5)
            .padding(.leading, clear(Tokens.space5, safe.leading))
            .padding(.trailing, clear(Tokens.space5, safe.trailing))
            .padding(.bottom, clear(contentBottomPadding, safe.bottom))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.ground)
    }
}

/// A design inset, or a gap past the safe area inset when that reaches further.
private func clear(_ design: CGFloat, _ safe: CGFloat) -> CGFloat {
    max(design, safe + Tokens.space2)
}

public extension View {
    /// The device outline the design frames draw around a screen; for previews
    /// and the gallery, where no real screen edge clips the shell.
    func deviceOutline(_ cornerRadius: CGFloat) -> some View {
        clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .overlay { RoundedRectangle(cornerRadius: cornerRadius).strokeBorder(Tokens.lineSoft, lineWidth: 1) }
    }
}
