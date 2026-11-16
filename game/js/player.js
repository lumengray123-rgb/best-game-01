// The Warden: movement, the dash with its brief invulnerability, and every
// weapon and stat the upgrades grow. Firing itself lives in projectiles.js;
// this file owns the body and the numbers.

import { clamp } from './rng.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from './state.js';
import { drawGlow } from './sprites.js';

export const PLAYER_RADIUS = 16;

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = PLAYER_RADIUS;
    this.facing = 0; // radians, toward the mouse or the nearest foe
    this.maxHp = 100;
    this.hp = 100;
    this.speed = 255;
    this.magnetRadius = 120;
    this.regen = 0;
    this.armor = 0;
    this.critChance = 0.05;
    this.critMult = 2;
    // Dash: a short burst toward the mouse with invulnerability.
    this.dashCooldown = 2.2;
    this.dashTimer = 0;
    this.dashTime = 0;
    this.dashDirX = 1;
    this.dashDirY = 0;
    this.invulnTimer = 0;
    this.hurtTimer = 0;
    // Weapons.
    this.bolt = { level: 1, damage: 12, fireInterval: 0.45, count: 1, pierce: 0, speed: 640, timer: 0 };
    this.orbit = { level: 0, damage: 11, count: 0, radius: 78, rotSpeed: 2.6, hitCooldown: 0.35 };
    this.nova = { level: 0, damage: 26, radius: 170, cooldown: 6.5, timer: 3 };
    this.walkCycle = 0;
  }

  get alive() {
    return this.hp > 0;
  }

  get dashReady() {
    return this.dashTimer <= 0;
  }

  get invulnerable() {
    return this.invulnTimer > 0 || this.dashTime > 0;
  }

  update(dt, input, camera, state) {
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    if (this.regen > 0) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);

    // Face the mouse (world space) so the dash goes where the player looks.
    const mouse = camera.toWorld(input.mouseX, input.mouseY);
    this.facing = Math.atan2(mouse.y - this.y, mouse.x - this.x);

    const wantDash = input.justPressed('Space') || input.justClicked();
    if (wantDash && this.dashReady && this.dashTime <= 0) {
      this.dashTime = 0.16;
      this.dashTimer = this.dashCooldown;
      this.dashDirX = Math.cos(this.facing);
      this.dashDirY = Math.sin(this.facing);
      this.invulnTimer = Math.max(this.invulnTimer, 0.26);
      state.stats.dashes += 1;
    }

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.x += this.dashDirX * 950 * dt;
      this.y += this.dashDirY * 950 * dt;
    } else {
      const axis = input.moveAxis();
      this.x += axis.x * this.speed * dt;
      this.y += axis.y * this.speed * dt;
      if (axis.x !== 0 || axis.y !== 0) this.walkCycle += dt * 10;
    }

    this.x = clamp(this.x, this.radius, WORLD_WIDTH - this.radius);
    this.y = clamp(this.y, this.radius, WORLD_HEIGHT - this.radius);
  }

  // Damage after armor; returns the HP actually lost (0 while invulnerable).
  takeDamage(amount) {
    if (this.invulnerable || !this.alive) return 0;
    const reduced = Math.max(1, Math.round(amount * (1 - this.armor)));
    this.hp = Math.max(0, this.hp - reduced);
    this.invulnTimer = 0.5;
    this.hurtTimer = 0.25;
    return reduced;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  draw(ctx, time) {
    const flicker = 1 + Math.sin(time * 9) * 0.06 + Math.sin(time * 23.7) * 0.04;
    // Ember aura.
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, '#ff9a3c', this.x, this.y, 130 * flicker, 0.55);
    ctx.globalCompositeOperation = 'source-over';

    // Cloak: a triangle swaying with the walk cycle.
    const sway = Math.sin(this.walkCycle) * 0.12;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing + Math.PI / 2 + sway);
    ctx.fillStyle = '#2a1e4f';
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(-13, -8);
    ctx.lineTo(0, -3);
    ctx.lineTo(13, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Body: a bright ember core in a dark ring.
    const hurt = this.hurtTimer > 0;
    ctx.fillStyle = hurt ? '#ff5d73' : '#1b1438';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hurt ? '#ff8a9a' : '#ffb347';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 6.5 * flicker, 0, Math.PI * 2);
    ctx.fill();

    // Aim tick: a short line toward the facing direction.
    ctx.strokeStyle = 'rgba(255, 215, 106, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x + Math.cos(this.facing) * (this.radius + 2), this.y + Math.sin(this.facing) * (this.radius + 2));
    ctx.lineTo(this.x + Math.cos(this.facing) * (this.radius + 10), this.y + Math.sin(this.facing) * (this.radius + 10));
    ctx.stroke();
  }
}
