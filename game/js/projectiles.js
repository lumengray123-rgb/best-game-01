// The Warden's weapons: ember bolts that seek the nearest Hollow, the
// orbiting ember ring, and the nova blast. Each update moves its shots and
// resolves its hits; main.js calls these in the frame's combat step.

import { dist } from './rng.js';
import { drawGlow } from './sprites.js';

function nearestEnemy(state, x, y, maxRange) {
  let best = null;
  let bestD = maxRange;
  for (const enemy of state.enemies) {
    const d = dist(x, y, enemy.x, enemy.y);
    if (d < bestD) {
      bestD = d;
      best = enemy;
    }
  }
  return best;
}

// Fire the bolt volley at the nearest enemy; returns how many bolts flew.
export function fireBolts(state, sound) {
  const player = state.player;
  const bolt = player.bolt;
  const target = nearestEnemy(state, player.x, player.y, 620);
  if (!target) return 0;
  const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
  const spread = 0.14;
  for (let i = 0; i < bolt.count; i++) {
    const offset = (i - (bolt.count - 1) / 2) * spread;
    const angle = baseAngle + offset;
    const crit = Math.random() < player.critChance;
    state.bolts.push({
      x: player.x + Math.cos(angle) * 20,
      y: player.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * bolt.speed,
      vy: Math.sin(angle) * bolt.speed,
      damage: bolt.damage * (crit ? player.critMult : 1),
      crit,
      pierce: bolt.pierce,
      radius: 6,
      life: 1.1,
      hitIds: new Set(),
    });
  }
  state.stats.boltsFired += bolt.count;
  sound.shoot();
  return bolt.count;
}

export function updateBolts(dt, state, onHit) {
  const bolts = state.bolts;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const bolt = bolts[i];
    bolt.life -= dt;
    bolt.x += bolt.vx * dt;
    bolt.y += bolt.vy * dt;
    let dead = bolt.life <= 0;
    if (!dead) {
      // A hit can kill (and remove) an enemy, so iterate a snapshot.
      for (const enemy of [...state.enemies]) {
        if (bolt.hitIds.has(enemy.id)) continue;
        const rr = bolt.radius + enemy.radius;
        if (Math.abs(enemy.x - bolt.x) < rr && Math.abs(enemy.y - bolt.y) < rr) {
          if (dist(bolt.x, bolt.y, enemy.x, enemy.y) < rr) {
            bolt.hitIds.add(enemy.id);
            onHit(enemy, bolt.damage, bolt.vx * 0.35, bolt.vy * 0.35, bolt.crit);
            if (bolt.pierce > 0) {
              bolt.pierce -= 1;
            } else {
              dead = true;
              break;
            }
          }
        }
      }
    }
    if (dead) bolts.splice(i, 1);
  }
}

export function drawBolts(ctx, state) {
  ctx.globalCompositeOperation = 'lighter';
  for (const bolt of state.bolts) {
    drawGlow(ctx, bolt.crit ? '#fff07a' : '#ffb347', bolt.x, bolt.y, bolt.crit ? 34 : 26, 0.9);
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.arc(bolt.x, bolt.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// The nova: an expanding ring that hurts each enemy once as it passes.
export function castNova(state) {
  const player = state.player;
  state.novas.push({
    x: player.x,
    y: player.y,
    radius: 10,
    maxRadius: player.nova.radius,
    damage: player.nova.damage,
    speed: 520,
    hitIds: new Set(),
  });
}

export function updateNovas(dt, state, onHit) {
  for (let i = state.novas.length - 1; i >= 0; i--) {
    const nova = state.novas[i];
    nova.radius += nova.speed * dt;
    for (const enemy of [...state.enemies]) {
      if (nova.hitIds.has(enemy.id)) continue;
      const d = dist(nova.x, nova.y, enemy.x, enemy.y);
      if (Math.abs(d - nova.radius) < enemy.radius + 14) {
        nova.hitIds.add(enemy.id);
        const kx = ((enemy.x - nova.x) / Math.max(1, d)) * 260;
        const ky = ((enemy.y - nova.y) / Math.max(1, d)) * 260;
        onHit(enemy, nova.damage, kx, ky, false);
      }
    }
    if (nova.radius >= nova.maxRadius) state.novas.splice(i, 1);
  }
}

export function drawNovas(ctx, state) {
  ctx.globalCompositeOperation = 'lighter';
  for (const nova of state.novas) {
    const t = nova.radius / nova.maxRadius;
    ctx.strokeStyle = `rgba(255, 179, 71, ${(1 - t) * 0.9})`;
    ctx.lineWidth = 10 * (1 - t) + 3;
    ctx.beginPath();
    ctx.arc(nova.x, nova.y, nova.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 240, 200, ${(1 - t) * 0.7})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(nova.x, nova.y, nova.radius * 0.92, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// Orbiting embers: positions on a ring around the player; main.js checks
// their contact with enemies and calls onOrbitHit for each touch.
export function orbitPositions(state) {
  const player = state.player;
  const positions = [];
  const count = player.orbit.count;
  if (count <= 0) return positions;
  for (let i = 0; i < count; i++) {
    const angle = state.orbitAngle + (i / count) * Math.PI * 2;
    positions.push({
      id: i,
      x: player.x + Math.cos(angle) * player.orbit.radius,
      y: player.y + Math.sin(angle) * player.orbit.radius,
      radius: 11,
    });
  }
  return positions;
}

export function drawOrbit(ctx, state) {
  const positions = orbitPositions(state);
  if (positions.length === 0) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, state.player.orbit.radius, 0, Math.PI * 2);
  ctx.stroke();
  for (const ember of positions) {
    drawGlow(ctx, '#ff9a3c', ember.x, ember.y, 34, 0.95);
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.arc(ember.x, ember.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

export function updateEnemyShots(dt, state) {
  for (let i = state.enemyShots.length - 1; i >= 0; i--) {
    const shot = state.enemyShots[i];
    shot.life -= dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    if (shot.life <= 0) state.enemyShots.splice(i, 1);
  }
}

export function drawEnemyShots(ctx, state) {
  ctx.globalCompositeOperation = 'lighter';
  for (const shot of state.enemyShots) {
    drawGlow(ctx, shot.color, shot.x, shot.y, 30, 0.85);
    ctx.fillStyle = '#eaffea';
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
