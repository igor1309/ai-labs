// The paragraph menu, its answer (a card under the paragraph, a sheet on compact) and the outline drawer. Pages work
// without this; it only adds the menu.
(() => {
  const reader = document.querySelector(".reader");
  if (!reader) return;
  const menu = document.getElementById("menu");
  const scrim = document.querySelector(".sheet-scrim");
  const icons = document.getElementById("answer-icons").content;
  const compact = matchMedia("(max-width: 599px)");
  let active = null;

  const icon = (kind) => icons.querySelector(`[data-k="${kind}"]`).innerHTML;
  const titles = { more: "Расскажи подробнее", simpler: "Объясни проще", example: "Приведи пример", ask: "Вопрос" };
  const items = () => [...menu.querySelectorAll("[role=menuitem], .menu-ask input")];

  function open(para, button) {
    close(false);
    active = para;
    para.classList.add("active");
    button.setAttribute("aria-expanded", "true");
    menu.querySelector(".menu-quote span").textContent = para.dataset.text;
    menu.hidden = false;
    if (compact.matches) {
      scrim.hidden = false;
      menu.style.top = "";
    } else {
      const box = button.getBoundingClientRect();
      const left = Math.min(box.right + scrollX - 300, document.documentElement.clientWidth - 316);
      menu.style.left = Math.max(16, left) + "px";
      menu.style.top = box.bottom + scrollY + 4 + "px";
    }
    items()[0].focus();
  }

  function close(refocus = true) {
    if (!active) return;
    const button = active.querySelector(".para-menu");
    button.setAttribute("aria-expanded", "false");
    active.classList.remove("active");
    menu.hidden = true;
    scrim.hidden = true;
    menu.querySelector(".menu-ask input").value = "";
    if (refocus) button.focus();
    active = null;
  }

  let answer = null;

  function dismiss(refocus = true) {
    if (!answer) return;
    const { box, para } = answer;
    box.remove();
    para.classList.remove("answered");
    scrim.hidden = true;
    if (refocus) para.querySelector(".para-menu").focus();
    answer = null;
  }

  async function ask(kind, text) {
    const para = active || answer?.para;
    close(false);
    dismiss(false);
    const box = document.createElement("section");
    box.className = "answer";
    box.setAttribute("aria-live", "polite");
    box.innerHTML = `<div class="grip" aria-hidden="true"></div><header><span class="badge">${icon(kind)}</span><b></b><button type="button" aria-label="Закрыть">${icon("close")}</button></header><p class="quote"></p><p class="q" hidden></p><div class="body"><p class="a loading">Думаю</p></div>`;
    box.querySelector("header b").textContent = titles[kind];
    box.querySelector(".quote").textContent = para.dataset.text;
    para.after(box);
    para.classList.add("answered");
    answer = { box, para };
    if (compact.matches) scrim.hidden = false;
    box.querySelector("header button").onclick = () => dismiss();
    if (text) { const q = box.querySelector(".q"); q.textContent = text; q.hidden = false; }
    const body = box.querySelector(".body");
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, entityId: reader.dataset.entity, page: +reader.dataset.page, paragraph: +para.dataset.n, text: text || para.dataset.text }),
      });
      if (!res.ok) throw new Error(res.status);
      const reply = await res.json();
      const p = document.createElement("p");
      p.className = "a";
      p.textContent = reply.text;
      body.replaceChildren(p);
    } catch {
      body.innerHTML = `<div class="err">${icon("alert")}<b>Не удалось получить ответ</b><span>Agonara не ответила. Абзац и вопрос сохранены, можно повторить.</span></div><button type="button" class="button">${icon("retry")}Повторить</button>`;
      body.querySelector("button").onclick = () => { answer && (active = null); ask(kind, text); };
    }
    if (!compact.matches) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  document.addEventListener("click", (e) => {
    const button = e.target.closest(".para-menu");
    if (button) {
      const para = button.closest(".para");
      active === para ? close() : open(para, button);
      return;
    }
    const item = e.target.closest("[role=menuitem]");
    if (item) return ask(item.dataset.kind);
    if (e.target.closest("[data-open-outline]")) return reader.classList.add("outline-open");
    if (e.target.closest("[data-close-outline]")) return reader.classList.remove("outline-open");
    if (e.target === scrim && answer && !active) return dismiss(false);
    if (active && !menu.contains(e.target)) close(false);
  });

  menu.querySelector(".menu-ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = e.target.q.value.trim();
    if (text) ask("ask", text);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (active) close();
      else if (answer) dismiss();
      else reader.classList.remove("outline-open");
      return;
    }
    if (!active || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
    const list = items();
    const at = list.indexOf(document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    list[(at + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length].focus();
  });
})();
