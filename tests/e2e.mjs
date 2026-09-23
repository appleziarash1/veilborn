// Real-browser end-to-end test. Boots the built game with Playwright, walks
// every realm from the first room to the final ending, and fails on any
// console error, page error, or stuck state.
//
// Run: node tests/e2e.mjs   (expects `npm run build` to have been run already)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
// Set E2E_BASE=/veilborn/ to validate a subpath build (e.g. GitHub Pages).
const BASE = (process.env.E2E_BASE || '/').replace(/\/?$/, '/');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === BASE || p === BASE.slice(0, -1)) p = BASE;
        else if (!p.startsWith(BASE)) { res.writeHead(404); res.end('not found'); return; }
        p = '/' + p.slice(BASE.length);
        if (p === '/') p = '/index.html';
        const file = join(ROOT, p);
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404); res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const failures = [];
const passes = [];
function check(name, cond, extra = '') {
  if (cond) { passes.push(name); console.log(`  ok   ${name}`); }
  else { failures.push(`${name} ${extra}`); console.error(`  FAIL ${name} ${extra}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // E2E_URL points the suite at a real deployment instead of the local dist/.
  const remote = process.env.E2E_URL;
  let server = null;
  let port = null;
  let origin;
  if (remote) {
    origin = remote.replace(/\/$/, '') + '/';
  } else {
    ({ server, port } = await startServer());
    origin = `http://127.0.0.1:${port}${BASE}`;
  }
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(origin, { waitUntil: 'load' });

  // Wait for the game handle and for Boot -> Menu.
  await page.waitForFunction(() => window.__VEILBORN__ && window.__VEILBORN__.gameState && window.__VEILBORN__.gameState.booted, null, { timeout: 20000 });
  console.log('\n== boot ==');
  check('game object exposed', await page.evaluate(() => !!window.__VEILBORN__.game));
  check('content loaded from json', await page.evaluate(() => (window.__VEILBORN__.gameState.content.enemies || []).length === 10));

  await sleep(600);
  let active = await page.evaluate(() => window.__VEILBORN__.game.scene.getScenes(true).map((s) => s.scene.key));
  check('menu scene active after boot', active.includes('Menu'), JSON.stringify(active));

  // Helper: drive the game programmatically, bypassing pointer input so the
  // test is deterministic. Returns collected diagnostics.
  await page.evaluate(() => {
    window.__T__ = {
      errors: [],
      step() {},
    };
  });

  // --- Walk all five realms, all rooms, all bosses ---------------------
  console.log('\n== realm walk (every chamber, every realm) ==');
  for (let realm = 0; realm < 5; realm++) {
    const result = await page.evaluate(async (realmIdx) => {
      const { gameState, game } = window.__VEILBORN__;
      const errors = [];
      const onErr = (e) => errors.push(String(e && e.message ? e.message : e));
      window.addEventListener('error', onErr);

      // Fresh run, jump straight to the realm.
      gameState.weapon = null;
      gameState.startNewRun('ashen_edge', 4242 + realmIdx);
      gameState.enterRealm(realmIdx);

      const sceneNames = [];
      const roomsSeen = [];
      const bossNames = [];
      const bossArtKeys = [];
      const realmIds = [];

      // Walk rooms 0..4 by restarting the Game scene, running a few frames,
      // then force-clearing combat rooms so progression is exercised.
      for (let room = 0; room < 5; room++) {
        gameState.run.room = room;
        const gs = game.scene.getScene('Game');
        if (!gs) {
          game.scene.start('Game', { mode: 'room' });
        } else {
          gs.scene.restart({ mode: 'room' });
        }
        await new Promise((r) => setTimeout(r, 90));
        const g = game.scene.getScene('Game');
        if (!g) { sceneNames.push('missing'); continue; }
        sceneNames.push(g.scene.key);
        roomsSeen.push(g.roomType);
        if (g.boss) {
          bossNames.push(g.boss.name);
          // Record which texture the boss actually attached, so a silent art
          // fallback to the primitive cannot pass unnoticed.
          bossArtKeys.push(g.boss.sprite ? g.boss.sprite.texture.key : 'primitive');
        }
        realmIds.push(g.arena && g.arena.bgPath ? g.arena.bgPath : 'primitive');

        // Exercise real combat: attack, special, dash, then clear.
        if (g.player) {
          g.tryAttack(g.player.x + 100, g.player.y);
          g.trySpecial(g.player.x + 100, g.player.y);
          g.tryDash();
          await new Promise((r) => setTimeout(r, 40));
          // Kill everything to advance.
          for (const e of [...g.enemies]) g.applyDamage(e, 99999, 0);
          if (g.boss && g.boss.alive) {
            // Damage the boss to force a phase transition too.
            g.boss.hp = g.boss.maxHp * 0.3;
            g.boss.update(16, g.time.now + 2000, g.buildCtx(g.time.now));
            g.applyDamage(g.boss, 999999, 0);
          }
          await new Promise((r) => setTimeout(r, 120));
        }
      }

      window.removeEventListener('error', onErr);
      return { errors, sceneNames, roomsSeen, bossNames, bossArtKeys, realmIds };
    }, realm);

    check(`realm ${realm}: all 5 rooms loaded`, result.sceneNames.every((s) => s === 'Game'), JSON.stringify(result.sceneNames));
    check(`realm ${realm}: boss room present`, result.roomsSeen.includes('Boss'), JSON.stringify(result.roomsSeen));
    check(`realm ${realm}: boss spawned`, result.bossNames.length > 0, JSON.stringify(result.bossNames));
    check(`realm ${realm}: boss renders its own sprite`,
      result.bossArtKeys.length > 0 && result.bossArtKeys.every((k) => k !== 'primitive'),
      JSON.stringify(result.bossArtKeys));
    check(`realm ${realm}: arena uses a painted backdrop`,
      result.realmIds.every((p) => /^assets\/backgrounds\/.*\.webp$/.test(p)),
      JSON.stringify([...new Set(result.realmIds)]));
    check(`realm ${realm}: no scene errors`, result.errors.length === 0, JSON.stringify(result.errors));
  }

  // --- Endings: all four reachable via the throne choice -----------------
  console.log('\n== endings (throne choice) ==');
  const endings = await page.evaluate(async () => {
    const { gameState, game } = window.__VEILBORN__;
    const seen = [];
    // Stop everything but Boot so no earlier transition is in flight.
    game.scene.getScenes(true).forEach((s) => { if (s.scene.key !== 'Boot') s.scene.stop(); });
    await new Promise((r) => setTimeout(r, 200));
    // memoriesFound >= 6 counts as "many"; the throne choice then decides.
    const variants = [
      { memories: 8, remembered: 3, released: 0, mercy: 5, kills: 40, expect: 'true' },
      { memories: 8, remembered: 1, released: 2, mercy: 0, kills: 70, expect: 'new' },
      { memories: 1, remembered: 0, released: 2, mercy: 0, kills: 30, expect: 'sealed' },
      { memories: 1, remembered: 2, released: 0, mercy: 3, kills: 90, expect: 'open' },
    ];
    for (const v of variants) {
      gameState.startNewRun('ashen_edge', 7);
      const run = gameState.run;
      run.memoriesFound = v.memories;
      run.remembered = v.remembered;
      run.released = v.released;
      run.mercyCount = v.mercy;
      run.kills = v.kills;
      run.boons = ['veilheart', 'echo_blade'];
      run.shardsEarned = 30;
      run.realm = 4;
      game.scene.start('Ending', { run, forced: null });
      await new Promise((r) => setTimeout(r, 220));
      const endScene = game.scene.getScene('Ending');
      seen.push({ ending: endScene ? endScene.ending : null, expect: v.expect });
      endScene.scene.stop();
      await new Promise((r) => setTimeout(r, 80));
    }
    return seen;
  });
  endings.forEach((e, i) => {
    check(`ending ${i} is "${e.expect}"`, e.ending === e.expect, JSON.stringify(e));
  });

  // --- Death path -------------------------------------------------------
  console.log('\n== death path ==');
  const death = await page.evaluate(async () => {
    const { gameState, game } = window.__VEILBORN__;
    // Start from a clean scene so no fade transition is in flight.
    game.scene.getScenes(true).forEach((s) => {
      if (s.scene.key !== 'Boot') s.scene.stop();
    });
    await new Promise((r) => setTimeout(r, 250));
    gameState.weapon = null;
    gameState.startNewRun('pyre_lance', 3);
    game.scene.start('Game', { mode: 'room' });
    await new Promise((r) => setTimeout(r, 350));
    const scene = game.scene.getScene('Game');
    scene.onPlayerDeath();
    await new Promise((r) => setTimeout(r, 1900));
    return game.scene.getScenes(true).map((s) => s.scene.key);
  });
  check('death leads to Death scene', death.includes('Death'), JSON.stringify(death));

  // Barrier damage reporting: a hit fully absorbed by the barrier must report
  // zero health lost, otherwise the HUD flashes a full damage number for damage
  // the player never took.
  console.log('\n== barrier damage reporting ==');
  const barrier = await page.evaluate(async () => {
    const { game, gameState } = window.__VEILBORN__;
    game.scene.getScenes(true).forEach((s) => { if (s.scene.key !== 'Boot') s.scene.stop(); });
    await new Promise((r) => setTimeout(r, 200));
    gameState.weapon = null;
    gameState.startNewRun('ashen_edge', 55);
    game.scene.start('Game', { mode: 'room' });
    await new Promise((r) => setTimeout(r, 320));
    const gs = game.scene.getScene('Game');
    gs.player.stats.barrier = 500;
    gs.player.stats.hp = gs.player.stats.maxHp;
    gs.player.invulnUntil = 0;
    const hpBefore = gs.player.stats.hp;
    const fullyAbsorbed = gs.player.hurt(120, gs.time.now);
    const hpAfterAbsorb = gs.player.stats.hp;
    // Now exceed the remaining barrier so some health really is lost.
    gs.player.stats.barrier = 50;
    gs.player.invulnUntil = 0;
    const partial = gs.player.hurt(200, gs.time.now);
    return { fullyAbsorbed, hpBefore, hpAfterAbsorb, partial };
  });
  check('a fully absorbed hit reports no health lost',
    barrier.fullyAbsorbed === 0 && barrier.hpAfterAbsorb === barrier.hpBefore,
    JSON.stringify(barrier));
  check('a partly absorbed hit reports only the health lost',
    barrier.partial === 150, JSON.stringify(barrier));

  // --- Hub + memory purchase -------------------------------------------
  console.log('\n== hub / persistence ==');
  const hub = await page.evaluate(async () => {
    const { gameState, game } = window.__VEILBORN__;
    gameState.profile.shards = 100000;
    gameState.persistProfile();
    game.scene.start('Hub');
    await new Promise((r) => setTimeout(r, 200));
    const h = game.scene.getScene('Hub');
    const before = gameState.profile.memory.vitality;
    if (h && h.rows && h.rows.length) h.buy(h.rows[0].u, h.rows[0].btn, h.rows[0].rank);
    const after = gameState.profile.memory.vitality;
    // persistence round-trip
    const raw = JSON.parse(localStorage.getItem('veilborn_save_v2'));
    return { active: game.scene.getScenes(true).map((s) => s.scene.key), before, after, saved: raw && raw.memory };
  });
  check('hub scene active', hub.active.includes('Hub'), JSON.stringify(hub.active));
  check('memory upgrade purchases', hub.after === hub.before + 1, JSON.stringify(hub));
  check('memory upgrade persists to localStorage', hub.saved && hub.saved.vitality === hub.after, JSON.stringify(hub.saved));

  // --- Weapon select ----------------------------------------------------
  console.log('\n== weapon select ==');
  const weapons = await page.evaluate(async () => {
    const { game } = window.__VEILBORN__;
    game.scene.start('WeaponSelect');
    await new Promise((r) => setTimeout(r, 200));
    return game.scene.getScenes(true).map((s) => s.scene.key);
  });
  check('weapon select scene active', weapons.includes('WeaponSelect'), JSON.stringify(weapons));

  // --- PWA / viewport sanity -------------------------------------------
  console.log('\n== mobile / PWA sanity ==');
  const viewportMeta = await page.evaluate(() => {
    const m = document.querySelector('meta[name="viewport"]');
    return m ? m.getAttribute('content') : null;
  });
  check('viewport meta present', !!viewportMeta, String(viewportMeta));

  // --- iPhone PWA contract ---------------------------------------------
  // These are the tags iOS reads when the game is added to the Home Screen.
  // Getting one wrong is invisible in a desktop browser but produces a white
  // splash, a status bar over the HUD, or a squashed canvas on a real phone.
  console.log('\n== iPhone PWA contract ==');
  const ios = await page.evaluate(() => {
    const meta = (n) => {
      const el = document.querySelector(`meta[name="${n}"]`);
      return el ? el.getAttribute('content') : null;
    };
    const splashes = [...document.querySelectorAll('link[rel="apple-touch-startup-image"]')]
      .map((l) => l.getAttribute('href'));
    const mf = document.querySelector('link[rel="manifest"]');
    return {
      capable: meta('apple-mobile-web-app-capable'),
      statusBar: meta('apple-mobile-web-app-status-bar-style'),
      title: meta('apple-mobile-web-app-title'),
      viewportFit: /viewport-fit=cover/.test(meta('viewport') || ''),
      userScalable: /user-scalable=no/.test(meta('viewport') || ''),
      splashes: splashes.length,
      touchIcon: (document.querySelector('link[rel="apple-touch-icon"]') || {}).href || null,
      manifestHref: mf ? mf.getAttribute('href') : null,
    };
  });
  check('ios standalone capable', ios.capable === 'yes', String(ios.capable));
  check('ios status bar is translucent', ios.statusBar === 'black-translucent', String(ios.statusBar));
  check('ios home-screen title set', ios.title === 'Veilborn', String(ios.title));
  check('viewport respects the notch (viewport-fit=cover)', ios.viewportFit);
  check('viewport blocks pinch zoom', ios.userScalable);
  check('ios launch screens declared', ios.splashes >= 4, `count=${ios.splashes}`);

  // The manifest must force landscape: the arena is a 16:9 field and a portrait
  // phone would letterbox it into an unplayable strip.
  const mf = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const res = await fetch(link.getAttribute('href'));
    return res.ok ? res.json() : null;
  });
  check('manifest forces landscape orientation', mf && mf.orientation === 'landscape',
    String(mf && mf.orientation));
  check('manifest is installable (standalone + fullscreen override)',
    !!mf && mf.display === 'standalone' && (mf.display_override || []).includes('fullscreen'),
    JSON.stringify(mf && { display: mf.display, over: mf.display_override }));
  check('manifest ships a maskable icon',
    !!mf && (mf.icons || []).some((i) => String(i.purpose).includes('maskable')),
    JSON.stringify(mf && mf.icons));

  // Safe-area insets: without these the HUD sits under the notch and the home
  // indicator covers the touch controls.
  const safeArea = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('game'));
    return cs.paddingTop !== undefined && getComputedStyle(document.body).overflow === 'hidden';
  });
  check('game container is locked to the viewport', safeArea);

  // --- rotate prompt ----------------------------------------------------
  // A real iPhone context, because the overlay is touch-gated: a narrow desktop
  // window must NOT show it, and a portrait phone must.
  console.log('\n== rotate prompt ==');
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true, isMobile: true, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const phonePage = await phone.newPage();
  await phonePage.goto(origin, { waitUntil: 'load' });
  await phonePage.waitForFunction(() => window.__VEILBORN__ && window.__VEILBORN__.gameState.booted, null, { timeout: 20000 });
  const shownPortrait = await phonePage.evaluate(() =>
    document.getElementById('rotate').classList.contains('show'));
  check('portrait phone shows the rotate prompt', shownPortrait);

  // Rotating to landscape must hide it again without a reload.
  await phonePage.setViewportSize({ width: 844, height: 390 });
  await sleep(400);
  const hiddenLandscape = await phonePage.evaluate(() =>
    document.getElementById('rotate').classList.contains('show'));
  check('landscape phone hides the rotate prompt', !hiddenLandscape);

  // Back to portrait: it must come back.
  await phonePage.setViewportSize({ width: 390, height: 844 });
  await sleep(400);
  const shownAgain = await phonePage.evaluate(() =>
    document.getElementById('rotate').classList.contains('show'));
  check('rotate prompt returns on rotating back', shownAgain);
  await phone.close();

  // Desktop (already 1280x720, no touch) must never see the overlay.
  const desktopShows = await page.evaluate(() =>
    document.getElementById('rotate').classList.contains('show'));
  check('desktop never shows the rotate prompt', !desktopShows);

  // --- Art wiring -------------------------------------------------------
  // The art layer is optional by design, so a silent failure is possible: the
  // manifest could list a file the loader never requests, a referenced file
  // could be absent from the build, or a texture could load and still not be
  // attached to an entity. All three are invisible to a behavioural test.
  console.log('\n== art wiring ==');

  // Node side: the manifest is a plain module, and the files it names must ship.
  const manifestSrc = await readFile(join(ROOT, '..', 'src', 'art-manifest.js'), 'utf8');
  const manifestPaths = [...manifestSrc.matchAll(/"(assets\/[^"]+)"/g)].map((m) => m[1]);
  const spritesInManifest = manifestPaths.filter((p) => p.includes('/sprites/'));
  const bgsInManifest = manifestPaths.filter((p) => p.includes('/backgrounds/'));
  check('art manifest lists every sprite slot', spritesInManifest.length >= 29,
    `sprites=${spritesInManifest.length}`);
  check('art manifest lists every background', bgsInManifest.length >= 6,
    `backgrounds=${bgsInManifest.length}`);
  const absentFromBuild = [];
  for (const p of manifestPaths) {
    try { await readFile(join(ROOT, p)); } catch { absentFromBuild.push(p); }
  }
  check('every manifest path exists in the build', absentFromBuild.length === 0,
    JSON.stringify(absentFromBuild.slice(0, 5)));

  // Page side: Boot queues the art, so by the menu it must be in the cache and
  // attached to real entities.
  const art = await page.evaluate(async () => {
    const { game, gameState } = window.__VEILBORN__;
    const wanted = [
      'assets/sprites/player/cael_idle.png',
      'assets/sprites/enemies/shade_wraith.png',
      'assets/sprites/bosses/zyther.png',
      'assets/sprites/props/treasure.png',
      'assets/sprites/props/respite.png',
      'assets/sprites/props/spirit.png',
      'assets/sprites/npcs/mira.png',
      'assets/sprites/npcs/korrin.png',
      'assets/sprites/npcs/chronicler.png',
      'assets/sprites/npcs/keeper.png',
      'assets/sprites/elites/shielded.png',
      'assets/sprites/elites/frenzied.png',
      'assets/sprites/elites/volatile.png',
      'assets/sprites/elites/warded.png',
      'assets/backgrounds/ash.webp',
      'assets/vfx/slash.png',
      'assets/vfx/impact.png',
      'assets/vfx/explosion.png',
      'assets/vfx/death_puff.png',
      'assets/ui/btn.png',
      'assets/ui/btn_hover.png',
      'assets/ui/hud_frame.png',
      'assets/ui/shard.png',
      'assets/ui/boon_rare.png',
    ];
    // Boot has already queued and awaited the art batch.
    const loaded = wanted.filter((p) => game.textures.exists(p));

    gameState.weapon = null;
    gameState.startNewRun('ashen_edge', 11);
    game.scene.start('Game', { mode: 'room' });
    await new Promise((r) => setTimeout(r, 450));
    const gs = game.scene.getScene('Game');
    const enemy = (gs.enemies || []).find((e) => e.sprite);
    return {
      loaded: loaded.length,
      wanted: wanted.length,
      playerUsesImage: !!(gs.player && gs.player.sprite),
      enemyUsesImage: !!enemy,
      enemyTexture: enemy ? enemy.sprite.texture.key : null,
      arenaHasBg: !!(gs.arena && gs.arena.graphics),
    };
  });
  check('art textures are cached after boot', art.loaded === art.wanted,
    `loaded=${art.loaded}/${art.wanted}`);

  // VFX sheets: each multi-frame strip must be sliced into a real animation, not
  // shown as one squashed image. Boot prepares them, so they must exist before
  // any effect fires. This is the failure Phaser's key-collision rule produced
  // silently, so it is asserted directly.
  const vfx = await page.evaluate(async () => {
    const { game, gameState } = window.__VEILBORN__;
    gameState.weapon = null;
    gameState.startNewRun('ashen_edge', 91);
    game.scene.start('Game', { mode: 'room' });
    await new Promise((r) => setTimeout(r, 400));
    const gs = game.scene.getScene('Game');
    const keys = {};
    for (const id of ['slash', 'impact', 'explosion', 'death_puff']) {
      const sheet = `assets/vfx/${id}.png__sheet`;
      const anim = `assets/vfx/${id}.png__anim`;
      keys[id] = {
        anim: game.anims.exists(anim),
        frames: game.textures.exists(sheet) ? game.textures.get(sheet).frameTotal - 1 : 0,
      };
    }
    // Fire every effect through the real code path, then count the live VFX
    // objects. Each must be a Sprite running its animation, not a flat image.
    gs.effects.slashArc(640, 360, 0, 100, 1.1, 0xffffff, 180);
    gs.effects.impact(640, 360, 0xff0000, 66, 200);
    gs.effects.deathPuff(640, 360, 0x9c6cff, 96);
    gs.effects.explosion(640, 360, 0x9c6cff, 300);
    const vfxObjs = gs.children.list.filter((o) => o.texture
      && String(o.texture.key).startsWith('assets/vfx/'));
    return {
      keys,
      live: vfxObjs.length,
      animated: vfxObjs.filter((o) => o.anims && o.anims.isPlaying).length,
    };
  });
  const expectedFrames = { slash: 6, impact: 6, explosion: 8, death_puff: 6 };
  for (const [id, r] of Object.entries(vfx.keys)) {
    check(`${id} vfx is prepared as a ${expectedFrames[id]}-frame animation`,
      r.anim && r.frames === expectedFrames[id], JSON.stringify(r));
  }
  check('vfx objects are created by real effect calls', vfx.live >= 4, `live=${vfx.live}`);
  check('every vfx object is playing its animation', vfx.animated === vfx.live,
    `animated=${vfx.animated}/${vfx.live}`);

  // Button art: the drawn rect stays as the hit area, and the art tiles attach
  // on top. Hover must swap the two art tiles rather than only recolour.
  const uiArt = await page.evaluate(async () => {
    const { game } = window.__VEILBORN__;
    game.scene.start('Menu');
    await new Promise((r) => setTimeout(r, 250));
    const menu = game.scene.getScene('Menu');
    const btn = (menu.buttons || [])[0];
    if (!btn) return { none: true };
    const before = { art: btn.art ? btn.art.alpha : null, hover: btn.hoverArt ? btn.hoverArt.alpha : null };
    btn.rect.emit('pointerover');
    const over = { art: btn.art ? btn.art.alpha : null, hover: btn.hoverArt ? btn.hoverArt.alpha : null };
    btn.rect.emit('pointerout');
    const out = { art: btn.art ? btn.art.alpha : null, hover: btn.hoverArt ? btn.hoverArt.alpha : null };
    return { hasArt: !!(btn.art && btn.hoverArt), before, over, out };
  });
  check('buttons render the art tile', uiArt.hasArt, JSON.stringify(uiArt));
  check('button hover swaps the art tiles',
    uiArt.over && uiArt.over.hover === 1 && uiArt.over.art === 0
    && uiArt.out && uiArt.out.hover === 0 && uiArt.out.art === 1, JSON.stringify(uiArt));

  check('player renders as a sprite, not a primitive', art.playerUsesImage);
  check('enemy renders as a sprite, not a primitive', art.enemyUsesImage,
    `texture=${art.enemyTexture}`);

  // Room props: the chest, the respite shrine and the bound spirit are the only
  // non-entity art in a chamber. Force each room type and confirm the sprite
  // attached rather than the primitive fallback.
  const propArt = await page.evaluate(async () => {
    const { game, gameState } = window.__VEILBORN__;
    const out = {};
    const cases = [
      ['Treasure', 'chestBody', 'assets/sprites/props/treasure.png'],
      ['Rest', 'healIcon', 'assets/sprites/props/respite.png'],
      ['Event', 'chestBody', 'assets/sprites/props/spirit.png'],
    ];
    for (const [type, field, path] of cases) {
      gameState.weapon = null;
      gameState.startNewRun('ashen_edge', 77);
      // Pin the room under test, then start it for real.
      gameState.rooms[1] = { ...gameState.rooms[1], type };
      gameState.run.room = 1;
      game.scene.start('Game', { mode: 'room' });
      await new Promise((r) => setTimeout(r, 320));
      const gs = game.scene.getScene('Game');
      const obj = gs[field];
      out[type] = {
        roomType: gs.roomType,
        texture: obj && obj.texture ? obj.texture.key : 'primitive',
        expected: path,
      };
    }
    return out;
  });
  for (const [type, r] of Object.entries(propArt)) {
    check(`${type.toLowerCase()} room uses its prop sprite`,
      r.roomType === type && r.texture === r.expected, JSON.stringify(r));
  }

  // Elite aura: an Elite room spawns a modified enemy. The aura overlay must
  // attach to that enemy while the body stays the base archetype sprite.
  const eliteArt = await page.evaluate(async () => {
    const { game, gameState } = window.__VEILBORN__;
    gameState.weapon = null;
    gameState.startNewRun('ashen_edge', 33);
    gameState.rooms[1] = { ...gameState.rooms[1], type: 'Elite' };
    gameState.run.room = 1;
    game.scene.start('Game', { mode: 'room' });
    await new Promise((r) => setTimeout(r, 400));
    const gs = game.scene.getScene('Game');
    const elite = (gs.enemies || []).find((e) => e.elite);
    if (!elite) return { none: true, roomType: gs.roomType };
    return {
      roomType: gs.roomType,
      eliteId: elite.elite.id,
      auraTexture: elite.aura ? elite.aura.texture.key : null,
      expected: `assets/sprites/elites/${elite.elite.id}.png`,
      bodyTexture: elite.sprite ? elite.sprite.texture.key : null,
    };
  });
  check('elite room spawns an elite with aura art',
    !eliteArt.none && eliteArt.auraTexture === eliteArt.expected,
    JSON.stringify(eliteArt));
  check('elite body keeps the base archetype sprite',
    !!eliteArt.bodyTexture && !String(eliteArt.bodyTexture).includes('/elites/'),
    JSON.stringify(eliteArt));

  // Speaker portraits: the event room shows one only for a speaker the art pass
  // actually drew, and falls back to the centred text line for the rest.
  const portraits = await page.evaluate(async () => {
    const { game, gameState } = window.__VEILBORN__;
    const withArt = [];
    const withoutArt = [];
    // Every speaker in the dialogue pool, so a new one cannot be added without
    // either art or an explicit fallback decision.
    for (const speaker of ['Mira', 'Korrin', 'Chronicler', 'Cael', 'Hollow']) {
      gameState.weapon = null;
      gameState.startNewRun('ashen_edge', 5);
      gameState.rooms[1] = { ...gameState.rooms[1], type: 'Event' };
      gameState.run.room = 1;
      // Pin the line the room will draw, so the speaker under test is the one
      // rendered rather than a random pick from the pool.
      gameState.content = { ...(gameState.content || {}), dialogue: [{ speaker, text: 'x' }] };
      game.scene.start('Game', { mode: 'room' });
      await new Promise((r) => setTimeout(r, 300));
      const gs = game.scene.getScene('Game');
      const p = gs.memoryPortrait;
      if (p && p.texture) withArt.push(`${speaker}:${p.texture.key}`);
      else withoutArt.push(speaker);
    }
    return { withArt, withoutArt };
  });
  check('drawn speakers show a portrait',
    portraits.withArt.length === 3 && portraits.withArt.every((s) => s.includes('/npcs/')),
    JSON.stringify(portraits.withArt));
  check('undrawn speakers fall back to text only',
    JSON.stringify(portraits.withoutArt) === JSON.stringify(['Cael', 'Hollow']),
    JSON.stringify(portraits.withoutArt));

  // --- Full playthrough: realm 1 room 1 -> final ending -----------------
  // Drives the *real* progression chain (room clear -> reward -> boon ->
  // advance -> boss -> realm transition -> ... -> throne -> ending) using the
  // actual buttons, rather than restarting scenes directly.
  console.log('\n== full playthrough (all realms, start to ending) ==');
  const play = await page.evaluate(async () => {
    const { gameState, game } = window.__VEILBORN__;
    game.scene.getScenes(true).forEach((s) => { if (s.scene.key !== 'Boot') s.scene.stop(); });
    await new Promise((r) => setTimeout(r, 250));

    const trace = [];
    const seenBosses = [];
    let ending = null;
    let error = null;

    gameState.weapon = null;
    gameState.startNewRun('ashen_edge', 20250922);
    gameState.enterRealm(0);
    gameState.run.room = 0;
    game.scene.start('Game', { mode: 'room' });

    try {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const active = game.scene.getScenes(true).map((s) => s.scene.key);
        if (active.includes('Ending')) {
          ending = game.scene.getScene('Ending').ending;
          break;
        }
        const g = game.scene.getScene('Game');
        if (g && g.scene.isActive()) {
          const at = `${gameState.run.realm}:${g.roomIndex}:${g.roomType}`;
          if (trace[trace.length - 1] !== at) trace.push(at);
          if (g.boss && g.boss.alive && !seenBosses.includes(g.boss.name)) seenBosses.push(g.boss.name);

          const btns = g.buttons || [];
          const take = btns.find((b) => b.label.text === 'TAKE');
          const descend = btns.find((b) => b.label.text.startsWith('DESCEND INTO'));
          const remember = btns.find((b) => b.label.text === 'REMEMBER');
          const free = btns.find((b) => b.label.text === 'FREE IT');

          if (take) {
            take.trigger();
          } else if (descend) {
            descend.trigger();
          } else if (remember) {
            remember.trigger();
          } else if (free) {
            free.trigger();
          } else if (!g.paused && g.player) {
            // Walk the player to the room's objective, exactly as a real player
            // would. Event/Rest rooms only complete on contact.
            const target = g.freedSpirit || g.healPool || g.chest || null;
            if (target) {
              g.player.x = target.x;
              g.player.y = target.y;
            }
            for (const e of [...g.enemies]) g.applyDamage(e, 999999, 0);
            if (g.boss && g.boss.alive) g.applyDamage(g.boss, 9999999, 0);
          }
        }
        await new Promise((r) => setTimeout(r, 55));
      }
    } catch (e) {
      error = String(e && e.stack ? e.stack : e);
    }

    return { ending, trace, seenBosses, error };
  });

  const realmsVisited = new Set(play.trace.map((t) => t.split(':')[0])).size;
  check('playthrough reached an ending', !!play.ending, JSON.stringify(play).slice(0, 500));
  check('playthrough visited all 5 realms', realmsVisited === 5, JSON.stringify(play.trace));
  check('playthrough fought all 5 bosses', play.seenBosses.length === 5, JSON.stringify(play.seenBosses));
  check('playthrough had no scene error', !play.error, JSON.stringify(play.error));

  // --- Offline PWA: install the service worker, cut the network, reload ---
  console.log('\n== offline PWA ==');
  const offlineContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const offPage = await offlineContext.newPage();
  const offErrors = [];
  offPage.on('pageerror', (err) => offErrors.push(err.message));
  await offPage.goto(origin, { waitUntil: 'load' });
  // Wait until the SW is activated and controlling the page.
  const swReady = await offPage.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (!reg) return 'no-reg';
    // Force the control change so the very next navigation is served by the SW.
    for (let i = 0; i < 60 && !navigator.serviceWorker.controller; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return navigator.serviceWorker.controller ? 'controlled' : 'no-controller';
  });
  check('service worker activates', swReady === 'controlled' || swReady === 'no-controller', swReady);

  const manifestMeta = await offPage.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    const res = await fetch(link.getAttribute('href'));
    if (!res.ok) return { ok: false, status: res.status };
    const m = await res.json();
    return { ok: true, name: m.name, display: m.display, icons: (m.icons || []).length, start: m.start_url };
  });
  check('manifest is fetchable and complete', !!manifestMeta && manifestMeta.ok && manifestMeta.icons >= 3 && manifestMeta.display === 'standalone', JSON.stringify(manifestMeta));

  const touchIcon = await offPage.evaluate(async () => {
    const link = document.querySelector('link[rel="apple-touch-icon"]');
    if (!link) return 'missing';
    const res = await fetch(link.getAttribute('href'));
    return res.ok ? 'ok' : `status ${res.status}`;
  });
  check('apple-touch-icon resolves', touchIcon === 'ok', touchIcon);

  // Give the SW a beat to finish precaching, then genuinely go offline.
  await sleep(1500);
  await offlineContext.setOffline(true);
  const offLoad = await offPage.reload({ waitUntil: 'load' }).then(() => true).catch((e) => String(e));
  check('page reloads while offline', offLoad === true, String(offLoad).slice(0, 120));
  const offBoot = await offPage.waitForFunction(
    () => window.__VEILBORN__ && window.__VEILBORN__.gameState.booted,
    null, { timeout: 20000 },
  ).then(() => true).catch(() => false);
  check('game boots offline from cache', offBoot === true, 'boot timed out');

  // Art is fetched by the loader rather than referenced from index.html, so it
  // is reachable in the precache only if the SW read art-index.json. Confirm a
  // sprite is genuinely there, not merely that the game booted.
  const offArt = await offPage.evaluate(async () => {
    const { game } = window.__VEILBORN__;
    const wanted = ['assets/sprites/player/cael_idle.png', 'assets/backgrounds/ash.webp'];
    return wanted.filter((p) => game.textures.exists(p)).length;
  });
  check('sprites are precached for a cold offline start', offArt === 2, `cached=${offArt}`);

  check('no page errors while offline', offErrors.length === 0, JSON.stringify(offErrors.slice(0, 3)));
  await offlineContext.setOffline(false);
  await offlineContext.close();

  // --- iOS lifecycle: backgrounding auto-pauses a live run --------------
  console.log('\n== lifecycle (background auto-pause) ==');
  const lifecycle = await page.evaluate(async () => {
    const { gameState, game } = window.__VEILBORN__;
    game.scene.getScenes(true).forEach((s) => { if (s.scene.key !== 'Boot') s.scene.stop(); });
    await new Promise((r) => setTimeout(r, 250));
    gameState.weapon = null;
    gameState.startNewRun('ashen_edge', 4242);
    gameState.enterRealm(0);
    gameState.run.room = 0;
    game.scene.start('Game', { mode: 'room' });
    await new Promise((r) => setTimeout(r, 400));
    const g = game.scene.getScene('Game');
    const beforePaused = g.paused;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 200));
    const afterPaused = g.paused;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 200));
    return { beforePaused, afterPaused, stillPaused: g.paused, overlay: !!g.pauseOverlay };
  });
  check('run is live before backgrounding', lifecycle.beforePaused === false, JSON.stringify(lifecycle));
  check('backgrounding auto-pauses the run', lifecycle.afterPaused === true, JSON.stringify(lifecycle));
  check('run stays paused on return', lifecycle.stillPaused === true && lifecycle.overlay === true, JSON.stringify(lifecycle));

  await browser.close();
  if (server) server.close();

  console.log('\n== error summary ==');
  check('no uncaught page errors', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 5)));
  check('no console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));

  console.log(`\n${passes.length} passed, ${failures.length} failed`);
  if (server) server.close();
  if (failures.length) { console.error('\nFAILURES:\n' + failures.join('\n')); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
