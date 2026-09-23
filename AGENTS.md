# AGENTS.md

## What this is

VEILBORN — an original-IP browser action-roguelike (Phaser 3 + Vite). Five
realms, five bosses, four endings, hub meta-progression, iOS PWA support.

## Commands

```bash
npm ci                  # install
npm run build           # build to dist/ for a domain root
VITE_BASE=/veilborn/ npm run build   # build for a subpath (GitHub Pages)
npm test                # build + full e2e suite
E2E_URL=<url> node tests/e2e.mjs     # run the suite against a deployed site
```

## Deployment

Live: https://appleziarash1.github.io/veilborn/ (repo `appleziarash1/veilborn`).

- Pages serves the **`gh-pages`** branch, folder `/`, `VITE_BASE=/veilborn/`.
- `.github/workflows/deploy-pages.yml` rebuilds and force-pushes `gh-pages` on
  every push to `main`. Never hand-push `gh-pages`; let the workflow do it.
- The local branch is `master` but the remote default is `main`:
  push with `git push origin master:main`.

## Art pipeline

Entities render as Phaser primitives so the game is playable with no art
installed. Dropping a correctly named file into `public/assets/` makes that
entity use the sprite instead, with no code change.

Source crops live in `art-source/veilborn-package/` (committed). Regenerate the
runtime sprites with `python3 scripts/extract-sprites.py`; it reads `SRC` from
`$VEILBORN_ART_SRC` and writes `public/assets/sprites/<folder>/<slot>.png`.

- `scripts/scan-art.mjs` walks `public/assets/` and writes `src/art-manifest.js`
  **and** `public/art-index.json`. `npm run build` and `npm run dev` run it
  first. **Run `npm run art` after adding or removing art**, or the new file
  will not be requested.
- `public/art-index.json` exists because the service worker cannot read `src/`.
  The SW fetches it during install and precaches every listed file, which is
  what makes a first-launch-offline start have art. If you add a new asset
  folder, it is covered automatically; only a new *format* needs the regex in
  `public/sw.js` extended.
- `src/art.js` resolves slots to paths. Only files in the manifest are
  requested, so a partly finished art pass produces no 404s.
- Sprites replace visuals only: radii and hitboxes stay config-driven.
- Primitives use `setFillStyle`, Images use `setTintFill`. Route hit flashes
  through `tintBody()` in `src/art.js` rather than calling either directly.
- The filename contract is `docs/ART_GUIDE.md`. `art-kit/` holds the
  contributor-facing copy; `scripts/build-art-kit.mjs` publishes it plus
  `veilborn-art-kit.zip` to `public/art-kit/` for download from the live site.
- **Any new scene object must be destroyed in `clearEntities()`.** Missing one
  leaks it across rooms: `healIcon` and `memoryPortrait` were both added without
  a destroy and survived into the next chamber. The e2e suite catches this by
  forcing each room type and asserting the *attached texture*, not just that the
  sprite exists.

## iOS / PWA

- `public/manifest.webmanifest` forces `orientation: landscape`; the arena is
  16:9 and a portrait phone letterboxes it into a strip.
- `#rotate` in `index.html` is the in-page fallback, because iOS ignores the
  manifest orientation for a browser tab and when rotating back. `src/pwa.js`
  shows it only when portrait **and** touch **and** narrow, so a small desktop
  window is unaffected.

## Things that bite

- **`base` must stay configurable.** Anything absolute (`/icons/...`) breaks a
  subpath deploy. The manifest uses relative paths on purpose; keep it that way.
- **Service worker scope is relative.** It precaches the hashed bundles by
  reading `index.html`, so a stale `sw.js` cache can serve an old build — bump
  the cache name in `public/sw.js` if you change asset layout.
- **Never pass a method as a bare reference.** `gameState.rand` was once passed
  unbound and crashed every reward screen. Bind or wrap closures.
- **Scene timers outlive their scene.** Use the scene's `later()` helper, which
  carries a session token, instead of raw `setTimeout`.

## Testing notes

`tests/e2e.mjs` drives a real Chromium and plays the game through all five
realms to an ending. It covers boot, hub persistence, weapon select, the full
playthrough, all bosses, offline PWA boot, and background auto-pause. Screenshot
pixel checks in this environment are unreliable for WebGL canvases; assert on
game state instead.

## Licensing

Original IP only. All art is procedural/vector or generated at runtime. Do not
introduce third-party or proprietary assets.
