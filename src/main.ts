import { GameEngine } from './engine/GameEngine';

const engine = new GameEngine();
engine.init().catch(console.error);

// Prevent default touch behaviors on mobile
document.addEventListener('touchmove', (e) => {
  if (e.target instanceof HTMLCanvasElement) {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', (e) => {
  if (e.target instanceof HTMLCanvasElement) e.preventDefault();
});
