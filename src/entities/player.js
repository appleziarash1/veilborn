// Player character: Cael Varen. Pure movement + attack logic; the scene owns
// collision resolution and tells the player when it is safe to act.
import { KNIGHT, ARENA } from '../config.js';
import { audio } from '../audio.js';
import { playerPath } from '../art.js';

export class Player {
  constructor(scene, x, y, run, weapon) {
    this.scene = scene;
    this.run = run;
    this.weapon = weapon;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 0;
    this.radius = 16;
    this.speed = KNIGHT.baseSpeed;
    this.invulnUntil = 0;
    this.dashUntil = 0;
    this.lastDash = -9999;
    this.lastAttack = -9999;
    this.attackTempo = 0;
    this.combo = 0;
    this.comboUntil = 0;
    this.alive = true;

    this.body = scene.add.container(x, y).setDepth(30);
    this.aura = scene.add.circle(0, 0, 26, weapon.color, 0.14).setDepth(-1);
    this.shadow = scene.add.ellipse(0, 12, 30, 12, 0x000000, 0.35).setDepth(-1);
    // Art, when present, replaces the primitive core. `radius` still governs
    // collision, so a sprite swap cannot change how the game plays.
    const art = playerPath('idle');
    if (art && scene.textures.exists(art)) {
      this.sprite = scene.add.image(0, 0, art);
      this.sprite.setDisplaySize(this.radius * 3.4, this.radius * 3.4);
      this.core = this.sprite;
    } else {
      this.core = scene.add.circle(0, 0, this.radius, 0xf4d8c2).setStrokeStyle(3, weapon.color);
    }
    this.weaponMark = scene.add.rectangle(0, 0, 26, 4, weapon.color).setOrigin(0, 0.5);
    this.body.add([this.aura, this.shadow, this.core, this.weaponMark]);
  }

  get stats() { return this.run.stats; }

  get hp() { return this.stats.hp; }
  set hp(v) { this.stats.hp = v; }

  attackCooldown() {
    return this.weapon.cooldown * this.stats.cooldownMult;
  }

  range() {
    return this.weapon.range * this.stats.rangeMult;
  }

  moveSpeed() {
    return KNIGHT.baseSpeed * this.stats.speedMult;
  }

  canDash(now) {
    return now - this.lastDash >= KNIGHT.dashCooldown;
  }

  canAttack(now) {
    return now - this.lastAttack >= this.attackCooldown();
  }

  dash(now, angle) {
    if (!this.canDash(now)) return false;
    this.lastDash = now;
    this.dashUntil = now + KNIGHT.dashInvuln;
    this.invulnUntil = Math.max(this.invulnUntil, now + KNIGHT.dashInvuln);
    this.x += Math.cos(angle) * KNIGHT.dashDistance;
    this.y += Math.sin(angle) * KNIGHT.dashDistance;
    this.clampToArena();
    audio.dash();
    return true;
  }

  hurt(amount, now) {
    if (this.isInvulnerable(now) || !this.alive) return 0;
    this.invulnUntil = now + 320;
    const s = this.stats;
    let remaining = amount;
    if (s.barrier > 0) {
      const absorbed = Math.min(s.barrier, remaining);
      s.barrier -= absorbed;
      remaining -= absorbed;
    }
    s.hp = Math.max(0, s.hp - remaining);
    if (s.hp <= 0) this.alive = false;
    // Report the health actually lost. A hit the barrier ate entirely reads as
    // zero here, so the caller does not flash a full damage number for it.
    return remaining;
  }

  heal(amount) {
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
  }

  isInvulnerable(now) {
    return now < this.invulnUntil;
  }

  clampToArena() {
    const pad = ARENA.x + this.radius + 8;
    const maxX = ARENA.x + ARENA.w - this.radius - 8;
    const minY = ARENA.y + this.radius + 8;
    const maxY = ARENA.y + ARENA.h - this.radius - 8;
    this.x = Math.max(pad, Math.min(maxX, this.x));
    this.y = Math.max(minY, Math.min(maxY, this.y));
  }

  updateVisual(now) {
    this.body.setPosition(this.x, this.y);
    const invuln = this.isInvulnerable(now);
    this.core.setAlpha(invuln ? (Math.floor(now / 60) % 2 ? 0.35 : 1) : 1);
    this.weaponMark.setVisible(!this.sprite);
    this.weaponMark.setPosition(Math.cos(this.facing) * 8, Math.sin(this.facing) * 8);
    this.weaponMark.setRotation(this.facing);
    const dashing = now < this.dashUntil;
    this.aura.setScale(dashing ? 1.6 : 1);
    this.aura.setAlpha(dashing ? 0.3 : 0.14);
    this.aura.setFillStyle(this.weapon.color, dashing ? 0.3 : 0.14);
  }

  destroy() {
    this.body.destroy(true);
  }
}
