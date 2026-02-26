import Phaser from 'phaser';

interface DamageTextEntry {
  text: Phaser.GameObjects.Text;
  active: boolean;
  elapsed: number;
  startX: number;
  startY: number;
  velocityX: number;
  velocityY: number;
  duration: number;
}

/**
 * Object-pooled floating damage number system.
 * Call `spawn()` to show a number that floats upward and fades out.
 * Call `update(delta)` each frame to animate active numbers.
 */
export class DamageNumbers {
  private scene: Phaser.Scene;
  private pool: DamageTextEntry[] = [];
  private poolSize: number;

  // Visual tuning
  private static readonly NORMAL_FONT_SIZE = 16;
  private static readonly CRIT_FONT_SIZE = 24;
  private static readonly NORMAL_COLOR = '#ffffff';
  private static readonly CRIT_COLOR = '#ffdd00';
  private static readonly HEAL_COLOR = '#44ff44';
  private static readonly RISE_SPEED = -80;     // pixels per second (negative = up)
  private static readonly SPREAD_X = 30;        // horizontal random spread
  private static readonly NORMAL_DURATION = 800; // ms
  private static readonly CRIT_DURATION = 1100;  // ms

  constructor(scene: Phaser.Scene, poolSize: number = 40) {
    this.scene = scene;
    this.poolSize = poolSize;

    this.initPool();
  }

  // ------------------------------------------------------------------
  // Pool management
  // ------------------------------------------------------------------

  private initPool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const text = this.scene.add.text(0, 0, '', {
        fontFamily: '"Courier New", monospace',
        fontSize: `${DamageNumbers.NORMAL_FONT_SIZE}px`,
        color: DamageNumbers.NORMAL_COLOR,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      });
      text.setOrigin(0.5, 0.5);
      text.setDepth(2000); // Above everything
      text.setVisible(false);
      text.setActive(false);

      this.pool.push({
        text,
        active: false,
        elapsed: 0,
        startX: 0,
        startY: 0,
        velocityX: 0,
        velocityY: DamageNumbers.RISE_SPEED,
        duration: DamageNumbers.NORMAL_DURATION,
      });
    }
  }

  private getInactive(): DamageTextEntry | null {
    for (const entry of this.pool) {
      if (!entry.active) return entry;
    }
    // If pool is exhausted, recycle the oldest active entry
    let oldest: DamageTextEntry | null = null;
    let maxElapsed = -1;
    for (const entry of this.pool) {
      if (entry.elapsed > maxElapsed) {
        maxElapsed = entry.elapsed;
        oldest = entry;
      }
    }
    return oldest;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Spawn a floating damage number at world position (x, y).
   * @param x        World X position
   * @param y        World Y position
   * @param amount   Damage amount (positive) or heal amount
   * @param isCrit   If true, renders bigger and in crit colour
   * @param isHeal   If true, renders in green
   */
  public spawn(
    x: number,
    y: number,
    amount: number,
    isCrit: boolean = false,
    isHeal: boolean = false
  ): void {
    const entry = this.getInactive();
    if (!entry) return;

    const displayAmount = Math.ceil(Math.abs(amount));
    const prefix = isHeal ? '+' : '';
    entry.text.setText(`${prefix}${displayAmount}`);

    // Style based on type
    if (isHeal) {
      entry.text.setFontSize(DamageNumbers.NORMAL_FONT_SIZE);
      entry.text.setColor(DamageNumbers.HEAL_COLOR);
      entry.duration = DamageNumbers.NORMAL_DURATION;
    } else if (isCrit) {
      entry.text.setFontSize(DamageNumbers.CRIT_FONT_SIZE);
      entry.text.setColor(DamageNumbers.CRIT_COLOR);
      entry.text.setText(`${displayAmount}!`);
      entry.duration = DamageNumbers.CRIT_DURATION;
    } else {
      entry.text.setFontSize(DamageNumbers.NORMAL_FONT_SIZE);
      entry.text.setColor(DamageNumbers.NORMAL_COLOR);
      entry.duration = DamageNumbers.NORMAL_DURATION;
    }

    // Position with slight random spread
    const spreadX = (Math.random() - 0.5) * DamageNumbers.SPREAD_X;
    entry.startX = x + spreadX;
    entry.startY = y;
    entry.text.setPosition(entry.startX, entry.startY);

    // Random slight horizontal drift
    entry.velocityX = (Math.random() - 0.5) * 20;
    entry.velocityY = DamageNumbers.RISE_SPEED + (isCrit ? -30 : 0);

    entry.elapsed = 0;
    entry.active = true;
    entry.text.setVisible(true);
    entry.text.setActive(true);
    entry.text.setAlpha(1);

    // Crits get a brief scale pop
    if (isCrit) {
      entry.text.setScale(1.5);
    } else {
      entry.text.setScale(1);
    }
  }

  /**
   * Update all active damage numbers. Call once per frame.
   * @param delta  Time elapsed in ms since last frame
   */
  public update(delta: number): void {
    const dt = delta / 1000; // to seconds

    for (const entry of this.pool) {
      if (!entry.active) continue;

      entry.elapsed += delta;
      const progress = entry.elapsed / entry.duration;

      if (progress >= 1) {
        // Deactivate
        entry.active = false;
        entry.text.setVisible(false);
        entry.text.setActive(false);
        continue;
      }

      // Move
      const newX = entry.text.x + entry.velocityX * dt;
      const newY = entry.text.y + entry.velocityY * dt;
      entry.text.setPosition(newX, newY);

      // Fade out in the last 40% of lifetime
      if (progress > 0.6) {
        const fadeProgress = (progress - 0.6) / 0.4;
        entry.text.setAlpha(1 - fadeProgress);
      }

      // Scale down crits over time
      if (entry.text.scaleX > 1) {
        const scaleTarget = 1;
        const scaleSpeed = 0.08;
        const newScale = entry.text.scaleX + (scaleTarget - entry.text.scaleX) * scaleSpeed;
        entry.text.setScale(newScale);
      }

      // Slow down vertical velocity slightly (decelerate)
      entry.velocityY *= 0.995;
    }
  }

  /**
   * Destroy all pooled objects. Call in scene shutdown.
   */
  public destroy(): void {
    for (const entry of this.pool) {
      entry.text.destroy();
    }
    this.pool = [];
  }
}
