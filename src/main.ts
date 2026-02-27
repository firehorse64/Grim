import Phaser from 'phaser';
import { gameConfig } from './config';

const game = new Phaser.Game(gameConfig);

// Handle window visibility changes (pause/resume)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.scene.getScenes(true).forEach(scene => {
      if (scene.scene.key === 'GameScene') {
        scene.scene.pause();
      }
    });
  }
});

// Prevent default touch behaviors that interfere with gameplay
document.addEventListener('touchmove', (e) => {
  if (e.target instanceof HTMLCanvasElement) {
    e.preventDefault();
  }
}, { passive: false });

// Prevent double-tap zoom on mobile
document.addEventListener('dblclick', (e) => {
  e.preventDefault();
}, { passive: false });

// Prevent context menu on long press
document.addEventListener('contextmenu', (e) => {
  if (e.target instanceof HTMLCanvasElement) {
    e.preventDefault();
  }
});

export default game;
