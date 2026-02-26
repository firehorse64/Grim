import Phaser from 'phaser';
import { lerp, clamp } from '../utils/MathUtils';

export interface HealthBarConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  bgColor?: number;
  borderColor?: number;
  borderWidth?: number;
  showText?: boolean;
  fontSize?: number;
  fontColor?: string;
  /** If true, bar follows a world object; if false, it is fixed to the camera. */
  worldSpace?: boolean;
  /** Lerp speed for smooth transitions (0-1 per frame at 60fps). Default 0.12. */
  lerpSpeed?: number;
}

const DEFAULT_CONFIG: Required<HealthBarConfig> = {
  x: 0,
  y: 0,
  width: 200,
  height: 20,
  bgColor: 0x1a1a2e,
  borderColor: 0x444466,
  borderWidth: 2,
  showText: true,
  fontSize: 12,
  fontColor: '#ffffff',
  worldSpace: false,
  lerpSpeed: 0.12,
};

/**
 * Reusable health bar drawn with Phaser Graphics.
 * Smoothly animates fill changes, and colour shifts
 * from green -> yellow -> orange -> red based on HP percentage.
 */
export class HealthBar {
  private scene: Phaser.Scene;
  private config: Required<HealthBarConfig>;

  // Phaser objects
  private bgGraphics: Phaser.GameObjects.Graphics;
  private fillGraphics: Phaser.GameObjects.Graphics;
  private borderGraphics: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text | null = null;

  // State
  private currentHp: number = 1;
  private maxHp: number = 1;
  private displayFraction: number = 1; // what we are lerping toward
  private targetFraction: number = 1;

  private _visible: boolean = true;

  constructor(scene: Phaser.Scene, config: HealthBarConfig) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };

    const depth = this.config.worldSpace ? 50 : 1000;

    // Background
    this.bgGraphics = scene.add.graphics();
    this.bgGraphics.setDepth(depth);
    this.bgGraphics.setScrollFactor(this.config.worldSpace ? 1 : 0);

    // Fill
    this.fillGraphics = scene.add.graphics();
    this.fillGraphics.setDepth(depth + 1);
    this.fillGraphics.setScrollFactor(this.config.worldSpace ? 1 : 0);

    // Border
    this.borderGraphics = scene.add.graphics();
    this.borderGraphics.setDepth(depth + 2);
    this.borderGraphics.setScrollFactor(this.config.worldSpace ? 1 : 0);

    // Text
    if (this.config.showText) {
      this.hpText = scene.add.text(
        this.config.x + this.config.width / 2,
        this.config.y + this.config.height / 2,
        '',
        {
          fontFamily: '"Courier New", monospace',
          fontSize: `${this.config.fontSize}px`,
          color: this.config.fontColor,
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 2,
        }
      );
      this.hpText.setOrigin(0.5, 0.5);
      this.hpText.setDepth(depth + 3);
      this.hpText.setScrollFactor(this.config.worldSpace ? 1 : 0);
    }

    this.drawBorder();
    this.drawBg();
    this.drawFill();
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Set the health values. The visual fill will lerp smoothly.
   */
  public setValue(current: number, max: number): void {
    this.currentHp = clamp(current, 0, max);
    this.maxHp = Math.max(1, max);
    this.targetFraction = this.currentHp / this.maxHp;

    if (this.hpText) {
      this.hpText.setText(`${Math.ceil(this.currentHp)} / ${Math.ceil(this.maxHp)}`);
    }
  }

  /**
   * Instantly set the fill to target (skip lerp animation).
   */
  public setValueInstant(current: number, max: number): void {
    this.setValue(current, max);
    this.displayFraction = this.targetFraction;
    this.drawFill();
  }

  /**
   * Call each frame to animate smooth transitions.
   */
  public update(): void {
    if (!this._visible) return;

    if (Math.abs(this.displayFraction - this.targetFraction) > 0.001) {
      this.displayFraction = lerp(
        this.displayFraction,
        this.targetFraction,
        this.config.lerpSpeed
      );
      this.drawFill();
    }
  }

  /**
   * Reposition the bar (useful for world-space bars following entities).
   */
  public setPosition(x: number, y: number): void {
    this.config.x = x;
    this.config.y = y;

    this.drawBorder();
    this.drawBg();
    this.drawFill();

    if (this.hpText) {
      this.hpText.setPosition(
        x + this.config.width / 2,
        y + this.config.height / 2
      );
    }
  }

  public show(): void {
    this._visible = true;
    this.bgGraphics.setVisible(true);
    this.fillGraphics.setVisible(true);
    this.borderGraphics.setVisible(true);
    if (this.hpText) this.hpText.setVisible(true);
  }

  public hide(): void {
    this._visible = false;
    this.bgGraphics.setVisible(false);
    this.fillGraphics.setVisible(false);
    this.borderGraphics.setVisible(false);
    if (this.hpText) this.hpText.setVisible(false);
  }

  public isVisible(): boolean {
    return this._visible;
  }

  public destroy(): void {
    this.bgGraphics.destroy();
    this.fillGraphics.destroy();
    this.borderGraphics.destroy();
    if (this.hpText) this.hpText.destroy();
  }

  // ------------------------------------------------------------------
  // Drawing helpers
  // ------------------------------------------------------------------

  private drawBorder(): void {
    const { x, y, width, height, borderColor, borderWidth } = this.config;
    this.borderGraphics.clear();
    this.borderGraphics.lineStyle(borderWidth, borderColor, 1);
    this.borderGraphics.strokeRect(
      x - borderWidth / 2,
      y - borderWidth / 2,
      width + borderWidth,
      height + borderWidth
    );
  }

  private drawBg(): void {
    const { x, y, width, height, bgColor } = this.config;
    this.bgGraphics.clear();
    this.bgGraphics.fillStyle(bgColor, 0.85);
    this.bgGraphics.fillRect(x, y, width, height);
  }

  private drawFill(): void {
    const { x, y, width, height } = this.config;
    const frac = clamp(this.displayFraction, 0, 1);
    const fillWidth = Math.max(0, width * frac);

    this.fillGraphics.clear();

    if (fillWidth <= 0) return;

    const color = HealthBar.fractionToColor(frac);
    this.fillGraphics.fillStyle(color, 1);
    this.fillGraphics.fillRect(x, y, fillWidth, height);

    // Subtle highlight at the top of the bar for a polished look
    this.fillGraphics.fillStyle(0xffffff, 0.15);
    this.fillGraphics.fillRect(x, y, fillWidth, Math.max(2, height * 0.3));
  }

  // ------------------------------------------------------------------
  // Color interpolation: green -> yellow -> orange -> red
  // ------------------------------------------------------------------

  /**
   * Map a 0-1 fraction to a colour:
   *  1.0       -> bright green  (0x44dd44)
   *  0.75-1.0  -> green to yellow
   *  0.50-0.75 -> yellow to orange
   *  0.25-0.50 -> orange to red
   *  0.0-0.25  -> dark red
   */
  public static fractionToColor(frac: number): number {
    if (frac > 0.75) {
      return HealthBar.lerpColor(0xccdd22, 0x44dd44, (frac - 0.75) / 0.25);
    } else if (frac > 0.5) {
      return HealthBar.lerpColor(0xdd8822, 0xccdd22, (frac - 0.5) / 0.25);
    } else if (frac > 0.25) {
      return HealthBar.lerpColor(0xcc2222, 0xdd8822, (frac - 0.25) / 0.25);
    } else {
      return HealthBar.lerpColor(0x880000, 0xcc2222, frac / 0.25);
    }
  }

  private static lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;

    const rr = Math.round(lerp(ar, br, t));
    const rg = Math.round(lerp(ag, bg, t));
    const rb = Math.round(lerp(ab, bb, t));

    return (rr << 16) | (rg << 8) | rb;
  }
}
