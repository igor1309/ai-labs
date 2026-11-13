// Turns successive reads of a Telemost page into events: the roster when it
// changes, and when each remote participant starts and stops speaking. Each
// event carries the browser clock's time of the read that saw the change.
//
// readRoster: (doc) => the roster reader's result for the page.
// now: () => milliseconds on the browser clock.
// emit: (event) => void.
export function createCallObserver({ readRoster, now, emit }) {
  let participants = null;
  let speaking = new Set();

  return function observe(doc) {
    const read = readRoster(doc);
    const at = now();

    if (!read.inCall) {
      if (participants === null) return;
      for (const id of speaking) emit({ type: "speakingStopped", at, id });
      emit({ type: "callEnded", at });
      participants = null;
      speaking = new Set();
      return;
    }

    const nowSpeaking = new Set(read.speakingIds);
    for (const id of speaking) {
      if (!nowSpeaking.has(id)) emit({ type: "speakingStopped", at, id });
    }
    if (participants === null || !sameRoster(participants, read.participants)) {
      participants = read.participants;
      emit({ type: "roster", at, participants });
    }
    for (const id of nowSpeaking) {
      if (!speaking.has(id)) emit({ type: "speakingStarted", at, id });
    }
    speaking = nowSpeaking;
  };
}

function sameRoster(before, after) {
  return (
    before.length === after.length &&
    before.every((p, i) => p.id === after[i].id && p.name === after[i].name && p.isSelf === after[i].isSelf)
  );
}
