// Reads the participant roster, and who is speaking, from a Telemost call
// document.
//
// Telemost exposes no participant ID, so an ID names one observed tile: the
// same video element under the same name keeps its ID across reads, and a
// replaced or renamed tile gets a new one. Only test IDs and structure are
// read, never localised labels or generated class names.

const END_CALL = 'button[data-testid="end-call-alt-button"]';
const SHARE = 'button[data-testid="share-button"]';
const CAMERA = 'button[data-testid="turn-on-camera-button"], button[data-testid="turn-off-camera-button"]';
const ENTER = 'button[data-testid="enter-conference-button"]';
const MAX_NAME = 200;
const SPEAKING_GREEN = "rgb(29, 204, 102)";

// newId: () => string, called once for each tile seen for the first time.
// afterStyle: (element) => the computed style of its ::after pseudo-element;
// the browser's is getComputedStyle(element, "::after").
export function createRosterReader({ newId, afterStyle }) {
  const seen = new WeakMap();

  function idFor(video, name) {
    let known = seen.get(video);
    if (!known || known.name !== name) {
      known = { name, id: newId() };
      seen.set(video, known);
    }
    return known.id;
  }

  // Returns { inCall: false } for a page that is not a connected call, and
  // { inCall: true, participants: [{ id, name, isSelf }], speakingIds } for
  // one, where speakingIds lists the remote participants marked as speaking.
  return function readRoster(doc) {
    if (doc.querySelector(ENTER) || !hasCallToolbar(doc)) return { inCall: false };

    const participants = [];
    const byTrack = new Map();
    const speakingIds = [];
    for (const video of doc.querySelectorAll('[data-video-root="true"] video')) {
      const tile = video.parentElement;
      if (!tile || !shown(tile)) continue;
      const name = tileName(tile);
      if (!name) continue;
      const isSelf = mirrored(doc, video);
      // Speaker view shows the same track in the main tile and a thumbnail.
      const track = video.getAttribute("data-g_track_id")?.trim();
      const key = track ? JSON.stringify([track, name, isSelf]) : null;
      let participant = key ? byTrack.get(key) : undefined;
      if (!participant) {
        participant = { id: idFor(video, name), name, isSelf };
        participants.push(participant);
        if (key) byTrack.set(key, participant);
      }
      if (!isSelf && marksSpeaking(tile, video) && !speakingIds.includes(participant.id)) {
        speakingIds.push(participant.id);
      }
    }
    // Two tiles with one name may be two people: say nobody is speaking
    // rather than give one person's speech to the other.
    const names = participants.map((participant) => participant.name);
    const ambiguous = new Set(names).size !== names.length;
    return { inCall: true, participants, speakingIds: ambiguous ? [] : speakingIds };
  };

  // A speaking tile's overlay draws a green border in its ::after; a muted
  // tile is never marked speaking.
  function marksSpeaking(tile, video) {
    if (tile.querySelector('[data-testid="micro-off-icon"]')) return false;
    return [...tile.children].some((overlay) => {
      if (overlay === video || !shown(overlay)) return false;
      const style = afterStyle(overlay);
      return (
        style.content === '""' &&
        style.borderTopStyle === "solid" &&
        parseFloat(style.borderTopWidth) >= 2 &&
        style.borderTopColor === SPEAKING_GREEN
      );
    });
  }
}

// A connected call has one end-call button in a toolbar with Share and
// Camera; the shell's own controls exist before joining and prove nothing.
function hasCallToolbar(doc) {
  const ends = [...doc.querySelectorAll(END_CALL)].filter(shown);
  if (ends.length !== 1) return false;
  for (let node = ends[0].parentElement, depth = 0; node && depth < 5; node = node.parentElement, depth++) {
    if (node.querySelector(SHARE) && node.querySelector(CAMERA)) return true;
  }
  return false;
}

// A tile's name is its one span whose title equals its text.
function tileName(tile) {
  const names = [...tile.querySelectorAll("span[title]")].filter(
    (span) => !span.closest('button, [role="menu"]') && span.getAttribute("title") === span.textContent.trim(),
  );
  if (names.length !== 1) return null;
  const name = names[0].textContent.trim();
  return name && name.length <= MAX_NAME ? name : null;
}

// The local camera preview is mirrored.
function mirrored(doc, video) {
  const transform = doc.defaultView.getComputedStyle(video).transform ?? "";
  return /^matrix(?:3d)?\(\s*-1(?:\.0+)?\s*,/.test(transform) || /^scaleX\(\s*-1\s*\)/.test(transform);
}

function shown(element) {
  const view = element.ownerDocument.defaultView;
  for (let node = element; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  }
  return true;
}
