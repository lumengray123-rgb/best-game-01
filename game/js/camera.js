// The camera follows the player across a world larger than the screen,
// clamped to the arena's edge, with a trauma-based screen shake.

import { clamp, lerp } from './rng.js';

export class Camera {
  constructor(viewWidth, viewHeight, worldWidth, worldHeight) {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.x = worldWidth / 2 - viewWidth / 2;
    this.y = worldHeight / 2 - viewHeight / 2;
    this.trauma = 0;
  }

  follow(targetX, targetY, dt) {
    const wantX = clamp(targetX - this.viewWidth / 2, 0, this.worldWidth - this.viewWidth);
    const wantY = clamp(targetY - this.viewHeight / 2, 0, this.worldHeight - this.viewHeight);
    const t = 1 - Math.pow(0.0001, dt);
    this.x = lerp(this.x, wantX, t);
    this.y = lerp(this.y, wantY, t);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }

  addShake(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  // Screen-space offset of the shake this frame.
  shakeOffset(time) {
    const mag = this.trauma * this.trauma * 14;
    return {
      x: Math.sin(time * 91.7) * mag,
      y: Math.cos(time * 113.3) * mag,
    };
  }

  // Convert screen coordinates to world coordinates.
  toWorld(screenX, screenY) {
    return { x: screenX + this.x, y: screenY + this.y };
  }
}
