import Phaser from 'phaser';

export class Pellet extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  public damage: number = 0;
  public bulletSpeed: number = 0;
  public knockback: number = 0;
  public owner: Phaser.GameObjects.Sprite | null = null;

  private lifeTimer: number = 0;
  private maxLifeTime: number = 600; // shorter range than bullets

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'pellet');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setActive(false);
    this.setVisible(false);

    // Pellets have slight gravity for a realistic feel
    this.body.setAllowGravity(true);
    this.body.setGravityY(150); // slight drop-off
    this.body.setSize(4, 4);
    this.setScale(0.8);
  }

  /**
   * Fire the pellet from a position at a given angle.
   * Used for object pool reuse.
   */
  fire(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    knockback: number = 0,
    owner: Phaser.GameObjects.Sprite | null = null
  ): void {
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(x, y);
    this.setRotation(angle);

    this.damage = damage;
    this.bulletSpeed = speed;
    this.knockback = knockback;
    this.owner = owner;
    this.lifeTimer = 0;

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    this.body.setVelocity(vx, vy);
    this.body.setEnable(true);

    this.setAlpha(1);
    this.setScale(0.8);
  }

  /**
   * Called when the pellet hits something. Pellets never pierce.
   */
  onHit(): boolean {
    this.deactivate();
    return true;
  }

  /**
   * Deactivate and return to pool.
   */
  deactivate(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body.setEnable(false);
    this.body.setVelocity(0, 0);
    this.damage = 0;
    this.owner = null;
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    if (!this.active) return;

    this.lifeTimer += delta;

    // Fade out over the last third of lifetime
    if (this.lifeTimer > this.maxLifeTime * 0.66) {
      const fadeProgress =
        (this.lifeTimer - this.maxLifeTime * 0.66) /
        (this.maxLifeTime * 0.34);
      this.setAlpha(1 - fadeProgress);
    }

    if (this.lifeTimer >= this.maxLifeTime) {
      this.deactivate();
      return;
    }

    // Check if off-screen
    const camera = this.scene.cameras.main;
    const margin = 50;
    if (
      this.x < camera.scrollX - margin ||
      this.x > camera.scrollX + camera.width + margin ||
      this.y < camera.scrollY - margin ||
      this.y > camera.scrollY + camera.height + margin
    ) {
      this.deactivate();
    }
  }
}
