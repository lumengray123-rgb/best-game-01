// The DOM layer: HUD bars and counters, the banner, the four screens, and
// the buttons. main.js drives it; this file only touches the document.

import { formatTime } from './rng.js';
import { upgradeLevelText } from './upgrades.js';

export class UI {
  constructor(callbacks) {
    this.cb = callbacks;
    this.el = {};
    for (const id of [
      'hud', 'hp-fill', 'hp-text', 'xp-fill', 'xp-text', 'level-text', 'timer',
      'surge-label', 'score-text', 'kills-text', 'dash-text', 'banner', 'vignette',
      'title', 'levelup', 'upgrade-cards', 'pause', 'gameover', 'final-stats',
      'best-line', 'best-title', 'mute-btn',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.lastHud = {};
    document.getElementById('start-btn').addEventListener('click', () => this.cb.onStart());
    document.getElementById('resume-btn').addEventListener('click', () => this.cb.onResume());
    document.getElementById('restart-btn-pause').addEventListener('click', () => this.cb.onRestart());
    document.getElementById('again-btn').addEventListener('click', () => this.cb.onRestart());
    this.el['mute-btn'].addEventListener('click', () => this.cb.onMute());
  }

  showTitle(best) {
    this.el.title.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.levelup.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.gameover.classList.add('hidden');
    this.el['best-title'].textContent = best.score > 0
      ? `Best run: ${best.score} score · ${formatTime(best.time)} · ${best.kills} slain`
      : 'No run yet — the night is waiting.';
  }

  showHud() {
    this.el.title.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.levelup.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.gameover.classList.add('hidden');
    this.lastHud = {};
  }

  showLevelUp(choices, player, onPick) {
    this.el.levelup.classList.remove('hidden');
    const container = this.el['upgrade-cards'];
    container.innerHTML = '';
    choices.forEach((upgrade, index) => {
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `
        <div class="card-icon">${upgrade.icon}</div>
        <div class="card-name">${upgrade.name}</div>
        <div class="card-level">${upgradeLevelText(upgrade, player)}</div>
        <div class="card-desc">${upgrade.desc(upgrade.levelOf(player))}</div>
        <div class="card-key">${index + 1}</div>`;
      card.addEventListener('click', () => onPick(index));
      container.appendChild(card);
    });
  }

  hideLevelUp() {
    this.el.levelup.classList.add('hidden');
  }

  showPause() {
    this.el.pause.classList.remove('hidden');
  }

  hidePause() {
    this.el.pause.classList.add('hidden');
  }

  showGameOver(state) {
    this.el.gameover.classList.remove('hidden');
    const rows = [
      ['TIME SURVIVED', formatTime(state.time)],
      ['HOLLOW SLAIN', String(state.kills)],
      ['LEVEL REACHED', String(state.level)],
      ['BOLTS FIRED', String(state.stats.boltsFired)],
      ['DASHES', String(state.stats.dashes)],
    ];
    this.el['final-stats'].innerHTML = rows.map(([label, value]) =>
      `<div class="row"><span>${label}</span><span>${value}</span></div>`).join('') +
      `<div class="row score-row"><span>FINAL SCORE</span><span>${Math.floor(state.score)}</span></div>`;
    this.el['best-line'].textContent = state.newBest
      ? '★ A new best run! The ember remembers.'
      : `Best: ${state.best.score} score · ${formatTime(state.best.time)}`;
  }

  setMuted(muted) {
    this.el['mute-btn'].classList.toggle('muted', muted);
    this.el['mute-btn'].textContent = muted ? '♪' : '♪';
  }

  flashVignette() {
    const vignette = this.el.vignette;
    vignette.classList.add('hurt');
    window.setTimeout(() => vignette.classList.remove('hurt'), 220);
  }

  // Refresh the HUD; each field only touches the DOM when it changed.
  updateHud(state) {
    const player = state.player;
    const set = (key, element, value) => {
      if (this.lastHud[key] !== value) {
        this.lastHud[key] = value;
        element.textContent = value;
      }
    };
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    const hpWidth = `${(hpRatio * 100).toFixed(1)}%`;
    if (this.lastHud.hpWidth !== hpWidth) {
      this.lastHud.hpWidth = hpWidth;
      this.el['hp-fill'].style.width = hpWidth;
    }
    set('hpText', this.el['hp-text'], `${Math.ceil(player.hp)} / ${player.maxHp}`);
    const xpRatio = Math.max(0, Math.min(1, state.xp / state.xpNext));
    const xpWidth = `${(xpRatio * 100).toFixed(1)}%`;
    if (this.lastHud.xpWidth !== xpWidth) {
      this.lastHud.xpWidth = xpWidth;
      this.el['xp-fill'].style.width = xpWidth;
    }
    set('xpText', this.el['xp-text'], `${state.xp} / ${state.xpNext}`);
    set('levelText', this.el['level-text'], `LV ${state.level}`);
    set('timer', this.el.timer, formatTime(state.time));
    set('surgeLabel', this.el['surge-label'], `NIGHT ${state.surgeNumber}`);
    set('scoreText', this.el['score-text'], String(Math.floor(state.score)));
    set('killsText', this.el['kills-text'], String(state.kills));
    const dash = player.dashReady ? 'READY' : `${player.dashTimer.toFixed(1)}s`;
    set('dashText', this.el['dash-text'], dash);
    this.el['dash-text'].className = player.dashReady ? 'ready' : 'cooling';

    if (state.bannerActive) {
      if (this.lastHud.banner !== state.bannerText) {
        this.lastHud.banner = state.bannerText;
        this.el.banner.textContent = state.bannerText;
        this.el.banner.classList.remove('hidden');
      }
    } else if (this.lastHud.banner !== '') {
      this.lastHud.banner = '';
      this.el.banner.classList.add('hidden');
    }
  }
}
