import SwiftUI

#Preview("Calls · Light") { CallsListView(state: CallsListPreviews.state("calls"), event: { _ in }).frame(width: 920, height: 420).preferredColorScheme(.light) }
#Preview("Calls · Dark") { CallsListView(state: CallsListPreviews.state("calls"), event: { _ in }).frame(width: 920, height: 420).preferredColorScheme(.dark) }
#Preview("Notes") { CallsListView(state: CallsListPreviews.state("notes"), event: { _ in }).frame(width: 920, height: 420) }
#Preview("Notes · Selected") { CallsListView(state: CallsListPreviews.state("notes-selected"), event: { _ in }).frame(width: 920, height: 420) }
#Preview("Notes · Previewed") { CallsListView(state: CallsListPreviews.state("notes-previewed"), event: { _ in }).frame(width: 920, height: 420) }
#Preview("Delete") { CallsListView(state: CallsListPreviews.state("delete"), event: { _ in }).frame(width: 920, height: 420) }
#Preview("Rename") { CallsListView(state: CallsListPreviews.state("rename"), event: { _ in }).frame(width: 920, height: 420) }
