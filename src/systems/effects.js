// Visual feedback: damage numbers, hit sparks, screen shake, telegraphs.
import { C, COLOR_HEX } from '../config.js';
import { makeText } from '../ui.js';
import { vfxImage } from '../art.js';

// Art-driven hit effects. Each returns false when the art pass has no sheet for
// it, so the caller keeps its primitive arc/spark. The sheets are 128px frames
// and are tinted to the damage colour so one sheet serves every realm.
const VFX_SIZE = { slash: 118, impact: 74, explosion: 190, death_puff: 96 };

function playVfx(scene, id, x, y, opts = {}) {
  const { color = null, angle = null, size = null, depth = 53, life = null } = opts;
  const s = vfxImage(scene, id, size || VFX_SIZE[id] || 96);
  if (!s) return null;
  s.setPosition(x, y).setDepth(depth);
  if (angle != null) s.setAngle((angle * 180) / Math.PI);
  if (color != null) s.setTint(color);
  if (life != null) {
    scene.tweens.add({ targets: s, alpha: 0, duration: life, onComplete: () => s.destroy() });
  }
  return s;
}

export class Effects {
  constructor(scene, options) {
    this.scene = scene;
    this.options = options || { screenshake: true, damageNumbers: true, reducedFlash: false };
    this.layer = scene.add.container(0, 0).setDepth(60);
  }

  setOptions(o) { this.options = o; }

  damageNumber(x, y, amount, opts = {}) {
    if (!this.options.damageNumbers) return;
    const { crit = false, color = null, prefix = '-' } = opts;
    const col = color || (crit ? C.gold : C.red);
    const t = makeText(this.scene, x, y, `${prefix}${Math.round(amount)}`, {
      size: crit ? 26 : 18, color: col, origin: 0.5, bold: crit,
    });
    this.layer.add(t);
    const dx = (Math.random() - 0.5) * 26;
    this.scene.tweens.add({
      targets: t,
      x: x + dx,
      y: y - (crit ? 52 : 38),
      alpha: 0,
      scale: crit ? 1.25 : 1,
      duration: crit ? 620 : 480,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  floatText(x, y, str, color = C.text, size = 16) {
    const t = makeText(this.scene, x, y, str, { size, color, origin: 0.5 });
    this.layer.add(t);
    this.scene.tweens.add({
      targets: t, y: y - 34, alpha: 0, duration: 700, ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  spark(x, y, color, count = 8, speed = 180) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = this.scene.add.circle(x, y, 2 + Math.random() * 3, color, 0.95).setDepth(55);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(a) * speed * (0.4 + Math.random()),
        y: y + Math.sin(a) * speed * (0.4 + Math.random()),
        alpha: 0,
        scale: 0.2,
        duration: 260 + Math.random() * 260,
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  ring(x, y, radius, color, dur = 320, lineWidth = 4) {
    const g = this.scene.add.circle(x, y, radius * 0.25, undefined, 0)
      .setStrokeStyle(lineWidth, color, 0.9).setDepth(54);
    this.scene.tweens.add({
      targets: g, scale: 1 / 0.25, alpha: 0, duration: dur, ease: 'Cubic.easeOut',
      onComplete: () => g.destroy(),
    });
    return g;
  }

  slashArc(x, y, angle, radius, arc, color, dur = 200) {
    const art = playVfx(this.scene, 'slash', x, y, {
      color, angle: angle, size: Math.max(VFX_SIZE.slash, radius * 2.2), life: dur + 160,
    });
    if (art) return art;
    const g = this.scene.add.graphics().setDepth(53);
    g.lineStyle(6, color, 0.85);
    g.beginPath();
    g.arc(x, y, radius, angle - arc / 2, angle + arc / 2);
    g.strokePath();
    this.scene.tweens.add({ targets: g, alpha: 0, duration: dur, onComplete: () => g.destroy() });
    return g;
  }

  // A single impact burst. Used where a hit lands without a full swing.
  impact(x, y, color, size = VFX_SIZE.impact, life = 260) {
    return playVfx(this.scene, 'impact', x, y, { color, size, life });
  }

  // Enemy/boss death. Bigger and slower than a hit.
  deathPuff(x, y, color, size = VFX_SIZE.death_puff) {
    return playVfx(this.scene, 'death_puff', x, y, { color, size, life: 420 });
  }

  explosion(x, y, color, size = VFX_SIZE.explosion) {
    return playVfx(this.scene, 'explosion', x, y, { color, size, life: 460 });
  }

  // Telegraph a damaging zone before it activates.
  telegraph(x, y, radius, color, ms) {
    const g = this.scene.add.circle(x, y, radius, color, 0.16)
      .setStrokeStyle(3, color, 0.8).setDepth(20);
    const inner = this.scene.add.circle(x, y, radius, color, 0.32).setDepth(21).setScale(0);
    this.scene.tweens.add({ targets: inner, scale: 1, duration: ms, ease: 'Linear' });
    return { g, inner, destroy: () => { g.destroy(); inner.destroy(); } };
  }

  shake(intensity = 0.006, dur = 140) {
    if (!this.options.screenshake) return;
    this.scene.cameras.main.shake(dur, intensity);
  }

  flash(color, alpha = 0.3, dur = 120) {
    if (this.options.reducedFlash) return;
    const r = this.scene.add.rectangle(640, 360, 1280, 720, color, alpha).setDepth(90);
    this.scene.tweens.add({ targets: r, alpha: 0, duration: dur, onComplete: () => r.destroy() });
  }

  destroy() { this.layer.destroy(true); }
}

export function tintHex(n) { return COLOR_HEX(n); }
