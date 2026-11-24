(() => {
  'use strict';
  if (window.location.protocol !== 'mahjong:' || window.location.hostname !== 'app') return;
  window.__dieyingNativeApp = true;
  window.__dieyingNativeDiagnostics = true;
  const log = value => { try { window.webkit.messageHandlers.gameLog.postMessage(typeof value === 'string' ? value : JSON.stringify(value)); } catch {} };
  for (const level of ['error', 'warn']) {
    const original = console[level];
    console[level] = function(...args) {
      log('[' + level + '] ' + args.map(value => String(value?.message || value)).join(' '));
      original.apply(console, args);
    };
  }
  if (typeof document !== 'undefined') window.addEventListener('DOMContentLoaded', () => {
    let painted = false;
    requestAnimationFrame(() => { painted = true; log({event:'native-animation-frame',visibility:document.visibilityState}); });
    setTimeout(() => { if (!painted) log({event:'native-frame-pending',visibility:document.visibilityState}); }, 2000);
  });
  const initial = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('__INITIAL_STORAGE__'), c => c.charCodeAt(0))));
  const restoreTag = 'dieying:__RESTORE_TOKEN__';
  const shouldRestore = window.name !== restoreTag;
  window.name = restoreTag;
  const allowed = new Set(['mahjong-solitaire:v1', 'mahjong-solitaire:voice', 'mahjong-solitaire:tile-sounds', 'mahjong-math-workshop:v1', 'mahjong-math-workshop:v1:recovery', 'mahjong-math-workshop:sounds']);
  const send = payload => { try { window.webkit.messageHandlers.gameStore.postMessage(payload); } catch {} };
  let storage;
  try {
    storage = window.localStorage;
    const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem, clear = Storage.prototype.clear;
    // Native atomic saves are also a recovery copy if WebKit is interrupted.
    if (shouldRestore) for (const [key, value] of Object.entries(initial)) if (allowed.has(key)) set.call(storage, key, value);
    Storage.prototype.setItem = function(key, value) {
      set.call(this, key, value);
      if (this === storage && allowed.has(String(key))) send({key: String(key), value: String(value)});
    };
    Storage.prototype.removeItem = function(key) {
      remove.call(this, key);
      if (this === storage && allowed.has(String(key))) send({key: String(key), value: null});
    };
    Storage.prototype.clear = function() {
      clear.call(this);
      if (this === storage) for (const key of allowed) send({key, value: null});
    };
  } catch {
    const values = new Map(Object.entries(initial));
    storage = {
      getItem: key => values.get(String(key)) ?? null,
      setItem(key, value) { key = String(key); value = String(value); values.set(key, value); if (allowed.has(key)) send({key, value}); },
      removeItem(key) { key = String(key); values.delete(key); if (allowed.has(key)) send({key, value: null}); },
      clear() { values.clear(); for (const key of allowed) send({key, value: null}); },
      key: index => [...values.keys()][index] ?? null,
      get length() { return values.size; }
    };
    Object.defineProperty(window, 'localStorage', {value: storage});
  }
  window.__dieyingSaveSnapshot = () => Object.fromEntries([...allowed].flatMap(key => {
    const value = storage.getItem(key); return value === null ? [] : [[key, value]];
  }));
  window.addEventListener('pagehide', () => send({snapshot: window.__dieyingSaveSnapshot()}));
  window.addEventListener('error', event => {
    if (event.message) { try { window.webkit.messageHandlers.gameLog.postMessage(String(event.message)); } catch {} }
  });
  window.addEventListener('unhandledrejection', event => {
    try { window.webkit.messageHandlers.gameLog.postMessage(String(event.reason?.message || event.reason)); } catch {}
  });
})();
