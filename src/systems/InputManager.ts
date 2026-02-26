import Phaser from 'phaser';
import { InputState } from '../types/GameTypes';

/**
 * Wraps Phaser's keyboard and pointer input into a single InputState
 * snapshot that is recalculated every frame. Any system or entity can
 * read `InputManager.state` without coupling directly to Phaser input
 * objects.
 *
 * Usage:
 *   const input = new InputManager();
 *   input.init(scene);          // call once in scene create()
 *   input.update();             // call every frame in scene update()
 *   const s = input.state;      // read-only snapshot
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
  // Helpers for "just pressed" tracking on specific keys so we can
  // convert Phaser's continuous isDown into single-fire triggers
  // where appropriate (pause, interact, grenade, barricade, reload,
  // weapon switch).
  // ----------------------------------------------------------------
  private prevPause = false;
  private prevInteract = false;
  private prevGrenade = false;
  private prevBarricade = false;
  private prevReload = false;
  private prevSlots: boolean[] = [false, false, false, false, false];
  private prevJump = false;

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  /** Bind to a Phaser scene. Call once during scene create(). */
  public init(scene: Phaser.Scene): void {
    this.scene = scene;

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
  }

  /**
   * Sample all input sources and rebuild `this.state`.
   * Call once per frame in scene update().
   */
  public update(): void {
    const pointer = this.scene.input.activePointer;

    // ---- Movement axes ----
    let moveX = 0;
    let moveY = 0;

    if (this.keyA.isDown || this.cursorKeys.left.isDown) moveX -= 1;
    if (this.keyD.isDown || this.cursorKeys.right.isDown) moveX += 1;
    if (this.keyW.isDown || this.cursorKeys.up.isDown) moveY -= 1;
    if (this.keyS.isDown || this.cursorKeys.down.isDown) moveY += 1;

    // ---- Aim (world-space mouse position) ----
    const aimX = pointer.worldX;
    const aimY = pointer.worldY;

    // We don't compute aimAngle here because it depends on the player
    // position. Instead we store 0 and let the consumer derive it.
    // However for convenience we can default to pointing right.
    const aimAngle = 0;

    // ---- Shooting (mouse button held) ----
    const shooting = pointer.isDown;

    // ---- "Just pressed" actions (fire on press edge, not hold) ----
    const curJump = this.keySpace.isDown;
    const curReload = this.keyR.isDown;
    const curInteract = this.keyE.isDown;
    const curGrenade = this.keyQ.isDown;
    const curBarricade = this.keyB.isDown;
    const curPause = this.keyEsc.isDown;

    const jumping = curJump && !this.prevJump;
    const reloading = curReload && !this.prevReload;
    const interact = curInteract && !this.prevInteract;
    const grenade = curGrenade && !this.prevGrenade;
    const barricade = curBarricade && !this.prevBarricade;
    const pause = curPause && !this.prevPause;

    // ---- Weapon slot (just pressed) ----
    let weaponSlot = -1; // -1 = no switch requested
    for (let i = 0; i < this.slotKeys.length; i++) {
      const cur = this.slotKeys[i].isDown;
      if (cur && !this.prevSlots[i]) {
        weaponSlot = i + 1; // slots are 1-based
      }
      this.prevSlots[i] = cur;
    }

    // ---- Climb (continuous hold is fine) ----
    const climbUp = this.keyW.isDown || this.cursorKeys.up.isDown;
    const climbDown = this.keyS.isDown || this.cursorKeys.down.isDown;

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

    // ---- Save previous-frame state for edge detection ----
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

  /**
   * Returns a neutral InputState where nothing is pressed.
   */
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

  /**
   * Temporarily disable all keyboard capture (useful when opening
   * text inputs or overlays).
   */
  public disable(): void {
    this.scene.input.keyboard?.disableGlobalCapture();
    this.state = InputManager.emptyState();
  }

  /**
   * Re-enable keyboard capture after a disable() call.
   */
  public enable(): void {
    this.scene.input.keyboard?.enableGlobalCapture();
  }

  /**
   * Clean up all keys. Call in scene shutdown.
   */
  public destroy(): void {
    this.scene.input.keyboard?.removeAllKeys(true);
    this.slotKeys = [];
  }
}
