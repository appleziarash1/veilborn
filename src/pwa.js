// iOS / mobile stability layer.
//
// Handles the things that break browser games on an iPhone when added to the
// Home Screen:
//   - audio context suspends when you switch apps or lock the phone
//   - the screen dims while you are mid-boss
//   - a new deploy reloading the page underneath a live run
//   - the safe-area insets not being reflected in the canvas size
//
// Imported once from main.js. Everything here is defensive: if a capability is
// missing it is skipped rather than throwing.
import { audio } from './audio.js';

let wakeLock = null;
let pausedByBackground = false;
const listeners = new Set();

export function onVisibilityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(hidden) {
  listeners.forEach((fn) => {
    try { fn(hidden); } catch (e) { console.warn('[VEILBORN] visibility handler failed', e); }
  });
}

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  if (wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    // Not permitted (e.g. low battery, not visible). Not fatal.
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    try { wakeLock.release(); } catch {}
    wakeLock = null;
  }
}

export function initPwa() {
  // --- visibility / app switching -------------------------------------
  document.addEventListener('visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden';
    if (hidden) {
      pausedByBackground = true;
      releaseWakeLock();
      // Suspend audio so iOS does not kill the context outright.
      if (audio.ctx && audio.ctx.state === 'running') {
        try { audio.ctx.suspend(); } catch {}
      }
    } else {
      acquireWakeLock();
      if (audio.ctx && audio.ctx.state === 'suspended') {
        audio.ctx.resume().catch(() => {});
      }
    }
    // Notify on both edges: listeners need to know the moment the app is
    // hidden (to pause gameplay), not just when it comes back.
    emit(hidden);
    if (!hidden) pausedByBackground = false;
  });

  // --- wake lock on first interaction (iOS 16.4+) ----------------------
  const firstGesture = () => { acquireWakeLock(); };
  window.addEventListener('pointerdown', firstGesture, { once: true });
  window.addEventListener('keydown', firstGesture, { once: true });

  // --- prevent accidental zoom / overscroll (iOS Safari) ---------------
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // --- service worker + update prompt ----------------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Relative to the document base so the SW is found under any deploy base.
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // --- rotate-to-landscape prompt ---------------------------------------
  // The manifest asks for landscape, but iOS ignores that for a tab or when the
  // user rotates back, so the overlay is driven by the actual viewport instead.
  // Touch-only: a narrow desktop window must keep working.
  const rotateEl = document.getElementById('rotate');
  const updateRotate = () => {
    if (!rotateEl) return;
    const portrait = window.innerHeight > window.innerWidth;
    const touch = (navigator.maxTouchPoints || 0) > 0;
    const narrow = Math.min(window.innerWidth, window.innerHeight) < 620;
    rotateEl.classList.toggle('show', portrait && touch && narrow);
  };
  updateRotate();
  window.addEventListener('resize', updateRotate);
  window.addEventListener('orientationchange', () => setTimeout(updateRotate, 120));

  // --- keep the canvas aligned with the visual viewport ----------------
  const resize = () => {
    // Phaser's Scale.FIT handles the canvas; this just nudges it after iOS
    // rotates or the URL bar collapses.
    window.dispatchEvent(new Event('resize'));
    updateRotate();
  };
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
  }
}
