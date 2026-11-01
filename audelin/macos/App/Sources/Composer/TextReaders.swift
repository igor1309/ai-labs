import class SideText.SideText
import class FillIn.FillIn
import class CallText.CallText
import struct CallText.State
import class TranscriptWriting.TranscriptWriting

typealias SideReader = SideText
typealias FillReader = FillIn
typealias CallReader = CallText
typealias WritingReader = TranscriptWriting<State>
