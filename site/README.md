# Pinned Sidebar — landing site

Static bilingual (VI/EN) site: plain HTML + CSS + one small local script (`lang.js`, the language toggle). No build step, no external scripts or fonts.

| File | Content |
| --- | --- |
| `index.html` | Landing page: hero, features, comparison, pricing (coming soon), FAQ |
| `privacy.html`, `terms.html`, `refund.html` | Generated from `store/privacy-policy.md`, `store/terms.md`, `store/refund-policy.md` |
| `style.css` | Shared styles; colors follow `sidebar.css` and the logo |
| `lang.js` | Language: `?lang=vi|en` → saved choice → browser language |
| `assets/` | Logo and icons copied from `store/assets/logo.svg` and `icons/` |
| `tools/render-legal.cjs` | Regenerates the three legal pages |

## Editing the legal pages

Edit the markdown in `store/`, then run:

```bash
node site/tools/render-legal.cjs
```

Each markdown file must keep one line with only `---` between the Vietnamese and English parts.

## Viewing locally

Open `site/index.html` in a browser, or serve the folder (`npx serve site`, `python -m http.server -d site`).

## Deploying (not done yet)

- **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` / `/site` is not offered (only `/` or `/docs`), so either use a Pages workflow that uploads `site/`, or use Cloudflare Pages.
- **Cloudflare Pages:** connect the repo, framework preset *None*, build command empty, output directory `site`.

After deploying, use `https://<domain>/privacy.html` as the privacy policy URL in both stores.
