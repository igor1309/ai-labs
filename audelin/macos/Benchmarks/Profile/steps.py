"""steps.py SMALL LARGE [SMALL LARGE...]: CPU per word by step, and its growth, per pair of runs."""
import json,re,sys
from collections import Counter
if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
    print(__doc__)
    sys.exit(0)
STEPS=[
 ('transcript render and write',r'TranscriptFile|WritingTranscript|TranscriptWriting|SessionTranscriptFile|Transcript\.'),
 ('repeat checks',r'ReadingState\.==|ReadingState\.Lines\.==|Dictionary<>\.==|PanelState\.==|SessionState\.=='),
 ('reducer',r'ReadingReducer|makeReading'),
 ('state log',r'StateLog'),
 ('panel mapping',r'panelState|panelLines|PanelState|ReadingPresenter|AudelinPanel'),
 ('mapping to reading',r'readingText|ReadingTextUpdate|ReadingSubscription|ReadingState'),
 ('call text merge',r'CallText|CallSide'),
 ('side text',r'SideText|SideHearing'),
 ('recogniser to live text',r'LiveText|TrackText|Segments|SpeakingRecognizer|NewestText|TwoPass'),
 ('session and state plumbing',r'ObservableModel|SessionModel|StateFeed|subscribe\(|makeSession|RecordingSessions|SessionPieces|ObservedSession|SessionState'),
]
STEPS=[(n,re.compile(r)) for n,r in STEPS]
def table(p):
    d=json.load(open(p)); c=Counter(); words=d['words']
    for s,w in d['stacks'].items():
        fr=json.loads(s)
        if any(re.search(r'Call\.(waitForWord|speakOneWord)',f) for f in fr):
            c['benchmark harness']+=w/words/1e6; continue
        for f in fr:
            hit=next((n for n,r in STEPS if r.search(f)),None)
            if hit: break
        else: hit='runtime, no app frame'
        c[hit]+=w/words/1e6
    return c,d['total_ns']/words/1e6
pairs=[(sys.argv[i],sys.argv[i+1]) for i in range(1,len(sys.argv),2)]
rows=[]
for a,b in pairs:
    x,tx=table(f'runs/{a}/stacks.json'); y,ty=table(f'runs/{b}/stacks.json')
    rows.append((x,y,tx,ty))
    print(a,b,f'{tx:.2f} {ty:.2f} growth {ty-tx:.2f}')
x,y,tx,ty=rows[0]
for n in sorted(set(y)|set(x),key=lambda n:-(y[n]-x[n])):
    print(f"{n:30}"+"  ".join(f"{r[0][n]:5.2f} {r[1][n]:5.2f} {r[1][n]-r[0][n]:5.2f} {100*(r[1][n]-r[0][n])/(r[3]-r[2]):4.0f}%" for r in rows))
