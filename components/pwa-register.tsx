'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // Installation is an enhancement; the live web experience remains usable.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
