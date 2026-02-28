import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';

/**
 * Camera follows the player with a deadzone and bounded to the
 * train area. Smooth lerp movement.
 */
export class CameraManager {
  private scene!: Phaser.Scene;
  private camera!: Phaser.Cameras.Scene2D.Camera;
  private target: Phaser.GameObjects.Components.Transform | null = null;

  public create(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Components.Transform,
    worldBounds: { x: number; y: number; w: number; h: number },
  ): void {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.target = target;

    // Set world bounds with some margin
    const margin = 100;
    this.camera.setBounds(
      worldBounds.x - margin,
      worldBounds.y - margin,
      worldBounds.w + margin * 2,
      worldBounds.h + margin * 2,
    );

    // Follow the player with deadzone
    this.camera.startFollow(target as unknown as Phaser.GameObjects.GameObject, true, 0.1, 0.1);
    this.camera.setDeadzone(80, 80);

    // Slight zoom for coziness
    this.camera.setZoom(1.8);
  }

  /** Update camera each frame. */
  public update(_time: number, _delta: number): void {
    // Camera follow is handled by Phaser's startFollow
    // Additional effects can go here (screen shake, tint, etc.)
  }

  /** Shake the camera (for impacts, etc.). */
  public shake(duration: number = 200, intensity: number = 0.005): void {
    this.camera.shake(duration, intensity);
  }

  /** Flash the camera (for sleep transitions, etc.). */
  public flash(color: number = 0x000000, duration: number = 500): void {
    this.camera.flash(duration, (color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff);
  }

  /** Fade to black and back (for sleep). */
  public fadeForSleep(callback: () => void): void {
    this.camera.fadeOut(800, 0, 0, 0);
    this.scene.time.delayedCall(1000, () => {
      callback();
      this.camera.fadeIn(800, 0, 0, 0);
    });
  }

  /** Get the camera's current scroll Y (for environment scrolling). */
  public getScrollY(): number {
    return this.camera.scrollY + GAME_HEIGHT / 2;
  }

  /** Expand bounds for exploration mode. */
  public setExplorationBounds(bounds: { x: number; y: number; w: number; h: number }): void {
    const margin = 200;
    this.camera.setBounds(
      bounds.x - margin,
      bounds.y - margin,
      bounds.w + margin * 2,
      bounds.h + margin * 2,
    );
  }
}
