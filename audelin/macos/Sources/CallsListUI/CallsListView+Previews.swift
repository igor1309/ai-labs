import SwiftUI

#Preview("Calls · Light") { CallsListView(state: CallsListPreviews.state("calls"), text: .init(language: .russian), event: { _ in }).frame(width: 920, height: 420).preferredColorScheme(.light) }
#Preview("Calls · Dark") { CallsListView(state: CallsListPreviews.state("calls"), text: .init(language: .russian), event: { _ in }).frame(width: 920, height: 420).preferredColorScheme(.dark) }
#Preview("Notes") { CallsListView(state: CallsListPreviews.state("notes"), text: .init(language: .russian), event: { _ in }).frame(width: 920, height: 420) }
#Preview("Notes · Selected") { CallsListView(state: CallsListPreviews.state("notes-selected"), text: .init(language: .russian), event: { _ in }).frame(width: 920, height: 420) }
#Preview("Delete") { CallsListView(state: CallsListPreviews.state("delete"), text: .init(language: .russian), event: { _ in }).frame(width: 920, height: 420) }
#Preview("Rename") { CallsListView(state: CallsListPreviews.state("rename"), text: .init(language: .russian), event: { _ in }).frame(width: 920, height: 420) }
