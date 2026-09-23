// Reusable UI primitives. Everything is drawn procedurally so the build has no
// external UI art dependency; a complete tile in the art pack overrides the
// drawn version where one exists (buttons, HUD frame, shard, boon sigils).
import { C, COLOR_HEX, W, H } from './config.js';
import { audio } from './audio.js';
import { uiImage, uiPath } from './art.js';

// A UI art tile if the pack has one, else null so the caller draws its own.
export function uiArt(scene, id, w, h) {
  return uiImage(scene, id, w, h);
}
export const hasUiArt = (id) => !!uiPath(id);

export function makeText(scene, x, y, str, opts = {}) {
  const {
    size = 20, color = C.text, origin = 0, wrap = 0, bold = false, alpha = 1,
  } = opts;
  const style = {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: `${size}px`,
    color: COLOR_HEX(color),
    align: opts.align || 'left',
  };
  if (bold) style.fontStyle = 'bold';
  if (wrap) style.wordWrap = { width: wrap };
  const t = scene.add.text(x, y, str, style).setOrigin(origin).setAlpha(alpha);
  t.setResolution(Math.min(2, window.devicePixelRatio || 1));
  return t;
}

export function panel(scene, x, y, w, h, opts = {}) {
  const { fill = C.panel, alpha = 0.94, stroke = 0x554c6d, strokeAlpha = 0.8, radius = 18 } = opts;
  const g = scene.add.graphics();
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, radius);
  if (stroke !== null) {
    g.lineStyle(2, stroke, strokeAlpha);
    g.strokeRoundedRect(x, y, w, h, radius);
  }
  return g;
}

export function bar(scene, x, y, w, h, opts = {}) {
  const { fill = C.red, bg = 0x2a2438, radius = 6 } = opts;
  const g = scene.add.graphics();
  const draw = (ratio) => {
    const r = Math.max(0, Math.min(1, ratio));
    g.clear();
    g.fillStyle(bg, 0.95);
    g.fillRoundedRect(x, y, w, h, radius);
    if (r > 0) {
      g.fillStyle(fill, 1);
      g.fillRoundedRect(x, y, Math.max(radius * 2, w * r), h, radius);
    }
  };
  draw(1);
  g.setRatio = draw;
  return g;
}

// A clickable button. Returns a container-like object with helper methods.
export class Button {
  constructor(scene, x, y, w, h, label, onClick, opts = {}) {
    this.scene = scene;
    this.w = w;
    this.h = h;
    this.enabled = true;
    this.onClick = onClick;
    this.opts = opts;
    const { size = 18, fill = C.panelLight, hover = 0x302941, stroke = 0x665b85, color = C.text } = opts;

    this.rect = scene.add.rectangle(x + w / 2, y + h / 2, w, h, fill)
      .setStrokeStyle(2, stroke)
      .setInteractive({ useHandCursor: true });
    this.label = makeText(scene, x + w / 2, y + h / 2, label, { size, color, origin: 0.5 });
    this.subLabel = null;

    // Optional button art. It sits under the label and follows the same hover
    // state; the drawn rect stays as the hit area and the no-art fallback.
    const art = uiImage(scene, 'btn', w, h);
    if (art) {
      this.art = art.setPosition(x + w / 2, y + h / 2);
      const hoverArt = uiImage(scene, 'btn_hover', w, h);
      if (hoverArt) { this.hoverArt = hoverArt.setPosition(x + w / 2, y + h / 2).setAlpha(0); }
      this.rect.setFillStyle(fill, 0);
    }

    const hovered = (on) => {
      if (this.hoverArt) this.hoverArt.setAlpha(on ? 1 : 0);
      if (this.art) this.art.setAlpha(on ? 0 : 1);
    };
    this.rect.on('pointerover', () => {
      if (!this.enabled) return;
      this.rect.setFillStyle(hover, this.art ? 0 : 1);
      hovered(true);
    });
    this.rect.on('pointerout', () => {
      if (!this.enabled) return;
      this.rect.setFillStyle(fill, this.art ? 0 : 1);
      hovered(false);
    });
    this.rect.on('pointerdown', () => {
      if (!this.enabled) return;
      audio.unlock();
      audio.ui();
      this.rect.setFillStyle(fill, this.art ? 0 : 1);
      hovered(false);
      this.onClick();
    });
    this.baseFill = fill;
    this.hoverFill = hover;
    if (opts.sub) this.setSub(opts.sub);

    // Registry so a scene can enumerate its live buttons. Used by tests and by
    // keyboard/accessibility navigation. Self-prunes: Phaser destroys overlays
    // as a group, which fires 'destroy' on the button rect, so we drop the
    // entry then and never hand back a dead button.
    (scene.buttons || (scene.buttons = [])).push(this);
    this.rect.once('destroy', () => {
      const list = scene.buttons || [];
      const i = list.indexOf(this);
      if (i >= 0) list.splice(i, 1);
    });
  }

  // Programmatic activation, equivalent to a pointer press. Used by automated
  // playthrough tests and by keyboard shortcuts.
  trigger() {
    if (!this.enabled || !this.rect || !this.rect.active) return false;
    audio.unlock();
    audio.ui();
    this.onClick();
    return true;
  }

  destroy() {
    const list = this.scene.buttons || [];
    const i = list.indexOf(this);
    if (i >= 0) list.splice(i, 1);
    this.rect.destroy();
    this.label.destroy();
    if (this.subLabel) this.subLabel.destroy();
    if (this.art) this.art.destroy();
    if (this.hoverArt) this.hoverArt.destroy();
  }

  setSub(text) {
    if (!this.subLabel) {
      this.subLabel = makeText(this.scene, this.label.x, this.label.y + 16, text, { size: 13, color: C.muted, origin: 0.5 });
      this.label.setY(this.label.y - 8);
    } else {
      this.subLabel.setText(text);
    }
    return this;
  }

  setLabel(text) { this.label.setText(text); return this; }

  setEnabled(v) {
    this.enabled = v;
    this.rect.setFillStyle(v ? this.baseFill : 0x1a1725, this.art ? 0 : 1);
    this.label.setAlpha(v ? 1 : 0.45);
    if (this.subLabel) this.subLabel.setAlpha(v ? 1 : 0.35);
    if (this.art) this.art.setAlpha(v ? 1 : 0.4);
    return this;
  }
}

export function hudLabel(scene, x, y, str, opts = {}) {
  return makeText(scene, x, y, str, { size: 15, color: C.muted, ...opts });
}

export function centerTitle(scene, y, title, subtitle, opts = {}) {
  const t = makeText(scene, W / 2, y, title, { size: opts.size || 60, origin: 0.5, color: opts.color || C.text });
  let s = null;
  if (subtitle) s = makeText(scene, W / 2, y + (opts.gap || 56), subtitle, { size: opts.subSize || 20, origin: 0.5, color: opts.subColor || C.purple });
  return { title: t, subtitle: s };
}

export function fadeIn(scene, ms = 260) {
  scene.cameras.main.fadeIn(ms, 9, 10, 16);
}

// Scene transition with a hard fallback.
//
// We fade out and swap on `camerafadeoutcomplete`, but that event is not
// guaranteed: headless renderers, a stalled requestAnimationFrame, or a scene
// paused mid-fade can all leave it unfired. A raw timeout guarantees the
// transition always happens, so the game can never hang on a fade.
export function transitionTo(scene, key, data, ms = 260) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    scene.cameras.main.off('camerafadeoutcomplete', go);
    scene.scene.start(key, data);
  };
  scene.cameras.main.once('camerafadeoutcomplete', go);
  scene.cameras.main.fadeOut(ms, 9, 10, 16);
  setTimeout(go, ms + 400);
}

export { C, COLOR_HEX, W, H };
