import assert from "node:assert/strict";
import { test } from "node:test";
import { createProgramFlow, initialSession } from "../src/program-flow.js";
import { keyboard } from "../src/telegram-adapter.js";

function setup() {
  const calls = [];
  const programs = [
    { programId: "program-a", title: "Algebra", description: "Study algebra." },
    { programId: "program-b", title: "Geometry" },
  ];
  const navigation = {
    topics: [{ entityId: "topic-id", acceptedKind: "topic", title: "Vectors" }],
    ungroupedConcepts: [{ entityId: "concept-id", acceptedKind: "concept", title: "Basis" }],
    ungroupedMaterials: [{ entityId: "material-id", acceptedKind: "material_reference", title: "Notes" }],
  };
  const node = {
    entityId: "topic-id", acceptedKind: "topic", title: "Vectors", body: "A vector has direction.",
    relationships: { outgoing: [
      { toEntityId: "child-id", toKind: "concept", toTitle: "Child" },
      { toEntityId: "other-child-id", toKind: "material_reference", toTitle: "Reading" },
    ] },
  };
  const client = {
    listPrograms: async () => { calls.push(["listPrograms"]); return { programs }; },
    navigation: async (id) => { calls.push(["navigation", id]); return { navigation }; },
    entity: async (id) => { calls.push(["entity", id]); return { navigationNode: node }; },
  };
  return { calls, programs, navigation, node, client, flow: createProgramFlow({ client }) };
}

test("program list includes titles, descriptions and indexed actions in JSON state", async () => {
  const { flow, calls } = setup();
  const result = await flow(initialSession());
  assert.equal(result.content, "Programs\n\nAlgebra\nStudy algebra.\n\nGeometry");
  assert.deepEqual(result.actions, [
    { id: "open_0", label: "Algebra" }, { id: "open_1", label: "Geometry" },
    { id: "programs", label: "Programs" },
  ]);
  assert.equal(result.session.screen, "programs");
  assert.equal(result.session.step, 1);
  assert.deepEqual(result.session, JSON.parse(JSON.stringify(result.session)));
  assert.deepEqual(calls, [["listPrograms"]]);
});

test("program navigation shows all groups with one shared index list", async () => {
  const { flow, calls } = setup();
  const list = await flow(initialSession());
  const result = await flow(list.session, "open_1");
  assert.equal(result.content, "Geometry\n\nTopics\nVectors\n\nUngrouped concepts\nBasis\n\nUngrouped materials\nNotes");
  assert.deepEqual(result.actions, [
    { id: "open_0", label: "Vectors" }, { id: "open_1", label: "Basis" },
    { id: "open_2", label: "Notes" }, { id: "back", label: "Back" },
    { id: "programs", label: "Programs" },
  ]);
  assert.equal(result.session.programId, "program-b");
  assert.equal(result.session.screen, "program");
  assert.deepEqual(calls.at(-1), ["navigation", "program-b"]);
});

test("an item index resolves from the saved screen even if the API list is reordered", async () => {
  const { flow, programs, calls } = setup();
  const list = await flow(initialSession());
  const saved = JSON.parse(JSON.stringify(list.session));
  programs.reverse();
  const opened = await flow(saved, "open_0");
  assert.equal(opened.session.programId, "program-a");
  assert.deepEqual(calls.at(-1), ["navigation", "program-a"]);
});

for (const [index, entityId] of [[0, "topic-id"], [1, "concept-id"], [2, "material-id"]]) {
  test(`program item ${index} opens entity ${entityId}`, async () => {
    const { flow, calls } = setup();
    const list = await flow(initialSession());
    const program = await flow(list.session, "open_0");
    const result = await flow(program.session, `open_${index}`);
    assert.equal(result.session.entityId, entityId);
    assert.deepEqual(calls.at(-1), ["entity", entityId]);
  });
}

test("entity screen shows title, body and outgoing items and resolves their indices", async () => {
  const { flow, calls } = setup();
  const list = await flow(initialSession());
  const program = await flow(list.session, "open_0");
  const result = await flow(program.session, "open_0");
  assert.equal(result.content, "Vectors\n\nA vector has direction.\n\nOutgoing items\n\nChild\nReading");
  assert.deepEqual(result.actions, [
    { id: "open_0", label: "Child" }, { id: "open_1", label: "Reading" },
    { id: "back", label: "Back" }, { id: "programs", label: "Programs" },
  ]);
  for (const [index, id] of [[0, "child-id"], [1, "other-child-id"]]) {
    const opened = await flow(result.session, `open_${index}`);
    assert.equal(opened.session.entityId, id);
    assert.deepEqual(calls.at(-1), ["entity", id]);
  }
});

test("Back retraces nested entities, the program and the list after JSON persistence", async () => {
  const { flow } = setup();
  let result = await flow(initialSession());
  for (const action of ["open_1", "open_0", "open_1"]) result = await flow(result.session, action);
  for (const expected of [
    { screen: "entity", entityId: "topic-id" },
    { screen: "program", programId: "program-b" },
    { screen: "programs" },
  ]) {
    const previous = JSON.parse(JSON.stringify(result.session));
    result = await flow(previous, "back");
    for (const [key, value] of Object.entries(expected)) assert.equal(result.session[key], value);
    assert.equal(result.session.step, previous.step + 1);
  }
  assert.ok(!result.actions.some((action) => action.id === "back"));
});

test("Programs from an entity clears Back history", async () => {
  const { flow } = setup();
  const list = await flow(initialSession());
  const program = await flow(list.session, "open_0");
  const entity = await flow(program.session, "open_0");
  const result = await flow(entity.session, "programs");
  assert.equal(result.session.screen, "programs");
  assert.deepEqual(result.session.history, []);
  assert.ok(!result.actions.some((action) => action.id === "back"));
});

test("invalid and stale indices are refused without requests or state changes", async () => {
  const { flow, programs, calls } = setup();
  const list = await flow(initialSession());
  programs.pop();
  const refreshed = await flow(list.session);
  const before = structuredClone(refreshed.session);
  const count = calls.length;
  for (const action of ["open_1", "open_-1", "open_0.5", "open_01", "open_9007199254740993", "unknown", "back"]) {
    assert.equal(await flow(refreshed.session, action), null);
  }
  assert.deepEqual(refreshed.session, before);
  assert.equal(calls.length, count);
  assert.equal(refreshed.session.step, list.session.step + 1);
});

test("UUIDs stay in state while callback data remains within Telegram's 64 bytes", async () => {
  const { flow, programs } = setup();
  programs[0].programId = "faca8453-0aaf-4586-9872-9877e41cc553";
  const result = await flow(initialSession());
  assert.equal(result.session.items[0].id, programs[0].programId);
  for (const row of keyboard(result.actions, result.session.step).inline_keyboard) {
    assert.ok(Buffer.byteLength(row[0].callback_data) <= 64);
    assert.ok(!row[0].callback_data.includes(programs[0].programId));
  }
});

test("empty screens retain navigation and have no item actions", async () => {
  const { flow, programs, navigation, node } = setup();
  const list = await flow(initialSession());
  navigation.topics = navigation.ungroupedConcepts = navigation.ungroupedMaterials = [];
  const program = await flow(list.session, "open_0");
  assert.match(program.content, /Topics\nNone\./);
  assert.deepEqual(program.actions.map((action) => action.id), ["back", "programs"]);
  programs.length = 0;
  const empty = await flow(program.session, "programs");
  assert.equal(empty.content, "Programs\n\nNo programs.");
  assert.deepEqual(empty.actions, [{ id: "programs", label: "Programs" }]);
  node.body = "";
  node.relationships.outgoing = [];
  const entity = await flow({ step: 4, screen: "entity", entityId: "leaf", items: [], history: [] });
  assert.equal(entity.content, "Vectors\n\nOutgoing items\n\nNone.");
});

test("failed reads leave the previous state intact", async () => {
  const { flow, client } = setup();
  const list = await flow(initialSession());
  const before = structuredClone(list.session);
  client.navigation = async () => { throw new Error("navigation failed"); };
  await assert.rejects(flow(list.session, "open_0"), /navigation failed/);
  assert.deepEqual(list.session, before);
});

test("a saved canned session opens Programs with a fresh step", async () => {
  const { flow } = setup();
  const result = await flow({ step: 9, depth: 1, lastContent: "Canned" });
  assert.equal(result.session.screen, "programs");
  assert.equal(result.session.step, 10);
  assert.ok(!("depth" in result.session));
});

test("a material with content shows its text without front matter", async () => {
  const { flow, client, calls, node } = setup();
  Object.assign(node, { entityId: "material-id", acceptedKind: "material_reference", title: "Notes", body: "Lecture.", hasContent: true });
  node.relationships.outgoing = [];
  client.materialContent = async (id) => {
    calls.push(["materialContent", id]);
    return { content: "---\nmodel: x\n---\n\n# Ethics\n\nText." };
  };
  const result = await flow({ step: 1, screen: "entity", entityId: "material-id", items: [], history: [] });
  assert.deepEqual(calls, [["entity", "material-id"], ["materialContent", "material-id"]]);
  assert.equal(result.content, "Notes\n\nLecture.\n\n# Ethics\n\nText.\n\nOutgoing items\n\nNone.");
});

for (const [name, change] of [
  ["a topic", { acceptedKind: "topic", hasContent: true }],
  ["a material without content", { acceptedKind: "material_reference", hasContent: false }],
]) {
  test(`${name} reads no material content`, async () => {
    const { flow, client, calls, node } = setup();
    Object.assign(node, change);
    client.materialContent = async () => { throw new Error("not expected"); };
    await flow({ step: 1, screen: "entity", entityId: "topic-id", items: [], history: [] });
    assert.deepEqual(calls, [["entity", "topic-id"]]);
  });
}
