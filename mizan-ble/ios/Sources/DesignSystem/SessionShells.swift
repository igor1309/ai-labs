import SwiftUI

/// The host session rail beside the current stage. Its parent supplies the size.
/// It lays out inside the safe area; its backgrounds reach the screen's edges.
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
            .padding(.top, Tokens.space12)
            .padding(.horizontal, Tokens.space7)
            .padding(.bottom, Tokens.space2)
            .frame(width: 300)
            .frame(maxHeight: .infinity, alignment: .top)
            .background(Tokens.rail, ignoresSafeAreaEdges: .all)
            VStack(alignment: .leading, spacing: Tokens.space6) {
                HStack {
                    Text(eyebrow).font(Tokens.mono(Tokens.sizeSmall, .medium)).tracking(1.5)
                        .foregroundStyle(Tokens.text2)
                    Spacer(minLength: Tokens.space2)
                    status
                }
                content.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .padding(.top, Tokens.space12)
            .padding(.horizontal, Tokens.space14)
            .padding(.bottom, Tokens.space7)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.ground, ignoresSafeAreaEdges: .all)
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
/// It lays out inside the safe area; its backgrounds reach the screen's edges.
public struct IPhoneShell<Steps: View, Content: View, Actions: View>: View {
    let side: Side
    let eyebrow: String
    let status: StatusPill
    let onSwitch: (Side) -> Void
    let steps: Steps
    let content: Content
    let actions: Actions

    public init(
        side: Side = .client, eyebrow: String, status: StatusPill,
        onSwitch: @escaping (Side) -> Void,
        @ViewBuilder steps: () -> Steps, @ViewBuilder content: () -> Content,
        @ViewBuilder actions: () -> Actions
    ) {
        self.side = side
        self.eyebrow = eyebrow
        self.status = status
        self.onSwitch = onSwitch
        self.steps = steps()
        self.content = content()
        self.actions = actions()
    }

    public var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: Tokens.space5) {
                ModeHeader(side: side, layout: .bar, onSwitch: onSwitch).shellFrame(.header)
                steps
            }
            .padding(.top, Tokens.space2)
            .padding([.horizontal, .bottom], Tokens.space5)
            .frame(maxWidth: .infinity)
            .background {
                UnevenRoundedRectangle(bottomLeadingRadius: 28, bottomTrailingRadius: 28)
                    .fill(Tokens.rail)
                    .ignoresSafeArea(edges: [.top, .horizontal])
            }
            VStack(alignment: .leading, spacing: Tokens.space4) {
                HStack {
                    Text(eyebrow).font(Tokens.mono(Tokens.sizeMicro, .medium)).tracking(1.5)
                        .foregroundStyle(Tokens.text2)
                    Spacer(minLength: Tokens.space2)
                    status
                }
                .shellFrame(.eyebrow)
                // Content takes what is left and can never push the header or
                // the actions, so every screen keeps them in the same place.
                content.frame(maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                ActionStack { actions }.shellFrame(.actions)
            }
            .padding([.top, .horizontal], Tokens.space5)
            .padding(.bottom, Tokens.space2)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.ground, ignoresSafeAreaEdges: .all)
    }
}

public extension IPhoneShell where Actions == EmptyView {

    init(
        side: Side = .client, eyebrow: String, status: StatusPill,
        onSwitch: @escaping (Side) -> Void,
        @ViewBuilder steps: () -> Steps, @ViewBuilder content: () -> Content
    ) {
        self.init(side: side, eyebrow: eyebrow, status: status, onSwitch: onSwitch,
                  steps: steps, content: content, actions: { EmptyView() })
    }
}

/// The actions at the foot of a screen, full width, one under the other.
public struct ActionStack<Actions: View>: View {
    let actions: Actions

    public init(@ViewBuilder actions: () -> Actions) { self.actions = actions() }

    public var body: some View {
        VStack(spacing: Tokens.space2) { actions }
    }
}

public extension View {
    /// The device a design frame draws, for previews and the gallery, where no
    /// real screen supplies one: its status bar and home indicator as a safe
    /// area, and its outline.
    func deviceScreen(_ size: CGSize, cornerRadius: CGFloat, safeArea: EdgeInsets) -> some View {
        safeAreaPadding(safeArea)
            .frame(width: size.width, height: size.height)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .overlay { RoundedRectangle(cornerRadius: cornerRadius).strokeBorder(Tokens.lineSoft, lineWidth: 1) }
    }
}

public extension EdgeInsets {
    /// The status bar and home indicator a design frame draws on an iPhone.
    static let iPhoneScreen = EdgeInsets(top: 48, leading: 0, bottom: 24, trailing: 0)
    /// The status bar and home indicator a design frame draws on an iPad.
    static let iPadScreen = EdgeInsets(top: 24, leading: 0, bottom: 20, trailing: 0)
}
