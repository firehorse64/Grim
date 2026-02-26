import Phaser from 'phaser';

export class Bullet extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  public damage: number = 0;
  public bulletSpeed: number = 0;
  public piercing: boolean = false;
  public knockback: number = 0;
  public owner: Phaser.GameObjects.Sprite | null = null;

  private lifeTimer: number = 0;
  private maxLifeTime: number = 2000; // auto-deactivate after 2 seconds
  private velocityX: number = 0;
  private velocityY: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'bullet');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setActive(false);
    this.setVisible(false);

    // Bullets ignore gravity by default
    this.body.setAllowGravity(false);
    this.body.setSize(6, 4);
  }

  /**
   * Fire the bullet from a position at a given angle.
   * Used for object pool reuse - reactivates and repositions the bullet.
   */
  fire(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    piercing: boolean,
    knockback: number = 0,
    owner: Phaser.GameObjects.Sprite | null = null
  ): void {
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(x, y);
    this.setRotation(angle);

    this.damage = damage;
    this.bulletSpeed = speed;
    this.piercing = piercing;
    this.knockback = knockback;
    this.owner = owner;
    this.lifeTimer = 0;

    this.velocityX = Math.cos(angle) * speed;
    this.velocityY = Math.sin(angle) * speed;

    this.body.setVelocity(this.velocityX, this.velocityY);
    this.body.setEnable(true);

    this.setAlpha(1);
    this.setScale(1);
  }

  /**
   * Called when the bullet hits something.
   * Returns true if the bullet should be deactivated (non-piercing).
   */
  onHit(): boolean {
    if (this.piercing) {
      // Piercing bullets keep going but reduce damage slightly
      this.damage *= 0.75;
      return false;
    }

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

    if (this.lifeTimer >= this.maxLifeTime) {
      this.deactivate();
      return;
    }

    // Check if bullet has gone off-screen (with generous margin)
    const camera = this.scene.cameras.main;
    const margin = 100;
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
