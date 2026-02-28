// ============================================================
// PreloaderScene - Shows a progress bar for future real asset
// loading. Currently acts as a transition with a visual
// loading bar animation before entering the MenuScene.
// ============================================================

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';

export class PreloaderScene extends Phaser.Scene {
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;
  private loadingText!: Phaser.GameObjects.Text;
  private percentText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private progress = 0;

  constructor() {
    super({ key: 'PreloaderScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0a1a');

    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    const barWidth = 320;
    const barHeight = 24;
    const barX = centerX - barWidth / 2;
    const barY = centerY;

    // Title
    this.add.text(centerX, centerY - 80, 'GRIM LINE', {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#aa3333',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Loading label
    this.loadingText = this.add.text(centerX, barY - 20, 'Loading...', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#888899',
    }).setOrigin(0.5);

    // Progress bar background (dark frame)
    this.progressBox = this.add.graphics();
    this.progressBox.fillStyle(0x111122, 0.9);
    this.progressBox.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
    // Border
    this.progressBox.lineStyle(1, 0x333344, 0.8);
    this.progressBox.strokeRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
    // Inner shadow
    this.progressBox.fillStyle(0x0a0a12, 0.5);
    this.progressBox.fillRect(barX, barY, barWidth, barHeight);

    // Progress bar fill (drawn dynamically)
    this.progressBar = this.add.graphics();

    // Percentage text
    this.percentText = this.add.text(centerX, barY + barHeight / 2, '0%', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ccccdd',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Status text (what's currently loading)
    this.statusText = this.add.text(centerX, barY + barHeight + 20, 'Initializing...', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#555566',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Decorative corner marks
    const cornerColor = 0x333344;
    const cornerAlpha = 0.4;
    const cornerLen = 12;
    const cg = this.add.graphics();
    cg.lineStyle(1, cornerColor, cornerAlpha);
    // Top-left
    cg.beginPath(); cg.moveTo(barX - 8, barY - 8); cg.lineTo(barX - 8, barY - 8 - cornerLen); cg.strokePath();
    cg.beginPath(); cg.moveTo(barX - 8, barY - 8); cg.lineTo(barX - 8 + cornerLen, barY - 8); cg.strokePath();
    // Top-right
    cg.beginPath(); cg.moveTo(barX + barWidth + 8, barY - 8); cg.lineTo(barX + barWidth + 8, barY - 8 - cornerLen); cg.strokePath();
    cg.beginPath(); cg.moveTo(barX + barWidth + 8, barY - 8); cg.lineTo(barX + barWidth + 8 - cornerLen, barY - 8); cg.strokePath();
    // Bottom-left
    cg.beginPath(); cg.moveTo(barX - 8, barY + barHeight + 8); cg.lineTo(barX - 8, barY + barHeight + 8 + cornerLen); cg.strokePath();
    cg.beginPath(); cg.moveTo(barX - 8, barY + barHeight + 8); cg.lineTo(barX - 8 + cornerLen, barY + barHeight + 8); cg.strokePath();
    // Bottom-right
    cg.beginPath(); cg.moveTo(barX + barWidth + 8, barY + barHeight + 8); cg.lineTo(barX + barWidth + 8, barY + barHeight + 8 + cornerLen); cg.strokePath();
    cg.beginPath(); cg.moveTo(barX + barWidth + 8, barY + barHeight + 8); cg.lineTo(barX + barWidth + 8 - cornerLen, barY + barHeight + 8); cg.strokePath();

    // Simulate loading progress with tween
    // In production, this would hook into Phaser's actual load events
    this.simulateLoading(barX, barY, barWidth, barHeight);
  }

  private simulateLoading(
    barX: number, barY: number,
    barWidth: number, barHeight: number
  ): void {
    const statusMessages = [
      'Initializing systems...',
      'Loading train configuration...',
      'Stocking supply crates...',
      'Scanning the wasteland...',
      'Boarding up windows...',
      'Checking fuel levels...',
      'Lighting the stove...',
      'Ready.',
    ];

    // Animate progress from 0 to 1
    this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: 1800,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        this.progress = (tween.getValue() as number) / 100;

        // Update bar
        this.progressBar.clear();

        // Fill gradient effect
        const fillWidth = barWidth * this.progress;
        if (fillWidth > 0) {
          // Dark red base
          this.progressBar.fillStyle(0x881111, 0.9);
          this.progressBar.fillRect(barX, barY, fillWidth, barHeight);

          // Lighter red highlight on top half
          this.progressBar.fillStyle(0xcc2222, 0.4);
          this.progressBar.fillRect(barX, barY, fillWidth, barHeight / 2);

          // Bright edge at the leading edge
          if (fillWidth > 2) {
            this.progressBar.fillStyle(0xff4444, 0.6);
            this.progressBar.fillRect(barX + fillWidth - 2, barY, 2, barHeight);
          }

          // Gloss/shine strip
          this.progressBar.fillStyle(0xffffff, 0.06);
          this.progressBar.fillRect(barX, barY + 2, fillWidth, 4);
        }

        // Update percentage text
        const pct = Math.floor(this.progress * 100);
        this.percentText.setText(`${pct}%`);

        // Update status message
        const msgIndex = Math.min(
          Math.floor(this.progress * statusMessages.length),
          statusMessages.length - 1
        );
        this.statusText.setText(statusMessages[msgIndex]);
      },
      onComplete: () => {
        this.percentText.setText('100%');
        this.statusText.setText('Ready.');
        this.loadingText.setText('Complete');

        // Brief pause then transition
        this.time.delayedCall(500, () => {
          this.cameras.main.fadeOut(400, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('MenuScene');
          });
        });
      },
    });
  }
}
