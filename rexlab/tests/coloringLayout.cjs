// One layout check for every Coloring screen: the page does not scroll, every
// control and text block is on screen, no two of them overlap, no label is
// cut, every control has a name and is big enough to tap.
const assert = require("node:assert/strict");

// A device for each size class, and the edges of each class.
const LAYOUT_VIEWPORTS = [
  { name: "iPad mini", width: 1133, height: 744, size: "wide" },
  { name: "desktop", width: 1440, height: 900, size: "wide" },
  { name: "upright iPad", width: 744, height: 1133, size: "tall" },
  { name: "small upright tablet", width: 600, height: 900, size: "tall" },
  { name: "iPhone", width: 393, height: 852, size: "tall-narrow" },
  { name: "iPhone SE", width: 375, height: 667, size: "tall-narrow" },
  { name: "small phone", width: 320, height: 568, size: "tall-narrow" },
  { name: "iPhone on its side", width: 852, height: 393, size: "wide-short" },
  { name: "small phone on its side", width: 568, height: 320, size: "wide-short" }
];

// Returns the layout of `root` as plain data; checks run in Node.
async function measure(page, root, scroller, large) {
  // A label measured before its font has loaded is measured in the
  // fallback font, which is wider on some machines.
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(({ root, scroller, large }) => {
    const screen = document.querySelector(root);
    if (!screen) return null;
    const visible = el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && b.width > 1 && b.height > 1 && !el.closest("[aria-hidden=true]"); };
    const scrolled = el => scroller ? !!el.closest(scroller) : false;
    const box = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const id = el => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40);
    const controls = [...screen.querySelectorAll("button, [role=button], a[href]")].filter(visible);
    const texts = [...screen.querySelectorAll("h1, h2, p, [role=status]")].filter(visible).filter(el => !el.closest("button"));
    const items = [...controls, ...texts];
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      // A modal layer covers the screen under it on purpose; only items in one layer must not overlap.
      if (a.contains(b) || b.contains(a) || scrolled(a) !== scrolled(b) || a.closest("[aria-modal=true]") !== b.closest("[aria-modal=true]")) continue;
      const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      const x = Math.min(p.right, q.right) - Math.max(p.left, q.left), y = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
      if (x > 1 && y > 1) overlaps.push([id(a), id(b)]);
    }
    // A label is cut when its text runs outside its own box or the box of its control.
    const cut = [];
    const walker = document.createTreeWalker(screen, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!node.textContent.trim() || !visible(parent)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      // Inline text may stand taller than its inline parent; its owner is the nearest box.
      let box = parent; while (box !== screen && getComputedStyle(box).display === "inline") box = box.parentElement;
      const t = range.getBoundingClientRect(), owner = (parent.closest("button") || box).getBoundingClientRect();
      const clipped = parent.scrollWidth > parent.clientWidth + 1 && getComputedStyle(parent).overflowX !== "visible";
      // Tight line heights let glyph boxes stand a little taller than their line; only a control's edge cuts a label vertically.
      const control = parent.closest("button")?.getBoundingClientRect();
      const tall = control && (t.top < control.top - 4 || t.bottom > control.bottom + 4);
      if (clipped || tall || t.left < owner.left - 1 || t.right > owner.right + 1) cut.push(node.textContent.trim().slice(0, 40));
    }
    return {
      size: document.documentElement.dataset.size,
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      // A control in a scroller may stand outside the screen, but keeps its name and size.
      controls: controls.map(el => ({ name: (el.getAttribute("aria-label") || el.textContent).trim(), scrolled: scrolled(el), large: !!large && el.matches(large), ...box(el) })),
      texts: texts.filter(el => !scrolled(el)).map(el => ({ name: id(el), ...box(el) })),
      overlaps, cut,
      // A dialog shows all it holds without scrolling inside itself.
      squeezed: [...screen.querySelectorAll("[role=dialog], [role=alertdialog]")].filter(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1).map(id)
    };
  }, { root, scroller, large });
}

// `root` is the screen; `minimum` its smallest tap target; `large`, if given,
// selects the controls that keep a 60-point target where the rest may be
// smaller; `scroller`, if given, is a region allowed to scroll, whose
// contents may leave the screen.
async function checkLayout(page, { root, minimum = 60, large, scroller, viewport, state }) {
  const layout = await measure(page, root, scroller, large);
  const context = JSON.stringify({ viewport: viewport?.name, state, layout });
  assert(layout, `${root} is not on the page: ${context}`);
  const { width, height } = page.viewportSize();
  if (viewport?.size) assert.equal(layout.size, viewport.size, context);
  assert.deepEqual(layout.scroll, [width, height], `the page scrolls: ${context}`);
  for (const item of [...layout.controls.filter(control => !control.scrolled), ...layout.texts])
    assert(item.x >= -1 && item.y >= -1 && item.x + item.w <= width + 1 && item.y + item.h <= height + 1, `${item.name} leaves the screen: ${context}`);
  for (const control of layout.controls) {
    assert(control.name, `a control has no name: ${context}`);
    const least = control.large ? 60 : minimum;
    assert(control.w >= least && control.h >= least, `${control.name} is smaller than ${least}: ${context}`);
  }
  assert.deepEqual(layout.overlaps, [], `overlap: ${context}`);
  assert.deepEqual(layout.cut, [], `cut label: ${context}`);
  assert.deepEqual(layout.squeezed, [], `a dialog scrolls: ${context}`);
  return layout;
}

module.exports = { LAYOUT_VIEWPORTS, checkLayout };
