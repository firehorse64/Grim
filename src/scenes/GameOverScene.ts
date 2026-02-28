import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';
import { isMobileDevice } from '../systems/TouchDetect';

interface GameOverData {
  message?: string;
}

/**
 * GameOverScene – shown when the player dies from starvation/exhaustion.
 */
export class GameOverScene extends Phaser.Scene {
  private message: string = "You didn't survive...";

  // UI
  private overlay!: Phaser.GameObjects.Rectangle;
  private redTint!: Phaser.GameObjects.Rectangle;
  private titleText!: Phaser.GameObjects.Text;
  private restartPrompt!: Phaser.GameObjects.Text;
  private menuButton!: Phaser.GameObjects.Container;

  // Blood drips
  private dripGraphics!: Phaser.GameObjects.Graphics;
  private drips: { x: number; y: number; speed: number; length: number }[] = [];

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: GameOverData): void {
    this.message = data?.message ?? "You didn't survive...";
  }

  create(): void {
    // Dark overlay
    this.overlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0,
    ).setDepth(0);

    this.redTint = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x330000, 0,
    ).setDepth(1);

    this.tweens.add({ targets: this.overlay, alpha: 0.8, duration: 600 });
    this.tweens.add({ targets: this.redTint, alpha: 0.25, duration: 800, delay: 200 });

    // Blood drips
    this.dripGraphics = this.add.graphics().setDepth(2);
    this.drips = [];
    for (let i = 0; i < 30; i++) {
      this.drips.push({
        x: Math.random() * GAME_WIDTH,
        y: -Math.random() * GAME_HEIGHT * 0.3,
        speed: 20 + Math.random() * 40,
        length: 15 + Math.random() * 40,
      });
    }

    // Title
    this.titleText = this.add.text(GAME_WIDTH / 2, 160, this.message, {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '48px',
      color: '#cc0000',
      fontStyle: 'bold',
      stroke: '#220000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10).setAlpha(0);

    this.tweens.add({
      targets: this.titleText,
      alpha: 1,
      scale: { from: 1.5, to: 1 },
      duration: 600,
      delay: 300,
      ease: 'Back.easeOut',
    });

    // Subtitle
    this.add.text(GAME_WIDTH / 2, 240, 'The train moves on without you.', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#886666',
    }).setOrigin(0.5).setDepth(10);

    // Restart prompt
    const promptText = isMobileDevice() ? 'TAP TO RESTART' : 'PRESS R TO RESTART';
    this.restartPrompt = this.add.text(GAME_WIDTH / 2, 360, promptText, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#888899',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10).setAlpha(0);

    this.tweens.add({
      targets: this.restartPrompt,
      alpha: 1,
      duration: 400,
      delay: 2000,
      onComplete: () => {
        this.tweens.add({
          targets: this.restartPrompt,
          alpha: { from: 1, to: 0.4 },
          yoyo: true,
          repeat: -1,
          duration: 800,
        });
      },
    });

    // Menu button
    const mobile = isMobileDevice();
    const btnW = mobile ? 280 : 220;
    const btnH = mobile ? 48 : 38;
    this.menuButton = this.add.container(GAME_WIDTH / 2, 430).setDepth(10).setAlpha(0);
    const bg = this.add.rectangle(0, 0, btnW, btnH, 0x111122, 0.8).setStrokeStyle(1, 0x444466);
    const text = this.add.text(0, 0, 'RETURN TO MENU', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#888899',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.menuButton.add([bg, text]);
    this.menuButton.setSize(btnW, btnH);
    this.menuButton.setInteractive(
      new Phaser.Geom.Rectangle(-btnW / 2, -btnH / 2, btnW, btnH),
      Phaser.Geom.Rectangle.Contains,
    );
    this.menuButton.on('pointerdown', () => this.returnToMenu());

    this.tweens.add({ targets: this.menuButton, alpha: 1, duration: 400, delay: 2200 });

    // Input
    const kb = this.input.keyboard!;
    kb.on('keydown-R', () => this.restartGame());
    this.time.delayedCall(2500, () => {
      this.restartPrompt.setInteractive();
      this.restartPrompt.on('pointerdown', () => this.restartGame());
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.dripGraphics.clear();
    for (const drip of this.drips) {
      drip.y += drip.speed * dt;
      if (drip.y > GAME_HEIGHT + drip.length) {
        drip.y = -drip.length - Math.random() * 100;
        drip.x = Math.random() * GAME_WIDTH;
      }
      this.dripGraphics.lineStyle(2, 0x880000, 0.3);
      this.dripGraphics.beginPath();
      this.dripGraphics.moveTo(drip.x, drip.y);
      this.dripGraphics.lineTo(drip.x, drip.y + drip.length);
      this.dripGraphics.strokePath();
      this.dripGraphics.fillStyle(0xaa0000, 0.5);
      this.dripGraphics.fillCircle(drip.x, drip.y + drip.length, 1.5);
    }
  }

  private restartGame(): void {
    this.scene.stop('HudScene');
    this.scene.stop('TouchControlsScene');
    this.scene.stop('GameScene');
    this.scene.stop();
    this.scene.start('GameScene', { newGame: true });
  }

  private returnToMenu(): void {
    this.scene.stop('HudScene');
    this.scene.stop('TouchControlsScene');
    this.scene.stop('GameScene');
    this.scene.stop();
    this.scene.start('MenuScene');
  }
}
