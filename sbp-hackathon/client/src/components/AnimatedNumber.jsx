import React, { useEffect, useState } from 'react';

export function AnimatedNumber({ value, formatter = (v) => v, duration = 450 }) {
  const [display, setDisplay] = useState(Number(value) || 0);

  useEffect(() => {
    const target = Number(value) || 0;
    const startVal = display;
    const startTime = performance.now();
    let raf;

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(startVal + (target - startVal) * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{formatter(display)}</>;
}
