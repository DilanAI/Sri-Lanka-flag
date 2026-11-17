import officialFlagSvgRaw from '../assets/sri-lanka-flag.svg?raw';

const ESCAPED_SVG = officialFlagSvgRaw.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

export const NEXTJS_COMPONENT_CODE = `'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const SRI_LANKA_FLAG_SVG = \`${ESCAPED_SVG}\`;

function createSriLankaFlagTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Immediate synchronous base fill matching official 1200x600 proportions
  ctx.fillStyle = '#FFBE29';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#00534E';
  ctx.fillRect(96, 96, 266, 832);
  ctx.fillStyle = '#EB7400';
  ctx.fillRect(362, 96, 266, 832);
  ctx.fillStyle = '#8D153A';
  ctx.fillRect(724, 96, 1228, 832);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const blob = new Blob([SRI_LANKA_FLAG_SVG], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    texture.needsUpdate = true;
    URL.revokeObjectURL(url);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;

  return texture;
}

export default function SriLankaFlag3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [windSpeed, setWindSpeed] = useState(1.2);
  const windRef = useRef(windSpeed);
  windRef.current = windSpeed;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f1f38');

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0.3, 1.1, 5.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const sun = new THREE.DirectionalLight(0xfff5e0, 2.4);
    sun.position.set(5, 8, 6);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x9cd2ff, 0x222a33, 1.0));

    // Ceremonial Steel Mast
    const poleGeo = new THREE.CylinderGeometry(0.045, 0.06, 5.5, 24);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 0.85, roughness: 0.25 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(-2.06, 0.0, 0);
    scene.add(pole);

    // Waving 2:1 Sri Lanka Flag Mesh
    const flagGeo = new THREE.PlaneGeometry(4.0, 2.0, 96, 48);
    const basePos = new Float32Array(flagGeo.attributes.position.array);
    const flagTex = createSriLankaFlagTexture();
    const flagMat = new THREE.MeshPhysicalMaterial({
      map: flagTex,
      roughness: 0.48,
      sheen: 0.8,
      side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(0, 1.35, 0);
    scene.add(flag);

    const clock = new THREE.Clock();
    let frameId = 0;

    const animate = () => {
      const t = clock.getElapsedTime();
      const wind = windRef.current;
      const pos = flagGeo.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;

      for (let i = 0; i < pos.count; i++) {
        const idx = i * 3;
        const bx = basePos[idx];
        const by = basePos[idx + 1];
        const u = (bx + 2.0) * 0.25;
        const v = (by + 1.0) * 0.5;
        const env = Math.pow(u, 1.15);
        const speed = 2.1 + wind * 1.45;
        const amp = 0.16 + wind * 0.14;

        const z =
          (Math.sin(u * 6.4 - t * speed + v * 1.15) * amp +
            Math.sin(u * 12.2 - t * speed * 1.55 - v * 2.4) * amp * 0.28) *
          env;
        const sag = -Math.max(0.02, 0.24 - wind * 0.1) * Math.pow(u, 1.5);

        arr[idx] = bx - Math.abs(z) * 0.1 * u;
        arr[idx + 1] = by + sag;
        arr[idx + 2] = z;
      }

      pos.needsUpdate = true;
      flagGeo.computeVertexNormals();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      flagGeo.dispose();
      flagMat.dispose();
      flagTex.dispose();
      poleGeo.dispose();
      poleMat.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#0f1f38]">
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-950/90 border border-white/15 rounded-xl px-5 py-3 text-white">
        <label className="text-sm font-medium" htmlFor="wind">
          Wind Speed: {windSpeed.toFixed(1)}x
        </label>
        <input
          id="wind"
          type="range"
          min={0.2}
          max={2.4}
          step={0.1}
          value={windSpeed}
          onChange={(e) => setWindSpeed(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
`;

export const NEXTJS_PAGE_CODE = `import SriLankaFlag3D from '@/components/SriLankaFlag3D';

export default function HomePage() {
  return (
    <main className="min-h-screen w-full overflow-hidden">
      <SriLankaFlag3D />
    </main>
  );
}
`;
