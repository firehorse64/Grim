/**
 * HTML-based HUD overlay for the 3D game.
 * Renders on top of the Three.js canvas using DOM elements.
 */
import { EventBus } from '../utils/EventBus';
import { PLAYER_MAX_HP, HUNGER_MAX, ENERGY_MAX, FUEL_MAX, LOW_STAT_THRESHOLD } from '../data/BalanceConstants';

export interface HudData {
  health: number;
  hunger: number;
  energy: number;
  mode: string;
  weapon: string;
  ammo: number;
  timeOfDay: string;
  engineHp: number;
  brakeHp: number;
  hasFire: boolean;
  npcCount: number;
  fuel: number;
  trainSpeed: number;
  destination: string | null;
  travelProgress: number;
  currentLocation: string;
}

export class HudOverlay {
  private container!: HTMLDivElement;
  private healthBar!: HTMLDivElement;
  private hungerBar!: HTMLDivElement;
  private energyBar!: HTMLDivElement;
  private fuelBar!: HTMLDivElement;
  private modeText!: HTMLDivElement;
  private weaponText!: HTMLDivElement;
  private destText!: HTMLDivElement;
  private controlsText!: HTMLDivElement;
  private interactPrompt!: HTMLDivElement;
  private floatingTexts: { el: HTMLDivElement; startTime: number; startY: number }[] = [];
  private fireWarning!: HTMLDivElement;

  public create(): void {
    this.container = document.createElement('div');
    this.container.id = 'hud-overlay';
    this.container.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none; font-family: 'Courier New', monospace;
      z-index: 10; color: #ccc;
    `;
    document.body.appendChild(this.container);

    // Top-left: stat bars
    const statsPanel = this.makePanel('12px', '12px', '', '');
    this.healthBar = this.makeBar(statsPanel, 'Health', '#44cc44', 100);
    this.hungerBar = this.makeBar(statsPanel, 'Food', '#cc8844', 100);
    this.energyBar = this.makeBar(statsPanel, 'Energy', '#4488cc', 100);

    // Weapon info below stats
    this.weaponText = document.createElement('div');
    this.weaponText.style.cssText = 'margin-top:8px; font-size:11px; color:#aab;';
    this.weaponText.textContent = 'Equipped: Rifle | Ammo: 15';
    statsPanel.appendChild(this.weaponText);

    // Fuel bar
    this.fuelBar = this.makeBar(statsPanel, 'Fuel', '#cccc44', 100);

    // Top-right: mode + time
    const rightPanel = this.makePanel('12px', '', '', '12px');
    rightPanel.style.textAlign = 'right';
    this.modeText = document.createElement('div');
    this.modeText.style.cssText = 'font-size:12px; font-weight:bold; color:#8c8;';
    this.modeText.textContent = 'TRAVELING';
    rightPanel.appendChild(this.modeText);

    // Bottom-left: destination + objective
    const bottomPanel = this.makePanel('', '12px', '40px', '');
    this.destText = document.createElement('div');
    this.destText.style.cssText = 'font-size:11px; color:#8ac;';
    this.destText.textContent = 'Objective: Reach Port Echo (The Coast)';
    bottomPanel.appendChild(this.destText);

    // Bottom-center: controls
    this.controlsText = document.createElement('div');
    this.controlsText.style.cssText = `
      position:fixed; bottom:8px; left:50%; transform:translateX(-50%);
      font-size:9px; color:#556; pointer-events:none;
    `;
    this.controlsText.textContent = 'WASD: Move | Click: Fire | E: Interact | TAB: Inventory | M: Map | +/-: Speed | ESC: Pause';
    this.container.appendChild(this.controlsText);

    // Center: interact prompt
    this.interactPrompt = document.createElement('div');
    this.interactPrompt.style.cssText = `
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      font-size:13px; color:#fff; background:#0008; padding:4px 12px;
      border-radius:4px; display:none; pointer-events:none;
    `;
    this.container.appendChild(this.interactPrompt);

    // Fire warning
    this.fireWarning = document.createElement('div');
    this.fireWarning.style.cssText = `
      position:fixed; top:12px; left:50%; transform:translateX(-50%);
      font-size:16px; font-weight:bold; color:#f42; display:none;
    `;
    this.fireWarning.textContent = 'FIRE!';
    this.container.appendChild(this.fireWarning);

    EventBus.on('hud:update', (data: unknown) => this.onUpdate(data as HudData));
  }

  private makePanel(top: string, left: string, bottom: string, right: string): HTMLDivElement {
    const p = document.createElement('div');
    p.style.cssText = `position:fixed; pointer-events:none;`;
    if (top) p.style.top = top;
    if (left) p.style.left = left;
    if (bottom) p.style.bottom = bottom;
    if (right) p.style.right = right;
    this.container.appendChild(p);
    return p;
  }

  private makeBar(parent: HTMLDivElement, label: string, color: string, _max: number): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; margin-bottom:4px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'width:50px; font-size:10px; color:#999;';
    lbl.textContent = label;
    row.appendChild(lbl);
    const barBg = document.createElement('div');
    barBg.style.cssText = 'width:90px; height:8px; background:#333; border-radius:2px; overflow:hidden;';
    const barFill = document.createElement('div');
    barFill.style.cssText = `width:100%; height:100%; background:${color}; transition: width 0.2s;`;
    barBg.appendChild(barFill);
    row.appendChild(barBg);
    parent.appendChild(row);
    return barFill;
  }

  private onUpdate(data: HudData): void {
    this.healthBar.style.width = `${(data.health / PLAYER_MAX_HP) * 100}%`;
    this.healthBar.style.background = data.health < LOW_STAT_THRESHOLD ? '#f44' : '#4c4';
    this.hungerBar.style.width = `${(data.hunger / HUNGER_MAX) * 100}%`;
    this.hungerBar.style.background = data.hunger < LOW_STAT_THRESHOLD ? '#f44' : '#c84';
    this.energyBar.style.width = `${(data.energy / ENERGY_MAX) * 100}%`;
    this.energyBar.style.background = data.energy < LOW_STAT_THRESHOLD ? '#f44' : '#48c';
    this.fuelBar.style.width = `${(data.fuel / FUEL_MAX) * 100}%`;
    this.fuelBar.style.background = data.fuel < 20 ? '#f44' : data.fuel < 40 ? '#cc4' : '#cc4';

    const speedSuffix = data.mode === 'TRAVELING' ? ` (${data.trainSpeed} km/h)` : '';
    this.modeText.textContent = data.mode + speedSuffix;
    this.modeText.style.color = data.mode === 'TRAVELING' ? '#8c8' : data.mode === 'STOPPED' ? '#cc4' : '#c64';

    this.weaponText.textContent = `Equipped: ${data.weapon} | Ammo: ${data.ammo} | Crew: ${data.npcCount} | ${data.timeOfDay}`;

    if (data.destination) {
      const pct = Math.floor(data.travelProgress * 100);
      this.destText.textContent = `Heading to: ${data.destination} (${pct}%) | Objective: Reach Port Echo`;
    } else {
      this.destText.textContent = `At: ${data.currentLocation} - Set destination on map [M] | Objective: Reach Port Echo`;
    }

    this.fireWarning.style.display = data.hasFire ? 'block' : 'none';
  }

  public showInteractPrompt(text: string): void {
    this.interactPrompt.textContent = text;
    this.interactPrompt.style.display = 'block';
  }

  public hideInteractPrompt(): void {
    this.interactPrompt.style.display = 'none';
  }

  public showFloatingText(text: string): void {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; left:50%; top:40%; transform:translateX(-50%);
      font-size:14px; font-weight:bold; color:#fd4;
      text-shadow: 0 0 4px #000; pointer-events:none;
      transition: top 1.2s, opacity 1.2s;
    `;
    el.textContent = text;
    this.container.appendChild(el);

    requestAnimationFrame(() => {
      el.style.top = '30%';
      el.style.opacity = '0';
    });

    setTimeout(() => el.remove(), 1300);
  }

  public destroy(): void {
    this.container.remove();
  }
}
