import SwiftUI

public enum StepState: CaseIterable, Equatable, Sendable {
    case done, active, failed, todo

    func fill(for side: Side) -> Color {
        switch self {
        case .done: side.accent
        case .active: side.tint
        case .failed: Tokens.bad
        case .todo: .clear
        }
    }

    func border(for side: Side) -> Color {
        switch self {
        case .active: side.accent
        case .todo: Tokens.lineStrong
        default: .clear
        }
    }

    var titleColor: Color { self == .todo ? Tokens.text3 : Tokens.text }

    func detailColor(for side: Side) -> Color {
        switch self {
        case .done: Tokens.text2
        case .active: side.accentHi
        case .failed: Tokens.bad
        case .todo: Tokens.text3
        }
    }

    func connectorColor(for side: Side) -> Color { self == .done ? side.accent : Tokens.line }
}

/// A session's ordered step; its position supplies the displayed number.
public struct SessionStep: Equatable, Sendable {
    public let state: StepState
    public let title: String
    public let detail: String

    public init(_ state: StepState, title: String, detail: String) {
        self.state = state
        self.title = title
        self.detail = detail
    }
}

private struct StepNode: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let state: StepState
    let side: Side
    let number: Int
    let diameter: CGFloat
    let numberSize: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(state.fill(for: side))
            Circle().strokeBorder(state.border(for: side), lineWidth: state == .active ? 2 : 1.5)
            switch state {
            case .done, .failed:
                Image(systemName: state == .done ? "checkmark" : "xmark")
                    .font(.system(size: diameter * 0.55, weight: .semibold))
                    .foregroundStyle(Tokens.onAccent)
            case .active:
                Circle().fill(side.accentHi).frame(width: diameter * 0.34, height: diameter * 0.34)
            case .todo:
                Text("\(number)").font(Tokens.mono(numberSize, .medium)).foregroundStyle(Tokens.text3)
            }
        }
        .frame(width: diameter, height: diameter)
        .animation(Motion.fast(reduced: reduceMotion).animation, value: state)
        .accessibilityHidden(true)
    }
}

public struct HostRailStep: View {
    let step: SessionStep
    let number: Int
    let isLast: Bool

    public init(_ step: SessionStep, number: Int, isLast: Bool = false) {
        self.step = step
        self.number = number
        self.isLast = isLast
    }

    public var body: some View {
        HStack(alignment: .top, spacing: Tokens.space3) {
            VStack(spacing: Tokens.space1) {
                StepNode(state: step.state, side: .host, number: number,
                         diameter: Tokens.space7, numberSize: Tokens.sizeEyebrow)
                if !isLast {
                    Capsule().fill(step.state.connectorColor(for: .host)).frame(width: 2)
                }
            }
            .frame(width: Tokens.space7)
            .frame(maxHeight: .infinity, alignment: .top)
            VStack(alignment: .leading, spacing: Tokens.space1) {
                Text(step.title).font(TypeRole.label.font).foregroundStyle(step.state.titleColor)
                Text(step.detail).font(TypeRole.small.font).foregroundStyle(step.state.detailColor(for: .host))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, Tokens.space1)
        }
        .frame(height: isLast ? 52 : 76, alignment: .top)
        .accessibilityElement(children: .combine)
        .accessibilityValue(Text(String(describing: step.state)))
    }
}

public struct HostRail: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let steps: [SessionStep]

    public init(_ steps: [SessionStep]) { self.steps = steps }

    public var body: some View {
        VStack(spacing: 0) {
            ForEach(steps.indices, id: \.self) { index in
                HostRailStep(steps[index], number: index + 1, isLast: index == steps.indices.last)
            }
        }
        .animation(Motion.fast(reduced: reduceMotion).animation, value: steps)
    }
}

public struct ClientStepperStep: View {
    let step: SessionStep
    let number: Int
    let isLast: Bool

    public init(_ step: SessionStep, number: Int, isLast: Bool = false) {
        self.step = step
        self.number = number
        self.isLast = isLast
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: Tokens.space2) {
            HStack(spacing: Tokens.space2) {
                StepNode(state: step.state, side: .client, number: number,
                         diameter: Tokens.space6, numberSize: Tokens.sizeMicro)
                if !isLast {
                    Capsule().fill(step.state.connectorColor(for: .client)).frame(height: 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: Tokens.space1) {
                Text(step.title).font(Tokens.text(Tokens.sizeSmall, .semibold)).foregroundStyle(step.state.titleColor)
                Text(step.detail).font(TypeRole.micro.font).foregroundStyle(step.state.detailColor(for: .client))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityValue(Text(String(describing: step.state)))
    }
}

public struct ClientStepper: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let steps: [SessionStep]

    public init(_ steps: [SessionStep]) { self.steps = steps }

    public var body: some View {
        HStack(alignment: .top, spacing: Tokens.space2) {
            ForEach(steps.indices, id: \.self) { index in
                ClientStepperStep(steps[index], number: index + 1, isLast: index == steps.indices.last)
                    .frame(width: index == steps.indices.last ? 64 : nil)
            }
        }
        .animation(Motion.fast(reduced: reduceMotion).animation, value: steps)
    }
}
