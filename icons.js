/* Fixed SVG paths only; user content is always assigned with textContent. */
"use strict";
globalThis.PinnedIcons = {
  panel:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16m3-11h.01M18 12h.01M18 15h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  settings:
    '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m9 3-.6 2-2 .9-2-.5-2 3.4 1.4 1.5v2.4L2.4 15l2 3.4 2-.5 2 .9L9 21h4l.6-2.2 2-.9 2 .5 2-3.4-1.4-1.3v-2.4L19.6 9l-2-3.4-2 .5-2-.9L13 3Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  pin: '<path d="m16 3 5 5-4 2-3 6-2-2-7 7 7-7-3-3 6-3 1-5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  "folder-plus":
    '<path d="M20 10V7a2 2 0 0 0-2-2h-6L10 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1M16 12v6m-3-3h6"/>',
  folder:
    '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  external:
    '<path d="M14 3h7v7M21 3l-11 11M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  "arrow-left": '<path d="m10 5-7 7 7 7M3 12h18"/>',
  up: '<path d="m5 12 7-7 7 7m-7-7v16"/>',
  down: '<path d="m5 12 7 7 7-7m-7 7V3"/>',
  reload: '<path d="M20 7v5h-5M20 12a8 8 0 1 0-2 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M3 15v6h18v-6"/>',
  upload: '<path d="M12 15V3m-5 5 5-5 5 5M3 15v6h18v-6"/>',
  cloud:
    '<path d="M6 18a5 5 0 1 1 .8-9.9A7 7 0 0 1 20 10a4 4 0 0 1-1 8M12 13v8m-3-3 3 3 3-3"/>',
};
globalThis.makeIcon = function (name) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", "currentColor");
  el.setAttribute("stroke-width", "1.7");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = PinnedIcons[name] || PinnedIcons.pin;
  return el;
};
