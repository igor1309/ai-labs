import class SideText.SideText
import class FillIn.FillIn
import class CallText.CallText
import class TranscriptWriting.TranscriptWriting

typealias SideReader = SideText<TranscriptSegment>
typealias FillReader = FillIn<TranscriptSegment>
typealias CallReader = CallText<TranscriptSegment>
typealias WritingReader = TranscriptWriting<CallState>
