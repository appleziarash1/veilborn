// In-run HUD: health, barrier, energy, boons, minimap-ish progress, hints.
import { C, W, H, COLOR_HEX } from '../config.js';
import { makeText, bar } from '../ui.js';
import { uiImage } from '../art.js';

export class Hud {
  constructor(scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(80);

    const pad = 24;
    // Art frame sits behind the bars when the pack ships one; the bars and text
    // draw on top either way.
    const frame = uiImage(scene, 'hud_frame', 520, 98);
    if (frame) frame.setPosition(pad - 6, H - 60).setOrigin(0, 0.5).setAlpha(0.9);
    this.artFrame = frame;
    this.hpBar = bar(scene, pad, H - 78, 260, 18, { fill: C.red });
    this.barrierBar = bar(scene, pad, H - 56, 260, 8, { fill: 0x8fb4ff });
    this.energyBar = bar(scene, pad + 280, H - 78, 200, 14, { fill: C.cyan });
    this.hpText = makeText(scene, pad + 6, H - 74, '', { size: 14, color: C.text });
    this.energyText = makeText(scene, pad + 286, H - 74, '', { size: 12, color: C.text });
    this.boonsText = makeText(scene, W - pad, H - 74, '', { size: 14, color: C.purple, origin: 1 });
    this.shardsText = makeText(scene, W - pad, H - 52, '', { size: 14, color: C.gold, origin: 1 });
    this.roomText = makeText(scene, W - pad, 24, '', { size: 17, color: C.text, origin: 1 });
    this.realmText = makeText(scene, W - pad, 48, '', { size: 14, color: C.muted, origin: 1 });
    this.weaponText = makeText(scene, pad, 24, '', { size: 16, color: C.gold });
    this.hintText = makeText(scene, W / 2, H - 108, '', { size: 13, color: C.muted, origin: 0.5 });
    this.comboText = makeText(scene, W / 2, 92, '', { size: 22, color: C.gold, origin: 0.5 });

    this.root.add([
      this.hpBar, this.barrierBar, this.energyBar, this.hpText, this.energyText,
      this.boonsText, this.shardsText, this.roomText, this.realmText,
      this.weaponText, this.hintText, this.comboText,
    ]);
    // The frame is drawn under the bars, so it joins the container first.
    if (this.artFrame) this.root.addAt(this.artFrame, 0);
    this.comboTimer = null;
  }

  setHint(text) {
    this.hintText.setText(text || '');
    if (this.hintTimer) this.hintTimer.remove();
    if (text) {
      this.hintTimer = this.scene.time.delayedCall(4200, () => this.hintText.setText(''));
    }
  }

  showCombo(text) {
    this.comboText.setText(text);
    this.comboText.setAlpha(1).setScale(1.15);
    this.scene.tweens.add({ targets: this.comboText, scale: 1, duration: 200 });
    if (this.comboTimer) this.comboTimer.remove();
    this.comboTimer = this.scene.time.delayedCall(900, () => {
      this.scene.tweens.add({ targets: this.comboText, alpha: 0, duration: 300 });
    });
  }

  update(run, player, realm, roomLabel) {
    const s = run.stats;
    this.hpBar.setRatio(s.hp / s.maxHp);
    this.barrierBar.setRatio(s.maxHp ? s.barrier / s.maxHp : 0);
    this.energyBar.setRatio(s.energy / s.maxEnergy);
    this.hpText.setText(`HP ${Math.ceil(s.hp)} / ${Math.round(s.maxHp)}`);
    this.energyText.setText(`ENERGY ${Math.ceil(s.energy)}`);
    this.boonsText.setText(`BOONS ${run.boons.length}`);
    this.shardsText.setText(`SHARDS ${run.shardsEarned}`);
    this.realmText.setText(realm.name);
    this.roomText.setText(roomLabel);
    this.weaponText.setText(`${run.weaponId.replace(/_/g, ' ').toUpperCase()}`);
  }

  destroy() { this.root.destroy(true); }
}
