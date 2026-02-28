import { InventoryItem } from '../types/GameTypes';
import { EventBus } from '../utils/EventBus';
import {
  INVENTORY_MAX_SLOTS,
  STARTING_AMMO,
  STARTING_FOOD,
  STARTING_MATERIALS,
} from '../data/BalanceConstants';

/**
 * Manages the player's inventory — items, quantities, add/remove.
 */
export class InventoryManager {
  private items: InventoryItem[] = [];
  private maxSlots: number = INVENTORY_MAX_SLOTS;

  public create(): void {
    this.items = [];
    // Starting items
    this.addItem('ammo-rifle', 'Rifle Ammo', 'ammo', STARTING_AMMO, 'pickup-material');
    this.addItem('canned-food', 'Canned Food', 'food', STARTING_FOOD, 'pickup-food');
    this.addItem('scrap-metal', 'Scrap Metal', 'material', STARTING_MATERIALS, 'pickup-material');
    this.addItem('bandage', 'Bandage', 'medicine', 2, 'pickup-medicine');
  }

  /** Add an item (stacks if same id exists). Returns false if full. */
  public addItem(id: string, name: string, type: InventoryItem['type'], quantity: number, icon: string): boolean {
    const existing = this.items.find(i => i.id === id);
    if (existing) {
      existing.quantity += quantity;
      EventBus.emit('inventory:changed', this.items);
      return true;
    }

    if (this.items.length >= this.maxSlots) {
      EventBus.emit('inventory:full');
      return false;
    }

    this.items.push({ id, name, type, quantity, icon });
    EventBus.emit('inventory:changed', this.items);
    return true;
  }

  /** Remove quantity of an item. Returns false if not enough. */
  public removeItem(id: string, quantity: number): boolean {
    const item = this.items.find(i => i.id === id);
    if (!item || item.quantity < quantity) return false;

    item.quantity -= quantity;
    if (item.quantity <= 0) {
      this.items = this.items.filter(i => i.id !== id);
    }
    EventBus.emit('inventory:changed', this.items);
    return true;
  }

  /** Check if player has at least `quantity` of an item. */
  public hasItem(id: string, quantity: number = 1): boolean {
    const item = this.items.find(i => i.id === id);
    return item !== undefined && item.quantity >= quantity;
  }

  /** Get a specific item. */
  public getItem(id: string): InventoryItem | undefined {
    return this.items.find(i => i.id === id);
  }

  /** Get all items. */
  public getItems(): InventoryItem[] {
    return this.items;
  }

  /** Get count of a specific item. */
  public getCount(id: string): number {
    return this.items.find(i => i.id === id)?.quantity ?? 0;
  }

  /** Is inventory full? */
  public isFull(): boolean {
    return this.items.length >= this.maxSlots;
  }

  /** Use a food item — returns restore amount or 0 if none available. */
  public useFood(): number {
    const food = this.items.find(i => i.type === 'food');
    if (!food || food.quantity <= 0) return 0;
    food.quantity--;
    if (food.quantity <= 0) {
      this.items = this.items.filter(i => i.id !== food.id);
    }
    EventBus.emit('inventory:changed', this.items);
    return 30; // restore amount
  }

  /** Use a medicine item — returns heal amount or 0. */
  public useMedicine(): number {
    const med = this.items.find(i => i.type === 'medicine');
    if (!med || med.quantity <= 0) return 0;
    med.quantity--;
    if (med.quantity <= 0) {
      this.items = this.items.filter(i => i.id !== med.id);
    }
    EventBus.emit('inventory:changed', this.items);
    return 25;
  }

  /** Get ammo count for rifle. */
  public getAmmo(): number {
    return this.getCount('ammo-rifle');
  }

  /** Use one ammo. Returns true if had ammo. */
  public useAmmo(): boolean {
    return this.removeItem('ammo-rifle', 1);
  }

  /** Serialize for saving. */
  public serialize(): InventoryItem[] {
    return JSON.parse(JSON.stringify(this.items));
  }

  /** Load from save data. */
  public deserialize(items: InventoryItem[]): void {
    this.items = items;
    EventBus.emit('inventory:changed', this.items);
  }
}
