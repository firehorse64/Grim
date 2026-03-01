import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';
import {
  MAP_LOCATIONS,
  ROUTE_SEGMENTS,
  MapLocation,
  getReachableLocations,
  getRoute,
} from '../data/LocationData';

/**
 * MapScene — overlay showing the world map, current location, and destination selection.
 * Only connected locations can be selected.
 */
export class MapScene extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Rectangle;
  private locationDots: Map<string, Phaser.GameObjects.Container> = new Map();
  private routeLines: Phaser.GameObjects.Graphics | null = null;
  private infoText!: Phaser.GameObjects.Text;
  private selectBtn!: Phaser.GameObjects.Container;

  private currentLocationId: string = 'riverside';
  private selectedLocationId: string | null = null;
  private currentDestinationId: string | null = null;
  private reachableIds: Set<string> = new Set();

  private escKey!: Phaser.Input.Keyboard.Key;
  private mKey!: Phaser.Input.Keyboard.Key;

  // Map display area
  private mapX = 60;
  private mapY = 80;
  private mapW = GAME_WIDTH - 120;
  private mapH = GAME_HEIGHT - 200;

  constructor() {
    super({ key: 'MapScene' });
  }

  init(data: { currentLocation: string; destination: string | null }): void {
    this.currentLocationId = data.currentLocation;
    this.currentDestinationId = data.destination;
    this.selectedLocationId = null;
  }

  create(): void {
    this.locationDots = new Map();

    // Overlay
    this.overlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.85,
    ).setDepth(0);

    // Title
    this.add.text(GAME_WIDTH / 2, 25, 'RAIL MAP', {
      fontSize: '24px', fontFamily: 'monospace', color: '#ccaa66', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(1);

    this.add.text(GAME_WIDTH / 2, 50, 'Select a connected destination to travel to', {
      fontSize: '10px', fontFamily: 'monospace', color: '#888888',
    }).setOrigin(0.5).setDepth(1);

    // Get reachable locations
    const reachable = getReachableLocations(this.currentLocationId);
    this.reachableIds = new Set(reachable.map(l => l.id));

    // Draw route lines
    this.routeLines = this.add.graphics().setDepth(1);
    for (const route of ROUTE_SEGMENTS) {
      const from = MAP_LOCATIONS.find(l => l.id === route.from);
      const to = MAP_LOCATIONS.find(l => l.id === route.to);
      if (!from || !to) continue;

      const fx = this.mapX + (from.x / 1000) * this.mapW;
      const fy = this.mapY + (from.y / 600) * this.mapH;
      const tx = this.mapX + (to.x / 1000) * this.mapW;
      const ty = this.mapY + (to.y / 600) * this.mapH;

      const isReachable = (route.from === this.currentLocationId && this.reachableIds.has(route.to)) ||
                          (route.to === this.currentLocationId && this.reachableIds.has(route.from));

      this.routeLines.lineStyle(isReachable ? 2 : 1, isReachable ? 0x888866 : 0x333333, isReachable ? 0.8 : 0.4);
      this.routeLines.beginPath();
      this.routeLines.moveTo(fx, fy);
      this.routeLines.lineTo(tx, ty);
      this.routeLines.strokePath();

      // Distance label
      const mx = (fx + tx) / 2;
      const my = (fy + ty) / 2;
      this.add.text(mx, my, `${route.distance}km`, {
        fontSize: '7px', fontFamily: 'monospace', color: '#555555',
      }).setOrigin(0.5).setDepth(1);
    }

    // Draw location dots
    for (const loc of MAP_LOCATIONS) {
      const lx = this.mapX + (loc.x / 1000) * this.mapW;
      const ly = this.mapY + (loc.y / 600) * this.mapH;

      const container = this.add.container(lx, ly).setDepth(2);

      // Dot
      const isCurrent = loc.id === this.currentLocationId;
      const isReachable = this.reachableIds.has(loc.id);
      const isDest = loc.id === this.currentDestinationId;

      let dotColor = 0x444444;
      let dotRadius = 5;
      if (isCurrent) { dotColor = 0x44ff44; dotRadius = 7; }
      else if (isDest) { dotColor = 0xff8844; dotRadius = 6; }
      else if (isReachable) { dotColor = 0x88aacc; dotRadius = 6; }
      else if (loc.id === 'port-echo') { dotColor = 0xffcc44; dotRadius = 7; }

      const dot = this.add.circle(0, 0, dotRadius, dotColor);
      container.add(dot);

      // Type icon
      let typeIndicator = '';
      if (loc.type === 'city') typeIndicator = ' [CITY]';
      else if (loc.type === 'town') typeIndicator = ' [TOWN]';
      else if (loc.type === 'outpost') typeIndicator = ' [OUTPOST]';

      // Label
      const label = this.add.text(0, dotRadius + 4, loc.name + typeIndicator, {
        fontSize: '8px', fontFamily: 'monospace',
        color: isCurrent ? '#44ff44' : isDest ? '#ff8844' : isReachable ? '#aaccee' : '#555555',
      }).setOrigin(0.5, 0);
      container.add(label);

      // Danger indicator
      if (loc.dangerLevel >= 3) {
        const danger = this.add.text(dotRadius + 4, -4, '!'.repeat(loc.dangerLevel - 2), {
          fontSize: '8px', fontFamily: 'monospace', color: '#ff4444',
        });
        container.add(danger);
      }

      // Interactivity for reachable locations
      if (isReachable && !isCurrent) {
        container.setSize(60, 30);
        container.setInteractive(
          new Phaser.Geom.Rectangle(-30, -15, 60, 30),
          Phaser.Geom.Rectangle.Contains,
        );
        container.on('pointerover', () => {
          dot.setScale(1.5);
          label.setColor('#ffffff');
          this.showLocationInfo(loc);
        });
        container.on('pointerout', () => {
          dot.setScale(1);
          label.setColor('#aaccee');
        });
        container.on('pointerdown', () => {
          this.selectedLocationId = loc.id;
          this.showLocationInfo(loc);
          this.selectBtn.setVisible(true);
        });
      }

      this.locationDots.set(loc.id, container);
    }

    // Info panel (bottom)
    this.infoText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 110, 'Click a connected location to see details', {
      fontSize: '11px', fontFamily: 'monospace', color: '#aaaaaa',
      wordWrap: { width: GAME_WIDTH - 200 }, align: 'center',
    }).setOrigin(0.5, 0).setDepth(2);

    // Select destination button
    const btnBg = this.add.rectangle(0, 0, 160, 34, 0x225522, 1).setStrokeStyle(2, 0x44aa44);
    const btnText = this.add.text(0, 0, 'SET DESTINATION', {
      fontSize: '14px', fontFamily: 'monospace', color: '#88ff88', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.selectBtn = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 60, [btnBg, btnText]).setDepth(2);
    this.selectBtn.setSize(160, 34);
    this.selectBtn.setInteractive(
      new Phaser.Geom.Rectangle(-80, -17, 160, 34),
      Phaser.Geom.Rectangle.Contains,
    );
    this.selectBtn.on('pointerdown', () => this.confirmDestination());
    this.selectBtn.on('pointerover', () => btnBg.setFillStyle(0x336633));
    this.selectBtn.on('pointerout', () => btnBg.setFillStyle(0x225522));
    this.selectBtn.setVisible(false);

    // Legend
    this.add.text(this.mapX, GAME_HEIGHT - 30, 'Green = You  |  Blue = Reachable  |  Orange = Current Destination  |  Gold = The Coast (Goal)', {
      fontSize: '8px', fontFamily: 'monospace', color: '#666666',
    }).setDepth(1);

    // Controls
    this.add.text(GAME_WIDTH - 60, GAME_HEIGHT - 30, 'M/ESC: Close', {
      fontSize: '9px', fontFamily: 'monospace', color: '#555566',
    }).setOrigin(1, 0).setDepth(1);

    // Input
    const kb = this.input.keyboard!;
    this.escKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.mKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M);
  }

  private showLocationInfo(loc: MapLocation): void {
    const route = getRoute(this.currentLocationId, loc.id);
    const distText = route ? `Distance: ${route.distance}km` : '';
    const waystops = route && route.waystops.length > 0
      ? `Possible stops along the way: ${route.waystops.length}`
      : '';
    this.infoText.setText(
      `${loc.name} (${loc.type.toUpperCase()}) — Danger: ${'*'.repeat(loc.dangerLevel)}\n` +
      `${loc.description}\n${distText}  ${waystops}`
    );
  }

  private confirmDestination(): void {
    if (!this.selectedLocationId) return;
    EventBus.emit('map:set-destination', this.selectedLocationId);
    this.closeMap();
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.escKey) || Phaser.Input.Keyboard.JustDown(this.mKey)) {
      this.closeMap();
    }
  }

  private closeMap(): void {
    this.scene.stop();
    const gameScene = this.scene.get('GameScene');
    if (gameScene) {
      gameScene.scene.resume();
    }
  }
}
