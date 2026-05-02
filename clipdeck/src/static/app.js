const TOAST_TIMEOUT_MS = 1800;

const state = {
  itemsById: new Map(),
  toastTimer: null
};

const elements = {
  library: document.querySelector("[data-library]"),
  loading: document.querySelector("[data-loading]"),
  reload: document.querySelector("[data-reload]"),
  sections: document.querySelector("[data-sections]"),
  toast: document.querySelector("[data-toast]")
};

void loadItems();

elements.reload?.addEventListener("click", () => {
  void loadItems();
});

async function loadItems() {
  showLoading();

  let response;
  try {
    response = await fetch("/api/items");
  } catch {
    hideLoading();
    showRetryableShell();
    showToast("Network error", "error");
    return;
  }

  if (!response.ok) {
    hideLoading();
    showRetryableShell();
    showToast(`Failed to load (${response.status})`, "error");
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    hideLoading();
    showRetryableShell();
    showToast("Failed to parse response", "error");
    return;
  }

  hideLoading();
  renderSections(data.sections);
}

function showLoading() {
  elements.library.hidden = true;
  elements.loading.hidden = false;
}

function hideLoading() {
  elements.loading.hidden = true;
}

function renderSections(sections) {
  state.itemsById.clear();
  elements.sections.replaceChildren();
  elements.library.hidden = false;

  for (const section of sections) {
    const heading = document.createElement("h2");
    heading.className = "section-heading";
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

  const titleRow = document.createElement("span");
  titleRow.className = "title-row";

  const title = document.createElement("span");
  title.className = "title";
  title.textContent = item.title;
  titleRow.append(title);

  if (item.version) {
    const version = document.createElement("span");
    version.className = "version";
    version.dataset.version = "";
    version.textContent = `v${item.version}`;
    titleRow.append(version);
  }

  const subtitle = document.createElement("span");
  subtitle.className = "subtitle";
  subtitle.textContent = item.subtitle;

  button.append(titleRow, subtitle);
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
    showToast("Copied");
  } catch {
    showToast("Copy failed", "error");
  }
}

function showToast(message, kind) {
  elements.toast.textContent = message;
  elements.toast.classList.add("toast-visible");
  elements.toast.classList.toggle("toast-error", kind === "error");
  if (state.toastTimer !== null) {
    clearTimeout(state.toastTimer);
  }
  state.toastTimer = setTimeout(() => {
    elements.toast.textContent = "";
    elements.toast.classList.remove("toast-visible");
    elements.toast.classList.remove("toast-error");
    state.toastTimer = null;
  }, TOAST_TIMEOUT_MS);
}

function showRetryableShell() {
  elements.library.hidden = false;
  elements.sections.replaceChildren();
}
