import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';
import { UpgradeCategory, UpgradeDefinition } from '../types/UpgradeTypes';
import { WeaponType } from '../types/WeaponTypes';
import { WEAPON_DATA } from '../data/WeaponData';
import { UPGRADES } from '../data/UpgradeData';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';

/**
 * ShopScene - Between-wave upgrade shop.
 *
 * Displayed as a semi-transparent overlay on top of the paused GameScene.
 * Players can buy weapons, ammo, health, and upgrades using currency
 * earned from zombie kills.
 */

// --- Shop item definitions (weapons, consumables, etc.) ---

interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: UpgradeCategory | 'consumable';
  tier?: number;
  maxTier?: number;
  action: () => void;
  canBuy: () => boolean;
}

export class ShopScene extends Phaser.Scene {
  // ---- State ----
  private currency: number = 0;
  private currentWave: number = 0;
  private purchasedUpgrades: string[] = [];

  // ---- UI ----
  private overlay!: Phaser.GameObjects.Rectangle;
  private titleText!: Phaser.GameObjects.Text;
  private currencyDisplay!: Phaser.GameObjects.Text;
  private tabButtons: Phaser.GameObjects.Container[] = [];
  private itemCards: Phaser.GameObjects.Container[] = [];
  private currentTab: string = 'WEAPONS';
  private readyButton!: Phaser.GameObjects.Container;
  private feedbackText!: Phaser.GameObjects.Text;

  // ---- Content area ----
  private contentContainer!: Phaser.GameObjects.Container;
  private scrollY: number = 0;

  // ---- Tabs ----
  private static readonly TABS = ['WEAPONS', 'PLAYER', 'DEFENSE', 'SPECIAL'];
  private static readonly TAB_TO_CATEGORY: Record<string, UpgradeCategory> = {
    WEAPONS: UpgradeCategory.WEAPON,
    PLAYER: UpgradeCategory.PLAYER,
    DEFENSE: UpgradeCategory.DEFENSE,
    SPECIAL: UpgradeCategory.SPECIAL,
  };

  // ---- Shop items (consumables / weapon unlocks) ----
  private shopItems: ShopItem[] = [];

  constructor() {
    super({ key: 'ShopScene' });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  init(data: { currency: number; wave: number; purchasedUpgrades: string[] }): void {
    this.currency = data.currency ?? 0;
    this.currentWave = data.wave ?? 1;
    this.purchasedUpgrades = data.purchasedUpgrades ?? [];
    this.scrollY = 0;
  }

  create(): void {
    this.createOverlay();
    this.createTitle();
    this.createCurrencyDisplay();
    this.createTabs();
    this.createContentArea();
    this.createReadyButton();
    this.createFeedbackText();

    this.buildShopItems();
    this.selectTab('WEAPONS');

    // Subscribe to currency changes
    EventBus.on(GameEvents.CURRENCY_CHANGED, this.onCurrencyChanged, this);

    this.events.once('shutdown', () => {
      EventBus.off(GameEvents.CURRENCY_CHANGED, this.onCurrencyChanged, this);
    });
  }

  // ------------------------------------------------------------------
  // Overlay
  // ------------------------------------------------------------------

  private createOverlay(): void {
    this.overlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0x000000, 0.75
    ).setDepth(0);
  }

  // ------------------------------------------------------------------
  // Title
  // ------------------------------------------------------------------

  private createTitle(): void {
    this.titleText = this.add.text(GAME_WIDTH / 2, 30, 'ARMORY', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '40px',
      color: '#cc8833',
      fontStyle: 'bold',
      stroke: '#331100',
      strokeThickness: 3,
    })
      .setOrigin(0.5, 0.5)
      .setDepth(10);

    // Decorative line under title
    const lineGfx = this.add.graphics().setDepth(10);
    lineGfx.lineStyle(1, 0x664422, 0.5);
    lineGfx.beginPath();
    lineGfx.moveTo(GAME_WIDTH / 2 - 200, 52);
    lineGfx.lineTo(GAME_WIDTH / 2 + 200, 52);
    lineGfx.strokePath();
  }

  // ------------------------------------------------------------------
  // Currency display
  // ------------------------------------------------------------------

  private createCurrencyDisplay(): void {
    // Coin icon
    const coinGfx = this.add.graphics().setDepth(10);
    coinGfx.fillStyle(0xffcc22, 1);
    coinGfx.fillCircle(GAME_WIDTH - 140, 32, 10);
    coinGfx.lineStyle(1, 0xaa8800, 1);
    coinGfx.strokeCircle(GAME_WIDTH - 140, 32, 10);

    this.add.text(GAME_WIDTH - 140, 32, '$', {
      fontFamily: '"Courier New", monospace',
      fontSize: '11px',
      color: '#886600',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(11);

    this.currencyDisplay = this.add.text(GAME_WIDTH - 124, 32, String(this.currency), {
      fontFamily: '"Courier New", monospace',
      fontSize: '22px',
      color: '#ffcc44',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    })
      .setOrigin(0, 0.5)
      .setDepth(10);
  }

  // ------------------------------------------------------------------
  // Tabs
  // ------------------------------------------------------------------

  private createTabs(): void {
    const tabWidth = 130;
    const tabHeight = 32;
    const totalW = ShopScene.TABS.length * (tabWidth + 8);
    const startX = (GAME_WIDTH - totalW) / 2 + tabWidth / 2;
    const y = 72;

    for (let i = 0; i < ShopScene.TABS.length; i++) {
      const tabName = ShopScene.TABS[i];
      const x = startX + i * (tabWidth + 8);

      const container = this.add.container(x, y).setDepth(10);

      const bg = this.add.rectangle(0, 0, tabWidth, tabHeight, 0x111122, 0.8)
        .setStrokeStyle(1, 0x333355);

      const text = this.add.text(0, 0, tabName, {
        fontFamily: '"Courier New", monospace',
        fontSize: '13px',
        color: '#888899',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5);

      container.add([bg, text]);
      container.setSize(tabWidth, tabHeight);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-tabWidth / 2, -tabHeight / 2, tabWidth, tabHeight),
        Phaser.Geom.Rectangle.Contains
      );

      container.on('pointerdown', () => {
        this.selectTab(tabName);
      });

      container.on('pointerover', () => {
        if (this.currentTab !== tabName) {
          bg.setFillStyle(0x1a1a33, 0.9);
        }
      });

      container.on('pointerout', () => {
        if (this.currentTab !== tabName) {
          bg.setFillStyle(0x111122, 0.8);
          bg.setStrokeStyle(1, 0x333355);
        }
      });

      container.setData('bg', bg);
      container.setData('text', text);
      container.setData('name', tabName);

      this.tabButtons.push(container);
    }
  }

  private selectTab(tabName: string): void {
    this.currentTab = tabName;

    // Update tab visuals
    for (const tab of this.tabButtons) {
      const bg = tab.getData('bg') as Phaser.GameObjects.Rectangle;
      const text = tab.getData('text') as Phaser.GameObjects.Text;
      const name = tab.getData('name') as string;

      if (name === tabName) {
        bg.setFillStyle(0x222244, 1);
        bg.setStrokeStyle(2, 0xcc8833);
        text.setColor('#ffcc44');
      } else {
        bg.setFillStyle(0x111122, 0.8);
        bg.setStrokeStyle(1, 0x333355);
        text.setColor('#888899');
      }
    }

    this.refreshItems();
  }

  // ------------------------------------------------------------------
  // Content area
  // ------------------------------------------------------------------

  private createContentArea(): void {
    this.contentContainer = this.add.container(0, 0).setDepth(10);
  }

  private clearItems(): void {
    for (const card of this.itemCards) {
      card.destroy();
    }
    this.itemCards = [];
  }

  private refreshItems(): void {
    this.clearItems();

    const category = ShopScene.TAB_TO_CATEGORY[this.currentTab];
    let items: ShopItem[];

    if (this.currentTab === 'WEAPONS') {
      // Show weapon unlocks/ammo + weapon upgrades
      items = this.shopItems.filter(
        item => item.category === 'consumable' || item.category === UpgradeCategory.WEAPON
      );
    } else {
      items = this.shopItems.filter(item => item.category === category);
    }

    const cardWidth = 280;
    const cardHeight = 80;
    const cols = 2;
    const padX = 40;
    const padY = 12;
    const startX = (GAME_WIDTH - (cols * cardWidth + (cols - 1) * padX)) / 2;
    const startY = 110;

    for (let i = 0; i < items.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardWidth + padX) + cardWidth / 2;
      const y = startY + row * (cardHeight + padY) + cardHeight / 2;

      const card = this.createItemCard(items[i], x, y, cardWidth, cardHeight);
      this.itemCards.push(card);
    }
  }

  private createItemCard(
    item: ShopItem,
    x: number,
    y: number,
    w: number,
    h: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(11);

    const canAfford = item.canBuy();

    // Background
    const bgColor = canAfford ? 0x141428 : 0x0e0e1a;
    const borderColor = canAfford ? 0x444466 : 0x222233;
    const bg = this.add.rectangle(0, 0, w, h, bgColor, 0.9)
      .setStrokeStyle(1, borderColor);

    // Name
    const nameColor = canAfford ? '#ccccdd' : '#555566';
    const nameText = this.add.text(-w / 2 + 12, -h / 2 + 8, item.name, {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      color: nameColor,
      fontStyle: 'bold',
    });

    // Description
    const descColor = canAfford ? '#888899' : '#444455';
    const descText = this.add.text(-w / 2 + 12, -h / 2 + 26, item.description, {
      fontFamily: '"Courier New", monospace',
      fontSize: '11px',
      color: descColor,
      wordWrap: { width: w - 90 },
    });

    // Tier indicator (small dots)
    const tierContainer = this.add.container(-w / 2 + 12, h / 2 - 14);
    if (item.tier != null && item.maxTier != null) {
      for (let t = 0; t < item.maxTier; t++) {
        const dotColor = t < item.tier ? 0xcc8833 : 0x333344;
        const dot = this.add.graphics();
        dot.fillStyle(dotColor, 1);
        dot.fillCircle(t * 12, 0, 4);
        tierContainer.add(dot);
      }
    }

    // Cost
    const costColor = canAfford ? '#ffcc44' : '#663322';
    const costText = this.add.text(w / 2 - 12, -h / 2 + 8, `$${item.cost}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      color: costColor,
      fontStyle: 'bold',
    }).setOrigin(1, 0);

    // Buy button
    const btnW = 60;
    const btnH = 24;
    const btnX = w / 2 - 12 - btnW / 2;
    const btnY = h / 2 - 14;
    const btnBgColor = canAfford ? 0x224422 : 0x1a1a22;
    const btnBorderColor = canAfford ? 0x44aa44 : 0x333344;
    const btnBg = this.add.rectangle(btnX, btnY, btnW, btnH, btnBgColor, 0.9)
      .setStrokeStyle(1, btnBorderColor);

    const btnTextColor = canAfford ? '#44dd44' : '#444455';
    const btnText = this.add.text(btnX, btnY, 'BUY', {
      fontFamily: '"Courier New", monospace',
      fontSize: '12px',
      color: btnTextColor,
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    container.add([bg, nameText, descText, tierContainer, costText, btnBg, btnText]);
    container.setSize(w, h);

    if (canAfford) {
      // Make the buy button interactive
      btnBg.setInteractive();

      btnBg.on('pointerover', () => {
        btnBg.setFillStyle(0x336633, 1);
      });

      btnBg.on('pointerout', () => {
        btnBg.setFillStyle(0x224422, 0.9);
      });

      btnBg.on('pointerdown', () => {
        this.buyItem(item);
      });

      // Whole card hover
      bg.setInteractive();
      bg.on('pointerover', () => {
        bg.setStrokeStyle(2, 0x6688aa);
      });
      bg.on('pointerout', () => {
        bg.setStrokeStyle(1, borderColor);
      });
    }

    return container;
  }

  // ------------------------------------------------------------------
  // Shop item definitions
  // ------------------------------------------------------------------

  private buildShopItems(): void {
    this.shopItems = [];

    // --- Consumables (always in WEAPONS tab) ---

    // Ammo refill
    this.shopItems.push({
      id: 'ammo-refill',
      name: 'Ammo Resupply',
      description: 'Refill ammo for all weapons.',
      cost: 30,
      category: 'consumable',
      action: () => {
        EventBus.emit(GameEvents.ITEM_PURCHASED, { itemType: 'ammo-refill', cost: 30 });
      },
      canBuy: () => this.currency >= 30,
    });

    // Health kit
    this.shopItems.push({
      id: 'health-kit',
      name: 'Health Kit',
      description: 'Restore 50 HP.',
      cost: 25,
      category: 'consumable',
      action: () => {
        EventBus.emit(GameEvents.ITEM_PURCHASED, { itemType: 'health-kit', cost: 25 });
        EventBus.emit(GameEvents.PLAYER_HEALED, { amount: 50 });
      },
      canBuy: () => this.currency >= 25,
    });

    // Full heal
    this.shopItems.push({
      id: 'full-heal',
      name: 'Full Restoration',
      description: 'Fully restore HP to maximum.',
      cost: 60,
      category: 'consumable',
      action: () => {
        EventBus.emit(GameEvents.ITEM_PURCHASED, { itemType: 'full-heal', cost: 60 });
        EventBus.emit(GameEvents.PLAYER_HEALED, { amount: 9999 });
      },
      canBuy: () => this.currency >= 60,
    });

    // --- Weapon unlocks ---

    const weaponUnlocks: { type: WeaponType; cost: number; waveReq: number }[] = [
      { type: WeaponType.SHOTGUN, cost: 80, waveReq: 2 },
      { type: WeaponType.SMG, cost: 100, waveReq: 3 },
      { type: WeaponType.RIFLE, cost: 150, waveReq: 5 },
      { type: WeaponType.GRENADE, cost: 60, waveReq: 4 },
    ];

    for (const wu of weaponUnlocks) {
      const unlockId = `unlock-${wu.type}`;
      const alreadyOwned = this.purchasedUpgrades.includes(unlockId);
      if (!alreadyOwned && this.currentWave >= wu.waveReq) {
        const weaponName = WEAPON_DATA[wu.type].name;
        this.shopItems.push({
          id: unlockId,
          name: `Unlock ${weaponName}`,
          description: `Add the ${weaponName} to your arsenal.`,
          cost: wu.cost,
          category: 'consumable',
          action: () => {
            EventBus.emit(GameEvents.UPGRADE_PURCHASED, { upgradeId: unlockId, cost: wu.cost });
            EventBus.emit(GameEvents.ITEM_PURCHASED, { itemType: unlockId, cost: wu.cost });
          },
          canBuy: () => this.currency >= wu.cost,
        });
      }
    }

    // --- Barricade purchases ---
    this.shopItems.push({
      id: 'barricade-wood',
      name: 'Wood Barricade',
      description: 'Place a wooden barricade on a train car.',
      cost: 30,
      category: UpgradeCategory.DEFENSE,
      action: () => {
        EventBus.emit(GameEvents.ITEM_PURCHASED, { itemType: 'barricade-wood', cost: 30 });
      },
      canBuy: () => this.currency >= 30,
    });

    this.shopItems.push({
      id: 'barricade-metal',
      name: 'Metal Barricade',
      description: 'Place a reinforced metal barricade.',
      cost: 75,
      category: UpgradeCategory.DEFENSE,
      action: () => {
        EventBus.emit(GameEvents.ITEM_PURCHASED, { itemType: 'barricade-metal', cost: 75 });
      },
      canBuy: () => this.currency >= 75,
    });

    this.shopItems.push({
      id: 'barricade-electric',
      name: 'Electric Barricade',
      description: 'Electrified barricade that damages zombies.',
      cost: 100,
      category: UpgradeCategory.DEFENSE,
      action: () => {
        EventBus.emit(GameEvents.ITEM_PURCHASED, { itemType: 'barricade-electric', cost: 100 });
      },
      canBuy: () => this.currency >= 100,
    });

    // --- Upgrades from UpgradeData ---
    for (const upgrade of UPGRADES) {
      const alreadyPurchased = this.purchasedUpgrades.includes(upgrade.id);
      if (alreadyPurchased) continue;

      // Check prerequisite
      if (upgrade.requires && !this.purchasedUpgrades.includes(upgrade.requires)) {
        continue; // prerequisite not met, skip
      }

      this.shopItems.push({
        id: upgrade.id,
        name: upgrade.name,
        description: upgrade.description,
        cost: upgrade.cost,
        category: upgrade.category,
        tier: upgrade.tier,
        maxTier: upgrade.maxTier,
        action: () => {
          EventBus.emit(GameEvents.UPGRADE_PURCHASED, {
            upgradeId: upgrade.id,
            cost: upgrade.cost,
          });
        },
        canBuy: () => this.currency >= upgrade.cost,
      });
    }
  }

  // ------------------------------------------------------------------
  // Buy action
  // ------------------------------------------------------------------

  private buyItem(item: ShopItem): void {
    if (!item.canBuy()) {
      this.showFeedback('Not enough currency!', '#ff4444');
      return;
    }

    // Deduct locally
    this.currency -= item.cost;
    this.currencyDisplay.setText(String(this.currency));

    // Execute action (emits events)
    item.action();

    // Track purchase
    if (!item.id.startsWith('ammo-') && !item.id.startsWith('health-') && !item.id.startsWith('full-') && !item.id.startsWith('barricade-')) {
      this.purchasedUpgrades.push(item.id);
    }

    this.showFeedback(`Purchased: ${item.name}`, '#44dd44');

    // Rebuild and refresh items to reflect changes
    this.buildShopItems();
    this.refreshItems();
  }

  // ------------------------------------------------------------------
  // Feedback text
  // ------------------------------------------------------------------

  private createFeedbackText(): void {
    this.feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 90, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      color: '#44dd44',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    })
      .setOrigin(0.5, 0.5)
      .setDepth(20)
      .setAlpha(0);
  }

  private showFeedback(message: string, color: string): void {
    this.feedbackText.setText(message);
    this.feedbackText.setColor(color);
    this.feedbackText.setAlpha(1);

    this.tweens.add({
      targets: this.feedbackText,
      alpha: 0,
      y: GAME_HEIGHT - 110,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => {
        this.feedbackText.setY(GAME_HEIGHT - 90);
      },
    });
  }

  // ------------------------------------------------------------------
  // Ready button
  // ------------------------------------------------------------------

  private createReadyButton(): void {
    const y = GAME_HEIGHT - 44;
    this.readyButton = this.add.container(GAME_WIDTH / 2, y).setDepth(20);

    const bg = this.add.rectangle(0, 0, 200, 40, 0x224422, 0.9)
      .setStrokeStyle(2, 0x44aa44);

    const text = this.add.text(0, 0, 'READY', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '22px',
      color: '#44dd44',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    this.readyButton.add([bg, text]);
    this.readyButton.setSize(200, 40);
    this.readyButton.setInteractive(
      new Phaser.Geom.Rectangle(-100, -20, 200, 40),
      Phaser.Geom.Rectangle.Contains
    );

    this.readyButton.on('pointerover', () => {
      bg.setFillStyle(0x336633, 1);
      text.setScale(1.05);
    });

    this.readyButton.on('pointerout', () => {
      bg.setFillStyle(0x224422, 0.9);
      text.setScale(1);
    });

    this.readyButton.on('pointerdown', () => {
      this.closeShop();
    });
  }

  private closeShop(): void {
    // Resume game scene
    this.scene.stop();
    EventBus.emit(GameEvents.GAME_RESUMED);

    const gameScene = this.scene.get('GameScene');
    if (gameScene) {
      gameScene.scene.resume();
    }
  }

  // ------------------------------------------------------------------
  // Currency sync
  // ------------------------------------------------------------------

  private onCurrencyChanged(amount: number): void {
    this.currency = amount;
    if (this.currencyDisplay) {
      this.currencyDisplay.setText(String(amount));
    }
  }
}
