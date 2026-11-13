import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createCallObserver } from "../src/observer.js";
import { createRosterReader } from "../src/roster.js";
import { fixtureAfterStyle } from "./after-style.js";

const fixture = (name) => readFileSync(new URL(`fixtures/telemost/${name}.html`, import.meta.url), "utf8");

// show() replaces the page with another fixture, as a Telemost re-render
// does: its tiles are new nodes. Tests that keep tiles mutate the page.
function makeSUT(first) {
  const doc = new JSDOM(fixture(first)).window.document;
  const events = [];
  let clock = 0;
  let count = 0;
  const observe = createCallObserver({
    readRoster: createRosterReader({ newId: () => `tile-${++count}`, afterStyle: fixtureAfterStyle }),
    now: () => clock,
    emit: (event) => events.push(event),
  });
  return {
    doc,
    events,
    at(ms) {
      clock = ms;
      observe(doc);
      return events.splice(0);
    },
    show(name) {
      doc.documentElement.innerHTML = new JSDOM(fixture(name)).window.document.documentElement.innerHTML;
    },
  };
}

function setSpeaking(doc, name, speaking) {
  for (const span of doc.querySelectorAll("span[title]")) {
    if (span.title === name) span.closest(".overlay").classList.toggle("speaking", speaking);
  }
}

const roster = [
  { id: "tile-1", name: "Анна Петрова", isSelf: true },
  { id: "tile-2", name: "Boris Ivanov", isSelf: false },
  { id: "tile-3", name: "Chen Wei", isSelf: false },
];

test("observe_shouldEmitTheRoster_onFirstReadingACall", () => {
  const sut = makeSUT("speaking-nobody");

  assert.deepEqual(sut.at(1000), [{ type: "roster", at: 1000, participants: roster }]);
});

test("observe_shouldEmitNothing_whenNothingChanged", () => {
  const sut = makeSUT("speaking-nobody");
  sut.at(1000);

  assert.deepEqual(sut.at(1250), []);
});

test("observe_shouldEmitNothing_onAPageThatIsNotACall", () => {
  const sut = makeSUT("prejoin");

  assert.deepEqual(sut.at(1000), []);
});

test("observe_shouldEmitStartAndStop_asARemoteSpeaks", () => {
  const sut = makeSUT("speaking-nobody");
  sut.at(1000);

  setSpeaking(sut.doc, "Boris Ivanov", true);
  assert.deepEqual(sut.at(1500), [{ type: "speakingStarted", at: 1500, id: "tile-2" }]);
  assert.deepEqual(sut.at(1750), []);
  setSpeaking(sut.doc, "Boris Ivanov", false);
  assert.deepEqual(sut.at(2400), [{ type: "speakingStopped", at: 2400, id: "tile-2" }]);
});

test("observe_shouldEmitOverlappingIntervals_whenTwoSpeakAtOnce", () => {
  const sut = makeSUT("speaking-nobody");
  sut.at(1000);

  setSpeaking(sut.doc, "Boris Ivanov", true);
  sut.at(1100);
  setSpeaking(sut.doc, "Chen Wei", true);
  assert.deepEqual(sut.at(1200), [{ type: "speakingStarted", at: 1200, id: "tile-3" }]);
  setSpeaking(sut.doc, "Boris Ivanov", false);
  assert.deepEqual(sut.at(1300), [{ type: "speakingStopped", at: 1300, id: "tile-2" }]);
});

test("observe_shouldEmitTheSpeakerWithTheRoster_whenAlreadySpeakingAtFirstRead", () => {
  const sut = makeSUT("speaking-two");

  assert.deepEqual(sut.at(1000), [
    { type: "roster", at: 1000, participants: roster },
    { type: "speakingStarted", at: 1000, id: "tile-2" },
    { type: "speakingStarted", at: 1000, id: "tile-3" },
  ]);
});

test("observe_shouldStopASpeaker_beforeTheRosterThatDropsThem", () => {
  const sut = makeSUT("speaking-two");
  sut.at(1000);

  sut.doc.querySelectorAll(".tile")[2].remove();
  assert.deepEqual(sut.at(2000), [
    { type: "speakingStopped", at: 2000, id: "tile-3" },
    { type: "roster", at: 2000, participants: roster.slice(0, 2) },
  ]);
});

test("observe_shouldEmitTheNewRoster_whenAParticipantJoins", () => {
  const sut = makeSUT("gallery-one-remote");
  sut.at(1000);

  const tile = sut.doc.querySelectorAll(".tile")[1];
  const joined = tile.cloneNode(true);
  joined.querySelector("span[title]").title = "Chen Wei";
  joined.querySelector("span[title]").textContent = "Chen Wei";
  tile.after(joined);

  assert.deepEqual(sut.at(2000), [
    {
      type: "roster",
      at: 2000,
      participants: [
        { id: "tile-1", name: "Анна Петрова", isSelf: true },
        { id: "tile-2", name: "Boris Ivanov", isSelf: false },
        { id: "tile-3", name: "Chen Wei", isSelf: false },
      ],
    },
  ]);
});

test("observe_shouldStopSpeakersAndEndTheCall_whenThePageLeavesTheCall", () => {
  const sut = makeSUT("speaking-two");
  sut.at(1000);

  sut.show("not-a-call");
  assert.deepEqual(sut.at(3000), [
    { type: "speakingStopped", at: 3000, id: "tile-2" },
    { type: "speakingStopped", at: 3000, id: "tile-3" },
    { type: "callEnded", at: 3000 },
  ]);
  assert.deepEqual(sut.at(3500), []);
});

test("observe_shouldStartAFreshRoster_whenACallIsJoinedAgain", () => {
  const sut = makeSUT("speaking-nobody");
  sut.at(1000);
  sut.show("not-a-call");
  sut.at(2000);

  sut.show("speaking-nobody");
  assert.deepEqual(sut.at(3000), [
    {
      type: "roster",
      at: 3000,
      participants: [
        { id: "tile-4", name: "Анна Петрова", isSelf: true },
        { id: "tile-5", name: "Boris Ivanov", isSelf: false },
        { id: "tile-6", name: "Chen Wei", isSelf: false },
      ],
    },
  ]);
});
