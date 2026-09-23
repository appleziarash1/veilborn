// Capture real screenshots of the built game so the art pass can be reviewed
// visually, not just asserted. Run: node scripts/shots.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css',
  '.webp': 'image/webp', '.webmanifest': 'application/manifest+json',
};
const OUT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'art-review');

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

async function shoot(name, viewport, prep, arg, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__VEILBORN__?.gameState?.booted, null, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 700));
  if (prep) await page.evaluate(prep, arg);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  await ctx.close();
  console.log('shot', name);
}

await shoot('01-menu', { width: 390, height: 844 });
await shoot('01b-menu-landscape', { width: 844, height: 390 });
// Portrait iPhone: the rotate prompt is the only thing that should be visible.
await shoot('00-rotate-prompt', { width: 390, height: 844 }, null, undefined, {
  hasTouch: true, isMobile: true, deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
// Event room, to review the spirit prop and the speaker portrait.
await shoot('03b-room-event', { width: 844, height: 390 }, () => {
  const { gameState, game } = window.__VEILBORN__;
  gameState.weapon = null;
  gameState.startNewRun('ashen_edge', 9);
  gameState.rooms[1] = { ...gameState.rooms[1], type: 'Event' };
  gameState.content = { ...(gameState.content || {}), dialogue: [{ speaker: 'Mira', text: 'the Veil remembers what the living refuse to name.' }] };
  gameState.run.room = 1;
  game.scene.start('Game', { mode: 'room' });
});
await shoot('03c-room-rest', { width: 844, height: 390 }, () => {
  const { gameState, game } = window.__VEILBORN__;
  gameState.weapon = null;
  gameState.startNewRun('ashen_edge', 9);
  gameState.rooms[1] = { ...gameState.rooms[1], type: 'Rest' };
  gameState.run.room = 1;
  game.scene.start('Game', { mode: 'room' });
});
await shoot('03d-room-treasure', { width: 844, height: 390 }, () => {
  const { gameState, game } = window.__VEILBORN__;
  gameState.weapon = null;
  gameState.startNewRun('ashen_edge', 9);
  gameState.rooms[1] = { ...gameState.rooms[1], type: 'Treasure' };
  gameState.run.room = 1;
  game.scene.start('Game', { mode: 'room' });
});
await shoot('02-weapons', { width: 844, height: 390 }, () => {
  window.__VEILBORN__.game.scene.start('WeaponSelect');
});
await shoot('03-room-ash', { width: 844, height: 390 }, () => {
  const { gameState, game } = window.__VEILBORN__;
  gameState.weapon = null;
  gameState.startNewRun('ashen_edge', 5);
  gameState.enterRealm(0);
  game.scene.start('Game', { mode: 'room' });
});

// Walk to a boss chamber and hold there so the boss art is on screen.
for (const [i, name] of ['zyther', 'seraphine', 'draemor', 'hollow'].entries()) {
  await shoot(`04-boss-${name}`, { width: 844, height: 390 }, (idx) => {
    const { gameState, game } = window.__VEILBORN__;
    gameState.weapon = null;
    gameState.startNewRun('pyre_lance', 40 + idx);
    gameState.enterRealm(idx);
    gameState.run.room = 3;
    game.scene.start('Game', { mode: 'room' });
  }, i);
}

await shoot('05-desktop-room', { width: 1280, height: 720 }, () => {
  const { gameState, game } = window.__VEILBORN__;
  gameState.weapon = null;
  gameState.startNewRun('tidebreaker_chakrams', 77);
  gameState.enterRealm(1);
  game.scene.start('Game', { mode: 'room' });
});

await browser.close();
server.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console/page errors');
