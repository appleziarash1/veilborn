// Enemies, enemy projectiles, and elite modifiers.
//
// Behaviour archetypes keep the ten content enemies mechanically distinct
// without needing ten hand-written AI trees.
import { ARENA } from '../config.js';
import { ELITE_MODS } from '../world/rooms.js';
import { enemyPath, elitePath, tintBody } from '../art.js';

export class Enemy {
  constructor(scene, x, y, archetype, opts = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.name = archetype.name;
    this.behaviour = archetype.behaviour;
    this.color = archetype.color;
    this.radius = opts.radius || (16 + Math.random() * 6);
    this.maxHp = Math.round((opts.hp || archetype.hp) * (opts.hpMult || 1));
    this.hp = this.maxHp;
    this.damage = Math.round((opts.damage || archetype.damage) * (opts.dmgMult || 1));
    this.speed = opts.speed || (52 + (opts.tier || 0) * 7);
    this.tier = opts.tier || 0;
    this.elite = opts.elite || null;
    this.shieldHp = this.elite && this.elite.id === 'shielded' ? Math.round(this.maxHp * 0.5) : 0;
    this.maxShield = this.shieldHp;
    this.stunnedUntil = 0;
    this.lastAction = 0;
    this.state = 'idle';
    this.chargeUntil = 0;
    this.chargeDir = 0;
    this.hitFlashUntil = 0;
    this.alive = true;
    this.knockback = { x: 0, y: 0 };
    this.slowUntil = 0;
    this.deathTimer = 0;

    if (this.elite) {
      this.color = this.elite.color;
      this.name = `${this.elite.name} ${this.name}`;
      this.radius += 6;
    }

    this.container = scene.add.container(x, y).setDepth(28);
    this.shadow = scene.add.ellipse(0, this.radius * 0.7, this.radius * 1.7, this.radius * 0.6, 0x000000, 0.3);
    // Art, when present, replaces the primitive body. The radius still governs
    // collision and knockback, so swapping in art cannot change how it plays.
    // Always key off the base archetype: an elite prefixes its own name.
    const art = enemyPath(archetype.name);
    if (art && scene.textures.exists(art)) {
      this.sprite = scene.add.image(0, 0, art);
      this.sprite.setDisplaySize(this.radius * 2.6, this.radius * 2.6);
      this.bodyShape = this.sprite;
    } else {
      this.bodyShape = scene.add.circle(0, 0, this.radius, this.color);
      if (this.elite) this.bodyShape.setStrokeStyle(3, this.elite.color, 1);
    }
    this.eye = scene.add.circle(this.radius * 0.35, -this.radius * 0.2, Math.max(2, this.radius * 0.18), 0xffffff, 0.9);
    if (this.sprite) this.eye.setVisible(false);
    this.container.add([this.shadow, this.bodyShape, this.eye]);

    this.hpBar = null;
    if (this.elite) {
      this.hpBar = scene.add.graphics().setDepth(29);
      this.drawHpBar();
      // Elite aura art frames the archetype sprite. It is a cosmetic overlay, so
      // it never touches the body shape or the collision radius.
      const aura = elitePath(this.elite.id);
      if (aura && scene.textures.exists(aura)) {
        this.aura = scene.add.image(0, 0, aura)
          .setDisplaySize(this.radius * 3.4, this.radius * 3.4)
          .setAlpha(0.85);
        this.container.addAt(this.aura, 1);
      }
    }
    if (this.maxShield > 0) {
      this.shieldRing = scene.add.circle(x, y, this.radius + 5, undefined, 0)
        .setStrokeStyle(3, 0x8fb4ff, 0.75).setDepth(29);
    }
  }

  drawHpBar() {
    if (!this.hpBar) return;
    const w = this.radius * 3;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6);
    this.hpBar.fillRect(this.x - w / 2, this.y - this.radius - 14, w, 5);
    this.hpBar.fillStyle(0xe05a68, 1);
    this.hpBar.fillRect(this.x - w / 2, this.y - this.radius - 14, w * Math.max(0, this.hp / this.maxHp), 5);
    if (this.maxShield > 0) {
      this.hpBar.fillStyle(0x8fb4ff, 1);
      this.hpBar.fillRect(this.x - w / 2, this.y - this.radius - 20, w * Math.max(0, this.shieldHp / this.maxShield), 4);
    }
  }

  takeDamage(amount, now, opts = {}) {
    if (!this.alive) return { killed: false, dead: 0 };
    let remaining = amount;
    if (this.shieldHp > 0) {
      const absorbed = Math.min(this.shieldHp, remaining);
      this.shieldHp -= absorbed;
      remaining -= absorbed;
      if (this.shieldRing) this.shieldRing.setAlpha(this.shieldHp > 0 ? 0.75 : 0);
    }
    this.hp -= remaining;
    this.hitFlashUntil = now + 90;
    tintBody(this.bodyShape, 0xffffff, this.color);
    if (opts.knockback) {
      this.knockback.x += Math.cos(opts.knockback) * (opts.knockbackForce || 90);
      this.knockback.y += Math.sin(opts.knockback) * (opts.knockbackForce || 90);
    }
    if (this.hp <= 0) {
      this.alive = false;
      return { killed: true, dead: amount };
    }
    return { killed: false, dead: amount };
  }

  update(dt, now, ctx) {
    if (!this.alive) return;
    const s = dt / 1000;
    // knockback decay
    this.x += this.knockback.x * s;
    this.y += this.knockback.y * s;
    this.knockback.x *= 0.86;
    this.knockback.y *= 0.86;

    if (now < this.hitFlashUntil) tintBody(this.bodyShape, 0xffffff, this.color);
    else tintBody(this.bodyShape, null, this.color);

    if (now < this.stunnedUntil) {
      this.syncVisual();
      return;
    }

    const player = ctx.player;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);
    const speedMult = now < this.slowUntil ? 0.45 : 1;
    const speed = this.speed * speedMult;

    switch (this.behaviour) {
      case 'chaser':
        this.x += Math.cos(angle) * speed * s;
        this.y += Math.sin(angle) * speed * s;
        break;
      case 'assassin':
        // stalls, then lunges quickly when in range
        if (dist < 260 && now - this.lastAction > 1800) {
          this.lastAction = now;
          this.state = 'lunge';
          this.chargeUntil = now + 300;
          this.chargeDir = angle;
        }
        if (this.state === 'lunge' && now < this.chargeUntil) {
          this.x += Math.cos(this.chargeDir) * speed * 4 * s;
          this.y += Math.sin(this.chargeDir) * speed * 4 * s;
        }
        break;
      case 'charger':
        if (this.state === 'idle' && dist < 340 && now - this.lastAction > 1500) {
          this.state = 'wind';
          this.lastAction = now;
          this.windUntil = now + 600;
          this.chargeDir = angle;
        }
        if (this.state === 'wind') {
          if (now > this.windUntil) { this.state = 'charge'; this.chargeUntil = now + 700; }
        } else if (this.state === 'charge') {
          this.x += Math.cos(this.chargeDir) * speed * 5.2 * s;
          this.y += Math.sin(this.chargeDir) * speed * 5.2 * s;
          if (now > this.chargeUntil) this.state = 'idle';
        }
        break;
      case 'shooter':
        if (dist > 300) { this.x += Math.cos(angle) * speed * s; this.y += Math.sin(angle) * speed * s; }
        else if (dist < 200) { this.x -= Math.cos(angle) * speed * s; this.y -= Math.sin(angle) * speed * s; }
        if (now - this.lastAction > (this.elite ? 1100 : 1700) && dist < 620) {
          this.lastAction = now;
          ctx.spawnEnemyShot(this.x, this.y, angle, this.damage, this.color);
        }
        break;
      case 'drainer':
        if (dist > 120) { this.x += Math.cos(angle) * speed * s; this.y += Math.sin(angle) * speed * s; }
        if (dist < 130 && now - this.lastAction > 1400) {
          this.lastAction = now;
          ctx.spawnEnemyShot(this.x, this.y, angle, this.damage * 0.7, 0x6fd8a6, { homing: true, speed: 190 });
        }
        break;
      case 'exploder':
        if (dist < 90 && now - this.lastAction > 800) {
          this.lastAction = now;
          this.hp = 0; this.alive = false;
          ctx.detonate(this.x, this.y, this.damage * 2.4, this.radius * 4.5, 0xff714a);
        } else {
          this.x += Math.cos(angle) * speed * 1.35 * s;
          this.y += Math.sin(angle) * speed * 1.35 * s;
          if (now - this.lastAction > 1200) tintBody(this.bodyShape, 0xffa06a, this.color);
        }
        break;
      case 'guardian':
        // slow, tanky, periodic stomp shockwave
        this.x += Math.cos(angle) * speed * 0.7 * s;
        this.y += Math.sin(angle) * speed * 0.7 * s;
        if (dist < 150 && now - this.lastAction > 2200) {
          this.lastAction = now;
          ctx.shockwave(this.x, this.y, this.damage, this.radius * 5);
        }
        break;
      case 'teleporter':
        if (now - this.lastAction > 1600) {
          this.lastAction = now;
          const ta = Math.random() * Math.PI * 2;
          const td = 140 + Math.random() * 180;
          this.x = player.x + Math.cos(ta) * td;
          this.y = player.y + Math.sin(ta) * td;
          ctx.blink(this.x, this.y, this.color);
        }
        break;
      default:
        this.x += Math.cos(angle) * speed * s;
        this.y += Math.sin(angle) * speed * s;
    }

    // contact damage
    if (dist < this.radius + player.radius) {
      ctx.damagePlayer(this.damage, this);
    }

    // keep in arena
    this.x = Math.max(ARENA.x + this.radius, Math.min(ARENA.x + ARENA.w - this.radius, this.x));
    this.y = Math.max(ARENA.y + this.radius, Math.min(ARENA.y + ARENA.h - this.radius, this.y));
    this.syncVisual();
  }

  syncVisual() {
    this.container.setPosition(this.x, this.y);
    if (this.hpBar) this.drawHpBar();
    if (this.shieldRing) this.shieldRing.setPosition(this.x, this.y);
  }

  destroy() {
    this.container.destroy(true);
    if (this.hpBar) this.hpBar.destroy();
    if (this.shieldRing) this.shieldRing.destroy();
  }
}

export class EnemyShot {
  constructor(scene, x, y, angle, damage, color, opts = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.damage = damage;
    this.color = color;
    this.speed = opts.speed || 240;
    this.homing = !!opts.homing;
    this.radius = opts.radius || 7;
    this.alive = true;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.age = 0;
    this.life = opts.life || 4000;
    this.shape = scene.add.circle(x, y, this.radius, color, 0.95).setDepth(26);
    this.shape.setStrokeStyle(2, 0xffffff, 0.4);
  }

  update(dt, now, ctx) {
    if (!this.alive) return;
    this.age += dt;
    if (this.age > this.life) { this.alive = false; return; }
    if (this.homing && ctx.player) {
      const a = Math.atan2(ctx.player.y - this.y, ctx.player.x - this.x);
      const cur = Math.atan2(this.vy, this.vx);
      let diff = a - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const na = cur + Math.max(-2.2 * dt / 1000, Math.min(2.2 * dt / 1000, diff));
      this.vx = Math.cos(na) * this.speed;
      this.vy = Math.sin(na) * this.speed;
    }
    this.x += this.vx * dt / 1000;
    this.y += this.vy * dt / 1000;
    this.shape.setPosition(this.x, this.y);
    if (ctx.player && Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y) < this.radius + ctx.player.radius) {
      ctx.damagePlayer(this.damage);
      this.alive = false;
      return;
    }
    if (this.x < ARENA.x - 40 || this.x > ARENA.x + ARENA.w + 40
      || this.y < ARENA.y - 40 || this.y > ARENA.y + ARENA.h + 40) {
      this.alive = false;
    }
  }

  destroy() { this.shape.destroy(); }
}

export { ELITE_MODS };
