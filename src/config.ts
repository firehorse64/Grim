import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './data/BalanceConstants';

import { BootScene } from './scenes/BootScene';
import { PreloaderScene } from './scenes/PreloaderScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { PauseScene } from './scenes/PauseScene';
import { GameOverScene } from './scenes/GameOverScene';
import { TouchControlsScene } from './scenes/TouchControlsScene';
import { InventoryScene } from './scenes/InventoryScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    PreloaderScene,
    MenuScene,
    GameScene,
    HudScene,
    PauseScene,
    GameOverScene,
    TouchControlsScene,
    InventoryScene,
  ],
  render: {
    antialias: false,
    pixelArt: true,
    roundPixels: true,
  },
  input: {
    keyboard: true,
    mouse: true,
    touch: true,
  },
};
