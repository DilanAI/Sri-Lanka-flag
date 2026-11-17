/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { FlagSceneController } from './flag/FlagScene';
import { buildSriLankaFlagSvg } from './flag/sriLankaFlagTexture';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const [webglUnavailable, setWebglUnavailable] = useState<boolean>(false);

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    try {
      const controller = new FlagSceneController(
        mountEl,
        {
          windSpeed: 1.2,
          isPlaying: true,
          skyPreset: 'daylight',
          fabricPreset: 'silk',
          reducedMotion,
        },
        (lost) => setWebglUnavailable(lost)
      );

      return () => {
        controller.dispose();
      };
    } catch {
      setWebglUnavailable(true);
    }
  }, [reducedMotion]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0B111B] select-none">
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="National Flag of Sri Lanka"
      />

      {webglUnavailable && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-[#0E1B2E]">
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildSriLankaFlagSvg())}`}
            alt="National Flag of Sri Lanka"
            className="w-full max-w-4xl h-auto block shadow-2xl"
          />
        </div>
      )}
    </main>
  );
}
