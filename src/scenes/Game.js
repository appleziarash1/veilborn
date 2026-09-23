// GameScene: the descent itself. Rooms, combat, boss fights, rewards, pause.
//
// The scene is authoritative for collisions and lifecycle so that entities can
// stay small and dumb.
import Phaser from 'phaser';
import { W, H, C, ARENA, REALMS, KNIGHT } from '../config.js';
import { audio } from '../audio.js';
import { gameState, budgetFor } from '../systems/gamestate.js';
import { Effects } from '../systems/effects.js';
import { TouchControls } from '../systems/touch.js';
import { Hud } from '../systems/hud.js';
import { Player } from '../entities/player.js';
import { Enemy, EnemyShot } from '../entities/enemy.js';
import { Boss } from '../entities/boss.js';
import { PlayerShot, Hazard, Orbit } from '../entities/projectile.js';
import { Arena } from '../world/arena.js';
import { buildAttack, buildSpecial, coneHits, rollCrit } from '../systems/combat.js';
import { enemyArchetype, ELITE_MODS, roomBudget, rollBoonChoices, rarityColor } from '../world/rooms.js';
import { makeText, panel, Button, transitionTo } from '../ui.js';
import { npcPath, propImage } from '../art.js';
import { onVisibilityChange } from '../pwa.js';

const ROOM_LABELS = {
  Combat: 'COMBAT', Elite: 'ELITE', Gauntlet: 'GAUNTLET',
  Treasure: 'TREASURE', Rest: 'RESPITE', Event: 'MEMORY', Boss: 'BOSS',
};

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create(data) {
    this.mode = data.mode || 'room';
    // Every create() is a new "session". Wall-clock timers capture the token
    // and abort if the scene has since been restarted, so a late callback from
    // a previous room can never mutate the current one.
    this.session = (this.session || 0) + 1;
    const session = this.session;
    this.later = (fn, ms) => setTimeout(() => {
      if (this.session !== session || !this.scene.isActive()) return;
      fn();
    }, ms);
    this.effects = new Effects(this, gameState.options);
    this.touch = new TouchControls(this);
    this.hud = new Hud(this);
    this.enemies = [];
    this.shots = [];
    this.enemyShots = [];
    this.hazards = [];
    this.orbits = [];
    this.scheduled = [];
    this.boss = null;
    this.player = null;
    this.paused = false;
    this.roomDone = false;
    this.roomStart = 0;
    this.slowFields = [];
    this.pullEffect = null;

    this.buildInput();
    this.startRoom();

    this.cameras.main.fadeIn(240, 9, 10, 16);
    this.events.once('shutdown', () => this.cleanup());

    // Auto-pause the instant the app is backgrounded, so an iOS app switch or
    // screen lock cannot silently burn a run.
    this._offVisibility = onVisibilityChange((hidden) => {
      if (hidden && this.scene.isActive() && !this.paused && !this.rewardOverlay && !this.roomDone) {
        this.togglePause();
      }
    });
  }

  cleanup() {
    this.effects.destroy();
    this.hud.destroy();
    if (this.touch) this.touch.destroy();
    this.scheduled = [];
    if (this._offVisibility) { this._offVisibility(); this._offVisibility = null; }
  }

  // ---------------------------------------------------------------- input
  buildInput() {
    this.keys = this.input.keyboard.addKeys(
      'W,A,S,D,UP,LEFT,DOWN,RIGHT,SPACE,ONE,TWO,THREE,FOUR,FIVE,SIX,ESC,SHIFT,E,Q',
    );
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard.on('keydown-P', () => this.togglePause());
    this.input.keyboard.on('keydown-E', () => this.interact());
    this.input.keyboard.on('keydown-SPACE', () => this.tryDash());
    this.input.keyboard.on('keydown-SHIFT', () => this.tryDash());

    this.input.on('pointerdown', (p) => {
      audio.unlock();
      if (this.paused || this.roomDone || !this.player) return;
      if (this.touch.enabled) return; // touch buttons handle it
      if (p.rightButtonDown()) this.trySpecial(p.worldX, p.worldY);
      else this.tryAttack(p.worldX, p.worldY);
    });
    // Hold to keep attacking.
    this.input.on('pointermove', (p) => {
      if (this.paused || this.roomDone || !this.player) return;
      if (this.touch.enabled) return;
      if (p.isDown && !p.rightButtonDown()) this.tryAttack(p.worldX, p.worldY);
    });
    this.input.mouse && this.input.mouse.disableContextMenu();
  }

  // ---------------------------------------------------------------- rooms
  startRoom() {
    this.roomIndex = gameState.run.room;
    const room = gameState.currentRoom();
    this.roomType = room.type;
    this.roomDone = false;
    this.roomStart = this.time.now;
    this.clearEntities();

    gameState.run.stats.energy = gameState.run.stats.maxEnergy;
    const stats = gameState.run.stats;
    if (stats.ward) stats.barrier = stats.ward;

    const realm = REALMS[gameState.run.realm];
    this.realm = realm;
    this.arena = new Arena(this, realm);
    this.arena.build();

    this.player = new Player(this, W / 2, ARENA.y + ARENA.h - 110, gameState.run, gameState.weaponDef);

    this.hud.setHint(`${realm.name} — ${ROOM_LABELS[room.type] || 'ROOM'} ${this.roomIndex + 1}/${gameState.roomCount || 5}`);

    if (room.type === 'Boss') this.spawnBoss();
    else if (room.type === 'Treasure') this.spawnTreasureRoom();
    else if (room.type === 'Rest') this.spawnRestRoom();
    else if (room.type === 'Event') this.spawnEventRoom();
    else this.spawnCombatRoom(room.type);

    if (room.type === 'Combat' || room.type === 'Elite' || room.type === 'Gauntlet') {
      audio.playMusic(gameState.run.realm >= 3 ? 'tension' : 'combat');
    } else if (room.type === 'Boss') {
      audio.playMusic('boss');
    } else {
      audio.playMusic('hub');
    }
    this.updateHud();
  }

  spawnCombatRoom(type) {
    const budget = budgetFor(type, gameState.run.realm, this.roomIndex);
    const elite = type === 'Elite';
    for (let i = 0; i < budget; i++) {
      const tier = gameState.run.realm;
      const idx = (gameState.run.realm * 2 + this.roomIndex + i) % 10;
      const arch = enemyArchetype(idx, gameState.content);
      const rarityBoost = 1 + gameState.run.realm * 0.35 + this.roomIndex * 0.08;
      const opts = {
        tier,
        speed: 54 + tier * 6,
      };
      if (elite && i === 0) {
        const mod = ELITE_MODS[gameState.run.realm % ELITE_MODS.length];
        opts.elite = mod;
        opts.hpMult = mod.hpMult * (1 + gameState.run.realm * 0.25);
        opts.dmgMult = mod.dmgMult;
        opts.radius = 28;
      } else {
        opts.hpMult = rarityBoost;
        opts.dmgMult = 1 + gameState.run.realm * 0.12;
      }
      const pos = this.findSpawnPosition();
      this.enemies.push(new Enemy(this, pos.x, pos.y, arch, opts));
    }
    if (this.enemies.length === 0) this.completeRoom();
  }

  spawnTreasureRoom() {
    // A chest to walk into; opening it grants a boon choice.
    this.chest = this.add.container(W / 2, ARENA.y + ARENA.h / 2).setDepth(25);
    this.chestBody = propImage(this, 'treasure', 96)
      || this.add.rectangle(0, 0, 54, 40, 0xf1c75b).setStrokeStyle(3, 0xfff2c8);
    this.chestGlow = this.add.circle(0, 0, 52, 0xf1c75b, 0.18);
    this.chest.add([this.chestGlow, this.chestBody]);
    this.tweens.add({ targets: this.chestGlow, scale: 1.25, alpha: 0.08, duration: 900, yoyo: true, repeat: -1 });
    this.prompt = makeText(this, W / 2, ARENA.y + ARENA.h / 2 + 70, 'Walk in to open the Vault', { size: 16, color: C.gold, origin: 0.5 });
  }

  spawnRestRoom() {
    this.healPool = this.add.circle(W / 2, ARENA.y + ARENA.h / 2, 70, C.green, 0.16)
      .setStrokeStyle(3, C.green, 0.6).setDepth(20);
    // The sprite sits over the pool so the room reads as a shrine, not a blob.
    this.healIcon = propImage(this, 'respite', 76);
    if (this.healIcon) this.healIcon.setPosition(W / 2, ARENA.y + ARENA.h / 2).setDepth(21);
    this.tweens.add({ targets: this.healPool, scale: 1.12, duration: 1100, yoyo: true, repeat: -1 });
    this.prompt = makeText(this, W / 2, ARENA.y + ARENA.h / 2 + 96, 'Stand in the Respite to heal', { size: 16, color: C.green, origin: 0.5 });
  }

  spawnEventRoom() {
    const pool = (gameState.content && gameState.content.dialogue) || [];
    const line = pool.length ? pool[Math.floor(Math.random() * pool.length)] : {
      speaker: 'Memory', text: 'the Veil remembers what the living refuse to name.',
    };

    // A bound spirit. You may free it (mercy) or absorb it (power). This is the
    // choice that makes the True Ending earnable rather than accidental.
    this.freedSpirit = this.add.container(W / 2, ARENA.y + ARENA.h / 2).setDepth(25);
    this.pickupGlow = this.add.circle(0, 0, 54, C.purple, 0.18).setStrokeStyle(3, C.purple, 0.6);
    this.chestBody = propImage(this, 'spirit', 84) || this.add.circle(0, 0, 20, 0xd9c9ff, 0.85);
    this.shardPile = this.freedSpirit;
    this.freedSpirit.add([this.pickupGlow, this.chestBody]);
    this.tweens.add({ targets: this.pickupGlow, scale: 1.2, alpha: 0.08, duration: 1000, yoyo: true, repeat: -1 });

    // Speaker portrait, when the art pass has one for them. Cael and the Hollow
    // have none, so the line stays text-only rather than showing a blank frame.
    const portrait = npcPath(line.speaker);
    if (portrait && this.textures.exists(portrait)) {
      this.memoryPortrait = this.add.image(W / 2 - 300, ARENA.y + 96, portrait)
        .setDisplaySize(104, 104).setDepth(26).setAlpha(0.95);
      this.memoryLine = makeText(this, W / 2 + 30, ARENA.y + 80, `${line.speaker || 'Memory'}: "${line.text}"`, {
        size: 17, color: C.muted, origin: 0.5, wrap: 560, align: 'left',
      });
    } else {
      this.memoryLine = makeText(this, W / 2, ARENA.y + 80, `${line.speaker || 'Memory'}: "${line.text}"`, {
        size: 17, color: C.muted, origin: 0.5, wrap: 820, align: 'center',
      });
    }
    this.prompt = makeText(this, W / 2, ARENA.y + ARENA.h - 40, 'Walk into the spirit to face it', {
      size: 16, color: C.purple, origin: 0.5,
    });
  }

  spawnBoss() {
    const def = gameState.bossDef;
    this.boss = new Boss(this, def, { x: W / 2, y: ARENA.y + 180, tier: gameState.run.realm });
    this.boss.start(this.time.now);
    audio.bossRoar();
    this.cameras.main.shake(500, 0.008);
    // Intro banner
    const banner = makeText(this, W / 2, H / 2 - 60, def.name, { size: 44, color: C.text, origin: 0.5 });
    const sub = makeText(this, W / 2, H / 2 - 6, def.title, { size: 19, color: def.accent, origin: 0.5 });
    const taunt = makeText(this, W / 2, H / 2 + 44, `"${def.taunt}"`, { size: 17, color: C.muted, origin: 0.5, wrap: 760, align: 'center' });
    [banner, sub, taunt].forEach((t) => t.setAlpha(0));
    this.tweens.add({ targets: [banner, sub, taunt], alpha: 1, duration: 600 });
    this.time.delayedCall(3000, () => {
      this.tweens.add({
        targets: [banner, sub, taunt], alpha: 0, duration: 500,
        onComplete: () => { banner.destroy(); sub.destroy(); taunt.destroy(); },
      });
    });
  }

  findSpawnPosition() {
    for (let tries = 0; tries < 40; tries++) {
      const x = ARENA.x + 80 + Math.random() * (ARENA.w - 160);
      const y = ARENA.y + 80 + Math.random() * (ARENA.h - 160);
      if (!this.player) return { x, y };
      if (Math.hypot(x - this.player.x, y - this.player.y) > 260) return { x, y };
    }
    return { x: ARENA.x + 120, y: ARENA.y + 120 };
  }

  clearEntities() {
    this.enemies.forEach((e) => e.destroy());
    this.shots.forEach((s) => s.destroy());
    this.enemyShots.forEach((s) => s.destroy());
    this.hazards.forEach((h) => h.destroy());
    this.orbits.forEach((o) => o.destroy());
    this.enemies = []; this.shots = []; this.enemyShots = [];
    this.hazards = []; this.orbits = []; this.scheduled = [];
    if (this.boss) { this.boss.destroy(); this.boss = null; }
    if (this.player) { this.player.destroy(); this.player = null; }
    if (this.arena) { this.arena.destroy(); this.arena = null; }
    if (this.chest) { this.chest.destroy(); this.chest = null; }
    if (this.shardPile) { this.shardPile.destroy(); this.shardPile = null; }
    if (this.healPool) { this.healPool.destroy(); this.healPool = null; }
    if (this.healIcon) { this.healIcon.destroy(); this.healIcon = null; }
    if (this.prompt) { this.prompt.destroy(); this.prompt = null; }
    if (this.memoryLine) { this.memoryLine.destroy(); this.memoryLine = null; }
    if (this.memoryPortrait) { this.memoryPortrait.destroy(); this.memoryPortrait = null; }
    if (this.freedSpirit) { this.freedSpirit.destroy(); this.freedSpirit = null; }
    this.slowFields.forEach((f) => f.destroy());
    this.slowFields = [];
  }

  // ---------------------------------------------------------------- combat
  aimAngle(tx, ty) {
    if (tx == null || ty == null) return this.player.facing;
    return Math.atan2(ty - this.player.y, tx - this.player.x);
  }

  tryAttack(tx, ty) {
    if (!this.player || this.roomDone || this.paused) return false;
    const now = this.time.now;
    if (!this.player.canAttack(now)) return false;
    const stats = gameState.run.stats;
    const angle = this.aimAngle(tx, ty);
    this.player.facing = angle;
    this.player.lastAttack = now;
    this.player.attackTempo = Math.min(1, this.player.attackTempo + 0.34 * (stats.tempo ? 1.6 : 1));

    const weapon = gameState.weaponDef;
    const hits = buildAttack(weapon, this.player, stats, angle);
    const heavy = weapon.kind !== 'ranged';
    audio.swing(heavy ? (weapon.damage > 30 ? 'heavy' : 'melee') : 'ranged');

    hits.forEach((hit) => {
      if (hit.kind === 'projectile') {
        this.shots.push(new PlayerShot(this, { ...hit, x: this.player.x, y: this.player.y }));
      } else if (hit.kind === 'melee') {
        this.effects.slashArc(hit.x, hit.y, hit.angle, hit.range, hit.arc, hit.color, 180);
        this.resolveMelee(hit);
      } else if (hit.kind === 'shock') {
        this.effects.ring(hit.x, hit.y, hit.radius, hit.color, 300, 5);
        this.resolveArea(hit, hit.radius);
      }
    });
    return true;
  }

  resolveMelee(hit) {
    const stats = gameState.run.stats;
    const targets = [...this.enemies];
    if (this.boss && this.boss.alive) targets.push(this.boss);
    let struck = 0;
    for (const e of targets) {
      if (!e.alive) continue;
      if (coneHits(hit, e.x, e.y, e.radius)) {
        this.applyDamage(e, hit.damage, hit.angle, this.player.combo);
        struck++;
      }
    }
    if (struck > 0) {
      this.player.combo = Math.min(20, this.player.combo + struck);
      this.player.comboUntil = this.time.now + 2000;
      this.effects.shake(0.004, 90);
      if (this.player.combo >= 5) this.hud.showCombo(`${this.player.combo} HIT`);
    }
  }

  resolveArea(hit, radius) {
    const targets = [...this.enemies];
    if (this.boss && this.boss.alive) targets.push(this.boss);
    for (const e of targets) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - hit.x, e.y - hit.y) <= radius + e.radius) {
        this.applyDamage(e, hit.damage, Math.atan2(e.y - hit.y, e.x - hit.x));
        if (hit.stun) e.stunnedUntil = this.time.now + hit.stun;
      }
    }
  }

  applyDamage(entity, rawDamage, angle, combo = 0) {
    const stats = gameState.run.stats;
    const crit = rollCrit(stats, Math.random);
    let dmg = rawDamage;
    if (crit) dmg *= stats.critMult;
    dmg *= 1 + combo * 0.012;

    const knockbackAngle = angle != null ? angle : Math.atan2(entity.y - this.player.y, entity.x - this.player.x);
    let killed = false;
    if (entity === this.boss) {
      const res = this.boss.takeDamage(dmg, this.time.now);
      killed = res.killed;
    } else {
      const res = entity.takeDamage(dmg, this.time.now, { knockback: knockbackAngle, knockbackForce: 60 });
      killed = res.killed;
    }

    this.effects.damageNumber(entity.x, entity.y - entity.radius, dmg, { crit });
    this.effects.spark(entity.x, entity.y, crit ? C.gold : C.white, crit ? 12 : 6, crit ? 260 : 160);
    if (crit) audio.crit(); else audio.hit();

    if (killed) {
      this.onKill(entity);
    }
    return dmg;
  }

  onKill(entity) {
    const wasBoss = entity === this.boss;
    const x = entity.x; const y = entity.y;
    this.effects.spark(x, y, entity.color || C.purple, wasBoss ? 40 : 14, wasBoss ? 420 : 220);
    this.effects.ring(x, y, wasBoss ? 200 : 60, entity.color || C.purple, wasBoss ? 700 : 320);
    audio.kill();

    if (wasBoss) {
      this.onBossDefeated();
      return;
    }
    const stats = gameState.run.stats;
    gameState.run.kills++;
    gameState.profile.totalKills = (gameState.profile.totalKills || 0) + 1;
    gameState.run.shardsEarned += 3 + gameState.run.realm;
    if (stats.lifesteal) this.player.heal(stats.lifesteal);
    entity.destroy();
    this.enemies = this.enemies.filter((e) => e !== entity);
    if (!this.enemies.length && !this.boss) this.completeRoom();
    else if (!this.enemies.length && this.boss) {
      // Add-phase enemies cleared; boss continues.
    }
  }

  onBossDefeated() {
    const boss = this.boss;
    this.effects.flash(C.white, 0.5, 400);
    this.cameras.main.shake(700, 0.014);
    audio.victory();
    const def = boss.def;
    const defeatLine = makeText(this, W / 2, H / 2, `"${def.defeat}"`, {
      size: 20, color: def.accent, origin: 0.5, wrap: 800, align: 'center',
    });
    boss.destroy();
    this.boss = null;
    this.roomDone = true;
    // Wall-clock timer (not scene time) so this cannot stall if the scene is
    // paused during the death animation.
    this.later(() => {
      defeatLine.destroy();
      this.finishRealm();
    }, 1600);
  }

  // ---------------------------------------------------------------- enemy → player
  damagePlayer(amount, source) {
    if (!this.player || !this.player.alive) return;
    const now = this.time.now;
    const dealt = this.player.hurt(amount, now);
    if (dealt <= 0) return;
    this.effects.damageNumber(this.player.x, this.player.y - 24, dealt, { color: C.red });
    this.effects.shake(0.009, 200);
    this.effects.flash(C.red, 0.22, 160);
    audio.hurt();
    if (!this.player.alive) this.onPlayerDeath();
  }

  freezePlayer(ms) {
    if (this.player) this.player.frozenUntil = this.time.now + ms;
  }

  pullPlayer(x, y, force, ms) {
    this.pullEffect = { x, y, force, until: this.time.now + ms };
    this.effects.ring(x, y, force * 0.8, 0x9c6cff, ms, 3);
  }

  // ---------------------------------------------------------------- helpers for bosses
  spawnEnemyShot(x, y, angle, damage, color, opts) {
    this.enemyShots.push(new EnemyShot(this, x, y, angle, damage, color, opts));
  }

  spawnEnemyShotBurst(x, y, count, damage, color, offset = 0) {
    for (let i = 0; i < count; i++) {
      this.spawnEnemyShot(x, y, offset + (i / count) * Math.PI * 2, damage, color, { speed: 210 });
    }
  }

  detonate(x, y, damage, radius, color) {
    this.effects.ring(x, y, radius, color, 340, 6);
    this.effects.shake(0.008, 180);
    this.effects.spark(x, y, color, 18, 300);
    if (Math.hypot(this.player.x - x, this.player.y - y) < radius) this.damagePlayer(damage);
    // also hurts other enemies
    for (const e of [...this.enemies]) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - x, e.y - y) < radius) this.applyDamage(e, damage * 0.5, Math.atan2(e.y - y, e.x - x));
    }
  }

  shockwave(x, y, damage, radius) {
    this.effects.ring(x, y, radius, C.gold, 380, 5);
    this.effects.shake(0.007, 160);
    if (Math.hypot(this.player.x - x, this.player.y - y) < radius) this.damagePlayer(damage);
  }

  blink(x, y, color) {
    this.effects.ring(x, y, 42, color, 240, 3);
  }

  addHazard(def) {
    const h = new Hazard(this, def);
    this.hazards.push(h);
    return h;
  }

  addHazardSafe(def) { return this.addHazard(def); }

  summonAdd(x, y) {
    const idx = (gameState.run.realm * 3 + this.roomIndex) % 10;
    const arch = enemyArchetype(idx, gameState.content);
    const e = new Enemy(this, x, y, arch, {
      tier: gameState.run.realm,
      hp: arch.hp * (1 + gameState.run.realm * 0.3),
      damage: arch.damage,
      speed: 66 + gameState.run.realm * 6,
    });
    this.effects.ring(x, y, 44, arch.color, 300, 3);
    this.enemies.push(e);
  }

  spawnShadowClone(x, y, boss) {
    const fake = this.add.circle(x, y, 28, 0x1a1226, 0.85).setStrokeStyle(3, 0x9c6cff, 0.9).setDepth(27);
    this.effects.ring(x, y, 50, 0x9c6cff, 340, 3);
    const attack = this.time.delayedCall(600, () => {
      if (!fake.active) return;
      const a = Math.atan2(this.player.y - y, this.player.x - x);
      for (let k = -1; k <= 1; k++) {
        this.spawnEnemyShot(x, y, a + k * 0.22, boss.damage * 0.5, 0x9c6cff, { speed: 300 });
      }
    });
    return {
      destroy: () => { attack.remove(); fake.destroy(); },
      active: true,
    };
  }

  schedule(delay, fn) {
    const t = this.time.delayedCall(delay, () => {
      this.scheduled = this.scheduled.filter((x) => x !== t);
      if (!this.roomDone) fn();
    });
    this.scheduled.push(t);
    return t;
  }

  hitEnemy(e, damage, angle) { this.applyDamage(e, damage, angle, this.player.combo); }

  hitEnemyOrBoss(e, damage, angle) {
    if (e === this.boss) this.applyDamage(this.boss, damage, angle, this.player.combo);
    else this.applyDamage(e, damage, angle, this.player.combo);
  }

  hitBoss(b, damage, angle) { this.applyDamage(b, damage, angle, this.player.combo); }

  interact() {
    if (this.roomType === 'Treasure' && this.chest && !this.roomDone) {
      if (Math.hypot(this.player.x - this.chest.x, this.player.y - this.chest.y) < 90) this.openTreasure();
    }
  }

  openTreasure() {
    if (this.roomDone) return;
    this.roomDone = true;
    audio.boon();
    this.effects.spark(this.chest.x, this.chest.y, C.gold, 26, 320);
    this.chest.destroy(); this.chest = null;
    this.showReward(true);
  }

  // ---------------------------------------------------------------- flow
  completeRoom() {
    if (this.roomDone) return;
    this.roomDone = true;
    gameState.run.roomsCleared++;
    if (!this.enemies.length && !this.boss && this.roomType !== 'Boss') {
      this.later(() => this.showReward(false), 420);
    }
  }

  showReward(fromChest) {
    const stats = gameState.run.stats;
    let choices;
    try {
      choices = rollBoonChoices(
        gameState.content,
        gameState.run.boons,
        fromChest ? 3 : 3,
        // Pass a bound closure: gameState.rand() uses `this`, so handing over the
        // bare method reference would run it with an undefined receiver.
        () => gameState.rand(),
      );
    } catch (e) {
      // A reward screen must never trap the player: fall back to Math.random,
      // then to a guaranteed heal, so the run can always continue.
      console.warn('[VEILBORN] boon roll failed, falling back', e);
      try {
        choices = rollBoonChoices(gameState.content, gameState.run.boons, 3, Math.random);
      } catch {
        choices = [];
      }
    }
    const overlay = this.add.container(0, 0).setDepth(200);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x08070d, 0.86);
    overlay.add(dim);
    const title = makeText(this, W / 2, 90, fromChest ? 'THE VAULT OPENS' : 'MEMORY SURVIVES', { size: 40, color: C.text, origin: 0.5 });
    const sub = makeText(this, W / 2, 138, 'Choose one echo to carry deeper.', { size: 18, color: C.muted, origin: 0.5 });
    overlay.add([title, sub]);

    const shardGain = 4 + gameState.run.realm * 2;
    gameState.run.shardsEarned += shardGain;
    const shardNote = makeText(this, W / 2, 620, `+${shardGain} shards gathered — they persist after death.`, { size: 15, color: C.gold, origin: 0.5 });
    overlay.add(shardNote);

    choices.forEach((boon, i) => {
      const x = 180 + i * 320;
      const y = 210;
      const col = rarityColor(boon.rarity);
      const card = panel(this, x, y, 280, 300, { fill: C.panel, stroke: col, strokeAlpha: 0.9 });
      const name = makeText(this, x + 140, y + 44, boon.name, { size: 22, color: col, origin: 0.5, wrap: 250, align: 'center' });
      const rar = makeText(this, x + 140, y + 84, boon.rarity.toUpperCase(), { size: 13, color: C.muted, origin: 0.5 });
      const desc = makeText(this, x + 140, y + 150, boon.desc, { size: 16, color: C.text, origin: 0.5, wrap: 240, align: 'center' });
      overlay.add([card, name, rar, desc]);
      const btn = new Button(this, x + 40, y + 236, 200, 46, 'TAKE', () => {
        this.takeBoon(boon, overlay);
      }, { fill: 0x241f34, hover: 0x342c4a, stroke: col, size: 16 });
      overlay.add([btn.rect, btn.label, btn.subLabel].filter(Boolean));
    });

    const skip = new Button(this, W / 2 - 90, 650, 180, 40, 'SKIP (HEAL 15)', () => {
      this.player.heal(15);
      this.closeReward(overlay);
    }, { fill: 0x1c1828, hover: 0x2a2438, size: 14 });
    overlay.add([skip.rect, skip.label].filter(Boolean));

    if (!choices.length) {
      // Guarantee the overlay is always dismissible.
      overlay.add(makeText(this, W / 2, 380, 'The echoes are silent. Take the shards and descend.', {
        size: 17, color: C.muted, origin: 0.5,
      }));
    }

    this.rewardOverlay = overlay;
    this.paused = true;
    this.touch.setVisible(false);
    audio.playMusic('hub');
  }

  takeBoon(boon, overlay) {
    audio.boon();
    gameState.run.boons.push(boon.id);
    if (boon.apply) boon.apply(gameState.run.stats);
    const stats = gameState.run.stats;
    stats.hp = Math.min(stats.hp, stats.maxHp);
    gameState.run.memoriesFound++;
    this.closeReward(overlay);
    this.effects.flash(C.gold, 0.28, 260);
    this.hud.setHint(`${boon.name} — ${boon.desc}`);
  }

  closeReward(overlay) {
    overlay.destroy(true);
    this.rewardOverlay = null;
    this.paused = false;
    this.touch.setVisible(true);
    this.advance();
  }

  advance() {
    const run = gameState.run;
    const lastIndex = (gameState.roomCount || 5) - 1;
    if (this.roomIndex >= lastIndex) {
      this.finishRealm();
      return;
    }
    run.room++;
    this.scene.restart({ mode: 'room' });
  }

  finishRealm() {
    const run = gameState.run;
    const isFinal = run.realm >= REALMS.length - 1;
    if (isFinal) {
      this.openEnding();
      return;
    }
    const realm = REALMS[run.realm];
    const overlay = this.add.container(0, 0).setDepth(200);
    overlay.add(this.add.rectangle(W / 2, H / 2, W, H, 0x08070d, 0.9));
    overlay.add(makeText(this, W / 2, 130, 'MEMORY RESTORED', { size: 44, color: C.text, origin: 0.5 }));
    overlay.add(makeText(this, W / 2, 196, `${realm.boss} falls. A fragment of Cael returns.`, { size: 19, color: C.cyan, origin: 0.5 }));
    const next = REALMS[run.realm + 1];
    overlay.add(makeText(this, W / 2, 270, `Next: ${next.name}`, { size: 26, color: next.accent, origin: 0.5 }));
    overlay.add(makeText(this, W / 2, 318, next.intro, { size: 17, color: C.muted, origin: 0.5, wrap: 780, align: 'center' }));

    const stats = gameState.run.stats;
    stats.hp = Math.min(stats.maxHp, stats.hp + Math.round(stats.maxHp * 0.3));
    overlay.add(makeText(this, W / 2, 380, `Recovered ${Math.round(stats.maxHp * 0.3)} health.`, { size: 16, color: C.green, origin: 0.5 }));

    const btn = new Button(this, W / 2 - 170, 470, 340, 58, `DESCEND INTO ${next.name.toUpperCase()}`, () => {
      overlay.destroy(true);
      gameState.enterRealm(run.realm + 1);
      gameState.run.room = 0;
      this.paused = false;
      this.touch.setVisible(true);
      this.scene.restart({ mode: 'room' });
    }, { fill: 0x241f34, hover: 0x342c4a, stroke: next.accent });
    overlay.add([btn.rect, btn.label].filter(Boolean));

    gameState.profile.bestRealm = Math.max(gameState.profile.bestRealm || 0, run.realm);
    gameState.persistProfile();
    this.paused = true;
    this.touch.setVisible(false);
    audio.playMusic('hub');
  }

  openEnding() {
    this.paused = true;
    this.touch.setVisible(false);
    const run = gameState.run;
    run.shardsEarned += 50;
    gameState.profile.shards = (gameState.profile.shards || 0) + run.shardsEarned;
    gameState.profile.totalKills = (gameState.profile.totalKills || 0) + run.kills;
    gameState.persistProfile();
    audio.stopMusic();
    audio.playMusic('hub');

    // The Hollow asks one last question. This choice is what actually decides
    // which of the four endings the run earns.
    const o = this.add.container(0, 0).setDepth(220);
    o.add(this.add.rectangle(W / 2, H / 2, W, H, 0x08070d, 0.94));
    o.add(makeText(this, W / 2, 130, 'THE THRONE THAT WAITS', { size: 38, color: C.text, origin: 0.5 }));
    o.add(makeText(this, W / 2, 196, 'The Hollow: "You were never meant to forget me."', {
      size: 21, color: C.purple, origin: 0.5, wrap: 900, align: 'center',
    }));
    o.add(makeText(this, W / 2, 240, 'Cael: "Then I will remember — and choose what remains."', {
      size: 19, color: C.gold, origin: 0.5, wrap: 900, align: 'center',
    }));
    o.add(makeText(this, W / 2, 300, 'What do you carry back up out of the Veil?', {
      size: 17, color: C.muted, origin: 0.5,
    }));

    const remember = new Button(this, W / 2 - 360, 360, 340, 130, 'REMEMBER', () => {
      run.remembered = (run.remembered || 0) + 1;
      this.resolveEnding(run, o);
    }, { fill: 0x241d33, hover: 0x3a2c4c, stroke: C.gold, size: 24, sub: 'Keep every name, every grief,\nevery thing the Veil held.' });
    const release = new Button(this, W / 2 + 20, 360, 340, 130, 'RELEASE', () => {
      run.released = (run.released || 0) + 1;
      this.resolveEnding(run, o);
    }, { fill: 0x1a2030, hover: 0x2a3448, stroke: C.cyan, size: 24, sub: 'Let the forgotten rest.\nChoose what the Veil keeps.' });
    o.add([remember.rect, remember.label, remember.subLabel].filter(Boolean));
    o.add([release.rect, release.label, release.subLabel].filter(Boolean));

    o.add(makeText(this, W / 2, 540, `Memories recovered: ${run.memoriesFound || 0}  •  Kills: ${run.kills}  •  Mercy shown: ${run.mercyCount || 0}`, {
      size: 15, color: C.muted, origin: 0.5,
    }));
    this.endingChoice = o;
  }

  resolveEnding(run, overlay) {
    overlay.destroy(true);
    this.endingChoice = null;
    transitionTo(this, 'Ending', { run, profile: gameState.profile }, 500);
  }

  showSpiritChoice() {
    if (this.roomDone || this.spiritChoiceOpen) return;
    this.spiritChoiceOpen = true;
    this.paused = true;
    this.touch.setVisible(false);
    const run = gameState.run;

    const o = this.add.container(0, 0).setDepth(215);
    o.add(this.add.rectangle(W / 2, H / 2, W, H, 0x08070d, 0.9));
    o.add(makeText(this, W / 2, 150, 'A BOUND MEMORY', { size: 32, color: C.text, origin: 0.5 }));
    o.add(makeText(this, W / 2, 210, 'It has been waiting here a long time. It does not ask for anything.', {
      size: 17, color: C.muted, origin: 0.5, wrap: 860, align: 'center',
    }));

    const free = new Button(this, W / 2 - 340, 280, 320, 110, 'FREE IT', () => {
      run.mercyCount = (run.mercyCount || 0) + 1;
      run.remembered = (run.remembered || 0) + 1;
      run.memoriesFound = (run.memoriesFound || 0) + 1;
      this.effects.flash(C.gold, 0.2, 300);
      audio.boon();
      this.closeSpiritChoice(o, '+1 MERCY — the memory walks free');
    }, { fill: 0x241d33, hover: 0x3a2c4c, stroke: C.gold, size: 20, sub: 'Mercy. Counts toward the True Ending.' });

    const absorb = new Button(this, W / 2 + 20, 280, 320, 110, 'ABSORB IT', () => {
      const gain = 14 + run.realm * 5;
      run.shardsEarned += gain;
      run.released = (run.released || 0) + 1;
      run.memoriesFound = (run.memoriesFound || 0) + 1;
      gameState.run.stats.damageMult += 0.04;
      audio.pickup();
      this.closeSpiritChoice(o, `+${gain} SHARDS — and a little more power`);
    }, { fill: 0x2c1a20, hover: 0x3c2229, stroke: C.purple, size: 20, sub: 'Shards now, and +4% damage this run.' });

    o.add([free.rect, free.label, free.subLabel].filter(Boolean));
    o.add([absorb.rect, absorb.label, absorb.subLabel].filter(Boolean));
    this.spiritChoice = o;
  }

  closeSpiritChoice(overlay, message) {
    overlay.destroy(true);
    this.spiritChoice = null;
    this.spiritChoiceOpen = false;
    this.roomDone = true;
    this.paused = false;
    this.touch.setVisible(true);
    if (this.freedSpirit) { this.freedSpirit.destroy(); this.freedSpirit = null; }
    if (this.memoryLine) { this.memoryLine.destroy(); this.memoryLine = null; }
    if (this.prompt) { this.prompt.destroy(); this.prompt = null; }
    this.hud.setHint(message);
    audio.playMusic('hub');
    this.later(() => this.showReward(false), 500);
  }

  onPlayerDeath() {
    this.roomDone = true;
    this.paused = true;
    audio.stopMusic();
    audio.death();
    const run = gameState.run;
    gameState.profile.shards = (gameState.profile.shards || 0) + run.shardsEarned;
    gameState.persistProfile();
    // Wall-clock timer: the scene is paused here, so scene time would not tick.
    this.later(() => {
      transitionTo(this, 'Death', {
        run,
        profile: gameState.profile,
        realm: run.realm,
        room: this.roomIndex,
      }, 400);
    }, 900);
  }

  // ---------------------------------------------------------------- pause
  togglePause() {
    if (this.rewardOverlay) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.pauseOverlay = this.buildPauseOverlay();
      this.touch.setVisible(false);
    } else if (this.pauseOverlay) {
      this.pauseOverlay.destroy(true);
      this.pauseOverlay = null;
      this.touch.setVisible(true);
    }
  }

  buildPauseOverlay() {
    const o = this.add.container(0, 0).setDepth(210);
    o.add(this.add.rectangle(W / 2, H / 2, W, H, 0x08070d, 0.88));
    o.add(makeText(this, W / 2, 150, 'PAUSED', { size: 46, color: C.text, origin: 0.5 }));
    const info = makeText(this, W / 2, 210, `${this.realm.name} • Room ${this.roomIndex + 1} • ${ROOM_LABELS[this.roomType]}`, { size: 17, color: C.muted, origin: 0.5 });
    o.add(info);
    const boons = gameState.run.boons.length
      ? gameState.run.boons.map((b) => b.replace(/_/g, ' ')).join(', ')
      : 'none yet';
    o.add(makeText(this, W / 2, 250, `Boons: ${boons}`, { size: 15, color: C.purple, origin: 0.5, wrap: 900, align: 'center' }));
    o.add(makeText(this, W / 2, 290, `Weapon: ${gameState.weaponDef.name} • Kills: ${gameState.run.kills} • Shards: ${gameState.run.shardsEarned}`, { size: 15, color: C.gold, origin: 0.5 }));

    const resume = new Button(this, W / 2 - 150, 350, 300, 52, 'RESUME', () => this.togglePause(), { fill: 0x241f34, hover: 0x342c4a });
    const opts = new Button(this, W / 2 - 150, 414, 300, 52, 'SOUND & VIDEO', () => {
      this.scene.pause();
      this.scene.launch('Options', { from: 'Game' });
    }, { fill: 0x241f34, hover: 0x342c4a });
    const quit = new Button(this, W / 2 - 150, 478, 300, 52, 'ABANDON RUN', () => {
      const run = gameState.run;
      gameState.profile.shards = (gameState.profile.shards || 0) + run.shardsEarned;
      gameState.persistProfile();
      audio.stopMusic();
      transitionTo(this, 'Hub', {}, 300);
    }, { fill: 0x2c1a20, hover: 0x3c2229, stroke: C.red });
    [resume, opts, quit].forEach((b) => o.add([b.rect, b.label].filter(Boolean)));
    o.add(makeText(this, W / 2, 560, 'ESC to resume • WASD move • SPACE dash • Click attack • Right-click special', { size: 14, color: C.muted, origin: 0.5 }));
    return o;
  }

  // ---------------------------------------------------------------- loop
  update(time, delta) {
    if (this.paused || !this.player) return;
    const stats = gameState.run.stats;
    const now = time;
    const ctx = this.buildCtx(now);
    const dt = Math.min(delta, 50);

    // --- player input ---
    let dx = 0; let dy = 0;
    const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) dx--;
    if (k.D.isDown || k.RIGHT.isDown) dx++;
    if (k.W.isDown || k.UP.isDown) dy--;
    if (k.S.isDown || k.DOWN.isDown) dy++;
    if (this.touch && this.touch.enabled) {
      dx += this.touch.move.x;
      dy += this.touch.move.y;
      if (this.touch.consumeDash()) this.tryDash();
      if (this.touch.consumeSpecial()) this.trySpecial();
      if (this.touch.attackHeld) this.autoAimAttack();
    }

    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      const frozen = now < (this.player.frozenUntil || 0);
      const speed = this.player.moveSpeed() * (frozen ? 0.35 : 1);
      this.player.x += (dx / len) * speed * dt / 1000;
      this.player.y += (dy / len) * speed * dt / 1000;
      this.player.facing = Math.atan2(dy / len, dx / len);
    }
    // Pull effect (void pull)
    if (this.pullEffect && now < this.pullEffect.until) {
      const p = this.pullEffect;
      const ddx = p.x - this.player.x;
      const ddy = p.y - this.player.y;
      const d = Math.hypot(ddx, ddy) || 1;
      this.player.x += (ddx / d) * Math.min(p.force, d) * dt / 1000 * 0.9;
      this.player.y += (ddy / d) * Math.min(p.force, d) * dt / 1000 * 0.9;
    }
    this.player.clampToArena();
    this.player.updateVisual(now);

    // --- energy regen ---
    stats.energy = Math.min(stats.maxEnergy, stats.energy + (KNIGHT.energyRegen * stats.energyRegenMult) * dt / 1000);
    // aim with mouse on desktop for the facing indicator
    if (!this.touch.enabled) {
      const p = this.input.activePointer;
      if (p && p.worldX != null) {
        const d = Math.hypot(p.worldX - this.player.x, p.worldY - this.player.y);
        if (d > 6) this.player.facing = Math.atan2(p.worldY - this.player.y, p.worldX - this.player.x);
      }
    }
    gameState.run.elapsed += dt;

    // --- cooldowns / combo decay ---
    if (now > this.player.comboUntil) this.player.combo = Math.max(0, this.player.combo - 1);
    this.player.attackTempo = Math.max(0, this.player.attackTempo - dt / 1000 * 0.5);

    // --- entities ---
    this.enemies.forEach((e) => e.update(dt, now, ctx));
    this.enemies = this.enemies.filter((e) => {
      if (e.alive) return true;
      if (e.deathTimer === 0) { e.deathTimer = 1; this.onKill(e); return false; }
      return false;
    });
    if (this.boss) this.boss.update(dt, now, ctx);
    this.enemyShots.forEach((s) => s.update(dt, now, ctx));
    this.enemyShots = this.enemyShots.filter((s) => { if (!s.alive) { s.destroy(); return false; } return true; });
    this.shots.forEach((s) => s.update(dt, ctx));
    this.shots = this.shots.filter((s) => { if (!s.alive) { s.destroy(); return false; } return true; });
    this.orbits.forEach((o) => o.update(dt, ctx, now));
    this.orbits = this.orbits.filter((o) => { if (!o.alive) { o.destroy(); return false; } return true; });

    this.hazards.forEach((h) => {
      if (!h.alive) return;
      h.update(dt, ctx, now);
      h.hurtEnemiesAt(now, ctx, this.enemies, this.boss);
    });
    this.hazards = this.hazards.filter((h) => h.alive);

    // --- room objectives ---
    this.checkRoomProgress(now);
    this.updateHud();
    this.player.comboUntil = Math.max(this.player.comboUntil, this.player.combo > 0 ? now + 2000 : 0);
    this.renderTempo(stats);
  }

  // The scene itself doubles as the ctx object for special-move construction,
  // so expose the clock the same way buildCtx() does.
  now() { return this.time.now; }

  buildCtx(now) {
    return {
      player: this.player,
      enemies: this.enemies,
      boss: this.boss,
      effects: this.effects,
      now: () => now,
      spawnEnemyShot: this.spawnEnemyShot.bind(this),
      spawnEnemyShotBurst: this.spawnEnemyShotBurst.bind(this),
      detonate: this.detonate.bind(this),
      shockwave: this.shockwave.bind(this),
      blink: this.blink.bind(this),
      addHazard: this.addHazardSafe.bind(this),
      summonAdd: this.summonAdd.bind(this),
      spawnShadowClone: this.spawnShadowClone.bind(this),
      pullPlayer: this.pullPlayer.bind(this),
      freezePlayer: this.freezePlayer.bind(this),
      damagePlayer: this.damagePlayer.bind(this),
      schedule: this.schedule.bind(this),
      hitEnemy: (e, d, a) => this.applyDamage(e, d, a, this.player.combo),
      hitBoss: (b, d, a) => this.applyDamage(b, d, a, this.player.combo),
      hitEnemyOrBoss: (e, d, a) => this.applyDamage(e, d, a, this.player.combo),
    };
  }

  checkRoomProgress(now) {
    if (this.roomDone) return;
    if (this.roomType === 'Treasure' && this.chest) {
      if (Math.hypot(this.player.x - this.chest.x, this.player.y - this.chest.y) < 80) this.openTreasure();
      return;
    }
    if (this.roomType === 'Rest' && this.healPool) {
      if (Math.hypot(this.player.x - this.healPool.x, this.player.y - this.healPool.y) < 70) {
        this.roomDone = true;
        const stats = gameState.run.stats;
        stats.hp = Math.min(stats.maxHp, stats.hp + stats.maxHp * 0.45);
        this.effects.floatText(this.player.x, this.player.y - 30, `+${Math.round(stats.maxHp * 0.45)} HP`, C.green);
        audio.pickup();
        this.later(() => this.showReward(false), 500);
      }
      return;
    }
    if (this.roomType === 'Event' && this.freedSpirit) {
      if (Math.hypot(this.player.x - this.freedSpirit.x, this.player.y - this.freedSpirit.y) < 70) {
        this.showSpiritChoice();
      }
      return;
    }
    if (this.enemies.length === 0 && !this.boss && this.roomType !== 'Boss') {
      this.completeRoom();
    }
  }

  renderTempo(stats) {
    // subtle indicator when Grave Tempo is active
    if (!stats.tempo) return;
    const ratio = Math.min(1, this.player.attackTempo);
    if (!this.tempoBar) {
      this.tempoBar = this.add.graphics().setDepth(79);
    }
    this.tempoBar.clear();
    this.tempoBar.fillStyle(0x9c6cff, 0.85);
    this.tempoBar.fillRect(24, H - 100, 120 * ratio, 5);
  }

  updateHud() {
    const total = gameState.roomCount || 5;
    this.hud.update(gameState.run, this.player, this.realm, `${ROOM_LABELS[this.roomType]} ${this.roomIndex + 1}/${total}`);
  }

  // ---------------------------------------------------------------- actions
  tryDash() {
    if (!this.player || this.paused || this.roomDone) return;
    const now = this.time.now;
    const stats = gameState.run.stats;
    // dash toward movement input if any, else toward facing
    let ang = this.player.facing;
    let dx = 0; let dy = 0;
    const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) dx--;
    if (k.D.isDown || k.RIGHT.isDown) dx++;
    if (k.W.isDown || k.UP.isDown) dy--;
    if (k.S.isDown || k.DOWN.isDown) dy++;
    if (this.touch && this.touch.enabled) { dx += this.touch.move.x; dy += this.touch.move.y; }
    if (dx || dy) ang = Math.atan2(dy, dx);

    if (!this.player.dash(now, ang)) return;
    this.effects.ring(this.player.x, this.player.y, 46, this.player.weapon.color, 260, 3);
    if (stats.dashBurn) {
      this.resolveArea({ x: this.player.x, y: this.player.y, damage: stats.dashBurn }, 90);
    }
    if (stats.dashRift) {
      this.addHazard({
        x: this.player.x, y: this.player.y, radius: 90, damage: 0,
        color: 0x9c6cff, slow: 1, until: now + 2600, pull: 0,
      });
      this.enemies.forEach((e) => {
        if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < 90) e.slowUntil = now + 1600;
      });
    }
  }

  trySpecial(tx, ty) {
    if (!this.player || this.paused || this.roomDone) return;
    const now = this.time.now;
    const stats = gameState.run.stats;
    const weapon = gameState.weaponDef;
    const cost = Math.round(weapon.specialCost * stats.specialDiscount);
    if (stats.energy < cost) {
      this.hud.setHint('Not enough energy for the special.');
      audio.ui();
      return;
    }
    let angle = this.player.facing;
    if (tx != null) angle = this.aimAngle(tx, ty);
    else if (this.touch && this.touch.enabled) {
      // aim at nearest enemy on touch
      const target = this.nearestEnemy();
      if (target) angle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    }
    stats.energy -= cost;
    audio.special();
    this.effects.flash(weapon.color, 0.22, 220);
    this.effects.shake(0.008, 200);

    const spec = buildSpecial(weapon, this.player, stats, angle, this);
    spec.hits.forEach((hit) => {
      if (hit.kind === 'projectile') {
        this.shots.push(new PlayerShot(this, { ...hit, x: this.player.x, y: this.player.y }));
      } else if (hit.kind === 'melee') {
        this.effects.slashArc(hit.x, hit.y, hit.angle, hit.range, hit.arc, hit.color, 220);
        this.resolveMelee(hit);
      } else if (hit.kind === 'nova' || hit.kind === 'shock') {
        this.effects.ring(hit.x, hit.y, hit.radius, hit.color, 380, 6);
        this.resolveArea(hit, hit.radius);
      } else if (hit.kind === 'vortex') {
        this.effects.ring(hit.x, hit.y, hit.radius, hit.color, 420, 5);
        this.addHazard({
          x: hit.x, y: hit.y, radius: hit.radius, damage: hit.damage * 0.3,
          color: hit.color, pull: hit.pull, until: hit.until,
        });
      } else if (hit.kind === 'orbit') {
        this.orbits.push(new Orbit(this, { ...hit, until: hit.until }));
      }
    });
    if (spec.dash) {
      this.player.dash(now, spec.dash.angle);
      this.player.x += Math.cos(spec.dash.angle) * spec.dash.distance;
      this.player.y += Math.sin(spec.dash.angle) * spec.dash.distance;
      this.player.clampToArena();
    }
  }

  autoAimAttack() {
    if (!this.player || this.paused || this.roomDone) return;
    const target = this.nearestEnemy();
    if (target) {
      this.player.facing = Math.atan2(target.y - this.player.y, target.x - this.player.x);
      this.tryAttack(target.x, target.y);
    } else {
      this.tryAttack();
    }
  }

  nearestEnemy() {
    let best = null; let bestD = Infinity;
    const list = [...this.enemies];
    if (this.boss && this.boss.alive) list.push(this.boss);
    for (const e of list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
}
