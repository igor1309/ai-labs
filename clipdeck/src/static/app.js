const TOAST_TIMEOUT_MS = 1800;
const FILTER_DEBOUNCE_MS = 150;

const state = {
  currentFilter: "",
  filterTimer: null,
  itemsById: new Map(),
  sections: [],
  toastTimer: null
};

const elements = {
  appVersion: document.querySelector("[data-app-version]"),
  library: document.querySelector("[data-library]"),
  loading: document.querySelector("[data-loading]"),
  reload: document.querySelector("[data-reload]"),
  sections: document.querySelector("[data-sections]"),
  toast: document.querySelector("[data-toast]")
};

void loadItems();
void loadAppVersion();

elements.reload?.addEventListener("click", () => {
  void loadItems();
});

async function loadItems() {
  resetFilter({ focus: false });
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
  elements.loading.hidden = true;
  elements.loading.textContent = "";
  elements.library.hidden = false;
  removeFilterRow();
  elements.sections.replaceChildren(renderSkeleton());
}

function hideLoading() {
  elements.loading.hidden = true;
  elements.loading.textContent = "";
}

function renderSections(sections) {
  state.sections = sections;
  state.itemsById.clear();
  elements.library.hidden = false;

  for (const section of sections) {
    for (const item of section.items) {
      state.itemsById.set(item.id, item);
    }
  }

  if (state.itemsById.size === 0) {
    removeFilterRow();
    elements.sections.replaceChildren();
    return;
  }

  ensureFilterRow();
  renderFilteredSections();
}

function renderFilteredSections() {
  const filter = normalizedFilter();
  let matchedItemCount = 0;
  elements.sections.replaceChildren();

  for (const section of state.sections) {
    const items = section.items.filter((item) => itemMatchesFilter(item, filter));
    if (filter !== "" && items.length === 0) {
      continue;
    }

    const heading = document.createElement("h2");
    heading.className = "section-heading";
    heading.textContent = section.title;
    elements.sections.append(heading);

    for (const item of items) {
      matchedItemCount += 1;
      elements.sections.append(renderItem(item));
    }
  }

  if (filter !== "" && matchedItemCount === 0) {
    elements.sections.replaceChildren(renderFilterEmpty());
  }

  updateFilterControls();
}

function ensureFilterRow() {
  if (document.querySelector("[data-filter-row]") !== null) {
    return;
  }

  const filterRow = document.createElement("div");
  filterRow.className = "filter-row";
  filterRow.dataset.filterRow = "";

  const input = document.createElement("input");
  input.className = "filter-input";
  input.dataset.filterInput = "";
  input.placeholder = "Filter prompts and skills";
  input.type = "text";
  input.value = state.currentFilter;
  input.addEventListener("input", () => scheduleFilterUpdate(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      resetFilter({ focus: true });
      renderFilteredSections();
    }
  });

  const clearButton = document.createElement("button");
  clearButton.className = "filter-clear";
  clearButton.dataset.filterClear = "";
  clearButton.hidden = true;
  clearButton.type = "button";
  clearButton.textContent = "Clear";
  clearButton.addEventListener("click", () => {
    resetFilter({ focus: true });
    renderFilteredSections();
  });

  filterRow.append(input, clearButton);
  elements.library.insertBefore(filterRow, elements.sections);
}

function removeFilterRow() {
  document.querySelector("[data-filter-row]")?.remove();
}

function scheduleFilterUpdate(value) {
  updateFilterControls();
  if (state.filterTimer !== null) {
    clearTimeout(state.filterTimer);
  }
  state.filterTimer = setTimeout(() => {
    state.currentFilter = value;
    state.filterTimer = null;
    renderFilteredSections();
  }, FILTER_DEBOUNCE_MS);
}

function resetFilter(options) {
  if (state.filterTimer !== null) {
    clearTimeout(state.filterTimer);
    state.filterTimer = null;
  }
  state.currentFilter = "";

  const input = document.querySelector("[data-filter-input]");
  if (input !== null) {
    input.value = "";
    if (options.focus) {
      input.focus();
    }
  }

  updateFilterControls();
}

function updateFilterControls() {
  const input = document.querySelector("[data-filter-input]");
  const clearButton = document.querySelector("[data-filter-clear]");
  if (input === null || clearButton === null) {
    return;
  }
  clearButton.hidden = input.value.trim().length === 0;
}

function normalizedFilter() {
  return state.currentFilter.trim().toLowerCase();
}

function itemMatchesFilter(item, filter) {
  if (filter === "") {
    return true;
  }
  return [item.title, item.subtitle, item.description].some((value) =>
    typeof value === "string" && value.toLowerCase().includes(filter)
  );
}

function renderFilterEmpty() {
  const empty = document.createElement("div");
  empty.className = "filter-empty";
  empty.dataset.filterEmpty = "";
  empty.textContent = "No matches";

  const clearButton = document.createElement("button");
  clearButton.dataset.filterEmptyClear = "";
  clearButton.type = "button";
  clearButton.textContent = "Clear filter";
  clearButton.addEventListener("click", () => {
    resetFilter({ focus: true });
    renderFilteredSections();
  });

  empty.append(clearButton);
  return empty;
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

  button.append(titleRow);

  if (item.subtitle && item.subtitle !== item.title) {
    const subtitle = document.createElement("span");
    subtitle.className = "subtitle";
    subtitle.textContent = item.subtitle;
    button.append(subtitle);
  }

  if (item.description) {
    const description = document.createElement("span");
    description.className = "description";
    description.textContent = item.description;
    button.append(description);
  }

  button.addEventListener("click", () => copyItem(item.id));
  return button;
}

function renderSkeleton() {
  const skeleton = document.createElement("div");
  skeleton.dataset.skeleton = "";
  skeleton.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 3; index += 1) {
    const item = document.createElement("div");
    item.className = "skeleton-item";
    item.setAttribute("aria-hidden", "true");
    skeleton.append(item);
  }

  return skeleton;
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

async function loadAppVersion() {
  if (elements.appVersion === null) {
    return;
  }

  try {
    const response = await fetch("/api/version");
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (typeof data?.version === "string" && data.version !== "") {
      elements.appVersion.textContent = `v${data.version}`;
    }
  } catch {
    // best-effort: leave the footer empty on any failure
  }
}
