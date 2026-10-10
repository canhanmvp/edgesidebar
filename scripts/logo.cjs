/* Single source of truth for the Pinned Sidebar logo (side-panel window + pin dot). */
const GRADIENT = ["#3f9d78", "#17503e"];

/* pad = transparent margin as a fraction of the artwork box (0.125 => 96px art in 128px). */
function logoSvg(size, pad = 0) {
  const margin = 128 * pad;
  const box = 128 + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-margin} ${-margin} ${box} ${box}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GRADIENT[0]}"/><stop offset="1" stop-color="${GRADIENT[1]}"/></linearGradient></defs>
<rect width="128" height="128" rx="30" fill="url(#g)"/>
<rect x="26" y="30" width="76" height="68" rx="13" fill="none" stroke="#fff" stroke-width="7"/>
<path d="M26 43a13 13 0 0 1 13-13H58v68H39a13 13 0 0 1-13-13z" fill="#fff"/>
<circle cx="82" cy="53" r="8" fill="#b8ed62"/>
<rect x="72" y="72" width="22" height="6.5" rx="3.25" fill="#fff" opacity=".85"/>
</svg>`;
}

module.exports = { logoSvg };
