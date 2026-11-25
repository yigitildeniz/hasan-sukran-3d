import { Game } from './game/Game';

const appEl = document.getElementById('app');
const hudEl = document.getElementById('hud-root');

if (!appEl || !hudEl) {
  throw new Error('Missing #app or #hud-root mount elements in index.html');
}

new Game(appEl, hudEl);
