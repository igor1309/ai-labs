# Audelin feed

Go programs for following a call as Audelin records it and indexing local
repositories for the call assistant. Run them from source.

- **`audelin-feed`** reads the live call's `transcript.md` in the calls
  folder and serves its words as server-sent events on this Mac's loopback:
  `noCall`, then a `chunk` for each window of the call, then `callEnded`.
  Each client asks for its own window size and overlap. The program ends
  after its last client leaves.
- **`audelin-follow`** connects to it and prints one JSON record per line
  for a thread to read: a window's words inside marked call text, no call,
  the call's end, or the source being lost.
- **`audelin-folder-index`** writes a Markdown index of local repositories
  and their direct projects, with summaries from their READMEs.

## Run

From `audelin/feed`:

```sh
go run ./cmd/audelin-feed -calls ~/Recordings/Audelin [-port 47820]
go run ./cmd/audelin-follow [-port 47820] [-size 180] [-overlap 60]
mkdir -p ../../.claude/skills/call-assistant
go run ./cmd/audelin-folder-index -out ../../.claude/skills/call-assistant/folders.md ~/Developer
```

`audelin-follow` exits 0 after the call's end, 1 when the source was lost,
2 when no source is running and 3 when the source refused the window size.

## Test

`sh scripts/test.sh` checks formatting, vets and runs every test with the
race detector. Tests run on a fake clock and temp folders; none waits. The
transcripts in `callreader/testdata` are Audelin's own renderings, which
`FeedFixtureTests` in the macOS package checks byte for byte.

Behaviour: the specs under `../docs/spec/` for call events, call reader,
SSE server, SSE client, follow client and folder index.
