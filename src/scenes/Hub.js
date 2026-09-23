// The Shattered Gate: hub between runs, where persistent "Memory" upgrades are
// bought with shards earned across every descent.
import Phaser from 'phaser';
import { W, H, C } from '../config.js';
import { audio } from '../audio.js';
import { gameState } from '../systems/gamestate.js';
import { makeText, panel, Button, transitionTo } from '../ui.js';
import { backgroundPath, npcPath } from '../art.js';

const MEMORY_UPGRADES = [
  { key: 'vitality', name: 'Deepened Vitality', desc: '+10 max HP per rank', cost: (r) => 40 + r * 35, max: 8 },
  { key: 'potency', name: 'Sharpened Memory', desc: '+4% weapon damage per rank', cost: (r) => 50 + r * 45, max: 8 },
  { key: 'swiftness', name: 'Fleet Recall', desc: '+3% move speed per rank', cost: (r) => 45 + r * 40, max: 6 },
  { key: 'insight', name: 'Read the Veil', desc: '+2% crit chance per rank', cost: (r) => 55 + r * 50, max: 6 },
  { key: 'attunement', name: 'Veil Attunement', desc: '+5% energy regen per rank', cost: (r) => 45 + r * 40, max: 6 },
];

export class Hub extends Phaser.Scene {
  constructor() { super('Hub'); }

  create() {
    audio.playMusic('hub');
    this.cameras.main.setBackgroundColor(0x0c0b12);
    const hubBg = backgroundPath('hub');
    if (hubBg && this.textures.exists(hubBg)) {
      const img = this.add.image(W / 2, H / 2, hubBg);
      img.setScale(Math.max(W / img.width, H / img.height)).setAlpha(0.45);
    }
    for (let i = 0; i < 30; i++) {
      const m = this.add.circle(Math.random() * W, H - Math.random() * H, 1 + Math.random() * 2, 0xffffff, 0.06 + Math.random() * 0.16);
      this.tweens.add({ targets: m, y: m.y - 200, alpha: 0, duration: 6000 + Math.random() * 6000, repeat: -1, delay: Math.random() * 4000 });
    }

    makeText(this, W / 2, 52, 'THE SHATTERED GATE', { size: 40, color: C.text, origin: 0.5 });
    makeText(this, W / 2, 96, 'A broken sanctuary between memory and oblivion. Shards you spend here are yours forever.', {
      size: 15, color: C.muted, origin: 0.5, wrap: 900, align: 'center',
    });

    this.shardText = makeText(this, W / 2, 132, '', { size: 19, color: C.gold, origin: 0.5 });

    // The shop keeper watches the Memory panel. Art is optional; the keeper is
    // simply absent when the pack has no sprite for it.
    const keeper = npcPath('keeper');
    if (keeper && this.textures.exists(keeper)) {
      const img = this.add.image(818, 470, keeper).setDisplaySize(132, 132).setAlpha(0.95);
      img.setOrigin(0.5, 1);
      makeText(this, 818, 478, 'THE KEEPER', { size: 12, color: C.muted, origin: 0.5 });
    }

    panel(this, 60, 160, 760, 470, { fill: C.panel, alpha: 0.9 });
    makeText(this, 90, 176, 'MEMORY — permanent upgrades', { size: 20, color: C.purple });
    this.rows = [];
    MEMORY_UPGRADES.forEach((u, i) => this.buildRow(u, i));

    panel(this, 848, 160, 372, 470, { fill: C.panel, alpha: 0.9 });
    makeText(this, 878, 176, 'CAEL VAREN', { size: 20, color: C.gold });
    makeText(this, 878, 204, 'The Veilborn', { size: 14, color: C.muted });
    makeText(this, 878, 240, 'DESCEND', { size: 16, color: C.muted });
    new Button(this, 878, 264, 312, 54, 'BEGIN DESCENT', () => this.scene.start('WeaponSelect'), {
      fill: 0x2a2036, hover: 0x3a2c4c, stroke: C.purple, size: 18,
    });
    makeText(this, 878, 336, 'Leaving the Gate resets your boons, weapon,\nand health to a fresh run.', { size: 13, color: C.muted, lineSpacing: 4 });

    const p = gameState.profile;
    makeText(this, 878, 402, `Runs: ${p.totalRuns || 0}   Kills: ${p.totalKills || 0}`, { size: 14, color: C.muted });
    const endings = (p.endings || []);
    makeText(this, 878, 430, `Endings found: ${endings.length} / 4`, { size: 14, color: C.purple });
    const names = { sealed: 'Sealed Veil', open: 'Open Veil', new: 'New Veil', true: 'The Veilborn' };
    (['sealed', 'open', 'new', 'true']).forEach((k, i) => {
      const found = endings.includes(k);
      makeText(this, 878, 458 + i * 24, `${found ? '✦' : '·'} ${names[k]}`, { size: 13, color: found ? C.gold : 0x4d4759 });
    });

    new Button(this, 878, 570, 312, 44, 'SOUND & VIDEO', () => this.scene.start('Options', { from: 'Hub' }), {
      fill: C.panelLight, hover: 0x302941, size: 15,
    });
    new Button(this, 60, 646, 200, 44, '← MENU', () => transitionTo(this, 'Menu', {}, 260), {
      fill: C.panelLight, hover: 0x302941, size: 15,
    });

    this.input.keyboard.on('keydown-ESC', () => transitionTo(this, 'Menu', {}, 260));
    this.refresh();
    this.cameras.main.fadeIn(260, 8, 7, 13);
  }

  buildRow(u, i) {
    const x = 90; const y = 216 + i * 82;
    const name = makeText(this, x, y, u.name, { size: 17, color: C.text });
    const desc = makeText(this, x, y + 24, u.desc, { size: 13, color: C.muted });
    const rank = makeText(this, x + 430, y + 6, '', { size: 17, color: C.cyan, origin: 1 });
    const btn = new Button(this, x + 470, y + 2, 190, 44, '', () => this.buy(u, btn, rank), {
      fill: 0x241f34, hover: 0x342c4a, size: 14,
    });
    this.rows.push({ u, btn, rank, name, desc });
  }

  buy(u, btn, rank) {
    const p = gameState.profile;
    const cur = p.memory[u.key] || 0;
    if (cur >= u.max) { audio.ui(); return; }
    const cost = u.cost(cur);
    if ((p.shards || 0) < cost) {
      this.flashInsufficient();
      audio.ui();
      return;
    }
    p.shards -= cost;
    p.memory[u.key] = cur + 1;
    gameState.persistProfile();
    audio.boon();
    this.cameras.main.flash(200, 40, 30, 60);
    this.refresh();
  }

  flashInsufficient() {
    if (this.warnTween) this.warnTween.remove();
    this.warnTween = this.tweens.add({
      targets: this.shardText,
      x: { from: W / 2 - 6, to: W / 2 + 6 },
      duration: 60, yoyo: true, repeat: 4,
      onComplete: () => this.shardText.setX(W / 2),
    });
  }

  refresh() {
    const p = gameState.profile;
    this.shardText.setText(`SHARDS  ${p.shards || 0}`);
    for (const row of this.rows) {
      const cur = p.memory[row.u.key] || 0;
      const maxed = cur >= row.u.max;
      const cost = row.u.cost(cur);
      row.rank.setText(`RANK ${cur}/${row.u.max}`);
      row.rank.setColor('#' + (maxed ? 'f1c75b' : '63d9e8'));
      if (maxed) row.btn.setLabel('MAXED').setEnabled(false);
      else {
        const afford = (p.shards || 0) >= cost;
        row.btn.setLabel(`${cost} SHARDS`).setEnabled(afford);
      }
    }
  }
}
