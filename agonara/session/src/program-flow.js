// The session flow: given the session state and an action, it returns the
// screen as meaning (title, text, numbered lists, actions by kind) and the
// updated state. How a screen is drawn is the surface's business.
export const PAGE_SIZE = 2500;

export function initialSession() {
  return { step: 0, screen: "programs", items: [], history: [] };
}

const MATERIAL = "material_reference";
const HEADINGS = { topic: "Topics", concept: "Concepts", [MATERIAL]: "Materials" };

export function createProgramFlow({ client, pageSize = PAGE_SIZE }) {
  return async function flow(session, actionId) {
    // Older state files have no screen; the next message opens the program list.
    const current = session.screen ? session : { ...initialSession(), step: session.step };
    let target = descriptor(current);
    let history = current.history;
    if (actionId === "programs") {
      target = { screen: "programs" };
      history = [];
    } else if (actionId === "back") {
      if (!history.length) return null;
      target = history.at(-1);
      history = history.slice(0, -1);
    } else if (actionId === "next" || actionId === "prev") {
      if (current.screen !== "entity" || current.pageCount === undefined) return null;
      const page = (current.page ?? 0) + (actionId === "next" ? 1 : -1);
      if (page < 0 || page >= current.pageCount) return null;
      target = { ...target, page };
    } else if (actionId !== undefined) {
      const match = /^open_(0|[1-9]\d*)$/.exec(actionId);
      const item = match && current.items[Number(match[1])];
      if (!item) return null;
      target = current.screen === "programs"
        ? { screen: "program", programId: item.id, title: item.title }
        : { screen: "entity", entityId: item.id };
      history = [...history, descriptor(current)];
    }

    let view;
    let items;
    let pageCount;
    if (target.screen === "programs") {
      const { programs } = await client.listPrograms();
      items = programs.map((program) => ({ id: program.programId, title: program.title, kind: "program" }));
      view = { title: "Programs", lists: [numbered(null, items, 0)], empty: items.length ? undefined : "No programs." };
    } else if (target.screen === "program") {
      const { navigation } = await client.navigation(target.programId);
      items = [...navigation.topics, ...navigation.ungroupedConcepts, ...navigation.ungroupedMaterials]
        .map((node) => ({ id: node.entityId, title: node.title, kind: node.acceptedKind }));
      view = { title: target.title, lists: grouped(items) };
    } else {
      const { navigationNode: node } = await client.entity(target.entityId);
      items = node.relationships.outgoing.map((link) => ({
        id: link.toEntityId, title: link.toTitle, kind: link.toKind,
      }));
      view = { title: node.title, body: node.body, lists: grouped(items) };
      if (node.acceptedKind === MATERIAL && node.hasContent) {
        const pages = paginate(withoutFrontMatter((await client.materialContent(node.entityId)).content), pageSize);
        pageCount = pages.length;
        const page = Math.min(target.page ?? 0, pageCount - 1);
        target = { ...target, page };
        view = { ...view, body: page === 0 ? node.body : undefined, markdown: pages[page],
          page: { index: page, count: pageCount } };
      }
    }

    const actions = items.map((item, index) => ({
      id: `open_${index}`, kind: item.kind === MATERIAL ? "material" : "item",
      label: item.kind === MATERIAL ? item.title : String(numberOf(view.lists, index)),
    }));
    if (view.page) {
      if (view.page.index > 0) actions.push({ id: "prev", kind: "page", label: "◀ Prev" });
      if (view.page.index < view.page.count - 1) actions.push({ id: "next", kind: "page", label: "Next ▶" });
    }
    if (history.length) actions.push({ id: "back", kind: "nav", label: "◀ Back" });
    if (target.screen !== "programs") actions.push({ id: "programs", kind: "nav", label: "Programs" });
    const next = { ...target, items, history, step: session.step + 1 };
    if (pageCount !== undefined) next.pageCount = pageCount;
    return { session: next, view, actions };
  };
}

// Lists by kind, materials first to match their buttons above the number keys.
// Topics and concepts are numbered across the screen in the order of `items`.
function grouped(items) {
  const order = [MATERIAL, "topic", "concept", "other"];
  const kindOf = (item) => (HEADINGS[item.kind] ? item.kind : "other");
  let n = 0;
  const numbers = new Map();
  for (const kind of order.filter((kind) => kind !== MATERIAL)) {
    items.forEach((item, index) => { if (kindOf(item) === kind) numbers.set(index, ++n); });
  }
  return order.map((kind) => ({
    heading: HEADINGS[kind] ?? "Related",
    entries: items.flatMap((item, index) => (kindOf(item) === kind
      ? [{ index, n: numbers.get(index), label: item.title }] : [])),
  })).filter((list) => list.entries.length);
}

function numbered(heading, items, offset) {
  return { heading, entries: items.map((item, index) => ({ index, n: offset + index + 1, label: item.title })) };
}

function numberOf(lists, index) {
  for (const list of lists) {
    const entry = list.entries.find((candidate) => candidate.index === index);
    if (entry) return entry.n;
  }
  return index + 1;
}

function descriptor({ screen, programId, entityId, title, page }) {
  if (screen === "program") return { screen, programId, title };
  if (screen === "entity") return page ? { screen, entityId, page } : { screen, entityId };
  return { screen: "programs" };
}

// Material files start with YAML front matter about their conversion, not for the student.
function withoutFrontMatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n+/, "");
}

// Splits text into pages of at most `size` characters, at paragraph breaks
// where possible, then at line breaks, then anywhere.
export function paginate(text, size) {
  const pieces = text.trim().split(/\n{2,}/).flatMap((paragraph) => cut(paragraph, size));
  const pages = [];
  let page = "";
  for (const piece of pieces) {
    if (page && page.length + 2 + piece.length > size) {
      pages.push(page);
      page = piece;
    } else {
      page = page ? `${page}\n\n${piece}` : piece;
    }
  }
  pages.push(page);
  return pages;
}

function cut(paragraph, size) {
  if (paragraph.length <= size) return [paragraph];
  const lines = paragraph.split("\n").flatMap((line) =>
    line.length <= size ? [line] : line.match(new RegExp(`[\\s\\S]{1,${size}}`, "g")));
  const out = [];
  let chunk = "";
  for (const line of lines) {
    if (chunk && chunk.length + 1 + line.length > size) {
      out.push(chunk);
      chunk = line;
    } else {
      chunk = chunk ? `${chunk}\n${line}` : line;
    }
  }
  out.push(chunk);
  return out;
}
