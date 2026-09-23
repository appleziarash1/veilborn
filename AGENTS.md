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
