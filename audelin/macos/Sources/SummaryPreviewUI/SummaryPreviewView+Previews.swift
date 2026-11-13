import SwiftUI

#Preview("Notes · Light") { SummaryPreviewView(state: SummaryPreviews.state("notes"), event: { _ in }, render: SummaryPreviews.plain).frame(width: 440, height: 560).preferredColorScheme(.light) }
#Preview("Notes · Dark") { SummaryPreviewView(state: SummaryPreviews.state("notes"), event: { _ in }, render: SummaryPreviews.plain).frame(width: 440, height: 560).preferredColorScheme(.dark) }
#Preview("Unreadable") { SummaryPreviewView(state: SummaryPreviews.state("unreadable"), event: { _ in }, render: SummaryPreviews.plain).frame(width: 440, height: 560) }
#Preview("Making") { SummaryPreviewView(state: SummaryPreviews.state("making"), event: { _ in }, render: SummaryPreviews.plain).frame(width: 440, height: 560) }
#Preview("Failed") { SummaryPreviewView(state: SummaryPreviews.state("failed"), event: { _ in }, render: SummaryPreviews.plain).frame(width: 440, height: 560) }
#Preview("No selection") { SummaryPreviewView(state: SummaryPreviews.state("no-selection"), event: { _ in }, render: SummaryPreviews.plain).frame(width: 440, height: 560) }
