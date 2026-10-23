// page-hook.js — runs in the page's own world at document_start.
// A content script cannot see closed shadow roots being created; the page's
// own world can. It only announces "a shadow root was attached here" — the
// content script (which can read closed roots) does the rest.

(() => {
  if (Element.prototype.attachShadow.__fb) return;
  const orig = Element.prototype.attachShadow;
  function attached(init) {
    const root = orig.call(this, init);
    queueMicrotask(() => this.dispatchEvent(new Event("fb-shadow", { bubbles: true })));
    return root;
  }
  attached.__fb = true;
  Element.prototype.attachShadow = attached;
})();
