// Boot: load realm backgrounds and any optional hand-drawn art, then hand off
// to the Menu.
//
// Content data is imported as a module (see content.js) rather than fetched, so
// there is nothing to fail on a slow or offline connection.
import Phaser from 'phaser';
import { W, H, C } from '../config.js';
import { gameState } from '../systems/gamestate.js';
import { getContent } from '../content.js';
import { makeText, bar } from '../ui.js';
import { queueArt, prepareArt } from '../art.js';

export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.add.rectangle(W / 2, H / 2, W, H, C.bg);
    makeText(this, W / 2, H / 2 - 40, 'VEILBORN', { size: 44, color: C.text, origin: 0.5 });
    makeText(this, W / 2, H / 2 + 24, 'Descending…', { size: 16, color: C.muted, origin: 0.5 });
    this.progress = bar(this, W / 2 - 160, H / 2 + 56, 320, 10, { fill: C.purple });

    // Every optional art path is queued here; missing files are expected and
    // handled by resolveArt(), which falls back to the procedural renderer.
    queueArt(this);

    this.load.on('progress', (v) => this.progress.setRatio(v));
    this.load.on('loaderror', (file) => {
      // Non-fatal: the entity falls back to its procedural shape.
      console.info('[VEILBORN] optional art not found, using procedural:', file.key);
    });
  }

  create() {
    gameState.content = getContent();
    gameState.roomCount = 5;
    gameState.booted = true;

    // Slice the multi-frame effect sheets now so the first hit of a run does not
    // pay for texture setup mid-combat.
    prepareArt(this);

    if (!gameState.profile.unlockedWeapons || !gameState.profile.unlockedWeapons.length) {
      gameState.profile.unlockedWeapons = ['ashen_edge'];
    }
    gameState.persistProfile();

    this.scene.start('Menu');
  }
}

