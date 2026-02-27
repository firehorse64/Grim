import Phaser from 'phaser';
import { InputState } from '../types/GameTypes';
import { TouchState, TouchControlsScene } from '../scenes/TouchControlsScene';
import { isMobileDevice } from './TouchDetect';

/**
 * Wraps Phaser's keyboard/pointer AND virtual touch input into a single
 * InputState snapshot that is recalculated every frame.
 *
 * On mobile devices, merges the TouchControlsScene's virtual joystick
 * and buttons with any connected keyboard/mouse.
 */
export class InputManager {
  // ----------------------------------------------------------------
  // Public read-only state
  // ----------------------------------------------------------------
  public state: InputState = InputManager.emptyState();

  // ----------------------------------------------------------------
  // Phaser references (populated in init)
  // ----------------------------------------------------------------
  private scene!: Phaser.Scene;

  // Movement
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;

  // Actions
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyB!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  // Weapon slots (1-5)
  private slotKeys: Phaser.Input.Keyboard.Key[] = [];

  // ----------------------------------------------------------------
  // Edge detection helpers
  // ----------------------------------------------------------------
  private prevPause = false;
  private prevInteract = false;
  private prevGrenade = false;
  private prevBarricade = false;
  private prevReload = false;
  private prevSlots: boolean[] = [false, false, false, false, false];
  private prevJump = false;

  // ----------------------------------------------------------------
  // Touch controls reference
  // ----------------------------------------------------------------
  private touchScene: TouchControlsScene | null = null;
  private isMobile: boolean = false;

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  /** Bind to a Phaser scene. Call once during scene create(). */
  public init(scene: Phaser.Scene): void {
    this.scene = scene;
    this.isMobile = isMobileDevice();

    const kb = scene.input.keyboard!;

    // WASD
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    // Arrow keys
    this.cursorKeys = kb.createCursorKeys();

    // Actions
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyR = kb.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyQ = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyB = kb.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // Weapon slot keys 1-5
    this.slotKeys = [
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE),
    ];

    // Get reference to TouchControlsScene if it's running
    if (this.isMobile) {
      this.touchScene = scene.scene.get('TouchControlsScene') as TouchControlsScene;
    }
  }

  /**
   * Sample all input sources and rebuild `this.state`.
   * Call once per frame in scene update().
   */
  public update(): void {
    const pointer = this.scene.input.activePointer;

    // ---- Keyboard: Movement axes ----
    let moveX = 0;
    let moveY = 0;

    if (this.keyA.isDown || this.cursorKeys.left.isDown) moveX -= 1;
    if (this.keyD.isDown || this.cursorKeys.right.isDown) moveX += 1;
    if (this.keyW.isDown || this.cursorKeys.up.isDown) moveY -= 1;
    if (this.keyS.isDown || this.cursorKeys.down.isDown) moveY += 1;

    // ---- Aim (world-space mouse position) ----
    let aimX = pointer.worldX;
    let aimY = pointer.worldY;
    const aimAngle = 0;

    // ---- Shooting (mouse button held, only on non-mobile or if not touching joystick area) ----
    let shooting = false;
    if (!this.isMobile) {
      shooting = pointer.isDown;
    }

    // ---- "Just pressed" actions ----
    const curJump = this.keySpace.isDown;
    const curReload = this.keyR.isDown;
    const curInteract = this.keyE.isDown;
    const curGrenade = this.keyQ.isDown;
    const curBarricade = this.keyB.isDown;
    const curPause = this.keyEsc.isDown;

    let jumping = curJump && !this.prevJump;
    let reloading = curReload && !this.prevReload;
    let interact = curInteract && !this.prevInteract;
    let grenade = curGrenade && !this.prevGrenade;
    const barricade = curBarricade && !this.prevBarricade;
    let pause = curPause && !this.prevPause;

    // ---- Weapon slot (just pressed) ----
    let weaponSlot = -1;
    for (let i = 0; i < this.slotKeys.length; i++) {
      const cur = this.slotKeys[i].isDown;
      if (cur && !this.prevSlots[i]) {
        weaponSlot = i + 1;
      }
      this.prevSlots[i] = cur;
    }

    // ---- Climb ----
    let climbUp = this.keyW.isDown || this.cursorKeys.up.isDown;
    let climbDown = this.keyS.isDown || this.cursorKeys.down.isDown;

    // ---- Merge touch input ----
    if (this.isMobile && this.touchScene?.visible) {
      const ts = this.touchScene.touchState;

      // Joystick overrides keyboard movement (OR'd together)
      if (ts.moveX !== 0) moveX = ts.moveX;
      if (ts.moveY !== 0) moveY = ts.moveY;

      // Buttons (OR with keyboard)
      shooting = shooting || ts.shooting;
      jumping = jumping || ts.jumping;
      reloading = reloading || ts.reloading;
      interact = interact || ts.interact;
      grenade = grenade || ts.grenade;
      pause = pause || ts.pause;

      if (ts.weaponSlot !== -1) weaponSlot = ts.weaponSlot;

      climbUp = climbUp || ts.climbUp;
      climbDown = climbDown || ts.climbDown;
    }

    // ---- Commit snapshot ----
    this.state = {
      moveX,
      moveY,
      aimX,
      aimY,
      aimAngle,
      shooting,
      reloading,
      jumping,
      weaponSlot,
      interact,
      grenade,
      barricade,
      pause,
      climbUp,
      climbDown,
    };

    // ---- Save previous-frame state ----
    this.prevJump = curJump;
    this.prevReload = curReload;
    this.prevInteract = curInteract;
    this.prevGrenade = curGrenade;
    this.prevBarricade = curBarricade;
    this.prevPause = curPause;
  }

  // ----------------------------------------------------------------
  // Utility
  // ----------------------------------------------------------------

  public static emptyState(): InputState {
    return {
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      aimAngle: 0,
      shooting: false,
      reloading: false,
      jumping: false,
      weaponSlot: -1,
      interact: false,
      grenade: false,
      barricade: false,
      pause: false,
      climbUp: false,
      climbDown: false,
    };
  }

  public disable(): void {
    this.scene.input.keyboard?.disableGlobalCapture();
    this.state = InputManager.emptyState();
  }

  public enable(): void {
    this.scene.input.keyboard?.enableGlobalCapture();
  }

  public destroy(): void {
    this.scene.input.keyboard?.removeAllKeys(true);
    this.slotKeys = [];
  }
}
