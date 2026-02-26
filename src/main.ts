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

export default game;
