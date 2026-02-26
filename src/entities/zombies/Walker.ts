import Phaser from 'phaser';
import { Zombie } from './Zombie';
import { ZombieType, ZombieState } from '../../types/ZombieTypes';
import { ZOMBIE_DATA } from '../../data/ZombieData';

/**
 * Walker -- the bread-and-butter zombie.
 *
 * Slow, relentless, and numerous. Walkers shamble toward the nearest
 * barricade or the player in a straight line. They have no special
 * movement abilities and cannot bypass obstacles. Their threat comes
 * from sheer numbers: left unchecked a horde of walkers will chew
 * through barricades and overwhelm the player.
 *
 * Behaviour:
 *   - Standard SPAWNING -> APPROACHING -> ATTACKING loop from base.
 *   - Slight random sway while walking so groups look organic.
 *   - Occasional groan sound cue.
 */
export class Walker extends Zombie {
  /** Small vertical bob amplitude for a shambling feel. */
  private _swayTimer: number = 0;
  private _swayPhase: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'zombie-walker');
  }

  // ----------------------------------------------------------------
  // Overrides
  // ----------------------------------------------------------------

  public getZombieType(): string {
    return ZombieType.WALKER;
  }

  protected override onSpawn(): void {
    // Start a random sway phase so walkers in a group don't sync
    this._swayPhase = Math.random() * Math.PI * 2;
    this._swayTimer = 0;

    // Set texture / tint specific to walker
    this.setTexture('zombie-walker');
    this.setTint(ZOMBIE_DATA[ZombieType.WALKER].color);
  }

  protected override onApproach(
    _player: Phaser.GameObjects.Sprite,
    _time: number,
    delta: number,
    _barricades?: Phaser.GameObjects.Group,
  ): void {
    // Subtle sinusoidal speed variation for shambling feel
    this._swayTimer += delta * 0.001;
    const sway = Math.sin(this._swayTimer * 2.5 + this._swayPhase) * 0.15;
    // Modulate the effective speed slightly (base class applies speed after this)
    this.speed = ZOMBIE_DATA[ZombieType.WALKER].speed * (1 + sway);
  }

  protected override playWalkAnim(): void {
    const key = 'zombie-walker-walk';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }

  protected override playAttackAnim(): void {
    const key = 'zombie-walker-attack';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }
}
