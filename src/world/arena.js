// Arena backdrop. Uses the shipped realm backgrounds when present and falls
// back to a procedural gradient so the game always renders.
import { ARENA, W, H } from '../config.js';
import { backgroundPath } from '../art.js';

export class Arena {
  constructor(scene, realm) {
    this.scene = scene;
    this.realm = realm;
    this.tiles = [];
    this.graphics = null;
  }

  async build() {
    const { scene, realm } = this;
    // Background image, if art exists for this realm. Keyed by path so the
    // texture name always matches what the loader queued.
    const bgPath = backgroundPath(realm.id);
    if (bgPath && scene.textures.exists(bgPath)) {
      const img = scene.add.image(W / 2, H / 2, bgPath);
      const scale = Math.max(W / img.width, H / img.height);
      img.setScale(scale).setDepth(-20).setAlpha(0.5);
    } else {
      scene.add.rectangle(W / 2, H / 2, W, H, realm.tint).setDepth(-20);
    }
    scene.cameras.main.setBackgroundColor(realm.tint);

    this.graphics = scene.add.graphics().setDepth(-10);
    const g = this.graphics;
    // Grid floor
    g.lineStyle(2, realm.accent, 0.10);
    for (let x = ARENA.x; x <= ARENA.x + ARENA.w; x += 74) g.lineBetween(x, ARENA.y, x, ARENA.y + ARENA.h);
    for (let y = ARENA.y; y <= ARENA.y + ARENA.h; y += 74) g.lineBetween(ARENA.x, y, ARENA.x + ARENA.w, y);
    // Border
    g.lineStyle(6, realm.accent, 0.55);
    g.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    g.lineStyle(2, realm.accent, 0.9);
    g.strokeRect(ARENA.x - 6, ARENA.y - 6, ARENA.w + 12, ARENA.h + 12);
    // Corner runes
    const cs = 44;
    g.lineStyle(3, realm.accent, 0.8);
    const corners = [
      [ARENA.x, ARENA.y], [ARENA.x + ARENA.w, ARENA.y],
      [ARENA.x, ARENA.y + ARENA.h], [ARENA.x + ARENA.w, ARENA.y + ARENA.h],
    ];
    corners.forEach(([cx, cy], i) => {
      const sx = i % 2 === 0 ? 1 : -1;
      const sy = i < 2 ? 1 : -1;
      g.lineBetween(cx, cy, cx + cs * sx, cy);
      g.lineBetween(cx, cy, cx, cy + cs * sy);
    });
  }

  destroy() {
    if (this.graphics) this.graphics.destroy();
  }
}
