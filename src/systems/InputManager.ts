import Phaser from 'phaser';
import { InputState } from '../types/GameTypes';
import { isMobileDevice } from './TouchDetect';

/**
 * Unified input manager for keyboard and touch.
 * Produces a simple InputState each frame: movement, interact, pause.
 */
export class InputManager {
  public state: InputState = InputManager.emptyState();

  private keys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
  };

  private scene: Phaser.Scene;
  public isMobile: boolean;

  // Touch state (set externally by TouchControlsScene)
  public touchMoveX: number = 0;
  public touchMoveY: number = 0;
  public touchInteract: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.isMobile = isMobileDevice();
  }

  public init(): void {
    if (!this.scene.input.keyboard) return;

    this.keys = {
      w: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      up: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      left: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      e: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      esc: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
    };
  }

  public update(): void {
    const st = this.state;

    // Keyboard movement
    let mx = 0;
    let my = 0;

    if (this.keys) {
      if (this.keys.a.isDown || this.keys.left.isDown) mx -= 1;
      if (this.keys.d.isDown || this.keys.right.isDown) mx += 1;
      if (this.keys.w.isDown || this.keys.up.isDown) my -= 1;
      if (this.keys.s.isDown || this.keys.down.isDown) my += 1;
    }

    // Merge touch input
    if (this.isMobile) {
      if (this.touchMoveX !== 0) mx = this.touchMoveX;
      if (this.touchMoveY !== 0) my = this.touchMoveY;
    }

    st.moveX = mx;
    st.moveY = my;
    st.interact = (this.keys?.e.isDown ?? false) || this.touchInteract;
    st.cancel = false;
    st.pause = this.keys?.esc.isDown ?? false;
  }

  public static emptyState(): InputState {
    return {
      moveX: 0,
      moveY: 0,
      interact: false,
      cancel: false,
      pause: false,
    };
  }
}
