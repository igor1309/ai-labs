import SwiftUI

#Preview("Notes · Light") { SummaryPreviewView(state: SummaryPreviews.state("notes"), copy: {}).frame(width: 440, height: 560).preferredColorScheme(.light) }
#Preview("Notes · Dark") { SummaryPreviewView(state: SummaryPreviews.state("notes"), copy: {}).frame(width: 440, height: 560).preferredColorScheme(.dark) }
#Preview("Unreadable") { SummaryPreviewView(state: SummaryPreviews.state("unreadable"), copy: {}).frame(width: 440, height: 560) }
