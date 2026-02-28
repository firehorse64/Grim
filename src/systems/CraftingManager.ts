import { CraftRecipe } from '../types/GameTypes';
import { InventoryManager } from './InventoryManager';
import { EventBus } from '../utils/EventBus';

/**
 * Manages crafting recipes and the crafting process.
 */
export class CraftingManager {
  private recipes: CraftRecipe[] = [];

  public create(): void {
    this.recipes = [
      {
        id: 'craft-barricade-boards',
        name: 'Barricade Boards',
        ingredients: [{ itemId: 'scrap-metal', quantity: 3 }],
        result: { itemId: 'barricade-boards', quantity: 1 },
        requiredStation: 'workbench',
      },
      {
        id: 'craft-cooked-meal',
        name: 'Cooked Meal',
        ingredients: [{ itemId: 'canned-food', quantity: 1 }],
        result: { itemId: 'cooked-meal', quantity: 1 },
        requiredStation: 'stove',
      },
      {
        id: 'craft-medkit',
        name: 'First Aid Kit',
        ingredients: [
          { itemId: 'bandage', quantity: 2 },
          { itemId: 'scrap-metal', quantity: 1 },
        ],
        result: { itemId: 'medkit', quantity: 1 },
        requiredStation: 'workbench',
      },
      {
        id: 'craft-repair-kit',
        name: 'Repair Kit',
        ingredients: [{ itemId: 'scrap-metal', quantity: 4 }],
        result: { itemId: 'repair-kit', quantity: 1 },
        requiredStation: 'workbench',
      },
      {
        id: 'craft-ammo',
        name: 'Makeshift Ammo',
        ingredients: [{ itemId: 'scrap-metal', quantity: 2 }],
        result: { itemId: 'ammo-rifle', quantity: 5 },
        requiredStation: 'workbench',
      },
      {
        id: 'craft-plant-fertilizer',
        name: 'Fertilizer',
        ingredients: [{ itemId: 'canned-food', quantity: 2 }],
        result: { itemId: 'fertilizer', quantity: 1 },
        requiredStation: 'none',
      },
    ];
  }

  /** Get all available recipes. */
  public getRecipes(): CraftRecipe[] {
    return this.recipes;
  }

  /** Get recipes available at a specific station. */
  public getRecipesForStation(station: CraftRecipe['requiredStation']): CraftRecipe[] {
    return this.recipes.filter(r => r.requiredStation === station || r.requiredStation === 'none');
  }

  /** Check if the player can craft a recipe. */
  public canCraft(recipeId: string, inventory: InventoryManager): boolean {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe) return false;

    for (const ing of recipe.ingredients) {
      if (!inventory.hasItem(ing.itemId, ing.quantity)) return false;
    }
    return true;
  }

  /** Craft an item — consume ingredients and add result. */
  public craft(recipeId: string, inventory: InventoryManager): boolean {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe || !this.canCraft(recipeId, inventory)) return false;

    // Consume ingredients
    for (const ing of recipe.ingredients) {
      inventory.removeItem(ing.itemId, ing.quantity);
    }

    // Add result — need to figure out the result item properties
    const resultInfo = this.getItemInfo(recipe.result.itemId);
    inventory.addItem(
      recipe.result.itemId,
      resultInfo.name,
      resultInfo.type,
      recipe.result.quantity,
      resultInfo.icon,
    );

    EventBus.emit('craft:completed', recipe.name);
    return true;
  }

  /** Get item metadata by id. */
  private getItemInfo(itemId: string): { name: string; type: 'food' | 'material' | 'medicine' | 'ammo' | 'tool'; icon: string } {
    const items: Record<string, { name: string; type: 'food' | 'material' | 'medicine' | 'ammo' | 'tool'; icon: string }> = {
      'barricade-boards': { name: 'Barricade Boards', type: 'material', icon: 'pickup-material' },
      'cooked-meal': { name: 'Cooked Meal', type: 'food', icon: 'pickup-food' },
      'medkit': { name: 'First Aid Kit', type: 'medicine', icon: 'pickup-medicine' },
      'repair-kit': { name: 'Repair Kit', type: 'tool', icon: 'pickup-material' },
      'ammo-rifle': { name: 'Rifle Ammo', type: 'ammo', icon: 'pickup-material' },
      'fertilizer': { name: 'Fertilizer', type: 'material', icon: 'pickup-material' },
      'canned-food': { name: 'Canned Food', type: 'food', icon: 'pickup-food' },
      'scrap-metal': { name: 'Scrap Metal', type: 'material', icon: 'pickup-material' },
      'bandage': { name: 'Bandage', type: 'medicine', icon: 'pickup-medicine' },
      'water-bottle': { name: 'Water Bottle', type: 'food', icon: 'pickup-water' },
    };
    return items[itemId] ?? { name: itemId, type: 'material', icon: 'pickup-material' };
  }
}
