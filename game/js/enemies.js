// The Hollow: four enemy kinds with distinct shapes and behaviours, plus the
// Brute elite. The SpawnDirector paces them against the clock and throws a
// surge ring at the player every 60 seconds.

import { clamp, dist } from './rng.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from './state.js';
import { drawGlow } from './sprites.js';

export const ENEMY_TYPES = {
  wisp: {
    name: 'Wisp', hp: 18, speed: 98, radius: 13, damage: 8, xp: 1, score: 10,
    color: '#b78cff', core: '#e6d6ff', behavior: 'chase',
  },
  husk: {
    name: 'Husk', hp: 58, speed: 56, radius: 20, damage: 14, xp: 3, score: 25,
    color: '#ff5d73', core: '#ffd0d8', behavior: 'chase', knockResist: 0.75,
  },
  stinger: {
    name: 'Stinger', hp: 26, speed: 82, radius: 12, damage: 11, xp: 2, score: 20,
    color: '#59e3ff', core: '#d8fbff', behavior: 'lunge',
  },
  spitter: {
    name: 'Spitter', hp: 32, speed: 66, radius: 14, damage: 9, xp: 2, score: 25,
    color: '#7dff9a', core: '#e2ffe8', behavior: 'skirmish',
  },
  brute: {
    name: 'Brute', hp: 260, speed: 50, radius: 30, damage: 22, xp: 12, score: 150,
    color: '#ff8a3c', core: '#ffe1c2', behavior: 'chase', knockResist: 0.9, elite: true,
  },
};

let nextId = 1;

export class Enemy {
  constructor(typeKey, x, y, hpScale = 1) {
    const def = ENEMY_TYPES[typeKey];
    this.id = nextId++;
    this.type = typeKey;
    this.def = def;
    this.x = x;
    this.y = y;
    this.maxHp = Math.round(def.hp * hpScale);
    this.hp = this.maxHp;
    this.radius = def.radius;
    this.speed = def.speed;
    this.damage = def.damage;
    this.xp = def.xp;
    this.score = def.score;
    this.elite = Boolean(def.elite);
    this.flash = 0;
    this.knockX = 0;
    this.knockY = 0;
    this.lungeState = 'approach'; // approach | telegraph | lunging | recover
    this.lungeTimer = 0;
    this.lungeDirX = 0;
    this.lungeDirY = 0;
    this.shootTimer = 1.5;
    this.wobble = Math.random() * Math.PI * 2;
    this.hitByOrbit = new Map(); // orbit ember id -> time it may hit again
  }

  get alive() {
    return this.hp > 0;
  }

  update(dt, player, state) {
    this.flash = Math.max(0, this.flash - dt);
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / d;
    const ny = dy / d;
    const behavior = this.def.behavior;

    if (behavior === 'lunge') {
      this.updateLunge(dt, nx, ny, d);
    } else if (behavior === 'skirmish') {
      // Hold a ring around the player and spit globs.
      const want = 270;
      const radial = d < want - 30 ? -1 : d > want + 60 ? 1 : 0;
      const strafe = Math.sin(state.time * 0.7 + this.wobble) > 0 ? 1 : -1;
      this.x += (nx * radial + -ny * strafe * 0.7) * this.speed * dt;
      this.y += (ny * radial + nx * strafe * 0.7) * this.speed * dt;
      this.shootTimer -= dt;
      if (this.shootTimer <= 0 && d < 520) {
        this.shootTimer = 2.4;
        state.enemyShots.push({
          x: this.x, y: this.y,
          vx: nx * 240, vy: ny * 240,
          damage: this.damage, radius: 7, life: 4, color: this.def.color,
        });
      }
    } else {
      // Chase, with a slight wobble so the pack doesn't march in lockstep.
      const wob = Math.sin(state.time * 2.2 + this.wobble) * 0.35;
      const px = -ny * wob;
      const py = nx * wob;
      this.x += (nx + px) * this.speed * dt;
      this.y += (ny + py) * this.speed * dt;
    }

    // Knockback decays; the position integrates it.
    this.x += this.knockX * dt;
    this.y += this.knockY * dt;
    this.knockX *= Math.pow(0.001, dt);
    this.knockY *= Math.pow(0.001, dt);
    this.x = clamp(this.x, this.radius, WORLD_WIDTH - this.radius);
    this.y = clamp(this.y, this.radius, WORLD_HEIGHT - this.radius);
  }

  updateLunge(dt, nx, ny, d) {
    if (this.lungeState === 'approach') {
      this.x += nx * this.speed * dt;
      this.y += ny * this.speed * dt;
      if (d < 210) {
        this.lungeState = 'telegraph';
        this.lungeTimer = 0.45;
      }
    } else if (this.lungeState === 'telegraph') {
      this.lungeTimer -= dt;
      this.lungeDirX = nx;
      this.lungeDirY = ny;
      if (this.lungeTimer <= 0) {
        this.lungeState = 'lunging';
        this.lungeTimer = 0.32;
      }
    } else if (this.lungeState === 'lunging') {
      this.lungeTimer -= dt;
      this.x += this.lungeDirX * 520 * dt;
      this.y += this.lungeDirY * 520 * dt;
      if (this.lungeTimer <= 0) {
        this.lungeState = 'recover';
        this.lungeTimer = 0.7;
      }
    } else {
      this.lungeTimer -= dt;
      if (this.lungeTimer <= 0) this.lungeState = 'approach';
    }
  }

  // Apply damage with a knockback impulse; returns true when this kills it.
  takeDamage(amount, kx, ky) {
    this.hp -= amount;
    this.flash = 0.09;
    const resist = 1 - (this.def.knockResist || 0);
    this.knockX += kx * resist;
    this.knockY += ky * resist;
    return this.hp <= 0;
  }

  draw(ctx, time) {
    const def = this.def;
    const pulse = 1 + Math.sin(time * 6 + this.wobble) * 0.08;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, def.color, this.x, this.y, this.radius * 4.4 * pulse, 0.5);
    ctx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.translate(this.x, this.y);
    const body = this.flash > 0 ? '#ffffff' : def.color;
    if (this.type === 'wisp') {
      // A drifting orb with a tail of fading wisps.
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = def.core;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'husk' || this.type === 'brute') {
      // A spiked husk: a jagged polygon, slowly rotating.
      const spikes = this.type === 'brute' ? 10 : 8;
      ctx.rotate(time * 0.8 + this.wobble);
      ctx.fillStyle = body;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? this.radius : this.radius * 0.62;
        const a = (i / (spikes * 2)) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = def.core;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.34, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'stinger') {
      // A dart that points where it is going.
      const telegraph = this.lungeState === 'telegraph';
      ctx.rotate(Math.atan2(this.lungeDirY || 0, this.lungeDirX || 1) + (telegraph ? Math.sin(time * 40) * 0.06 : 0));
      ctx.fillStyle = telegraph ? '#ffffff' : body;
      ctx.beginPath();
      ctx.moveTo(this.radius * 1.3, 0);
      ctx.lineTo(-this.radius * 0.8, this.radius * 0.8);
      ctx.lineTo(-this.radius * 0.4, 0);
      ctx.lineTo(-this.radius * 0.8, -this.radius * 0.8);
      ctx.closePath();
      ctx.fill();
    } else {
      // Spitter: a blob with a glowing maw.
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = def.core;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0e1a';
      ctx.beginPath();
      ctx.arc(0, -this.radius * 0.25, this.radius * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Health bar for anything hurt, and always for elites.
    if (this.elite || this.hp < this.maxHp) {
      const w = this.radius * 2;
      const ratio = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(this.x - w / 2, this.y - this.radius - 12, w, 5);
      ctx.fillStyle = this.elite ? '#ff8a3c' : def.color;
      ctx.fillRect(this.x - w / 2, this.y - this.radius - 12, w * ratio, 5);
    }
  }
}

export class SpawnDirector {
  constructor(rng) {
    this.rng = rng;
  }

  // Which kinds may appear at this minute of the run, weighted.
  composition(time) {
    const table = [
      { type: 'wisp', weight: 10 },
      { type: 'husk', weight: time > 25 ? 4 : 0 },
      { type: 'stinger', weight: time > 50 ? 4 : 0 },
      { type: 'spitter', weight: time > 85 ? 3.5 : 0 },
    ];
    const total = table.reduce((sum, row) => sum + row.weight, 0);
    let roll = this.rng.float() * total;
    for (const row of table) {
      roll -= row.weight;
      if (roll <= 0) return row.type;
    }
    return 'wisp';
  }

  // Enemy HP grows slowly with the clock so the run stays tense.
  hpScale(time) {
    return 1 + time / 240;
  }

  update(dt, state, camera) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      const interval = Math.max(0.32, 1.05 - state.time * 0.0035);
      state.spawnTimer = interval;
      const batch = 1 + Math.floor(state.time / 75);
      for (let i = 0; i < batch; i++) {
        if (state.enemies.length >= 130) break;
        const pos = this.spawnPoint(state, camera);
        state.enemies.push(new Enemy(this.composition(state.time), pos.x, pos.y, this.hpScale(state.time)));
      }
    }

    // The surge: every 60 seconds a ring closes in, with a Brute from the second surge on.
    state.surgeTimer -= dt;
    if (state.surgeTimer <= 0) {
      state.surgeTimer = 60;
      const n = state.surgeNumber;
      state.showBanner(n === 1 ? 'THE HOLLOW SURGE' : `SURGE ${n} — HOLD THE LIGHT`, 2.6);
      const count = 10 + n * 3;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + this.rng.range(-0.1, 0.1);
        const r = 560 + this.rng.range(0, 120);
        const x = clamp(state.player.x + Math.cos(angle) * r, 30, WORLD_WIDTH - 30);
        const y = clamp(state.player.y + Math.sin(angle) * r, 30, WORLD_HEIGHT - 30);
        state.enemies.push(new Enemy(this.composition(state.time), x, y, this.hpScale(state.time)));
      }
      if (n >= 2) {
        const angle = this.rng.angle();
        const x = clamp(state.player.x + Math.cos(angle) * 620, 40, WORLD_WIDTH - 40);
        const y = clamp(state.player.y + Math.sin(angle) * 620, 40, WORLD_HEIGHT - 40);
        state.enemies.push(new Enemy('brute', x, y, this.hpScale(state.time)));
      }
      state.surgeNumber += 1;
      state.score += 50 * n;
    }
  }

  // A point just outside the camera's view but inside the world.
  spawnPoint(state, camera) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = this.rng.angle();
      const distance = this.rng.range(520, 720);
      const x = state.player.x + Math.cos(angle) * distance;
      const y = state.player.y + Math.sin(angle) * distance;
      if (x < 20 || y < 20 || x > WORLD_WIDTH - 20 || y > WORLD_HEIGHT - 20) continue;
      if (dist(x, y, camera.x + 640, camera.y + 360) < 500) continue;
      return { x, y };
    }
    return {
      x: clamp(state.player.x + 600, 20, WORLD_WIDTH - 20),
      y: clamp(state.player.y, 20, WORLD_HEIGHT - 20),
    };
  }
}
