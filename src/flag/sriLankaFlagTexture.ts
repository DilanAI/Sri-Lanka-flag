import * as THREE from 'three';
import officialFlagSvgRaw from '../assets/sri-lanka-flag.svg?raw';

/**
 * Enhances the official Sri Lanka flag SVG palette for rich, vivid color fidelity
 * under physically-based 3D lighting while preserving exact SLS 693 geometry.
 */
function getVibrantFlagSvg(): string {
  return officialFlagSvgRaw
    .replace(/#ffbe29/gi, '#FFD018')
    .replace(/#00534e/gi, '#00754A')
    .replace(/#eb7400/gi, '#FF7900')
    .replace(/#8d153a/gi, '#A8173E');
}

/**
 * Returns the vibrant 2:1 National Flag of Sri Lanka SVG markup.
 */
export function buildSriLankaFlagSvg(): string {
  return getVibrantFlagSvg();
}

/**
 * Overlays ultra-fine woven textile micro-threads onto the canvas without muting
 * pigment saturation.
 */
function applyWovenGrain(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.globalAlpha = 0.022;
  ctx.fillStyle = '#000000';
  for (let y = 0; y < height; y += 4) {
    ctx.fillRect(0, y, width, 1);
  }
  ctx.globalAlpha = 0.018;
  ctx.fillStyle = '#FFFFFF';
  for (let x = 0; x < width; x += 4) {
    ctx.fillRect(x, 0, 1, height);
  }
  ctx.restore();
}

/**
 * Creates the primary sRGB albedo CanvasTexture for the Sri Lanka National Flag
 * using the official SLS 693 vector specification with rich, colorful pigments.
 */
export function createSriLankaFlagTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Immediate synchronous base fill matching official 1200x600 proportions scaled to 2048x1024
  ctx.fillStyle = '#FFD018';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#00754A';
  ctx.fillRect(96, 96, 266, 832);
  ctx.fillStyle = '#FF7900';
  ctx.fillRect(362, 96, 266, 832);
  ctx.fillStyle = '#A8173E';
  ctx.fillRect(724, 96, 1228, 832);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(maxAnisotropy, 16);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  // Rasterize the vibrant SVG via Blob URL for full <use xlink:href> compatibility
  const svgBlob = new Blob([getVibrantFlagSvg()], { type: 'image/svg+xml;charset=utf-8' });
  const blobUrl = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    applyWovenGrain(ctx, width, height);
    texture.needsUpdate = true;
    URL.revokeObjectURL(blobUrl);
  };
  img.onerror = () => {
    URL.revokeObjectURL(blobUrl);
  };
  img.src = blobUrl;

  return texture;
}

/**
 * Creates a seamless procedural woven textile bump map for PBR micro-surface realism.
 */
export function createFabricWeaveBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  const step = 4;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const warp = (x / step + y / step) % 2 === 0;
      ctx.fillStyle = warp ? '#A4A4A4' : '#626262';
      ctx.fillRect(x, y, step - 1, step - 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(36, 18);
  texture.anisotropy = Math.min(maxAnisotropy, 8);
  texture.needsUpdate = true;
  return texture;
}
