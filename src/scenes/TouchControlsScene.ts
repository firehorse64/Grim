import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';
import { isMobileDevice } from '../systems/TouchDetect';

/**
 * TouchControlsScene - Virtual on-screen controls for mobile play.
 *
 * Runs as a parallel overlay scene (like HudScene). Renders:
 *   - Left side: virtual joystick (movement)
 *   - Right side: action buttons (shoot, jump, reload, grenade, weapon switch, pause)
 *
 * Exposes a public `touchState` that InputManager reads each frame
 * to merge with keyboard/mouse input.
 */

export interface TouchState {
  /** Movement axis from joystick (-1 to 1) */
  moveX: number;
  moveY: number;
  /** Is shoot button held */
  shooting: boolean;
  /** Was jump tapped this frame (edge-triggered) */
  jumping: boolean;
  /** Was reload tapped this frame */
  reloading: boolean;
  /** Was grenade tapped this frame */
  grenade: boolean;
  /** Was interact tapped this frame */
  interact: boolean;
  /** Was pause tapped this frame */
  pause: boolean;
  /** Weapon slot request (-1 = none) */
  weaponSlot: number;
  /** Touch-based aim position (world space, -1 = not aiming) */
  aimX: number;
  aimY: number;
  /** Climb up/down */
  climbUp: boolean;
  climbDown: boolean;
}

export class TouchControlsScene extends Phaser.Scene {
  public touchState: TouchState = TouchControlsScene.emptyState();
  public visible: boolean = false;

  // ---- Joystick ----
  private joyBase!: Phaser.GameObjects.Arc;
  private joyThumb!: Phaser.GameObjects.Arc;
  private joyActive: boolean = false;
  private joyPointerId: number = -1;
  private joyCenterX: number = 0;
  private joyCenterY: number = 0;
  private readonly JOY_RADIUS = 50;
  private readonly JOY_DEAD_ZONE = 8;

  // ---- Buttons ----
  private buttons: Map<string, { container: Phaser.GameObjects.Container; active: boolean }> = new Map();
  private shootPointerId: number = -1;

  // ---- Edge-trigger tracking ----
  private prevJump = false;
  private prevReload = false;
  private prevGrenade = false;
  private prevInteract = false;
  private prevPause = false;
  private prevSlots: boolean[] = [false, false, false, false, false];

  // ---- Weapon switcher ----
  private weaponPanel!: Phaser.GameObjects.Container;
  private weaponPanelOpen: boolean = false;
  private currentWeaponIndex: number = 0;

  constructor() {
    super({ key: 'TouchControlsScene' });
  }

  static emptyState(): TouchState {
    return {
      moveX: 0, moveY: 0,
      shooting: false, jumping: false, reloading: false,
      grenade: false, interact: false, pause: false,
      weaponSlot: -1,
      aimX: -1, aimY: -1,
      climbUp: false, climbDown: false,
    };
  }

  create(): void {
    if (!isMobileDevice()) {
      this.visible = false;
      return;
    }

    this.visible = true;
    this.input.addPointer(3); // support up to 4 simultaneous touches

    this.createJoystick();
    this.createActionButtons();
    this.createWeaponSwitcher();

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

  // ------------------------------------------------------------------
  // Joystick
  // ------------------------------------------------------------------

  private createJoystick(): void {
    const cx = 100;
    const cy = GAME_HEIGHT - 120;
    this.joyCenterX = cx;
    this.joyCenterY = cy;

    // Base ring
    this.joyBase = this.add.circle(cx, cy, this.JOY_RADIUS + 10, 0x222244, 0.3)
      .setStrokeStyle(2, 0x444466, 0.5)
      .setDepth(2000);

    // Thumb
    this.joyThumb = this.add.circle(cx, cy, 24, 0x555577, 0.5)
      .setStrokeStyle(2, 0x8888aa, 0.6)
      .setDepth(2001);
  }

  // ------------------------------------------------------------------
  // Action Buttons
  // ------------------------------------------------------------------

  private createActionButtons(): void {
    const rightX = GAME_WIDTH - 70;
    const bottomY = GAME_HEIGHT - 80;

    // Shoot button (large, bottom-right)
    this.createButton('shoot', rightX, bottomY, 40, 0xcc3333, 0.4, 'FIRE', true);

    // Jump button (above shoot)
    this.createButton('jump', rightX - 80, bottomY - 20, 28, 0x3355cc, 0.35, 'JMP');

    // Reload button (above jump)
    this.createButton('reload', rightX, bottomY - 90, 22, 0x888833, 0.35, 'RLD');

    // Grenade button
    this.createButton('grenade', rightX - 80, bottomY - 100, 22, 0xcc8833, 0.35, 'GRN');

    // Interact button (left of reload)
    this.createButton('interact', rightX - 80, bottomY + 50, 22, 0x33aa33, 0.35, 'USE');

    // Pause button (top-right corner)
    this.createButton('pause', GAME_WIDTH - 36, 36, 18, 0x666688, 0.4, '| |');

    // Weapon switch button (opens weapon panel)
    this.createButton('weapon-switch', rightX + 10, bottomY - 160, 22, 0x6666aa, 0.35, 'WPN');
  }

  private createButton(
    id: string, x: number, y: number, radius: number,
    color: number, alpha: number, label: string,
    isHold: boolean = false
  ): void {
    const container = this.add.container(x, y).setDepth(2000);

    const bg = this.add.circle(0, 0, radius, color, alpha)
      .setStrokeStyle(2, Phaser.Display.Color.GetColor(
        Math.min(255, ((color >> 16) & 0xff) + 60),
        Math.min(255, ((color >> 8) & 0xff) + 60),
        Math.min(255, (color & 0xff) + 60)
      ), 0.6);

    const text = this.add.text(0, 0, label, {
      fontFamily: '"Courier New", monospace',
      fontSize: radius < 24 ? '9px' : '11px',
      color: '#ccccdd',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    container.add([bg, text]);
    container.setSize(radius * 2, radius * 2);

    this.buttons.set(id, { container, active: false });
  }

  // ------------------------------------------------------------------
  // Weapon Switcher Panel
  // ------------------------------------------------------------------

  private createWeaponSwitcher(): void {
    this.weaponPanel = this.add.container(GAME_WIDTH - 70, GAME_HEIGHT - 280).setDepth(2010);
    this.weaponPanel.setVisible(false);

    const weapons = ['PIS', 'SHG', 'SMG', 'RIF', 'GRN'];
    const btnSize = 36;

    for (let i = 0; i < weapons.length; i++) {
      const y = i * (btnSize + 6);
      const bg = this.add.rectangle(0, y, btnSize + 16, btnSize, 0x111133, 0.85)
        .setStrokeStyle(1, 0x444466);
      const text = this.add.text(0, y, weapons[i], {
        fontFamily: '"Courier New", monospace',
        fontSize: '11px',
        color: '#aaaacc',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5);

      bg.setInteractive();
      bg.on('pointerdown', () => {
        this.currentWeaponIndex = i;
        this.weaponPanelOpen = false;
        this.weaponPanel.setVisible(false);
      });

      this.weaponPanel.add([bg, text]);
    }
  }

  // ------------------------------------------------------------------
  // Pointer Handling
  // ------------------------------------------------------------------

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // Left half of screen = joystick
    if (pointer.x < GAME_WIDTH / 2 && !this.joyActive) {
      this.joyActive = true;
      this.joyPointerId = pointer.id;
      // Re-center joystick at touch point
      this.joyCenterX = pointer.x;
      this.joyCenterY = pointer.y;
      this.joyBase.setPosition(this.joyCenterX, this.joyCenterY);
      this.joyThumb.setPosition(pointer.x, pointer.y);
      this.joyBase.setAlpha(0.5);
      return;
    }

    // Check button hits on right side
    this.checkButtonHit(pointer, true);
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
          this.joyCenterY + Math.sin(angle) * maxDist
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

    if (pointer.id === this.shootPointerId) {
      this.shootPointerId = -1;
      const shootBtn = this.buttons.get('shoot');
      if (shootBtn) shootBtn.active = false;
    }

    // Release any momentary buttons
    this.checkButtonHit(pointer, false);
  }

  private checkButtonHit(pointer: Phaser.Input.Pointer, isDown: boolean): void {
    for (const [id, btn] of this.buttons) {
      const c = btn.container;
      const dx = pointer.x - c.x;
      const dy = pointer.y - c.y;
      const hitRadius = Math.max(c.width, 44); // minimum 44px touch target
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= hitRadius) {
        if (id === 'shoot') {
          if (isDown) {
            btn.active = true;
            this.shootPointerId = pointer.id;
          }
        } else if (id === 'weapon-switch') {
          if (isDown) {
            this.weaponPanelOpen = !this.weaponPanelOpen;
            this.weaponPanel.setVisible(this.weaponPanelOpen);
          }
        } else {
          btn.active = isDown;
        }
        if (isDown) break; // only one button per touch
      }
    }
  }

  // ------------------------------------------------------------------
  // Build state each frame
  // ------------------------------------------------------------------

  private buildTouchState(): void {
    // Movement from joystick
    let moveX = 0;
    let moveY = 0;

    if (this.joyActive) {
      const dx = this.joyThumb.x - this.joyCenterX;
      const dy = this.joyThumb.y - this.joyCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > this.JOY_DEAD_ZONE) {
        moveX = dx / this.JOY_RADIUS;
        moveY = dy / this.JOY_RADIUS;
        // Clamp
        moveX = Math.max(-1, Math.min(1, moveX));
        moveY = Math.max(-1, Math.min(1, moveY));
      }
    }

    // Buttons
    const curJump = this.buttons.get('jump')?.active ?? false;
    const curReload = this.buttons.get('reload')?.active ?? false;
    const curGrenade = this.buttons.get('grenade')?.active ?? false;
    const curInteract = this.buttons.get('interact')?.active ?? false;
    const curPause = this.buttons.get('pause')?.active ?? false;
    const shooting = this.buttons.get('shoot')?.active ?? false;

    // Edge detection
    const jumping = curJump && !this.prevJump;
    const reloading = curReload && !this.prevReload;
    const grenade = curGrenade && !this.prevGrenade;
    const interact = curInteract && !this.prevInteract;
    const pause = curPause && !this.prevPause;

    // Weapon slot (check if changed this frame)
    let weaponSlot = -1;
    // Weapon switch via panel tap is tracked by currentWeaponIndex changes
    // We use a simple edge detection: if the index changed, fire the slot
    const slotChanged = this.currentWeaponIndex !== this.touchState.weaponSlot - 1;

    this.touchState = {
      moveX,
      moveY,
      shooting,
      jumping,
      reloading,
      grenade,
      interact,
      pause,
      weaponSlot,
      aimX: -1, // mobile doesn't use aim position (auto-aim instead)
      aimY: -1,
      climbUp: moveY < -0.5,
      climbDown: moveY > 0.5,
    };

    // Save previous frame
    this.prevJump = curJump;
    this.prevReload = curReload;
    this.prevGrenade = curGrenade;
    this.prevInteract = curInteract;
    this.prevPause = curPause;

    // Clear momentary buttons after reading
    for (const [id, btn] of this.buttons) {
      if (id !== 'shoot') {
        btn.active = false;
      }
    }
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  private cleanup(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
  }

  /** Show/hide controls (e.g., during menus vs gameplay) */
  public setControlsVisible(visible: boolean): void {
    if (!this.visible) return; // not a mobile device
    this.joyBase?.setVisible(visible);
    this.joyThumb?.setVisible(visible);
    for (const [, btn] of this.buttons) {
      btn.container.setVisible(visible);
    }
    if (!visible) {
      this.weaponPanel?.setVisible(false);
      this.weaponPanelOpen = false;
    }
  }
}
