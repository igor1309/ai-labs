import assert from "node:assert/strict";
import { test } from "node:test";
import { createProgramFlow, initialSession, paginate, sectionPages } from "../src/program-flow.js";
import { keyboard } from "../src/telegram-adapter.js";

function setup({ pageSize } = {}) {
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
      { toEntityId: "reading-id", toKind: "material_reference", toTitle: "Reading" },
      { toEntityId: "other-id", toKind: "concept", toTitle: "Other" },
    ] },
  };
  const material = "---\nmodel: x\n---\n\n# Ethics\n\nFirst part.\n\nSecond part.";
  const client = {
    listPrograms: async () => { calls.push(["listPrograms"]); return { programs }; },
    navigation: async (id) => { calls.push(["navigation", id]); return { navigation }; },
    entity: async (id) => { calls.push(["entity", id]); return { navigationNode: node }; },
    materialContent: async (id) => { calls.push(["materialContent", id]); return { content: material }; },
  };
  const flow = createProgramFlow({ client, ...(pageSize ? { pageSize } : {}) });
  return { calls, programs, navigation, node, client, flow };
}

const ids = (actions) => actions.map((action) => action.id);
const makeMaterial = (node, change = {}) => Object.assign(node, {
  entityId: "material-id", acceptedKind: "material_reference", title: "Notes", body: "Lecture.",
  hasContent: true, relationships: { outgoing: [] }, ...change,
});
const entityState = (change = {}) => ({ step: 1, screen: "entity", entityId: "material-id", items: [], history: [], ...change });

test("the program list numbers programs and offers a number key for each, without Programs", async () => {
  const { flow } = setup();
  const result = await flow(initialSession());
  assert.deepEqual(result.view, {
    title: "Programs",
    lists: [{ heading: null, entries: [{ index: 0, n: 1, label: "Algebra" }, { index: 1, n: 2, label: "Geometry" }] }],
    empty: undefined,
  });
  assert.deepEqual(result.actions, [
    { id: "open_0", kind: "item", label: "1" }, { id: "open_1", kind: "item", label: "2" },
  ]);
  assert.equal(result.session.screen, "programs");
});

test("a program groups topics and concepts as numbers and materials as their own buttons", async () => {
  const { flow, calls } = setup();
  const list = await flow(initialSession());
  const result = await flow(list.session, "open_0");
  assert.deepEqual(calls.at(-1), ["navigation", "program-a"]);
  assert.deepEqual(result.view.lists, [
    { heading: "Materials", entries: [{ index: 2, n: undefined, label: "Notes" }] },
    { heading: "Topics", entries: [{ index: 0, n: 1, label: "Vectors" }] },
    { heading: "Concepts", entries: [{ index: 1, n: 2, label: "Basis" }] },
  ]);
  assert.deepEqual(result.actions, [
    { id: "open_0", kind: "item", label: "1" }, { id: "open_1", kind: "item", label: "2" },
    { id: "open_2", kind: "material", label: "Notes" },
    { id: "back", kind: "nav", label: "◀ Back" }, { id: "programs", kind: "nav", label: "Programs" },
  ]);
});

test("numbers follow the lists, not the API order, and each opens its own item", async () => {
  const { flow, calls } = setup();
  const result = await flow(entityState({ entityId: "topic-id" }));
  assert.deepEqual(result.view.lists, [
    { heading: "Materials", entries: [{ index: 1, n: undefined, label: "Reading" }] },
    { heading: "Concepts", entries: [{ index: 0, n: 1, label: "Child" }, { index: 2, n: 2, label: "Other" }] },
  ]);
  assert.deepEqual(result.actions.slice(0, 3), [
    { id: "open_0", kind: "item", label: "1" },
    { id: "open_1", kind: "material", label: "Reading" },
    { id: "open_2", kind: "item", label: "2" },
  ]);
  for (const [action, id] of [["open_0", "child-id"], ["open_1", "reading-id"], ["open_2", "other-id"]]) {
    await flow(result.session, action);
    assert.deepEqual(calls.at(-1), ["entity", id]);
  }
});

test("an item index resolves from the saved screen even if the API list is reordered", async () => {
  const { flow, calls, navigation } = setup();
  const list = await flow(initialSession());
  const program = await flow(list.session, "open_0");
  navigation.topics.reverse();
  await flow(JSON.parse(JSON.stringify(program.session)), "open_1");
  assert.deepEqual(calls.at(-1), ["entity", "concept-id"]);
});

test("a material is paged, without front matter, and its body shows on the first page only", async () => {
  const { flow, node, calls } = setup({ pageSize: 25 });
  makeMaterial(node);
  const first = await flow(entityState());
  assert.deepEqual(calls, [["entity", "material-id"], ["materialContent", "material-id"]]);
  assert.deepEqual(first.view, {
    title: "Notes", body: "Lecture.", lists: [], markdown: "# Ethics\n\nFirst part.",
    page: { index: 0, count: 2 }, position: { section: null, label: null, index: 0, count: 2 },
  });
  assert.deepEqual(ids(first.actions), ["next", "programs"]);
  assert.equal(first.session.page, 0);
  assert.equal(first.session.pageCount, 2);

  const second = await flow(first.session, "next");
  assert.deepEqual(second.view, {
    title: "Notes", body: undefined, lists: [], markdown: "Second part.", page: { index: 1, count: 2 },
    position: { section: null, label: null, index: 1, count: 2 },
  });
  assert.deepEqual(ids(second.actions), ["prev", "programs"]);
  assert.deepEqual(second.session.history, first.session.history);

  const back = await flow(second.session, "prev");
  assert.equal(back.view.page.index, 0);
});

test("paging past either end, or on a screen without pages, is refused", async () => {
  const { flow, node } = setup({ pageSize: 25 });
  makeMaterial(node);
  const first = await flow(entityState());
  assert.equal(await flow(first.session, "prev"), null);
  const last = await flow(first.session, "next");
  assert.equal(await flow(last.session, "next"), null);
  const list = await flow(initialSession());
  assert.equal(await flow(list.session, "next"), null);
});

test("a page beyond a shortened material shows its last page", async () => {
  const { flow, node } = setup({ pageSize: 25 });
  makeMaterial(node);
  const result = await flow(entityState({ page: 5, pageCount: 6 }));
  assert.deepEqual(result.view.page, { index: 1, count: 2 });
  assert.equal(result.session.page, 1);
});

test("a typed message redraws the current page", async () => {
  const { flow, node } = setup({ pageSize: 25 });
  makeMaterial(node);
  const first = await flow(entityState());
  const second = await flow(first.session, "next");
  const redrawn = await flow(second.session);
  assert.equal(redrawn.view.page.index, 1);
});

for (const [name, change] of [
  ["a topic", { acceptedKind: "topic", hasContent: true }],
  ["a material without content", { acceptedKind: "material_reference", hasContent: false }],
]) {
  test(`${name} reads no material content and has no pages`, async () => {
    const { flow, calls, node } = setup();
    Object.assign(node, change);
    const result = await flow(entityState({ entityId: "topic-id" }));
    assert.deepEqual(calls, [["entity", "topic-id"]]);
    assert.equal(result.view.page, undefined);
    assert.equal(result.session.pageCount, undefined);
  });
}

test("Back retraces the material, the topic, the program and the list after JSON persistence", async () => {
  const { flow, node } = setup();
  const list = await flow(initialSession());
  const program = await flow(list.session, "open_0");
  const topic = await flow(program.session, "open_0");
  makeMaterial(node);
  const material = await flow(JSON.parse(JSON.stringify(topic.session)), "open_1");
  assert.deepEqual(material.session.history, [
    { screen: "programs" },
    { screen: "program", programId: "program-a", title: "Algebra" },
    { screen: "entity", entityId: "topic-id" },
  ]);
  let current = material;
  for (const screen of ["entity", "program", "programs"]) {
    current = await flow(JSON.parse(JSON.stringify(current.session)), "back");
    assert.equal(current.session.screen, screen);
  }
  assert.equal(await flow(current.session, "back"), null);
});

test("Programs from an entity clears Back history", async () => {
  const { flow } = setup();
  const result = await flow(entityState({ entityId: "topic-id", history: [{ screen: "programs" }] }), "programs");
  assert.equal(result.session.screen, "programs");
  assert.deepEqual(result.session.history, []);
});

test("invalid and stale indices are refused without requests", async () => {
  const { flow, calls } = setup();
  const list = await flow(initialSession());
  calls.length = 0;
  for (const action of ["open_2", "open_-1", "open_01", "open_x", "unknown"]) {
    assert.equal(await flow(list.session, action), null);
  }
  assert.deepEqual(calls, []);
});

test("UUIDs stay in state while callback data remains within Telegram's 64 bytes", async () => {
  const { flow, programs } = setup();
  programs[0].programId = "11111111-2222-3333-4444-555555555555";
  const result = await flow({ ...initialSession(), step: 123456789 });
  const data = keyboard(result.actions, result.session.step).inline_keyboard.flat().map((button) => button.callback_data);
  assert.ok(data.every((value) => Buffer.byteLength(value) <= 64));
  assert.ok(data.every((value) => !value.includes(programs[0].programId)));
  assert.equal(result.session.items[0].id, programs[0].programId);
});

test("an empty program list says so and keeps no item actions", async () => {
  const { flow, programs } = setup();
  programs.length = 0;
  const result = await flow(initialSession());
  assert.equal(result.view.empty, "No programs.");
  assert.deepEqual(result.actions, []);
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

test("pages break at paragraphs, then lines, then anywhere, and lose no text", () => {
  assert.deepEqual(paginate("aaaa\n\nbbbb\n\ncc", 10), ["aaaa\n\nbbbb", "cc"]);
  assert.deepEqual(paginate("aaaa\nbbbb\ncccc", 10), ["aaaa\nbbbb", "cccc"]);
  assert.deepEqual(paginate("x".repeat(25), 10), ["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  assert.ok(paginate("word ".repeat(2000), 2500).every((page) => page.length <= 2500));
});


test("a lecture is read a screen at a time, each page saying where it is, with contents a tap away", async () => {
  const { client, node } = setup();
  makeMaterial(node);
  node.relationships = { outgoing: [{ toEntityId: "c", toTitle: "Concept", toKind: "concept" }] };
  const content = "---\nx: 1\n---\n# Lecture\n\nIntro.\n\n## A\n\naaaa\n\nbbbb\n\n## B\n\nb text";
  const flow = createProgramFlow({ pageSize: 12, client: { ...client, entity: async () => ({ navigationNode: node }),
    materialContent: async () => ({ content }) } });
  const intro = await flow(entityState());
  assert.equal(intro.view.markdown, "# Lecture");
  assert.deepEqual(intro.view.position, { section: null, label: null, index: 0, count: 2 });
  assert.deepEqual(intro.view.lists, []);
  assert.deepEqual(ids(intro.actions), ["open_0", "next", "contents", "programs"]);

  const a2 = await flow((await flow((await flow(intro.session, "next")).session, "next")).session, "next");
  assert.equal(a2.view.markdown, "bbbb");
  assert.deepEqual(a2.view.position, { section: 1, label: "A", index: 1, count: 2 });

  const contents = await flow(a2.session, "contents");
  assert.deepEqual(contents.view.contents, [
    { page: 0, n: null, label: "Intro", current: false },
    { page: 2, n: 1, label: "A", current: true },
    { page: 4, n: 2, label: "B", current: false },
  ]);
  assert.equal(contents.view.lists[0].entries[0].label, "Concept");
  assert.deepEqual(ids(contents.actions), ["open_0", "sec_0", "sec_2", "sec_4", "read", "programs"]);
  assert.equal(await flow(contents.session, "contents"), null);
  assert.equal((await flow(contents.session, "read")).view.markdown, "bbbb");

  const b = await flow(contents.session, "sec_4");
  assert.deepEqual(b.view.position, { section: 2, label: "B", index: 0, count: 1 });
  assert.equal(b.session.contents, undefined);
  assert.equal(await flow(b.session, "read"), null);
  assert.equal(await flow(b.session, "sec_9"), null);
  const list = await flow(initialSession());
  assert.equal(await flow(list.session, "sec_1"), null);
  assert.equal(await flow(list.session, "contents"), null);
});

test("section pages: a section longer than a page runs on under the same title", () => {
  assert.deepEqual(sectionPages("## A\n\naaaa\n\nbbbb\n\n## B\n\nc", 10).map((page) => [page.title, page.text]),
    [["A", "## A\n\naaaa"], ["A", "bbbb"], ["B", "## B\n\nc"]]);
  assert.deepEqual(sectionPages("plain\n\ntext", 100), [{ title: null, text: "plain\n\ntext" }]);
});
