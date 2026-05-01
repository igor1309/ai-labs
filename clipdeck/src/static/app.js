const state = {
  itemsById: new Map()
};

const elements = {
  library: document.querySelector("[data-library]"),
  reload: document.querySelector("[data-reload]"),
  sections: document.querySelector("[data-sections]"),
  secretInput: document.querySelector("[data-secret-input]"),
  toast: document.querySelector("[data-toast]"),
  unlockForm: document.querySelector("[data-unlock-form]")
};

const storedSecret = localStorage.getItem("clipdeck.secret");
if (storedSecret) {
  void loadItems(storedSecret);
}

elements.unlockForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const secret = elements.secretInput?.value ?? "";
  void loadItems(secret);
});

elements.reload?.addEventListener("click", () => {
  const secret = localStorage.getItem("clipdeck.secret");
  if (secret) {
    void loadItems(secret);
  }
});

async function loadItems(secret) {
  const response = await fetch("/api/items", {
    headers: {
      Authorization: `Bearer ${secret}`
    }
  });

  if (response.status === 401) {
    localStorage.removeItem("clipdeck.secret");
    showLocked();
    return;
  }

  const data = await response.json();
  localStorage.setItem("clipdeck.secret", secret);
  renderSections(data.sections);
}

function renderSections(sections) {
  state.itemsById.clear();
  elements.sections.replaceChildren();
  elements.unlockForm.hidden = true;
  elements.library.hidden = false;

  for (const section of sections) {
    const heading = document.createElement("h2");
    heading.textContent = section.title;
    elements.sections.append(heading);

    for (const item of section.items) {
      state.itemsById.set(item.id, item);
      elements.sections.append(renderItem(item));
    }
  }
}

function renderItem(item) {
  const button = document.createElement("button");
  button.className = item.skillShape === "resource-backed" ? "item resource-backed" : "item";
  button.dataset.itemId = item.id;
  button.type = "button";

  const title = document.createElement("span");
  title.className = "title";
  title.textContent = item.title;

  const subtitle = document.createElement("span");
  subtitle.className = "subtitle";
  subtitle.textContent = item.subtitle;

  button.append(title, subtitle);
  button.addEventListener("click", () => copyItem(item.id));
  return button;
}

async function copyItem(id) {
  const item = state.itemsById.get(id);
  if (!item) {
    return;
  }

  try {
    await navigator.clipboard.writeText(item.body);
    elements.toast.textContent = "Copied";
  } catch {
    elements.toast.textContent = "Copy failed";
  }
}

function showLocked() {
  elements.library.hidden = true;
  elements.unlockForm.hidden = false;
  elements.sections.replaceChildren();
}
