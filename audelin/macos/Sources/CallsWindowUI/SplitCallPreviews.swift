import GlassLedger
import SummaryPreviewUI
import SwiftUI

/// The split frames, each rendered in light and dark.
public enum SplitCallPreviews: String, CaseIterable, Sendable {
    case split, splitting, failed, unavailable, narrow

    public var width: CGFloat {
        switch self {
        case .narrow: 560
        case .unavailable: 320
        default: 600
        }
    }

    public var sheet: SplitCallSheetState? {
        guard self != .unavailable else { return nil }
        let choices: [SplitCallSheetState.Choice] = [
            .init(id: 1239, gap: "23 с", cut: "20:39",
                  before: .init(time: "20:16", speaker: "Them 1", words: "Всем пока, до завтра."),
                  after: .init(time: "20:39", speaker: "Я", words: "Так, начинаем Android daily."), transition: true),
            .init(id: 1862, gap: "15 с", cut: "31:02",
                  before: .init(time: "30:47", speaker: "Them 1", words: "Ладно, с этим разобрались."),
                  after: .init(time: "31:02", speaker: "Them 2", words: "По тестам у нас два упавших.")),
            .init(id: 252, gap: "11 с", cut: "4:12",
                  before: .init(time: "4:01", speaker: "Я", words: "Хорошо, давай дальше."),
                  after: .init(time: "4:12", speaker: "Them 1", words: "У меня вчера был ревью.")),
        ]
        let status: SplitCallSheetState.Status
        switch self {
        case .splitting: status = .working
        case .failed: status = .failed("Не хватило места на диске для звука второй части.")
        default: status = .choosing
        }
        return .init(call: "«iOS & Android daily», 25.11 · 09:59 · 41:20", choices: choices, selected: 1239,
                     first: .init(prefix: "2026.11.25-0959", span: "09:59 · 20:39", title: "iOS daily"),
                     second: .init(prefix: "2026.11.25-1019", span: "10:19 · 20:41", title: "Android daily"),
                     status: status, editable: self != .splitting, canConfirm: self != .splitting)
    }

    public var unavailableReason: String {
        "Разделить можно, когда Audelin ничего не записывает и не готовит итоги."
    }

    @MainActor @ViewBuilder public func view() -> some View {
        let text = SummaryPreviewText(language: .russian)
        if let sheet {
            SplitCallSheet(state: sheet, text: text, event: { _ in }).frame(width: width)
        } else {
            UnavailableSplitPreview(reason: unavailableReason, title: text(.splitAction)).frame(width: width)
        }
    }
}

private struct UnavailableSplitPreview: View {
    let reason: String
    let title: String
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let tokens = GlassLedger.for(scheme)
        VStack(alignment: .trailing, spacing: tokens.space8) {
            ButtonPreview(reason: reason, title: title)
                .frame(width: tokens.space40, height: tokens.space32)
            Text(reason)
                .font(tokens.ui(tokens.typeSmall))
                .padding(tokens.space8)
                .background(tokens.surface, in: .rect(cornerRadius: tokens.radiusControl))
                .overlay { RoundedRectangle(cornerRadius: tokens.radiusControl).strokeBorder(tokens.rule) }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(tokens.space16)
        .foregroundStyle(tokens.text)
        .background(tokens.win)
    }

    private struct ButtonPreview: NSViewRepresentable {
        let reason: String
        let title: String
        func makeNSView(context: Context) -> NSButton { SplitCallButton(target: nil, action: nil) }
        func updateNSView(_ view: NSButton, context: Context) {
            (view as? SplitCallButton)?.show(.unavailable(reason), title: title)
        }
    }
}
