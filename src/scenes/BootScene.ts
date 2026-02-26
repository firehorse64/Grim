// ============================================================
// BootScene - First scene that loads.
// Generates all procedural textures via AssetGenerator,
// shows a simple "Loading..." message, then transitions
// to PreloaderScene.
// ============================================================

import Phaser from 'phaser';
import { generateAllAssets } from '../systems/AssetGenerator';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';

export class BootScene extends Phaser.Scene {
  private loadingText!: Phaser.GameObjects.Text;
  private dotCount = 0;
  private dotTimer = 0;

  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    // Dark background
    this.cameras.main.setBackgroundColor('#0a0a1a');

    // Title text
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, 'GRIM LINE', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#aa3333',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Loading text with animated dots
    this.loadingText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, 'Generating assets...', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#666677',
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, 'Preparing the wasteland', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#444455',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Use a short delay so the loading text renders before we block
    // the main thread with texture generation
    this.time.delayedCall(100, () => {
      this.generateAssets();
    });
  }

  update(_time: number, delta: number): void {
    // Animate the loading dots
    this.dotTimer += delta;
    if (this.dotTimer >= 400) {
      this.dotTimer = 0;
      this.dotCount = (this.dotCount + 1) % 4;
      const dots = '.'.repeat(this.dotCount);
      this.loadingText.setText(`Generating assets${dots}`);
    }
  }

  private generateAssets(): void {
    try {
      // Generate all procedural textures
      generateAllAssets(this);

      // Brief pause so the user sees the loading screen
      this.time.delayedCall(300, () => {
        this.scene.start('PreloaderScene');
      });
    } catch (error) {
      console.error('Asset generation failed:', error);
      this.loadingText.setText('Error generating assets!');
      this.loadingText.setColor('#cc3333');
    }
  }
}
