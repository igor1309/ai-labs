// LAB-909: on this debug branch, unless ?nodebug is in the address, shows the window's and the page's
// measured sizes on screen, to find where an iPhone layout ends.
(function () {
  if (/[?&]nodebug\b/.test(location.search)) return;
  var probe = function (css) {
    var d = document.createElement("div");
    d.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;visibility:hidden;" + css;
    document.body.appendChild(d);
    var r = d.getBoundingClientRect();
    var cs = getComputedStyle(d);
    var s = { paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom };
    d.remove();
    return { h: Math.round(r.height), s: s };
  };
  var box = document.createElement("pre");
  box.style.cssText = "position:fixed;z-index:99999;left:8px;top:45%;margin:0;padding:8px;font:11px/1.35 ui-monospace,monospace;color:#fff;background:#c0392bdd;border-radius:8px;pointer-events:none;white-space:pre";
  var line = document.createElement("div");
  line.style.cssText = "position:fixed;z-index:99998;left:0;right:0;height:0;border-top:2px dashed #ff0;pointer-events:none";
  var rect = function (sel) {
    var e = document.querySelector(sel);
    if (!e) return "-";
    var r = e.getBoundingClientRect();
    return Math.round(r.top) + "→" + Math.round(r.bottom);
  };
  var update = function () {
    if (!box.isConnected) { document.body.appendChild(box); document.body.appendChild(line); }
    var safe = probe("padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)").s;
    var home = document.querySelector(".home");
    if (home) line.style.top = Math.round(home.getBoundingClientRect().bottom) + "px";
    box.textContent = [
      "standalone " + (navigator.standalone === true || matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches),
      "screen     " + screen.width + "×" + screen.height,
      "inner      " + innerWidth + "×" + innerHeight,
      "visualVP   " + (window.visualViewport ? Math.round(visualViewport.height) : "-"),
      "html client " + document.documentElement.clientHeight,
      "100vh  " + probe("height:100vh").h + "  100dvh " + probe("height:100dvh").h,
      "100svh " + probe("height:100svh").h + "  100lvh " + probe("height:100lvh").h,
      "fixed inset0 " + probe("top:0;bottom:0").h,
      "safe top " + safe.paddingTop + " bottom " + safe.paddingBottom,
      "html  " + rect("html") + "  body " + rect("body"),
      ".home " + rect(".home") + "  (yellow line = bottom)",
      ".games-tiles " + rect(".games-tiles"),
      "#version " + rect("#version"),
    ].join("\n");
  };
  addEventListener("load", function () { update(); setInterval(update, 500); });
})();
