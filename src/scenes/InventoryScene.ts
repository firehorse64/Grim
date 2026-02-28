import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { InventoryItem, CraftRecipe } from '../types/GameTypes';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';
import { InventoryManager } from '../systems/InventoryManager';
import { CraftingManager } from '../systems/CraftingManager';

/**
 * InventoryScene — overlay showing inventory grid and crafting.
 * Pauses the game while open.
 */
export class InventoryScene extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Rectangle;
  private slots: Phaser.GameObjects.Container[] = [];
  private itemTexts: Phaser.GameObjects.Text[] = [];
  private selectedIndex: number = 0;
  private detailText!: Phaser.GameObjects.Text;
  private craftButtons: Phaser.GameObjects.Container[] = [];

  // References (set via data)
  private inventory!: InventoryManager;
  private crafting!: CraftingManager;
  private nearStation: string = 'none';

  private tabKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private leftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private useKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'InventoryScene' });
  }

  init(data: { inventory: InventoryManager; crafting: CraftingManager; nearStation?: string }): void {
    this.inventory = data.inventory;
    this.crafting = data.crafting;
    this.nearStation = data.nearStation ?? 'none';
    this.selectedIndex = 0;
  }

  create(): void {
    this.slots = [];
    this.itemTexts = [];
    this.craftButtons = [];

    // Dark overlay
    this.overlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75,
    ).setDepth(0);

    // Title
    this.add.text(GAME_WIDTH / 2, 30, 'INVENTORY', {
      fontSize: '24px', fontFamily: 'monospace', color: '#ccccdd', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(1);

    // Inventory grid (5 columns × 4 rows)
    const cols = 5;
    const slotSize = 36;
    const gap = 4;
    const gridW = cols * (slotSize + gap);
    const startX = GAME_WIDTH / 2 - gridW / 2 - 80;
    const startY = 70;

    const items = this.inventory.getItems();

    for (let i = 0; i < 20; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const sx = startX + col * (slotSize + gap);
      const sy = startY + row * (slotSize + gap);

      const container = this.add.container(sx + slotSize / 2, sy + slotSize / 2).setDepth(1);
      const bg = this.add.image(0, 0, i === 0 ? 'inv-slot-selected' : 'inv-slot');
      bg.setDisplaySize(slotSize, slotSize);
      container.add(bg);

      if (i < items.length) {
        const icon = this.add.image(0, -4, items[i].icon);
        icon.setDisplaySize(16, 16);
        container.add(icon);

        const qty = this.add.text(8, 6, `${items[i].quantity}`, {
          fontSize: '8px', fontFamily: 'monospace', color: '#ffffff',
        }).setOrigin(1, 0);
        container.add(qty);
        this.itemTexts.push(qty);
      }

      container.setInteractive(
        new Phaser.Geom.Rectangle(-slotSize / 2, -slotSize / 2, slotSize, slotSize),
        Phaser.Geom.Rectangle.Contains,
      );
      container.on('pointerdown', () => this.selectSlot(i));

      this.slots.push(container);
    }

    // Item detail panel
    this.detailText = this.add.text(startX, startY + 4 * (slotSize + gap) + 20, '', {
      fontSize: '11px', fontFamily: 'monospace', color: '#aaaaaa', wordWrap: { width: gridW },
    }).setDepth(1);

    // Use button
    const useBtn = this.add.text(startX + gridW - 60, startY + 4 * (slotSize + gap) + 20, '[E] Use', {
      fontSize: '12px', fontFamily: 'monospace', color: '#88aaff', fontStyle: 'bold',
    }).setDepth(1).setInteractive();
    useBtn.on('pointerdown', () => this.useSelected());

    // Crafting panel (right side)
    this.createCraftingPanel();

    // Controls hint
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 20, 'TAB/ESC: Close  |  E: Use  |  Arrow Keys: Navigate', {
      fontSize: '9px', fontFamily: 'monospace', color: '#555566',
    }).setOrigin(0.5).setDepth(1);

    // Input
    const kb = this.input.keyboard!;
    this.tabKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.escKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.upKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.leftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.useKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.updateDetail();
  }

  private createCraftingPanel(): void {
    const panelX = GAME_WIDTH / 2 + 60;
    const panelY = 70;

    this.add.text(panelX, panelY - 20, 'CRAFTING', {
      fontSize: '14px', fontFamily: 'monospace', color: '#ccaa44', fontStyle: 'bold',
    }).setDepth(1);

    const recipes = this.crafting.getRecipesForStation(this.nearStation as any);
    for (let i = 0; i < recipes.length; i++) {
      const recipe = recipes[i];
      const ry = panelY + i * 40;
      const canCraft = this.crafting.canCraft(recipe.id, this.inventory);

      const container = this.add.container(panelX, ry).setDepth(1);

      const nameTxt = this.add.text(0, 0, recipe.name, {
        fontSize: '11px', fontFamily: 'monospace',
        color: canCraft ? '#aaddaa' : '#666666',
      });
      container.add(nameTxt);

      // Ingredients list
      const ingText = recipe.ingredients.map(ing => {
        const have = this.inventory.getCount(ing.itemId);
        const color = have >= ing.quantity ? '#88aa88' : '#aa6666';
        return `${ing.itemId.replace(/-/g, ' ')}:${have}/${ing.quantity}`;
      }).join('  ');

      const ingTxt = this.add.text(0, 14, ingText, {
        fontSize: '8px', fontFamily: 'monospace', color: '#888888',
      });
      container.add(ingTxt);

      if (canCraft) {
        const craftBtn = this.add.text(200, 4, '[CRAFT]', {
          fontSize: '10px', fontFamily: 'monospace', color: '#88ff88', fontStyle: 'bold',
        }).setInteractive();
        craftBtn.on('pointerdown', () => {
          this.crafting.craft(recipe.id, this.inventory);
          this.refreshUI();
        });
        container.add(craftBtn);
      }

      this.craftButtons.push(container);
    }
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.tabKey) || Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.closeInventory();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
      this.selectSlot(Math.max(0, this.selectedIndex - 1));
    }
    if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
      this.selectSlot(Math.min(19, this.selectedIndex + 1));
    }
    if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
      this.selectSlot(Math.max(0, this.selectedIndex - 5));
    }
    if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
      this.selectSlot(Math.min(19, this.selectedIndex + 5));
    }
    if (Phaser.Input.Keyboard.JustDown(this.useKey)) {
      this.useSelected();
    }
  }

  private selectSlot(index: number): void {
    // Deselect old
    if (this.slots[this.selectedIndex]) {
      const oldBg = this.slots[this.selectedIndex].getAt(0) as Phaser.GameObjects.Image;
      oldBg.setTexture('inv-slot');
    }
    // Select new
    this.selectedIndex = index;
    if (this.slots[this.selectedIndex]) {
      const newBg = this.slots[this.selectedIndex].getAt(0) as Phaser.GameObjects.Image;
      newBg.setTexture('inv-slot-selected');
    }
    this.updateDetail();
  }

  private updateDetail(): void {
    const items = this.inventory.getItems();
    if (this.selectedIndex < items.length) {
      const item = items[this.selectedIndex];
      this.detailText.setText(`${item.name} (×${item.quantity}) — ${item.type}`);
    } else {
      this.detailText.setText('Empty slot');
    }
  }

  private useSelected(): void {
    const items = this.inventory.getItems();
    if (this.selectedIndex >= items.length) return;

    const item = items[this.selectedIndex];
    switch (item.type) {
      case 'food':
        EventBus.emit('inventory:use-food', item);
        this.inventory.removeItem(item.id, 1);
        break;
      case 'medicine':
        EventBus.emit('inventory:use-medicine', item);
        this.inventory.removeItem(item.id, 1);
        break;
    }
    this.refreshUI();
  }

  private refreshUI(): void {
    // Quick refresh — close and reopen
    this.scene.restart({
      inventory: this.inventory,
      crafting: this.crafting,
      nearStation: this.nearStation,
    });
  }

  private closeInventory(): void {
    this.scene.stop();
    const gameScene = this.scene.get('GameScene');
    if (gameScene) {
      gameScene.scene.resume();
    }
    EventBus.emit('inventory:closed');
  }
}
