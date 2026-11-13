// jsdom computes no pseudo-element styles, so tests resolve an element's
// ::after style from the fixture's own stylesheet rules.
export function fixtureAfterStyle(element) {
  const style = element.ownerDocument.createElement("div").style;
  for (const sheet of element.ownerDocument.styleSheets) {
    for (const rule of sheet.cssRules) {
      const matches = (rule.selectorText ?? "")
        .split(",")
        .map((selector) => selector.trim())
        .some((selector) => selector.endsWith("::after") && element.matches(selector.slice(0, -"::after".length)));
      if (!matches) continue;
      for (const property of rule.style) style.setProperty(property, rule.style.getPropertyValue(property));
    }
  }
  return {
    content: style.getPropertyValue("content"),
    borderTopStyle: style.getPropertyValue("border-top-style"),
    borderTopWidth: style.getPropertyValue("border-top-width"),
    borderTopColor: style.getPropertyValue("border-top-color"),
  };
}
