// Boss entity. Each boss owns a pattern list; patterns are timed attacks that
// telegraph, fire, and clean themselves up. Phases change behaviour as HP drops.
import { ARENA } from '../config.js';
import { audio } from '../audio.js';
import { bossPath, tintBody } from '../art.js';

export class Boss {
  constructor(scene, def, opts = {}) {
    this.scene = scene;
    this.def = def;
    this.x = opts.x != null ? opts.x : 640;
    this.y = opts.y != null ? opts.y : 320;
    this.radius = 54;
    this.maxHp = Math.round(def.hp * (opts.hpMult || 1));
    this.hp = this.maxHp;
    this.damage = 22 + (opts.tier || 0) * 5;
    this.speed = 62;
    this.phases = def.phases || 2;
    this.phase = 1;
    this.alive = true;
    this.name = def.name;
    this.patternIndex = 0;
    this.nextPatternAt = 0;
    this.charging = false;
    this.chargeUntil = 0;
    this.chargeDir = 0;
    this.telegraphs = [];
    this.introUntil = 0;
    this.hitFlashUntil = 0;
    this.slowUntil = 0;
    this.exposedUntil = 0;

    this.container = scene.add.container(this.x, this.y).setDepth(32);
    this.aura = scene.add.circle(0, 0, this.radius + 22, def.accent, 0.12);
    // Art, when present, replaces the primitive core. The radius still governs
    // collision and pattern ranges, so swapping in art cannot change the fight.
    const art = bossPath(def.id);
    if (art && scene.textures.exists(art)) {
      this.sprite = scene.add.image(0, 0, art);
      this.sprite.setDisplaySize(this.radius * 3.4, this.radius * 3.4);
      this.core = this.sprite;
      this.inner = null;
    } else {
      this.core = scene.add.circle(0, 0, this.radius, def.color);
      this.core.setStrokeStyle(4, def.accent, 0.9);
      this.inner = scene.add.circle(0, 0, this.radius * 0.45, def.accent, 0.75);
    }
    this.container.add(this.inner
      ? [this.aura, this.core, this.inner]
      : [this.aura, this.core]);

    this.hpBarBg = scene.add.graphics().setDepth(33);
    this.hpBar = scene.add.graphics().setDepth(34);
    this.namePlate = scene.add.text(0, 0, '', {}).setDepth(34);
  }

  start(now) {
    this.introUntil = now + 1400;
    this.nextPatternAt = this.introUntil + 500;
    this.drawBars();
  }

  phaseForHp() {
    const ratio = this.hp / this.maxHp;
    if (this.phases <= 1) return 1;
    if (this.phases === 2) return ratio > 0.5 ? 1 : 2;
    if (ratio > 0.66) return 1;
    if (ratio > 0.33) return 2;
    return 3;
  }

  takeDamage(amount, now, opts = {}) {
    if (!this.alive) return { killed: false };
    if (now < this.introUntil) return { killed: false };
    this.hp -= amount;
    this.hitFlashUntil = now + 80;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return { killed: true };
    }
    return { killed: false };
  }

  update(dt, now, ctx) {
    if (!this.alive) return;
    const s = dt / 1000;
    const player = ctx.player;

    if (now < this.hitFlashUntil) tintBody(this.core, 0xffffff, this.def.color);
    else tintBody(this.core, null, this.def.color);

    // Phase transition: brief exposure window + shockwave
    const newPhase = this.phaseForHp();
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.exposedUntil = now + 900;
      audio.bossRoar();
      ctx.effects.ring(this.x, this.y, this.radius * 6, this.def.accent, 520, 6);
      ctx.effects.shake(0.012, 300);
      ctx.shockwave(this.x, this.y, this.damage * 0.6, this.radius * 7);
      this.telegraphs.forEach((t) => t.destroy());
      this.telegraphs = [];
      this.nextPatternAt = now + 700;
    }

    const stunned = now < this.stunnedUntil;
    if (stunned) { this.syncVisual(); this.updateBars(); return; }

    // Track the player between attacks.
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);
    const speed = this.speed * (now < this.slowUntil ? 0.5 : 1);

    if (this.charging && now < this.chargeUntil) {
      this.x += Math.cos(this.chargeDir) * speed * 6 * s;
      this.y += Math.sin(this.chargeDir) * speed * 6 * s;
      if (dist < this.radius + player.radius + 6) ctx.damagePlayer(this.damage * 1.2, this);
    } else {
      this.charging = false;
      if (dist > 190) {
        this.x += Math.cos(angle) * speed * s;
        this.y += Math.sin(angle) * speed * s;
      } else if (dist < 120) {
        this.x -= Math.cos(angle) * speed * s;
        this.y -= Math.sin(angle) * speed * s;
      }
      if (dist < this.radius + player.radius + 4) ctx.damagePlayer(this.damage * 0.8, this);
    }

    this.x = Math.max(ARENA.x + this.radius, Math.min(ARENA.x + ARENA.w - this.radius, this.x));
    this.y = Math.max(ARENA.y + this.radius, Math.min(ARENA.y + ARENA.h - this.radius, this.y));

    // Attack scheduling. Higher phases attack faster.
    const patternCooldown = Math.max(900, 2100 - this.phase * 320);
    if (now >= this.nextPatternAt && !this.charging) {
      const patterns = this.def.patterns;
      const p = patterns[this.patternIndex % patterns.length];
      this.patternIndex++;
      this.runPattern(p, now, ctx, angle, dist);
      const jitter = 0.75 + Math.random() * 0.5;
      this.nextPatternAt = now + patternCooldown * jitter;
    }

    this.telegraphs = this.telegraphs.filter((t) => t.alive !== false);
    this.syncVisual();
    this.updateBars();
  }

  runPattern(pattern, now, ctx, angle, dist) {
    switch (pattern) {
      case 'fan': {
        const count = 5 + this.phase * 2;
        for (let i = 0; i < count; i++) {
          const a = angle - 0.5 + (i / (count - 1)) * 1.0;
          ctx.spawnEnemyShot(this.x, this.y + 10, a, this.damage * 0.55, this.def.accent, { speed: 250 });
        }
        audio.swing('ranged');
        break;
      }
      case 'spiral': {
        const steps = 12;
        const base = angle;
        for (let i = 0; i < steps; i++) {
          const a = base + i * 0.5;
          ctx.spawnEnemyShot(this.x, this.y, a, this.damage * 0.4, this.def.accent, {
            speed: 220, life: 4200, radius: 6,
          });
        }
        audio.swing('heavy');
        break;
      }
      case 'charge': {
        this.charging = true;
        this.chargeDir = angle;
        this.chargeUntil = now + 620;
        ctx.effects.ring(this.x, this.y, this.radius * 3, this.def.accent, 300, 4);
        audio.swing('heavy');
        break;
      }
      case 'snipe': {
        // Three delayed aimed shots landing where the player stands now.
        for (let i = 0; i < 3; i++) {
          const delay = i * 320;
          ctx.schedule(delay + 700, () => {
            if (!this.alive) return;
            const px = ctx.player.x;
            const py = ctx.player.y;
            const t = ctx.effects.telegraph(px, py, 44, this.def.accent, 700);
            ctx.schedule(700, () => {
              t.destroy();
              if (!this.alive) return;
              ctx.effects.ring(px, py, 46, this.def.accent, 220, 3);
              if (Math.hypot(ctx.player.x - px, ctx.player.y - py) < 48) {
                ctx.damagePlayer(this.damage * 0.9);
              }
            });
          });
        }
        break;
      }
      case 'frostNova': {
        const delay = 800;
        const t = ctx.effects.telegraph(this.x, this.y, this.radius * 5.5, this.def.accent, delay);
        ctx.schedule(delay, () => {
          t.destroy();
          if (!this.alive) return;
          ctx.effects.ring(this.x, this.y, this.radius * 5.5, this.def.accent, 320, 6);
          ctx.effects.shake(0.01, 220);
          if (Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y) < this.radius * 5.5) {
            ctx.damagePlayer(this.damage * 1.1);
            ctx.freezePlayer(900);
          }
        });
        break;
      }
      case 'burnArena': {
        // Scatter delayed burn patches.
        for (let i = 0; i < 6; i++) {
          const px = ARENA.x + 60 + Math.random() * (ARENA.w - 120);
          const py = ARENA.y + 60 + Math.random() * (ARENA.h - 120);
          const t = ctx.effects.telegraph(px, py, 62, 0xff714a, 900 + i * 60);
          ctx.schedule(900 + i * 60, () => {
            t.destroy();
            if (!this.alive) return;
            const patch = ctx.effects.telegraph(px, py, 62, 0xff714a, 2600);
            ctx.addHazard({ x: px, y: py, radius: 62, damage: this.damage * 0.35, until: now + 2600, patch });
          });
        }
        break;
      }
      case 'wave': {
        // Expanding ring of shots.
        const count = 16;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          ctx.spawnEnemyShot(this.x, this.y, a, this.damage * 0.45, this.def.accent, { speed: 170, life: 5200 });
        }
        break;
      }
      case 'summonAdds': {
        const n = 2 + this.phase;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          ctx.summonAdd(this.x + Math.cos(a) * 140, this.y + Math.sin(a) * 140);
        }
        audio.playMusic('boss');
        break;
      }
      case 'mirror': {
        // Spawn two hard-hitting clones that fire once and fade.
        for (let i = 0; i < 2; i++) {
          const a = angle + (i === 0 ? 1.2 : -1.2);
          const cx = this.x + Math.cos(a) * 200;
          const cy = this.y + Math.sin(a) * 200;
          const clone = ctx.effects.telegraph(cx, cy, 30, this.def.accent, 500);
          ctx.schedule(500, () => {
            clone.destroy();
            if (!this.alive) return;
            const shotsAngle = Math.atan2(ctx.player.y - cy, ctx.player.x - cx);
            for (let k = -1; k <= 1; k++) {
              ctx.spawnEnemyShot(cx, cy, shotsAngle + k * 0.25, this.damage * 0.6, this.def.accent, { speed: 300 });
            }
          });
        }
        break;
      }
      case 'teleport': {
        const ta = Math.random() * Math.PI * 2;
        const tx = Math.max(ARENA.x + 120, Math.min(ARENA.x + ARENA.w - 120, this.x + Math.cos(ta) * 260));
        const ty = Math.max(ARENA.y + 120, Math.min(ARENA.y + ARENA.h - 120, this.y + Math.sin(ta) * 260));
        ctx.blink(this.x, this.y, this.def.accent);
        this.x = tx; this.y = ty;
        ctx.blink(this.x, this.y, this.def.accent);
        const t = ctx.effects.telegraph(this.x, this.y, this.radius * 4, this.def.accent, 500);
        ctx.schedule(500, () => {
          t.destroy(); if (!this.alive) return;
          ctx.effects.ring(this.x, this.y, this.radius * 4, this.def.accent, 260, 5);
          if (Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y) < this.radius * 4) {
            ctx.damagePlayer(this.damage);
          }
        });
        break;
      }
      case 'shadowClone': {
        for (let i = 0; i < 3; i++) {
          const a = angle + (i - 1) * 1.4;
          const cx = this.x + Math.cos(a) * 170;
          const cy = this.y + Math.sin(a) * 170;
          const shade = ctx.spawnShadowClone(cx, cy, this);
          ctx.schedule(1400, () => { if (shade) shade.destroy(); });
        }
        break;
      }
      case 'voidPull': {
        ctx.pullPlayer(this.x, this.y, 300, 900);
        const t = ctx.effects.telegraph(this.x, this.y, this.radius * 6, 0x9c6cff, 900);
        ctx.schedule(900, () => {
          t.destroy(); if (!this.alive) return;
          ctx.effects.ring(this.x, this.y, this.radius * 6, 0x9c6cff, 340, 7);
          if (Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y) < this.radius * 6) {
            ctx.damagePlayer(this.damage * 1.2);
          }
        });
        break;
      }
      default: {
        ctx.spawnEnemyShot(this.x, this.y, angle, this.damage * 0.5, this.def.accent, { speed: 240 });
      }
    }
  }

  syncVisual() {
    this.container.setPosition(this.x, this.y);
    const exposed = this.scene.time.now < this.exposedUntil;
    this.aura.setScale(exposed ? 1.35 : 1);
    const pulse = 1 + Math.sin(this.scene.time.now / 260) * 0.04;
    if (this.inner) this.inner.setScale(pulse);
    else if (this.sprite) this.sprite.setScale(
      (this.radius * 3.4 / this.sprite.width) * pulse,
      (this.radius * 3.4 / this.sprite.height) * pulse,
    );
  }

  drawBars() {
    const w = 720;
    const x = 640 - w / 2;
    this.hpBarBg.clear();
    this.hpBarBg.fillStyle(0x1a1424, 0.92);
    this.hpBarBg.fillRoundedRect(x - 4, 24, w + 8, 26, 8);
    this.hpBarBg.lineStyle(2, 0x554c6d, 0.8);
    this.hpBarBg.strokeRoundedRect(x - 4, 24, w + 8, 26, 8);
  }

  updateBars() {
    const w = 720;
    const x = 640 - w / 2;
    const ratio = Math.max(0, this.hp / this.maxHp);
    this.hpBar.clear();
    this.hpBar.fillStyle(this.def.color, 1);
    this.hpBar.fillRoundedRect(x, 28, Math.max(4, w * ratio), 18, 6);
    this.hpBar.fillStyle(0xffffff, 0.18);
    this.hpBar.fillRoundedRect(x, 28, Math.max(4, w * ratio), 7, 6);
  }

  destroy() {
    this.container.destroy(true);
    this.hpBar.destroy();
    this.hpBarBg.destroy();
    this.namePlate.destroy();
    this.telegraphs.forEach((t) => t.destroy());
  }
}
