export function initialSession() {
  return { step: 0, screen: "programs", items: [], history: [] };
}

export function createProgramFlow({ client }) {
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
    } else if (actionId !== undefined) {
      const match = /^open_(0|[1-9]\d*)$/.exec(actionId);
      const item = match && current.items[Number(match[1])];
      if (!item) return null;
      target = current.screen === "programs"
        ? { screen: "program", programId: item.id, title: item.title }
        : { screen: "entity", entityId: item.id };
      history = [...history, descriptor(current)];
    }

    let content;
    let items;
    if (target.screen === "programs") {
      const { programs } = await client.listPrograms();
      items = programs.map((program) => ({ id: program.programId, title: program.title }));
      content = ["Programs", ...programs.map((program) =>
        [program.title, program.description].filter(Boolean).join("\n"))].join("\n\n");
      if (!items.length) content += "\n\nNo programs.";
    } else if (target.screen === "program") {
      const { navigation } = await client.navigation(target.programId);
      const groups = [
        ["Topics", navigation.topics],
        ["Ungrouped concepts", navigation.ungroupedConcepts],
        ["Ungrouped materials", navigation.ungroupedMaterials],
      ];
      items = groups.flatMap(([, nodes]) => nodes.map((node) => ({
        id: node.entityId, title: node.title, kind: node.acceptedKind,
      })));
      content = [target.title, ...groups.map(([title, nodes]) =>
        `${title}\n${nodes.map((node) => node.title).join("\n") || "None."}`)].join("\n\n");
    } else {
      const { navigationNode: node } = await client.entity(target.entityId);
      items = node.relationships.outgoing.map((link) => ({
        id: link.toEntityId, title: link.toTitle, kind: link.toKind,
      }));
      content = [node.title, node.body, "Outgoing items",
        items.map((item) => item.title).join("\n") || "None."].filter(Boolean).join("\n\n");
    }
    const next = { ...target, items, history, step: session.step + 1 };
    const actions = items.map((item, index) => ({ id: `open_${index}`, label: item.title }));
    if (history.length) actions.push({ id: "back", label: "Back" });
    actions.push({ id: "programs", label: "Programs" });
    return { session: next, content, actions };
  };
}

function descriptor({ screen, programId, entityId, title }) {
  if (screen === "program") return { screen, programId, title };
  if (screen === "entity") return { screen, entityId };
  return { screen: "programs" };
}
