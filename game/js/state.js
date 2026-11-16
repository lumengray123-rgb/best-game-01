// The run's shared state: mode, score, clock, entity lists, and the arena's
// constants. main.js owns the loop; the other modules read and mutate this.

export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;
export const WORLD_WIDTH = 2200;
export const WORLD_HEIGHT = 1400;
export const BEST_KEY = 'emberwarden-best';

export function xpForLevel(level) {
  return 5 + (level - 1) * 4 + Math.floor(Math.pow(level - 1, 1.5));
}

export function loadBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return { score: 0, time: 0, kills: 0 };
    const parsed = JSON.parse(raw);
    return {
      score: Number(parsed.score) || 0,
      time: Number(parsed.time) || 0,
      kills: Number(parsed.kills) || 0,
    };
  } catch {
    return { score: 0, time: 0, kills: 0 };
  }
}

export function saveBest(best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // Storage may be unavailable (private mode, sandbox); the run goes on.
  }
}

export class GameState {
  constructor() {
    this.mode = 'title'; // title | playing | levelup | paused | gameover
    this.time = 0;
    this.score = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpForLevel(1);
    this.player = null;
    this.enemies = [];
    this.bolts = [];
    this.enemyShots = [];
    this.gems = [];
    this.particles = [];
    this.texts = [];
    this.novas = [];
    this.orbitAngle = 0;
    this.spawnTimer = 0;
    this.surgeTimer = 60;
    this.surgeNumber = 1;
    this.bannerText = '';
    this.bannerUntil = 0;
    this.pendingLevels = 0;
    this.upgradeChoices = [];
    this.best = loadBest();
    this.newBest = false;
    this.muted = false;
    this.runSeed = 1;
    this.stats = { boltsFired: 0, damageDealt: 0, damageTaken: 0, dashes: 0 };
  }

  resetForRun(seed) {
    this.mode = 'playing';
    this.time = 0;
    this.score = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpForLevel(1);
    this.enemies = [];
    this.bolts = [];
    this.enemyShots = [];
    this.gems = [];
    this.particles = [];
    this.texts = [];
    this.novas = [];
    this.orbitAngle = 0;
    this.spawnTimer = 0.5;
    this.surgeTimer = 60;
    this.surgeNumber = 1;
    this.bannerText = '';
    this.bannerUntil = 0;
    this.pendingLevels = 0;
    this.upgradeChoices = [];
    this.newBest = false;
    this.runSeed = seed;
    this.stats = { boltsFired: 0, damageDealt: 0, damageTaken: 0, dashes: 0 };
  }

  // Grant XP; returns how many levels were gained.
  gainXp(amount) {
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level += 1;
      this.xpNext = xpForLevel(this.level);
      gained += 1;
    }
    this.pendingLevels += gained;
    return gained;
  }

  showBanner(text, seconds) {
    this.bannerText = text;
    this.bannerUntil = this.time + seconds;
  }

  get bannerActive() {
    return this.time < this.bannerUntil;
  }

  finishRun() {
    this.mode = 'gameover';
    this.score = Math.floor(this.score);
    const isBest = this.score > this.best.score;
    if (isBest) {
      this.best = { score: this.score, time: this.time, kills: this.kills };
      saveBest(this.best);
    }
    this.newBest = isBest;
  }
}
