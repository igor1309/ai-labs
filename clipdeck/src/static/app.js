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
  } else {
    showToast("No saved secret", "error");
  }
});

elements.unlockForm?.addEventListener("mousemove", (event) => {
  const rect = elements.unlockForm.getBoundingClientRect();
  elements.unlockForm.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
  elements.unlockForm.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
});

async function loadItems(secret) {
  showLoading();

  let response;
  try {
    response = await fetch("/api/items", {
      headers: {
        Authorization: `Bearer ${secret}`
      }
    });
  } catch {
    hideLoading();
    showLocked();
    showToast("Network error", "error");
    return;
  }

  if (response.status === 401) {
    hideLoading();
    localStorage.removeItem("clipdeck.secret");
    showLocked();
    return;
  }

  if (!response.ok) {
    hideLoading();
    showLocked();
    showToast(`Failed to load (${response.status})`, "error");
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    hideLoading();
    showLocked();
    showToast("Failed to parse response", "error");
    return;
  }

  localStorage.setItem("clipdeck.secret", secret);
  hideLoading();
  renderSections(data.sections);
}

function showLoading() {
  elements.unlockForm.hidden = true;
  elements.library.hidden = true;
  elements.loading.hidden = false;
}

function hideLoading() {
  elements.loading.hidden = true;
}

function renderSections(sections) {
  state.itemsById.clear();
  elements.sections.replaceChildren();
  elements.unlockForm.hidden = true;
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

function showLocked() {
  elements.library.hidden = true;
  elements.unlockForm.hidden = false;
  elements.sections.replaceChildren();
}
