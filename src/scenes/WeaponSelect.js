// Weapon selection before a descent. All six weapons are always available;
// the "unlocked" list tracks which ones the player has used.
import Phaser from 'phaser';
import { W, H, C } from '../config.js';
import { audio } from '../audio.js';
import { gameState } from '../systems/gamestate.js';
import { WEAPONS } from '../content.js';
import { makeText, panel, Button, transitionTo } from '../ui.js';
import { weaponIcon } from '../art.js';

export class WeaponSelect extends Phaser.Scene {
  constructor() { super('WeaponSelect'); }

  create() {
    this.cameras.main.setBackgroundColor(0x08070d);
    this.selected = gameState.weapon ? WEAPONS.indexOf(gameState.weapon) : 0;
    if (this.selected < 0) this.selected = 0;
    this.cards = [];

    makeText(this, W / 2, 66, 'CHOOSE YOUR WEAPON', { size: 38, color: C.text, origin: 0.5 });
    makeText(this, W / 2, 112, 'Cael carries one implement out of the Gate. It decides how the descent fights back.', {
      size: 16, color: C.muted, origin: 0.5, wrap: 900, align: 'center',
    });

    WEAPONS.forEach((wp, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 130 + col * 350;
      const y = 156 + row * 216;
      this.buildCard(wp, i, x, y);
      const num = makeText(this, x + 8, y + 6, `${i + 1}`, { size: 13, color: C.muted });
      this.cards[i].num = num;
    });

    this.confirm = new Button(this, W / 2 - 160, H - 92, 320, 54, 'DESCEND', () => this.confirm_(), {
      fill: 0x2a2036, hover: 0x3a2c4c, stroke: C.purple, size: 20,
    });
    this.back = new Button(this, 32, H - 92, 150, 54, 'BACK', () => transitionTo(this, 'Menu', {}, 220), {
      fill: C.panelLight, hover: 0x302941, size: 15,
    });

    this.keys = this.input.keyboard.addKeys('ONE,TWO,THREE,FOUR,FIVE,SIX,ESC,ENTER');
    this.keys.ESC.on('down', () => transitionTo(this, 'Menu', {}, 220));
    this.keys.ENTER.on('down', () => this.confirm_());
    [this.keys.ONE, this.keys.TWO, this.keys.THREE, this.keys.FOUR, this.keys.FIVE, this.keys.SIX].forEach((k, i) => {
      k.on('down', () => this.select(i));
    });

    this.refresh();
    this.cameras.main.fadeIn(240, 8, 7, 13);
  }

  buildCard(wp, i, x, y) {
    const w = 320; const h = 196;
    const bg = panel(this, x, y, w, h, { fill: C.panel, alpha: 0.9, stroke: 0x554c6d });
    const name = makeText(this, x + 18, y + 16, wp.name, { size: 21, color: C.text });
    const kind = makeText(this, x + 18, y + 44, `${wp.kind.toUpperCase()}  •  DMG ${wp.damage}  •  CD ${(wp.cooldown / 1000).toFixed(2)}s`, {
      size: 12, color: C.muted,
    });
    const lore = makeText(this, x + 18, y + 70, wp.lore, { size: 14, color: C.muted, wrap: w - 36 });
    const spec = makeText(this, x + 18, y + 130, `${wp.special}: ${wp.specialDesc}`, { size: 13, color: C.purple, wrap: w - 36 });
    const swatch = this.add.rectangle(x + w - 26, y + h - 24, 26, 8, wp.color).setOrigin(1, 0.5);
    // Card art when the art pass has produced it; the swatch stays as the
    // fallback and keeps the card readable either way.
    const icon = weaponIcon(this, wp.id, 72);
    if (icon) {
      icon.setPosition(x + w - 52, y + 52);
      swatch.setVisible(false);
    }
    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => { audio.unlock(); this.select(i); });
    hit.on('pointerover', () => { if (this.selected !== i) bg.setAlpha(0.98); });
    this.cards[i] = { bg, name, kind, lore, spec, swatch, icon, hit, x, y, w, h };
  }

  select(i) {
    if (i < 0 || i >= WEAPONS.length) return;
    this.selected = i;
    audio.ui();
    this.refresh();
  }

  refresh() {
    this.cards.forEach((c, i) => {
      if (!c || !c.bg) return;
      const on = i === this.selected;
      c.bg.clear();
      c.bg.fillStyle(on ? 0x241d33 : C.panel, on ? 0.98 : 0.85);
      c.bg.fillRoundedRect(c.x, c.y, c.w, c.h, 18);
      c.bg.lineStyle(on ? 3 : 2, on ? WEAPONS[i].color : 0x554c6d, on ? 1 : 0.6);
      c.bg.strokeRoundedRect(c.x, c.y, c.w, c.h, 18);
    });
    const wp = WEAPONS[this.selected];
    this.confirm.setSub(`${wp.name}`);
  }

  confirm_() {
    gameState.weapon = WEAPONS[this.selected];
    audio.door();
    if (!gameState.profile.unlockedWeapons.includes(WEAPONS[this.selected].id)) {
      gameState.profile.unlockedWeapons.push(WEAPONS[this.selected].id);
      gameState.persistProfile();
    }
    gameState.startNewRun(WEAPONS[this.selected].id);
    transitionTo(this, 'Game', { mode: 'room' }, 320);
  }
}
