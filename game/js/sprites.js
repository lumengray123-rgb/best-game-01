// Pre-rendered glow sprites: drawing a soft radial gradient once to an
// offscreen canvas and blitting it is far cheaper than shadowBlur per entity.

const cache = new Map();

export function glowSprite(color, size = 64) {
  const key = `${color}|${size}`;
  let sprite = cache.get(key);
  if (sprite) return sprite;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.25, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  cache.set(key, canvas);
  return canvas;
}

// Draw a glow sprite centered at (x, y) with the given diameter.
export function drawGlow(ctx, color, x, y, diameter, alpha = 1) {
  const sprite = glowSprite(color);
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - diameter / 2, y - diameter / 2, diameter, diameter);
  ctx.globalAlpha = 1;
}
