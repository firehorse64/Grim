import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';

/**
 * CameraManager – wraps the Phaser main camera with game-specific
 * behaviour: player-following with a deadzone, train-width bounds
 * clamping, screen shake, flash, and smooth zoom transitions.
 *
 * Usage:
 *   const cam = new CameraManager();
 *   cam.create(scene, playerSprite, trainTotalWidth);
 *   // in update():
 *   cam.update(time, delta);
 */
export class CameraManager {
  private scene!: Phaser.Scene;
  private camera!: Phaser.Cameras.Scene2D.Camera;
  private target: Phaser.GameObjects.Components.Transform | null = null;

  /** Horizontal deadzone half-width – the player can move this far from
   *  centre before the camera starts tracking. */
  private static readonly DEADZONE_X = 100;
  /** Vertical deadzone half-height. */
  private static readonly DEADZONE_Y = 50;

  /** Total world width the camera is clamped to. */
  private worldWidth: number = 0;

  // Zoom state
  private currentZoom: number = 1;
  private targetZoom: number = 1;
  private zoomSpeed: number = 2; // per second

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Initialise the camera system.
   *
   * @param scene        The current Phaser scene.
   * @param target       The game object the camera should follow (player sprite).
   * @param worldWidth   Total width of the train world for bounds clamping.
   */
  public create(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Components.Transform,
    worldWidth: number,
  ): void {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.target = target;
    this.worldWidth = worldWidth;

    // Camera bounds – clamp horizontally to the train, vertically to the viewport
    this.camera.setBounds(0, 0, worldWidth, GAME_HEIGHT);

    // Follow with deadzone
    this.camera.startFollow(
      target as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform,
      true, // roundPixels
      0.1,  // lerpX  (smooth follow)
      0.1,  // lerpY
    );

    this.camera.setDeadzone(
      CameraManager.DEADZONE_X * 2,
      CameraManager.DEADZONE_Y * 2,
    );

    // Default dark background
    this.camera.setBackgroundColor('#0a0a1a');

    // Listen to global events for shake/flash so any system can trigger them
    EventBus.on(GameEvents.SCREEN_SHAKE, this.onShakeEvent, this);
    EventBus.on(GameEvents.SCREEN_FLASH, this.onFlashEvent, this);
  }

  /**
   * Per-frame tick. Handles smooth zoom interpolation.
   */
  public update(_time: number, delta: number): void {
    if (!this.camera) return;

    // Smooth zoom
    if (this.currentZoom !== this.targetZoom) {
      const dt = delta / 1000;
      const diff = this.targetZoom - this.currentZoom;
      const step = this.zoomSpeed * dt;

      if (Math.abs(diff) < step) {
        this.currentZoom = this.targetZoom;
      } else {
        this.currentZoom += Math.sign(diff) * step;
      }
      this.camera.setZoom(this.currentZoom);
    }
  }

  // ------------------------------------------------------------------
  // Effects
  // ------------------------------------------------------------------

  /**
   * Shake the camera – use for explosions, heavy impacts, etc.
   *
   * @param intensity  Pixel displacement (default 0.01 = subtle).
   * @param duration   Milliseconds (default 200).
   */
  public shake(intensity: number = 0.01, duration: number = 200): void {
    this.camera?.shake(duration, intensity);
  }

  /**
   * Flash the camera to a colour then fade back.
   *
   * @param color     Hex colour (default 0xff0000 for damage red).
   * @param duration  Milliseconds (default 150).
   */
  public flash(color: number = 0xff0000, duration: number = 150): void {
    if (!this.camera) return;

    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    this.camera.flash(duration, r, g, b, false);
  }

  /**
   * Smoothly zoom to a target level over time.
   *
   * @param level     Target zoom (1 = normal, 1.2 = slight zoom in).
   * @param duration  Approximate duration in ms (controls lerp speed).
   */
  public setZoom(level: number, duration: number = 500): void {
    this.targetZoom = Phaser.Math.Clamp(level, 0.5, 2.0);
    // Convert duration into a per-second lerp rate
    const diff = Math.abs(this.targetZoom - this.currentZoom);
    this.zoomSpeed = diff > 0 ? diff / (duration / 1000) : 2;
  }

  /**
   * Immediately snap to a zoom level (no interpolation).
   */
  public setZoomImmediate(level: number): void {
    this.currentZoom = Phaser.Math.Clamp(level, 0.5, 2.0);
    this.targetZoom = this.currentZoom;
    this.camera?.setZoom(this.currentZoom);
  }

  /**
   * Update the camera world bounds (call if the train changes length,
   * e.g. a car is destroyed / added).
   */
  public setWorldWidth(width: number): void {
    this.worldWidth = width;
    this.camera?.setBounds(0, 0, width, GAME_HEIGHT);
  }

  /**
   * Update the follow target (e.g., switching between characters).
   */
  public setTarget(target: Phaser.GameObjects.Components.Transform): void {
    this.target = target;
    this.camera?.startFollow(
      target as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform,
      true,
      0.1,
      0.1,
    );
    this.camera?.setDeadzone(
      CameraManager.DEADZONE_X * 2,
      CameraManager.DEADZONE_Y * 2,
    );
  }

  /**
   * Fade the camera to black (useful for scene transitions).
   */
  public fadeOut(duration: number = 500, callback?: () => void): void {
    this.camera?.fadeOut(duration, 0, 0, 0);
    if (callback) {
      this.camera?.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, callback);
    }
  }

  /**
   * Fade the camera in from black.
   */
  public fadeIn(duration: number = 500, callback?: () => void): void {
    this.camera?.fadeIn(duration, 0, 0, 0);
    if (callback) {
      this.camera?.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, callback);
    }
  }

  /** Direct access to the underlying Phaser camera. */
  public getCamera(): Phaser.Cameras.Scene2D.Camera {
    return this.camera;
  }

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  private onShakeEvent(data: { intensity?: number; duration?: number }): void {
    this.shake(data.intensity, data.duration);
  }

  private onFlashEvent(data: { color?: number; duration?: number }): void {
    this.flash(data.color, data.duration);
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  public destroy(): void {
    EventBus.off(GameEvents.SCREEN_SHAKE, this.onShakeEvent, this);
    EventBus.off(GameEvents.SCREEN_FLASH, this.onFlashEvent, this);
    this.target = null;
  }
}
