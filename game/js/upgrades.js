// The level-up boons: each has a cap, a description that names what it does
// at the next level, and an apply step that grows the player's numbers.
// Choices are rolled from the pool the player can still improve.

export const UPGRADES = [
  {
    id: 'bolt-damage', name: 'Kindled Bolts', icon: '🔥', max: 5,
    desc: (lvl) => `Ember bolts deal +25% damage (now ${Math.round(12 * Math.pow(1.25, lvl))}).`,
    apply: (p) => { p.bolt.damage *= 1.25; },
    levelOf: (p) => p.boltDamageLvl || 0,
    track: (p) => { p.boltDamageLvl = (p.boltDamageLvl || 0) + 1; },
  },
  {
    id: 'bolt-rate', name: 'Rapid Flame', icon: '⚡', max: 5,
    desc: () => 'Bolts fire 18% faster.',
    apply: (p) => { p.bolt.fireInterval *= 0.85; },
    levelOf: (p) => p.boltRateLvl || 0,
    track: (p) => { p.boltRateLvl = (p.boltRateLvl || 0) + 1; },
  },
  {
    id: 'bolt-count', name: 'Split Ember', icon: '✦', max: 3,
    desc: (lvl) => `Fire ${2 + lvl} bolts at once instead of ${1 + lvl}.`,
    apply: (p) => { p.bolt.count += 1; },
    levelOf: (p) => p.bolt.count - 1,
    track: () => {},
  },
  {
    id: 'bolt-pierce', name: 'Piercing Light', icon: '➶', max: 3,
    desc: (lvl) => `Bolts pierce through ${lvl + 1} extra Hollow.`,
    apply: (p) => { p.bolt.pierce += 1; },
    levelOf: (p) => p.bolt.pierce,
    track: () => {},
  },
  {
    id: 'orbit', name: 'Ember Orbit', icon: '🪐', max: 4,
    desc: (lvl) => lvl === 0
      ? 'Summon an ember that circles you, burning all it touches.'
      : `Add another orbiting ember (${lvl + 2} total).`,
    apply: (p) => { p.orbit.count += 1; p.orbit.level += 1; },
    levelOf: (p) => p.orbit.level,
    track: () => {},
  },
  {
    id: 'orbit-damage', name: 'Burning Halo', icon: '☀️', max: 4,
    desc: () => 'Orbiting embers deal +30% damage.',
    requires: (p) => p.orbit.level >= 1,
    apply: (p) => { p.orbit.damage *= 1.3; },
    levelOf: (p) => p.orbitDamageLvl || 0,
    track: (p) => { p.orbitDamageLvl = (p.orbitDamageLvl || 0) + 1; },
  },
  {
    id: 'nova', name: 'Nova Blast', icon: '💥', max: 3,
    desc: (lvl) => lvl === 0
      ? 'Every 6.5s a ring of fire erupts from you, blasting the Hollow back.'
      : 'Nova recharges faster and reaches further.',
    apply: (p) => {
      p.nova.level += 1;
      p.nova.damage = Math.round(p.nova.damage * 1.35);
      p.nova.radius += 28;
      p.nova.cooldown = Math.max(3.2, p.nova.cooldown * 0.85);
    },
    levelOf: (p) => p.nova.level,
    track: () => {},
  },
  {
    id: 'vitality', name: 'Heart of Embers', icon: '❤️', max: 5,
    desc: () => '+25 max health, and heal 25 now.',
    apply: (p) => { p.maxHp += 25; p.heal(25); },
    levelOf: (p) => p.vitalityLvl || 0,
    track: (p) => { p.vitalityLvl = (p.vitalityLvl || 0) + 1; },
  },
  {
    id: 'regen', name: 'Slow Burn', icon: '🌿', max: 4,
    desc: () => 'Regenerate +0.9 HP every second.',
    apply: (p) => { p.regen += 0.9; },
    levelOf: (p) => p.regenLvl || 0,
    track: (p) => { p.regenLvl = (p.regenLvl || 0) + 1; },
  },
  {
    id: 'swift', name: 'Wind Stride', icon: '💨', max: 4,
    desc: () => 'Move 8% faster.',
    apply: (p) => { p.speed *= 1.08; },
    levelOf: (p) => p.swiftLvl || 0,
    track: (p) => { p.swiftLvl = (p.swiftLvl || 0) + 1; },
  },
  {
    id: 'magnet', name: 'Ember Call', icon: '🧲', max: 3,
    desc: () => 'Ember shards fly to you from 45% further away.',
    apply: (p) => { p.magnetRadius *= 1.45; },
    levelOf: (p) => p.magnetLvl || 0,
    track: (p) => { p.magnetLvl = (p.magnetLvl || 0) + 1; },
  },
  {
    id: 'crit', name: 'Killing Light', icon: '🎯', max: 4,
    desc: (lvl) => `+8% critical chance (now ${Math.round((0.05 + 0.08 * (lvl + 1)) * 100)}%).`,
    apply: (p) => { p.critChance += 0.08; },
    levelOf: (p) => p.critLvl || 0,
    track: (p) => { p.critLvl = (p.critLvl || 0) + 1; },
  },
  {
    id: 'dash', name: 'Flicker Step', icon: '👟', max: 3,
    desc: () => 'Dash recharges 20% faster.',
    apply: (p) => { p.dashCooldown *= 0.8; },
    levelOf: (p) => p.dashLvl || 0,
    track: (p) => { p.dashLvl = (p.dashLvl || 0) + 1; },
  },
];

// The fallback when the pool runs dry: always useful, always available.
const FEAST = {
  id: 'feast', name: 'Ember Feast', icon: '🍖', max: 99,
  desc: () => 'Heal 30 HP and bank 100 score.',
  apply: (p, state) => { p.heal(30); state.score += 100; },
  levelOf: () => 0,
  track: () => {},
};

// Roll three distinct choices the player can still take.
export function rollChoices(rng, player) {
  const available = UPGRADES.filter((u) => {
    if (u.levelOf(player) >= u.max) return false;
    if (u.requires && !u.requires(player)) return false;
    return true;
  });
  const picks = [];
  const pool = [...available];
  while (picks.length < 3 && pool.length > 0) {
    const index = Math.floor(rng.float() * pool.length);
    picks.push(pool.splice(index, 1)[0]);
  }
  while (picks.length < 3) picks.push(FEAST);
  return picks;
}

export function applyUpgrade(upgrade, player, state) {
  upgrade.apply(player, state);
  upgrade.track(player);
}

export function upgradeLevelText(upgrade, player) {
  const lvl = upgrade.levelOf(player);
  if (upgrade.id === 'feast') return 'BOON';
  return lvl === 0 ? 'NEW' : `LEVEL ${lvl + 1}`;
}
