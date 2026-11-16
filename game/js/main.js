// EMBERWARDEN — entry point. Boots the modules, runs the loop, owns the mode
// machine (title / playing / levelup / paused / dying / gameover), resolves
// combat, and draws the world. A ?shot= query arranges a fixed scene so the
// screenshots are real renders of the game (see arrangeShot below).

import { Rng, mulberry32, dist, clamp } from './rng.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { Camera } from './camera.js';
import { GameState, VIEW_WIDTH, VIEW_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from './state.js';
import { Player } from './player.js';
import { Enemy, SpawnDirector } from './enemies.js';
import {
  fireBolts, updateBolts, drawBolts, castNova, updateNovas, drawNovas,
  orbitPositions, drawOrbit, updateEnemyShots, drawEnemyShots,
} from './projectiles.js';
import { spawnBurst, spawnTrail, spawnText, updateParticles, drawParticles } from './particles.js';
import { rollChoices, applyUpgrade } from './upgrades.js';
import { drawGlow } from './sprites.js';
import { UI } from './ui.js';

const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed')) || (Math.floor(Math.random() * 1e9) + 1);
const SHOT = params.get('shot') || '';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const rng = new Rng(SEED);
const sound = new SoundEngine();
const input = new Input(canvas);
const camera = new Camera(VIEW_WIDTH, VIEW_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT);
const state = new GameState();
const director = new SpawnDirector(rng);
const ui = new UI({
  onStart: () => startRun(),
  onResume: () => togglePause(),
  onRestart: () => startRun(),
  onMute: () => toggleMute(),
});

// The night's scenery: stars and scorch marks, fixed by their own seed so the
// backdrop never shifts between runs.
const sceneryRng = mulberry32(1337);
const STARS = [];
for (let i = 0; i < 240; i++) {
  STARS.push({
    x: sceneryRng() * WORLD_WIDTH,
    y: sceneryRng() * WORLD_HEIGHT,
    r: 0.6 + sceneryRng() * 1.6,
    phase: sceneryRng() * Math.PI * 2,
  });
}
const SCORCHES = [];
for (let i = 0; i < 26; i++) {
  SCORCHES.push({
    x: sceneryRng() * WORLD_WIDTH,
    y: sceneryRng() * WORLD_HEIGHT,
    r: 40 + sceneryRng() * 110,
  });
}

let lastTime = performance.now();
let shotElapsed = 0;
let shotNovaDone = false;
let deathTimer = 0;
let ambientTimer = 0;

// The capture script polls this: true once the arranged scene is on screen.
// snapshot() reports the run's live numbers for the automated playtest.
window.__ember = {
  ready: false,
  mode: () => state.mode,
  snapshot: () => ({
    mode: state.mode,
    time: Math.round(state.time),
    score: state.score,
    kills: state.kills,
    level: state.level,
    hp: state.player ? Math.ceil(state.player.hp) : 0,
    enemies: state.enemies.length,
    bolts: state.bolts.length,
    gems: state.gems.length,
  }),
};

// ------------------------------------------------------------------ run flow

function startRun() {
  sound.ensure();
  sound.click();
  state.resetForRun(SEED);
  state.player = new Player(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  camera.x = WORLD_WIDTH / 2 - VIEW_WIDTH / 2;
  camera.y = WORLD_HEIGHT / 2 - VIEW_HEIGHT / 2;
  camera.trauma = 0;
  state.showBanner('THE NIGHT BEGINS', 2.2);
  ui.showHud();
  deathTimer = 0;
  input.endFrame(); // Swallow the key/click that started the run.
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    ui.showPause();
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    ui.hidePause();
  }
}

function toggleMute() {
  state.muted = !state.muted;
  sound.setMuted(state.muted);
  ui.setMuted(state.muted);
}

function openLevelUp() {
  state.mode = 'levelup';
  state.upgradeChoices = rollChoices(rng, state.player);
  sound.levelUp();
  ui.showLevelUp(state.upgradeChoices, state.player, (index) => pickUpgrade(index));
}

function pickUpgrade(index) {
  const upgrade = state.upgradeChoices[index];
  if (!upgrade) return;
  sound.click();
  applyUpgrade(upgrade, state.player, state);
  state.pendingLevels -= 1;
  if (state.pendingLevels > 0) {
    openLevelUp();
    return;
  }
  ui.hideLevelUp();
  state.mode = 'playing';
}

function killPlayer() {
  state.mode = 'dying';
  deathTimer = 0.9;
  spawnBurst(state, state.player.x, state.player.y, '#ffb347', 60, 420);
  spawnBurst(state, state.player.x, state.player.y, '#ffd76a', 30, 260);
  camera.addShake(0.9);
  sound.gameOver();
}

// ------------------------------------------------------------------ combat

function damageEnemy(enemy, amount, kx, ky, crit) {
  const rounded = Math.max(1, Math.round(amount));
  state.stats.damageDealt += rounded;
  spawnText(state, enemy.x, enemy.y, String(rounded), crit ? '#fff07a' : '#ffd9a0', crit);
  spawnBurst(state, enemy.x, enemy.y, enemy.def.color, crit ? 6 : 3, 160);
  sound.hit();
  if (enemy.takeDamage(amount, kx, ky)) {
    killEnemy(enemy);
  }
}

function killEnemy(enemy) {
  state.kills += 1;
  state.score += enemy.score;
  spawnBurst(state, enemy.x, enemy.y, enemy.def.color, enemy.elite ? 30 : 14, enemy.elite ? 340 : 240);
  sound.enemyDie();
  // Ember shards: the enemy's XP split into gems the player collects.
  let remaining = enemy.xp;
  let gems = 0;
  while (remaining > 0 && gems < 8) {
    const value = remaining >= 3 ? 2 : 1;
    remaining -= value;
    gems += 1;
    const angle = rng.angle();
    const d = rng.range(4, 26);
    state.gems.push({
      x: enemy.x + Math.cos(angle) * d,
      y: enemy.y + Math.sin(angle) * d,
      value,
      vx: Math.cos(angle) * rng.range(20, 70),
      vy: Math.sin(angle) * rng.range(20, 70),
      bob: rng.angle(),
    });
  }
  if (enemy.elite) {
    state.showBanner('BRUTE SLAIN  +150', 1.8);
    state.player.heal(12);
  }
  const index = state.enemies.indexOf(enemy);
  if (index >= 0) state.enemies.splice(index, 1);
}

function hurtPlayer(amount, fromX, fromY) {
  const lost = state.player.takeDamage(amount);
  if (lost <= 0) return;
  state.stats.damageTaken += lost;
  camera.addShake(0.55);
  ui.flashVignette();
  sound.hurt();
  spawnBurst(state, state.player.x, state.player.y, '#ff5d73', 12, 220);
  spawnText(state, state.player.x, state.player.y - 20, `-${lost}`, '#ff8a9a', true);
  // A shove away from the blow so the player isn't pinned.
  const d = Math.max(1, dist(fromX, fromY, state.player.x, state.player.y));
  state.player.x += ((state.player.x - fromX) / d) * 14;
  state.player.y += ((state.player.y - fromY) / d) * 14;
  if (!state.player.alive) killPlayer();
}

function updateCombat(dt) {
  const player = state.player;

  // Bolts: fire on cadence while a target is in range.
  player.bolt.timer -= dt;
  if (player.bolt.timer <= 0) {
    const fired = fireBolts(state, sound);
    player.bolt.timer = fired > 0 ? player.bolt.fireInterval : 0.1;
  }

  // Nova: a periodic eruption once learned.
  if (player.nova.level > 0) {
    player.nova.timer -= dt;
    if (player.nova.timer <= 0) {
      player.nova.timer = player.nova.cooldown;
      castNova(state);
      sound.nova();
      camera.addShake(0.25);
    }
  }

  // Orbit: the ring turns; each ember burns what it touches.
  state.orbitAngle += player.orbit.rotSpeed * dt;
  if (player.orbit.count > 0) {
    for (const ember of orbitPositions(state)) {
      for (const enemy of [...state.enemies]) {
        const rr = ember.radius + enemy.radius;
        if (Math.abs(enemy.x - ember.x) >= rr || Math.abs(enemy.y - ember.y) >= rr) continue;
        if (dist(ember.x, ember.y, enemy.x, enemy.y) >= rr) continue;
        const nextHit = enemy.hitByOrbit.get(ember.id) || 0;
        if (state.time < nextHit) continue;
        enemy.hitByOrbit.set(ember.id, state.time + player.orbit.hitCooldown);
        const kx = ((enemy.x - player.x) / Math.max(1, dist(player.x, player.y, enemy.x, enemy.y))) * 160;
        const ky = ((enemy.y - player.y) / Math.max(1, dist(player.x, player.y, enemy.x, enemy.y))) * 160;
        damageEnemy(enemy, player.orbit.damage, kx, ky, false);
      }
    }
  }

  updateBolts(dt, state, (enemy, amount, kx, ky, crit) => {
    damageEnemy(enemy, amount, kx, ky, crit);
    return !enemy.alive;
  });
  updateNovas(dt, state, (enemy, amount, kx, ky, crit) => {
    damageEnemy(enemy, amount, kx, ky, crit);
    return !enemy.alive;
  });
  updateEnemyShots(dt, state);

  // Enemy shots hitting the player.
  for (let i = state.enemyShots.length - 1; i >= 0; i--) {
    const shot = state.enemyShots[i];
    if (dist(shot.x, shot.y, player.x, player.y) < shot.radius + player.radius) {
      state.enemyShots.splice(i, 1);
      hurtPlayer(shot.damage, shot.x, shot.y);
    }
  }

  // Contact: enemies touching the player bite, then get pushed off.
  for (const enemy of state.enemies) {
    const rr = enemy.radius + player.radius;
    if (Math.abs(enemy.x - player.x) >= rr || Math.abs(enemy.y - player.y) >= rr) continue;
    if (dist(enemy.x, enemy.y, player.x, player.y) >= rr) continue;
    hurtPlayer(enemy.damage, enemy.x, enemy.y);
    const d = Math.max(1, dist(player.x, player.y, enemy.x, enemy.y));
    enemy.knockX += ((enemy.x - player.x) / d) * 220;
    enemy.knockY += ((enemy.y - player.y) / d) * 220;
  }

  // Gems: drift, magnetize, collect.
  for (let i = state.gems.length - 1; i >= 0; i--) {
    const gem = state.gems[i];
    gem.bob += dt * 4;
    const d = dist(gem.x, gem.y, player.x, player.y);
    if (d < player.magnetRadius) {
      const pull = 1 - d / player.magnetRadius;
      const speed = 260 + pull * 520;
      gem.vx += ((player.x - gem.x) / Math.max(1, d)) * speed * dt * 4;
      gem.vy += ((player.y - gem.y) / Math.max(1, d)) * speed * dt * 4;
    }
    gem.vx *= Math.pow(0.01, dt);
    gem.vy *= Math.pow(0.01, dt);
    gem.x += gem.vx * dt;
    gem.y += gem.vy * dt;
    if (d < player.radius + 12) {
      state.gems.splice(i, 1);
      state.score += gem.value * 2;
      sound.pickup();
      spawnText(state, gem.x, gem.y - 6, `+${gem.value}`, '#7dd8ff');
      if (state.gainXp(gem.value) > 0 && state.mode === 'playing') {
        openLevelUp();
        return;
      }
    }
  }

  // Enemies keep a little personal space so the pack doesn't stack.
  const foes = state.enemies;
  for (let i = 0; i < foes.length; i++) {
    for (let j = i + 1; j < foes.length; j++) {
      const a = foes[i];
      const b = foes[j];
      const rr = a.radius + b.radius;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.abs(dx) >= rr || Math.abs(dy) >= rr) continue;
      const d = Math.hypot(dx, dy);
      if (d >= rr || d === 0) continue;
      const push = (rr - d) * 0.5;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push * 0.5;
      a.y -= ny * push * 0.5;
      b.x += nx * push * 0.5;
      b.y += ny * push * 0.5;
    }
  }
}

// ------------------------------------------------------------------ update

function update(dt) {
  if (state.mode === 'title') {
    // A quiet drift of wisps behind the title panel.
    ambientTimer -= dt;
    if (ambientTimer <= 0 && state.enemies.length < 14) {
      ambientTimer = 0.8;
      state.enemies.push(new Enemy(rng.pick(['wisp', 'wisp', 'husk']), rng.range(0, WORLD_WIDTH), rng.range(0, WORLD_HEIGHT), 1));
    }
    const center = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    for (const enemy of state.enemies) {
      enemy.update(dt, center, state);
    }
    updateParticles(dt, state);
    camera.follow(WORLD_WIDTH / 2 + Math.sin(state.time * 0.05) * 60, WORLD_HEIGHT / 2, dt);
    state.time += dt;
    return;
  }

  if (state.mode === 'dying') {
    deathTimer -= dt;
    updateParticles(dt, state);
    camera.follow(state.player.x, state.player.y, dt);
    if (deathTimer <= 0) {
      state.finishRun();
      ui.showGameOver(state);
    }
    return;
  }

  if (state.mode !== 'playing') return;

  state.time += dt;
  state.score += dt * 5;

  // Dash trail embers.
  if (state.player.dashTime > 0 && Math.random() < 0.6) {
    spawnTrail(state, state.player.x, state.player.y, '#ffb347');
  }

  state.player.update(dt, input, camera, state);
  director.update(dt, state, camera);
  for (const enemy of [...state.enemies]) {
    enemy.update(dt, state.player, state);
  }
  updateCombat(dt);
  updateParticles(dt, state);
  camera.follow(state.player.x, state.player.y, dt);
  ui.updateHud(state);

  // A surge's horn: the banner appears the frame the director fires it.
  if (state.surgeNumber > 1 && state.bannerText.startsWith('SURGE') && !state.bannerSoundPlayed) {
    state.bannerSoundPlayed = true;
    sound.surge();
  }
  if (!state.bannerActive) state.bannerSoundPlayed = false;
}

// ------------------------------------------------------------------ draw

const bgGradient = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
bgGradient.addColorStop(0, '#0d1024');
bgGradient.addColorStop(0.55, '#0b0e1a');
bgGradient.addColorStop(1, '#080912');

function drawBackground() {
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  const left = camera.x;
  const top = camera.y;
  const right = left + VIEW_WIDTH;
  const bottom = top + VIEW_HEIGHT;

  // Grid, faint, world-locked.
  ctx.strokeStyle = 'rgba(120, 130, 220, 0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(left / 110) * 110; x <= right; x += 110) {
    ctx.moveTo(x - left, 0);
    ctx.lineTo(x - left, VIEW_HEIGHT);
  }
  for (let y = Math.floor(top / 110) * 110; y <= bottom; y += 110) {
    ctx.moveTo(0, y - top);
    ctx.lineTo(VIEW_WIDTH, y - top);
  }
  ctx.stroke();

  // Stars, twinkling.
  for (const star of STARS) {
    if (star.x < left || star.x > right || star.y < top || star.y > bottom) continue;
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(state.time * 1.5 + star.phase));
    ctx.globalAlpha = twinkle * 0.8;
    ctx.fillStyle = '#cdd6ff';
    ctx.beginPath();
    ctx.arc(star.x - left, star.y - top, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Scorch marks on the ground.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  for (const scorch of SCORCHES) {
    if (scorch.x + scorch.r < left || scorch.x - scorch.r > right) continue;
    if (scorch.y + scorch.r < top || scorch.y - scorch.r > bottom) continue;
    ctx.beginPath();
    ctx.ellipse(scorch.x - left, scorch.y - top, scorch.r, scorch.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawArenaBorder() {
  ctx.strokeStyle = 'rgba(255, 154, 60, 0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, WORLD_WIDTH - 8, WORLD_HEIGHT - 8);
  ctx.strokeStyle = 'rgba(255, 215, 106, 0.25)';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, WORLD_WIDTH - 20, WORLD_HEIGHT - 20);
  // Braziers along the wall, little flames marking the boundary.
  ctx.globalCompositeOperation = 'lighter';
  for (let x = 120; x < WORLD_WIDTH; x += 260) {
    drawGlow(ctx, '#ff9a3c', x, 10, 46, 0.7);
    drawGlow(ctx, '#ff9a3c', x, WORLD_HEIGHT - 10, 46, 0.7);
  }
  for (let y = 120; y < WORLD_HEIGHT; y += 260) {
    drawGlow(ctx, '#ff9a3c', 10, y, 46, 0.7);
    drawGlow(ctx, '#ff9a3c', WORLD_WIDTH - 10, y, 46, 0.7);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawGems() {
  ctx.globalCompositeOperation = 'lighter';
  for (const gem of state.gems) {
    const bob = Math.sin(gem.bob) * 2;
    drawGlow(ctx, '#7dd8ff', gem.x, gem.y + bob, 26, 0.8);
    ctx.save();
    ctx.translate(gem.x, gem.y + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#aee6ff';
    const s = gem.value >= 2 ? 6 : 4.5;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function draw() {
  drawBackground();
  const shake = camera.shakeOffset(state.time);
  ctx.save();
  ctx.translate(-camera.x + shake.x, -camera.y + shake.y);

  drawArenaBorder();
  drawGems();
  drawNovas(ctx, state);
  for (const enemy of state.enemies) enemy.draw(ctx, state.time);
  if (state.mode !== 'title' && state.player) {
    drawOrbit(ctx, state);
    if (state.player.alive || state.mode === 'dying') state.player.draw(ctx, state.time);
  }
  drawBolts(ctx, state);
  drawEnemyShots(ctx, state);
  drawParticles(ctx, state);

  ctx.restore();
}

// ------------------------------------------------------------------ loop

function frame(now) {
  const dt = clamp((now - lastTime) / 1000, 0, 1 / 30);
  lastTime = now;

  handleKeys();
  update(dt);
  updateShotMode(dt);
  draw();
  input.endFrame();
  requestAnimationFrame(frame);
}

function handleKeys() {
  if (input.justPressed('KeyM')) toggleMute();
  if (state.mode === 'title') {
    if (input.justPressed('Enter') || input.justPressed('Space')) startRun();
    return;
  }
  if (state.mode === 'playing') {
    if (input.justPressed('KeyP') || input.justPressed('Escape')) togglePause();
    return;
  }
  if (state.mode === 'paused') {
    if (input.justPressed('KeyP') || input.justPressed('Escape')) togglePause();
    return;
  }
  if (state.mode === 'levelup') {
    const index = input.justPressed('Digit1') ? 0 : input.justPressed('Digit2') ? 1 : input.justPressed('Digit3') ? 2 : -1;
    if (index >= 0) pickUpgrade(index);
    return;
  }
  if (state.mode === 'gameover') {
    if (input.justPressed('KeyR')) startRun();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'playing') togglePause();
});

// ------------------------------------------------------------------ screenshots

// ?shot= arranges a fixed scene for the entry's screenshots: the game plays
// itself into the state, then flags __ember.ready for the capture script.
function arrangeShot() {
  if (SHOT === 'title') {
    window.setTimeout(() => { window.__ember.ready = true; }, 600);
    return;
  }
  if (SHOT === 'play') {
    startRun();
    // A mid-run build: split bolts, an orbit ember, a nova, a few levels.
    const p = state.player;
    p.bolt.count = 2;
    p.bolt.damage = 15;
    p.orbit.count = 2;
    p.orbit.level = 1;
    p.nova.level = 1;
    p.nova.timer = 6; // The scripted nova at 2.4s is the one the shot catches.
    state.level = 4;
    state.xp = 6;
    state.xpNext = 25;
    state.kills = 23;
    state.score = 640;
    state.time = 42;
    // A lively pack closing in from every side.
    const kinds = ['wisp', 'wisp', 'husk', 'stinger', 'spitter', 'wisp', 'husk'];
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const r = rng.range(200, 520);
      const kind = kinds[i % kinds.length];
      state.enemies.push(new Enemy(kind,
        clamp(p.x + Math.cos(angle) * r, 30, WORLD_WIDTH - 30),
        clamp(p.y + Math.sin(angle) * r, 30, WORLD_HEIGHT - 30), 1));
    }
    for (let i = 0; i < 10; i++) {
      const angle = rng.angle();
      const r = rng.range(60, 300);
      state.gems.push({
        x: p.x + Math.cos(angle) * r, y: p.y + Math.sin(angle) * r,
        value: 1, vx: 0, vy: 0, bob: rng.angle(),
      });
    }
    return;
  }
  if (SHOT === 'levelup') {
    startRun();
    state.level = 5;
    state.kills = 41;
    state.score = 1180;
    state.time = 73;
    state.player.hp = 78;
    for (let i = 0; i < 8; i++) {
      const angle = rng.angle();
      const r = rng.range(320, 560);
      state.enemies.push(new Enemy(i % 3 === 0 ? 'husk' : 'wisp',
        clamp(state.player.x + Math.cos(angle) * r, 30, WORLD_WIDTH - 30),
        clamp(state.player.y + Math.sin(angle) * r, 30, WORLD_HEIGHT - 30), 1));
    }
    state.pendingLevels = 1;
    ui.updateHud(state); // The HUD behind the modal shows this run's numbers.
    openLevelUp();
    window.setTimeout(() => { window.__ember.ready = true; }, 350);
    return;
  }
  if (SHOT === 'gameover') {
    startRun();
    state.time = 187;
    state.kills = 142;
    state.level = 9;
    state.score = 8450;
    state.stats.boltsFired = 512;
    state.stats.dashes = 19;
    state.player.hp = 1;
    for (let i = 0; i < 6; i++) {
      const angle = rng.angle();
      const r = rng.range(200, 480);
      state.enemies.push(new Enemy(i % 2 ? 'wisp' : 'husk',
        clamp(state.player.x + Math.cos(angle) * r, 30, WORLD_WIDTH - 30),
        clamp(state.player.y + Math.sin(angle) * r, 30, WORLD_HEIGHT - 30), 1));
    }
    ui.updateHud(state); // The HUD behind the modal shows this run's numbers.
    killPlayer();
    window.setTimeout(() => { window.__ember.ready = true; }, 1400);
  }
}

function updateShotMode(dt) {
  if (SHOT !== 'play' || window.__ember.ready) return;
  if (state.mode !== 'playing') return;
  shotElapsed += dt;
  if (shotElapsed >= 2.4 && !shotNovaDone) {
    shotNovaDone = true;
    castNova(state);
  }
  // Catch the nova ring mid-blast (it fades ~0.35s after casting).
  if (shotElapsed >= 2.62) window.__ember.ready = true;
}

// ------------------------------------------------------------------ boot

ui.showTitle(state.best);
ui.setMuted(false);
arrangeShot();
requestAnimationFrame(frame);
