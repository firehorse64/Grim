import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';
import { isMobileDevice } from '../systems/TouchDetect';

/**
 * TouchControlsScene – virtual joystick + interact button for mobile.
 * Simplified for the survival game: movement + interact + pause only.
 */
export interface TouchState {
  moveX: number;
  moveY: number;
  interact: boolean;
  pause: boolean;
}

export class TouchControlsScene extends Phaser.Scene {
  public touchState: TouchState = TouchControlsScene.emptyState();
  public visible: boolean = false;

  // Joystick
  private joyBase!: Phaser.GameObjects.Arc;
  private joyThumb!: Phaser.GameObjects.Arc;
  private joyActive: boolean = false;
  private joyPointerId: number = -1;
  private joyCenterX: number = 0;
  private joyCenterY: number = 0;
  private readonly JOY_RADIUS = 50;
  private readonly JOY_DEAD_ZONE = 8;

  // Buttons
  private interactBtn!: Phaser.GameObjects.Container;
  private interactActive: boolean = false;
  private pauseBtn!: Phaser.GameObjects.Container;
  private pauseActive: boolean = false;

  // Edge tracking
  private prevInteract = false;
  private prevPause = false;

  constructor() {
    super({ key: 'TouchControlsScene' });
  }

  static emptyState(): TouchState {
    return { moveX: 0, moveY: 0, interact: false, pause: false };
  }

  create(): void {
    if (!isMobileDevice()) {
      this.visible = false;
      return;
    }

    this.visible = true;
    this.input.addPointer(3);

    this.createJoystick();
    this.createButtons();

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.events.once('shutdown', this.cleanup, this);
    this.events.once('destroy', this.cleanup, this);
  }

  update(): void {
    if (!this.visible) return;
    this.buildTouchState();
  }

  private createJoystick(): void {
    const cx = 100;
    const cy = GAME_HEIGHT - 120;
    this.joyCenterX = cx;
    this.joyCenterY = cy;

    this.joyBase = this.add.circle(cx, cy, this.JOY_RADIUS + 10, 0x222244, 0.3)
      .setStrokeStyle(2, 0x444466, 0.5).setDepth(2000);
    this.joyThumb = this.add.circle(cx, cy, 24, 0x555577, 0.5)
      .setStrokeStyle(2, 0x8888aa, 0.6).setDepth(2001);
  }

  private createButtons(): void {
    const rightX = GAME_WIDTH - 80;
    const bottomY = GAME_HEIGHT - 100;

    // Interact button (large)
    this.interactBtn = this.add.container(rightX, bottomY).setDepth(2000);
    const iBg = this.add.circle(0, 0, 36, 0x33aa33, 0.4)
      .setStrokeStyle(2, 0x55cc55, 0.6);
    const iText = this.add.text(0, 0, 'E', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ccddcc', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.interactBtn.add([iBg, iText]);

    // Pause button (top-right)
    this.pauseBtn = this.add.container(GAME_WIDTH - 36, 36).setDepth(2000);
    const pBg = this.add.circle(0, 0, 18, 0x666688, 0.4)
      .setStrokeStyle(2, 0x8888aa, 0.6);
    const pText = this.add.text(0, 0, '||', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ccccdd', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.pauseBtn.add([pBg, pText]);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // Left half = joystick
    if (pointer.x < GAME_WIDTH / 2 && !this.joyActive) {
      this.joyActive = true;
      this.joyPointerId = pointer.id;
      this.joyCenterX = pointer.x;
      this.joyCenterY = pointer.y;
      this.joyBase.setPosition(this.joyCenterX, this.joyCenterY);
      this.joyThumb.setPosition(pointer.x, pointer.y);
      this.joyBase.setAlpha(0.5);
      return;
    }

    // Check interact button
    const iDist = Math.sqrt(
      (pointer.x - this.interactBtn.x) ** 2 + (pointer.y - this.interactBtn.y) ** 2,
    );
    if (iDist < 44) {
      this.interactActive = true;
      return;
    }

    // Check pause button
    const pDist = Math.sqrt(
      (pointer.x - this.pauseBtn.x) ** 2 + (pointer.y - this.pauseBtn.y) ** 2,
    );
    if (pDist < 30) {
      this.pauseActive = true;
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.joyActive && pointer.id === this.joyPointerId) {
      const dx = pointer.x - this.joyCenterX;
      const dy = pointer.y - this.joyCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = this.JOY_RADIUS;

      if (dist > maxDist) {
        const angle = Math.atan2(dy, dx);
        this.joyThumb.setPosition(
          this.joyCenterX + Math.cos(angle) * maxDist,
          this.joyCenterY + Math.sin(angle) * maxDist,
        );
      } else {
        this.joyThumb.setPosition(pointer.x, pointer.y);
      }
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joyPointerId) {
      this.joyActive = false;
      this.joyPointerId = -1;
      this.joyThumb.setPosition(this.joyCenterX, this.joyCenterY);
      this.joyBase.setAlpha(0.3);
    }
  }

  private buildTouchState(): void {
    let moveX = 0;
    let moveY = 0;

    if (this.joyActive) {
      const dx = this.joyThumb.x - this.joyCenterX;
      const dy = this.joyThumb.y - this.joyCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > this.JOY_DEAD_ZONE) {
        moveX = Math.max(-1, Math.min(1, dx / this.JOY_RADIUS));
        moveY = Math.max(-1, Math.min(1, dy / this.JOY_RADIUS));
      }
    }

    const curInteract = this.interactActive;
    const curPause = this.pauseActive;

    this.touchState = {
      moveX,
      moveY,
      interact: curInteract && !this.prevInteract,
      pause: curPause && !this.prevPause,
    };

    this.prevInteract = curInteract;
    this.prevPause = curPause;

    // Clear momentary
    this.interactActive = false;
    this.pauseActive = false;
  }

  private cleanup(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
  }

  public setControlsVisible(visible: boolean): void {
    if (!this.visible) return;
    this.joyBase?.setVisible(visible);
    this.joyThumb?.setVisible(visible);
    this.interactBtn?.setVisible(visible);
    this.pauseBtn?.setVisible(visible);
  }
}
