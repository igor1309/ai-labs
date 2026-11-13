import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createRosterReader } from "../src/roster.js";
import { fixtureAfterStyle } from "./after-style.js";

function page(name) {
  const html = readFileSync(new URL(`fixtures/telemost/${name}.html`, import.meta.url), "utf8");
  return new JSDOM(html).window.document;
}

function makeSUT() {
  let count = 0;
  return createRosterReader({ newId: () => `tile-${++count}`, afterStyle: fixtureAfterStyle });
}

test("readRoster_shouldListLocalAndRemote_inGalleryWithOneRemote", () => {
  assert.deepEqual(makeSUT()(page("gallery-one-remote")), {
    inCall: true,
    participants: [
      { id: "tile-1", name: "Анна Петрова", isSelf: true },
      { id: "tile-2", name: "Boris Ivanov", isSelf: false },
    ],
    speakingIds: [],
  });
});

test("readRoster_shouldListEveryShownTile_inGalleryWithSeveralRemotes", () => {
  assert.deepEqual(makeSUT()(page("gallery-several-remote")).participants, [
    { id: "tile-1", name: "Анна Петрова", isSelf: true },
    { id: "tile-2", name: "Boris Ivanov", isSelf: false },
    { id: "tile-3", name: "Chen Wei", isSelf: false },
    { id: "tile-4", name: "Dana Smith", isSelf: false },
  ]);
});

test("readRoster_shouldListTheSpeakerOnce_inSpeakerView", () => {
  assert.deepEqual(makeSUT()(page("speaker-view")).participants, [
    { id: "tile-1", name: "Boris Ivanov", isSelf: false },
    { id: "tile-2", name: "Анна Петрова", isSelf: true },
    { id: "tile-3", name: "Chen Wei", isSelf: false },
  ]);
});

test("readRoster_shouldKeepBothTiles_whenEqualNamesHaveNoTrack", () => {
  const doc = page("gallery-one-remote");
  const remote = doc.querySelectorAll(".tile")[1];
  remote.after(remote.cloneNode(true));

  assert.deepEqual(makeSUT()(doc).participants.map((p) => p.name), ["Анна Петрова", "Boris Ivanov", "Boris Ivanov"]);
});

test("readRoster_shouldReportNoCall_beforeJoining", () => {
  assert.deepEqual(makeSUT()(page("prejoin")), { inCall: false });
});

test("readRoster_shouldReportNoCall_onAPageThatIsNotACall", () => {
  assert.deepEqual(makeSUT()(page("not-a-call")), { inCall: false });
});

test("readRoster_shouldKeepIds_acrossReadsOfTheSameTiles", () => {
  const read = makeSUT();
  const doc = page("gallery-one-remote");
  read(doc);

  assert.deepEqual(read(doc).participants.map((p) => p.id), ["tile-1", "tile-2"]);
});

test("readRoster_shouldGiveANewId_toARenamedTile", () => {
  const read = makeSUT();
  const doc = page("gallery-one-remote");
  read(doc);
  const span = doc.querySelectorAll(".tile")[1].querySelector("span[title]");
  span.title = "Boris I.";
  span.textContent = "Boris I.";

  assert.deepEqual(read(doc).participants[1], { id: "tile-3", name: "Boris I.", isSelf: false });
});

test("readRoster_shouldSkipATile_whoseNameIsAmbiguous", () => {
  const doc = page("gallery-one-remote");
  const overlay = doc.querySelectorAll(".tile")[1].querySelector(".overlay");
  overlay.insertAdjacentHTML("beforeend", '<span title="Other">Other</span>');

  assert.deepEqual(makeSUT()(doc).participants.map((p) => p.name), ["Анна Петрова"]);
});

function speakers(read, doc) {
  const roster = read(doc);
  return roster.speakingIds.map((id) => roster.participants.find((p) => p.id === id).name);
}

test("readRoster_shouldMarkNobody_whenNoTileShowsTheBorder", () => {
  assert.deepEqual(speakers(makeSUT(), page("speaking-nobody")), []);
});

test("readRoster_shouldMarkOneRemote_andNeitherSelfNorAMutedTile", () => {
  assert.deepEqual(speakers(makeSUT(), page("speaking-one")), ["Boris Ivanov"]);
});

test("readRoster_shouldMarkBoth_whenTwoRemotesSpeakAtOnce", () => {
  assert.deepEqual(speakers(makeSUT(), page("speaking-two")), ["Boris Ivanov", "Chen Wei"]);
});

test("readRoster_shouldMarkThePresenter_andSkipTheUnnamedScreen_duringScreenShare", () => {
  const roster = makeSUT()(page("speaking-screen-share"));

  assert.deepEqual(roster.participants.map((p) => p.name), ["Анна Петрова", "Boris Ivanov", "Chen Wei"]);
  assert.deepEqual(speakers(makeSUT(), page("speaking-screen-share")), ["Boris Ivanov"]);
});

test("readRoster_shouldMarkTheSpeakerOnce_whenSpeakerViewShowsThemTwice", () => {
  const doc = page("speaker-view");
  for (const tile of doc.querySelectorAll(".tile")) {
    if (tile.querySelector("span[title]").title === "Boris Ivanov") tile.querySelector(".overlay").classList.add("speaking");
  }
  doc.head.insertAdjacentHTML("beforeend", '<style>.speaking::after { content: ""; border: 4px solid rgb(29, 204, 102); }</style>');

  assert.deepEqual(speakers(makeSUT(), doc), ["Boris Ivanov"]);
});

test("readRoster_shouldMarkNobody_whenTwoTilesShareASpeakersName", () => {
  const doc = page("speaking-one");
  const speaker = doc.querySelectorAll(".tile")[1];
  const copy = speaker.cloneNode(true);
  copy.querySelector(".overlay").classList.remove("speaking");
  speaker.after(copy);

  assert.deepEqual(makeSUT()(doc).speakingIds, []);
});

test("readRoster_shouldMarkNobody_whenTheBorderIsNotTheSpeakingGreen", () => {
  const doc = page("speaking-one");
  doc.head.insertAdjacentHTML("beforeend", "<style>.speaking::after { border-color: rgb(255, 0, 0); }</style>");

  assert.deepEqual(makeSUT()(doc).speakingIds, []);
});
