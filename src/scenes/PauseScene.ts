import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';
import { isMobileDevice } from '../systems/TouchDetect';

/**
 * PauseScene - Overlay displayed when the game is paused.
 *
 * Options: RESUME, SETTINGS, SAVE & QUIT.
 * ESC or P to resume. Clicking Resume also resumes the GameScene.
 */
export class PauseScene extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Rectangle;
  private titleText!: Phaser.GameObjects.Text;
  private buttons: Phaser.GameObjects.Container[] = [];
  private selectedIndex: number = 0;

  // Input
  private escKey!: Phaser.Input.Keyboard.Key;
  private pKey!: Phaser.Input.Keyboard.Key;
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private wKey!: Phaser.Input.Keyboard.Key;
  private sKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'PauseScene' });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  create(): void {
    this.createOverlay();
    this.createTitle();
    this.createButtons();
    this.createInput();

    // Slight fade-in
    this.overlay.setAlpha(0);
    this.tweens.add({
      targets: this.overlay,
      alpha: 0.7,
      duration: 200,
    });
  }

  update(): void {
    this.handleInput();
  }

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------

  private createOverlay(): void {
    this.overlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0x000000, 0.7
    ).setDepth(0);
  }

  private createTitle(): void {
    this.titleText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 120, 'PAUSED', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '56px',
      color: '#ccccdd',
      fontStyle: 'bold',
      stroke: '#111122',
      strokeThickness: 3,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#000000',
        blur: 10,
        fill: true,
        stroke: false,
      },
    })
      .setOrigin(0.5, 0.5)
      .setDepth(10);
  }

  private createButtons(): void {
    const centerX = GAME_WIDTH / 2;
    const startY = GAME_HEIGHT / 2 - 20;
    const mobile = isMobileDevice();
    const btnW = mobile ? 300 : 240;
    const btnH = mobile ? 52 : 42;

    const buttonDefs: { label: string; action: () => void }[] = [
      { label: 'RESUME', action: () => this.resumeGame() },
      { label: 'SETTINGS', action: () => this.openSettings() },
      { label: 'SAVE & QUIT', action: () => this.saveAndQuit() },
    ];

    for (let i = 0; i < buttonDefs.length; i++) {
      const def = buttonDefs[i];
      const y = startY + i * (btnH + 14);

      const container = this.add.container(centerX, y).setDepth(10);

      const bg = this.add.rectangle(0, 0, btnW, btnH, 0x111122, 0.8)
        .setStrokeStyle(1, 0x444466);

      const text = this.add.text(0, 0, def.label, {
        fontFamily: '"Courier New", monospace',
        fontSize: mobile ? '20px' : '18px',
        color: '#ccccdd',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5);

      container.add([bg, text]);
      container.setSize(btnW, btnH);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-btnW / 2, -btnH / 2, btnW, btnH),
        Phaser.Geom.Rectangle.Contains
      );

      container.on('pointerover', () => {
        this.selectButton(i);
      });

      container.on('pointerdown', () => {
        def.action();
      });

      this.buttons.push(container);
    }

    this.selectButton(0);
  }

  private selectButton(index: number): void {
    for (let i = 0; i < this.buttons.length; i++) {
      const container = this.buttons[i];
      const bg = container.getAt(0) as Phaser.GameObjects.Rectangle;
      const text = container.getAt(1) as Phaser.GameObjects.Text;

      if (i === index) {
        bg.setFillStyle(0x1a1a33, 1);
        bg.setStrokeStyle(2, 0x6688cc);
        text.setColor('#88aaff');
        text.setScale(1.05);
      } else {
        bg.setFillStyle(0x111122, 0.8);
        bg.setStrokeStyle(1, 0x444466);
        text.setColor('#ccccdd');
        text.setScale(1);
      }
    }
    this.selectedIndex = index;
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------

  private createInput(): void {
    const kb = this.input.keyboard!;
    this.escKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.pKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.upKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.wKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.sKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.enterKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  private handleInput(): void {
    // Resume on ESC or P
    if (Phaser.Input.Keyboard.JustDown(this.escKey) || Phaser.Input.Keyboard.JustDown(this.pKey)) {
      this.resumeGame();
      return;
    }

    // Navigate
    if (Phaser.Input.Keyboard.JustDown(this.upKey) || Phaser.Input.Keyboard.JustDown(this.wKey)) {
      let newIndex = this.selectedIndex - 1;
      if (newIndex < 0) newIndex = this.buttons.length - 1;
      this.selectButton(newIndex);
    }

    if (Phaser.Input.Keyboard.JustDown(this.downKey) || Phaser.Input.Keyboard.JustDown(this.sKey)) {
      let newIndex = this.selectedIndex + 1;
      if (newIndex >= this.buttons.length) newIndex = 0;
      this.selectButton(newIndex);
    }

    // Confirm
    if (Phaser.Input.Keyboard.JustDown(this.enterKey) || Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.activateButton(this.selectedIndex);
    }
  }

  private activateButton(index: number): void {
    switch (index) {
      case 0:
        this.resumeGame();
        break;
      case 1:
        this.openSettings();
        break;
      case 2:
        this.saveAndQuit();
        break;
    }
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  private resumeGame(): void {
    this.scene.stop();

    const gameScene = this.scene.get('GameScene');
    if (gameScene) {
      gameScene.scene.resume();
    }

    EventBus.emit('game:resumed');
  }

  private openSettings(): void {
    // Emit event for a settings handler
    EventBus.emit('open-settings');
  }

  private saveAndQuit(): void {
    // Ask GameScene to save
    const gameScene = this.scene.get('GameScene') as any;
    if (gameScene?.saveGame) {
      gameScene.saveGame();
    }

    // Stop game, HUD, and touch controls scenes
    this.scene.stop('GameScene');
    this.scene.stop('HudScene');
    this.scene.stop('TouchControlsScene');
    this.scene.stop();

    // Go to menu
    this.scene.start('MenuScene');
  }
}
