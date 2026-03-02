/**
 * HTML-based HUD overlay for the 3D game.
 * Features: large stat bars, minimap, furniture labels, status display.
 */
import { EventBus } from '../utils/EventBus';
import { PLAYER_MAX_HP, HUNGER_MAX, ENERGY_MAX, FUEL_MAX, LOW_STAT_THRESHOLD } from '../data/BalanceConstants';
import { MAP_LOCATIONS, ROUTE_SEGMENTS } from '../data/LocationData';

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
  currentLocationId: string;
  destinationId: string | null;
  isSprinting: boolean;
}

export class HudOverlay {
  private container!: HTMLDivElement;
  private healthBar!: HTMLDivElement;
  private hungerBar!: HTMLDivElement;
  private energyBar!: HTMLDivElement;
  private fuelBar!: HTMLDivElement;
  private statusText!: HTMLDivElement;
  private infoText!: HTMLDivElement;
  private destText!: HTMLDivElement;
  private controlsText!: HTMLDivElement;
  private interactPrompt!: HTMLDivElement;
  private fireWarning!: HTMLDivElement;
  private minimapCanvas!: HTMLCanvasElement;
  private minimapCtx!: CanvasRenderingContext2D;
  private labelContainer!: HTMLDivElement;

  public create(): void {
    this.container = document.createElement('div');
    this.container.id = 'hud-overlay';
    this.container.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none; font-family: 'Courier New', monospace;
      z-index: 10; color: #ccc;
    `;
    document.body.appendChild(this.container);

    // Top-left: stat bars (large)
    const statsPanel = this.makePanel('16px', '16px', '', '');
    statsPanel.style.background = 'rgba(0,0,0,0.4)';
    statsPanel.style.padding = '10px 14px';
    statsPanel.style.borderRadius = '8px';

    this.healthBar = this.makeBar(statsPanel, 'HP', '#44cc44');
    this.hungerBar = this.makeBar(statsPanel, 'FOOD', '#cc8844');
    this.energyBar = this.makeBar(statsPanel, 'ENERGY', '#4488cc');
    this.fuelBar = this.makeBar(statsPanel, 'FUEL', '#cccc44');

    // Info text below bars
    this.infoText = document.createElement('div');
    this.infoText.style.cssText = 'margin-top:10px; font-size:13px; color:#bbc; line-height:1.4;';
    statsPanel.appendChild(this.infoText);

    // Top-right: status panel
    const rightPanel = this.makePanel('16px', '', '', '16px');
    rightPanel.style.background = 'rgba(0,0,0,0.4)';
    rightPanel.style.padding = '10px 14px';
    rightPanel.style.borderRadius = '8px';
    rightPanel.style.textAlign = 'right';
    rightPanel.style.minWidth = '180px';

    this.statusText = document.createElement('div');
    this.statusText.style.cssText = 'font-size:16px; font-weight:bold; color:#8c8; line-height:1.6;';
    rightPanel.appendChild(this.statusText);

    // Bottom-left: destination
    const bottomPanel = this.makePanel('', '16px', '44px', '');
    this.destText = document.createElement('div');
    this.destText.style.cssText = 'font-size:13px; color:#8ac; background:rgba(0,0,0,0.3); padding:6px 10px; border-radius:6px;';
    bottomPanel.appendChild(this.destText);

    // Bottom-center: controls
    this.controlsText = document.createElement('div');
    this.controlsText.style.cssText = `
      position:fixed; bottom:8px; left:50%; transform:translateX(-50%);
      font-size:10px; color:#556; pointer-events:none;
    `;
    this.controlsText.textContent = 'WASD: Move | Shift: Sprint | Click: Fire | E: Interact | TAB: Inventory | M: Map | T: Train | Q: Weapon | ,/.: Camera | ESC: Pause';
    this.container.appendChild(this.controlsText);

    // Interact prompt
    this.interactPrompt = document.createElement('div');
    this.interactPrompt.style.cssText = `
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      font-size:15px; color:#fff; background:#0009; padding:8px 18px;
      border-radius:8px; display:none; pointer-events:none;
    `;
    this.container.appendChild(this.interactPrompt);

    // Fire warning
    this.fireWarning = document.createElement('div');
    this.fireWarning.style.cssText = `
      position:fixed; top:16px; left:50%; transform:translateX(-50%);
      font-size:20px; font-weight:bold; color:#f42; display:none;
    `;
    this.fireWarning.textContent = 'FIRE!';
    this.container.appendChild(this.fireWarning);

    // Minimap (bottom-right)
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = 220;
    this.minimapCanvas.height = 130;
    this.minimapCanvas.style.cssText = `
      position:fixed; bottom:40px; right:16px;
      border: 1px solid #555; border-radius:6px;
      background:rgba(10,15,20,0.7); pointer-events:none;
    `;
    this.container.appendChild(this.minimapCanvas);
    this.minimapCtx = this.minimapCanvas.getContext('2d')!;

    // Floating label container
    this.labelContainer = document.createElement('div');
    this.labelContainer.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; pointer-events:none;';
    this.container.appendChild(this.labelContainer);

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

  private makeBar(parent: HTMLDivElement, label: string, color: string): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; margin-bottom:6px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'width:58px; font-size:13px; color:#ddd; font-weight:bold;';
    lbl.textContent = label;
    row.appendChild(lbl);
    const barBg = document.createElement('div');
    barBg.style.cssText = 'width:240px; height:20px; background:#1a1a1a; border:1px solid #666; border-radius:4px; overflow:hidden;';
    const barFill = document.createElement('div');
    barFill.style.cssText = `width:100%; height:100%; background:${color}; transition:width 0.2s; border-radius:3px;`;
    barBg.appendChild(barFill);
    row.appendChild(barBg);
    parent.appendChild(row);
    return barFill;
  }

  private onUpdate(data: HudData): void {
    // Stat bars
    this.healthBar.style.width = `${(data.health / PLAYER_MAX_HP) * 100}%`;
    this.healthBar.style.background = data.health < LOW_STAT_THRESHOLD ? '#f44' : '#4c4';
    this.hungerBar.style.width = `${(data.hunger / HUNGER_MAX) * 100}%`;
    this.hungerBar.style.background = data.hunger < LOW_STAT_THRESHOLD ? '#f44' : '#c84';
    this.energyBar.style.width = `${(data.energy / ENERGY_MAX) * 100}%`;
    this.energyBar.style.background = data.energy < LOW_STAT_THRESHOLD ? '#f44' : '#48c';
    this.fuelBar.style.width = `${(data.fuel / FUEL_MAX) * 100}%`;
    this.fuelBar.style.background = data.fuel < 20 ? '#f44' : '#cc4';

    // Info text beneath bars
    const sprintText = data.isSprinting ? ' | SPRINTING' : '';
    this.infoText.textContent = `${data.weapon} | Ammo: ${data.ammo} | Crew: ${data.npcCount} | ${data.timeOfDay}${sprintText}`;

    // Status panel (top-right)
    let statusLines = '';
    if (data.mode === 'TRAVELING') {
      statusLines = `TRAIN MOVING\n${data.trainSpeed} km/h`;
    } else if (data.mode === 'STOPPED') {
      statusLines = 'TRAIN STOPPED';
    } else {
      statusLines = 'EXPLORING';
    }
    if (data.destination) {
      statusLines += `\nTo: ${data.destination}`;
      const pct = Math.floor(data.travelProgress * 100);
      statusLines += `\nProgress: ${pct}%`;
    }
    this.statusText.innerHTML = statusLines.split('\n').map((line, i) => {
      const color = i === 0
        ? (data.mode === 'TRAVELING' ? '#8c8' : data.mode === 'STOPPED' ? '#cc4' : '#c84')
        : '#aac';
      const size = i === 0 ? '16px' : '12px';
      return `<div style="color:${color};font-size:${size}">${line}</div>`;
    }).join('');

    // Destination text (bottom)
    if (data.destination) {
      const pct = Math.floor(data.travelProgress * 100);
      this.destText.textContent = `Heading to: ${data.destination} (${pct}%) | Goal: Reach Port Echo`;
    } else {
      this.destText.textContent = `At: ${data.currentLocation} | Next: ${data.destination ?? 'Set destination [M]'} | Goal: Reach Port Echo`;
    }

    // Minimap
    this.drawMinimap(data.currentLocationId, data.destinationId, data.travelProgress);

    this.fireWarning.style.display = data.hasFire ? 'block' : 'none';
  }

  private drawMinimap(currentId: string, destId: string | null, progress: number): void {
    const ctx = this.minimapCtx;
    const cw = this.minimapCanvas.width;
    const ch = this.minimapCanvas.height;
    ctx.clearRect(0, 0, cw, ch);

    // Map location coordinates to canvas
    const mapX = (lx: number) => 10 + ((lx - 50) / 900) * (cw - 20);
    const mapY = (ly: number) => 10 + ((ly - 120) / 430) * (ch - 20);

    // Draw route lines
    ctx.strokeStyle = '#334';
    ctx.lineWidth = 1;
    for (const route of ROUTE_SEGMENTS) {
      const from = MAP_LOCATIONS.find(l => l.id === route.from);
      const to = MAP_LOCATIONS.find(l => l.id === route.to);
      if (!from || !to) continue;
      ctx.beginPath();
      ctx.moveTo(mapX(from.x), mapY(from.y));
      ctx.lineTo(mapX(to.x), mapY(to.y));
      ctx.stroke();
    }

    // Draw travel progress line
    if (destId) {
      const cur = MAP_LOCATIONS.find(l => l.id === currentId);
      const dest = MAP_LOCATIONS.find(l => l.id === destId);
      if (cur && dest) {
        const cx = mapX(cur.x);
        const cy = mapY(cur.y);
        const dx = mapX(dest.x);
        const dy = mapY(dest.y);
        // Progress line
        ctx.strokeStyle = '#4a4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (dx - cx) * progress, cy + (dy - cy) * progress);
        ctx.stroke();
        // Remaining
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(cx + (dx - cx) * progress, cy + (dy - cy) * progress);
        ctx.lineTo(dx, dy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw location dots
    for (const loc of MAP_LOCATIONS) {
      const x = mapX(loc.x);
      const y = mapY(loc.y);
      let color = '#556';
      let radius = 3;

      if (loc.id === currentId) {
        color = '#4f4';
        radius = 5;
      } else if (loc.id === destId) {
        color = '#f44';
        radius = 4;
      } else if (loc.id === 'port-echo') {
        color = '#ff4';
        radius = 4;
      }

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Labels for current, dest, and port-echo
      if (loc.id === currentId || loc.id === destId || loc.id === 'port-echo') {
        ctx.fillStyle = '#aab';
        ctx.font = '9px monospace';
        ctx.fillText(loc.name.length > 12 ? loc.name.substring(0, 12) + '..' : loc.name, x + 6, y + 3);
      }
    }
  }

  // --- Floating labels for interactable objects ---

  public updateLabels(labels: Array<{ text: string; x: number; y: number; dist: number }>): void {
    // Clear old labels
    while (this.labelContainer.children.length > labels.length) {
      this.labelContainer.removeChild(this.labelContainer.lastChild!);
    }
    // Add more if needed
    while (this.labelContainer.children.length < labels.length) {
      const el = document.createElement('div');
      el.style.cssText = `
        position:absolute; font-size:11px; color:#dda; text-shadow:0 0 4px #000;
        pointer-events:none; white-space:nowrap; transform:translateX(-50%);
      `;
      this.labelContainer.appendChild(el);
    }
    // Update
    for (let i = 0; i < labels.length; i++) {
      const el = this.labelContainer.children[i] as HTMLDivElement;
      const lbl = labels[i];
      el.textContent = lbl.text;
      el.style.left = `${lbl.x}px`;
      el.style.top = `${lbl.y}px`;
      const alpha = Math.max(0.3, 1 - lbl.dist / 8);
      el.style.opacity = String(alpha);
    }
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
      font-size:16px; font-weight:bold; color:#fd4;
      text-shadow: 0 0 6px #000; pointer-events:none;
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
