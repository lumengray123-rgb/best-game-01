// Particles and floating combat text: the juice. Sparks fly on hits, a burst
// marks a kill, and damage numbers float up so every shot feels answered.

import { drawGlow } from './sprites.js';

export function spawnBurst(state, x, y, color, count, speed = 220) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.9);
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: 0.35 + Math.random() * 0.4,
      maxLife: 0.75,
      size: 3 + Math.random() * 5,
      color,
      drag: 3.2,
    });
  }
}

export function spawnTrail(state, x, y, color) {
  state.particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 30,
    vy: (Math.random() - 0.5) * 30,
    life: 0.3,
    maxLife: 0.3,
    size: 5 + Math.random() * 4,
    color,
    drag: 1,
  });
}

export function spawnText(state, x, y, text, color, big = false) {
  state.texts.push({
    x: x + (Math.random() - 0.5) * 14,
    y: y - 10,
    text,
    color,
    life: 0.8,
    maxLife: 0.8,
    size: big ? 22 : 15,
  });
}

export function updateParticles(dt, state) {
  const particles = state.particles;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const drag = Math.pow(0.02, p.drag * dt);
    p.vx *= drag;
    p.vy *= drag;
  }
  if (particles.length > 500) particles.splice(0, particles.length - 500);

  const texts = state.texts;
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt;
    t.y -= 42 * dt;
    if (t.life <= 0) texts.splice(i, 1);
  }
  if (texts.length > 60) texts.splice(0, texts.length - 60);
}

export function drawParticles(ctx, state) {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    drawGlow(ctx, p.color, p.x, p.y, p.size * 2.6, alpha);
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.textAlign = 'center';
  for (const t of state.texts) {
    const alpha = Math.max(0, t.life / t.maxLife);
    ctx.globalAlpha = alpha;
    ctx.font = `800 ${t.size}px "Segoe UI", Arial, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
