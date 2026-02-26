import { UpgradeDefinition, UpgradeCategory } from '../types/UpgradeTypes';
import { UPGRADES } from '../data/UpgradeData';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';

// ─────────────────────────────────────────────────────────────────────────────
// UpgradeManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks purchased upgrades and applies their stat modifications to the
 * player and weapons. Reads available upgrades from UpgradeData.ts and
 * enforces prerequisite chains, costs, and tier limits.
 *
 * The manager does not directly hold a reference to the player object.
 * Instead, `purchaseUpgrade()` and `applyUpgrade()` accept a player-like
 * object whose stats are mutated. This keeps the manager decoupled from
 * the Entity class hierarchy.
 */
export class UpgradeManager {
  /** Set of purchased upgrade IDs. */
  public purchasedUpgrades: Set<string> = new Set();

  /** Cached lookup table for upgrade definitions by ID. */
  private upgradeMap: Map<string, UpgradeDefinition> = new Map();

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Initialise the upgrade manager. Builds the lookup table.
   */
  public create(): void {
    this.upgradeMap.clear();
    this.purchasedUpgrades.clear();

    for (const upgrade of UPGRADES) {
      this.upgradeMap.set(upgrade.id, upgrade);
    }
  }

  /**
   * Attempt to purchase an upgrade.
   *
   * @param id       The upgrade ID.
   * @param player   A player-like object with mutable stats. Expected shape:
   *                 `{ currency: number, maxHp: number, hp: number, speed: number,
   *                    regen: number, critChance: number, currencyMult: number,
   *                    barricadeHpMult: number,
   *                    getWeapon(type: string): { baseStats: Record<string, number> } | null }`
   * @returns `true` if the purchase succeeded.
   */
  public purchaseUpgrade(id: string, player: any): boolean {
    const upgrade = this.upgradeMap.get(id);
    if (!upgrade) {
      console.warn(`UpgradeManager: Unknown upgrade id "${id}"`);
      return false;
    }

    // Already purchased?
    if (this.purchasedUpgrades.has(id)) {
      return false;
    }

    // Check prerequisites
    if (upgrade.requires && !this.purchasedUpgrades.has(upgrade.requires)) {
      return false;
    }

    // Check affordability
    const currency: number = player.currency ?? 0;
    if (currency < upgrade.cost) {
      EventBus.emit(GameEvents.ITEM_PURCHASED, {
        success: false,
        id,
        reason: 'insufficient-funds',
      });
      return false;
    }

    // Deduct currency
    player.currency = currency - upgrade.cost;

    // Mark as purchased
    this.purchasedUpgrades.add(id);

    // Apply the upgrade effect
    this.applyUpgrade(id, player);

    // Emit events
    EventBus.emit(GameEvents.UPGRADE_PURCHASED, {
      id,
      name: upgrade.name,
      category: upgrade.category,
      cost: upgrade.cost,
    });

    EventBus.emit(GameEvents.CURRENCY_CHANGED, {
      amount: -upgrade.cost,
      reason: 'upgrade-purchase',
    });

    return true;
  }

  /**
   * Check if a specific upgrade can be purchased right now.
   *
   * @param id       The upgrade ID.
   * @param currency The player's current currency.
   */
  public canPurchase(id: string, currency: number): boolean {
    const upgrade = this.upgradeMap.get(id);
    if (!upgrade) return false;

    // Already purchased
    if (this.purchasedUpgrades.has(id)) return false;

    // Prerequisite not met
    if (upgrade.requires && !this.purchasedUpgrades.has(upgrade.requires)) return false;

    // Cannot afford
    if (currency < upgrade.cost) return false;

    return true;
  }

  /**
   * Returns all upgrades the player can currently see in the shop.
   * An upgrade is visible if:
   *   - It is NOT already purchased, AND
   *   - Its prerequisite IS purchased (or it has no prerequisite / is tier 1).
   */
  public getAvailableUpgrades(): UpgradeDefinition[] {
    const available: UpgradeDefinition[] = [];

    for (const upgrade of UPGRADES) {
      // Skip already purchased
      if (this.purchasedUpgrades.has(upgrade.id)) continue;

      // Show tier-1 upgrades unconditionally
      if (!upgrade.requires) {
        available.push(upgrade);
        continue;
      }

      // Show higher-tier upgrades only if prerequisite is purchased
      if (this.purchasedUpgrades.has(upgrade.requires)) {
        available.push(upgrade);
      }
    }

    return available;
  }

  /**
   * Returns all upgrades the player has already purchased.
   */
  public getPurchasedUpgrades(): UpgradeDefinition[] {
    return UPGRADES.filter((u) => this.purchasedUpgrades.has(u.id));
  }

  /**
   * Returns all upgrades in a given category.
   */
  public getUpgradesByCategory(category: UpgradeCategory): UpgradeDefinition[] {
    return UPGRADES.filter((u) => u.category === category);
  }

  /**
   * Returns a specific upgrade definition by ID.
   */
  public getUpgrade(id: string): UpgradeDefinition | undefined {
    return this.upgradeMap.get(id);
  }

  /**
   * Restore purchased upgrades from a saved list of IDs and re-apply them.
   * Used when loading a save file.
   */
  public restoreUpgrades(upgradeIds: string[], player: any): void {
    this.purchasedUpgrades.clear();

    for (const id of upgradeIds) {
      if (this.upgradeMap.has(id)) {
        this.purchasedUpgrades.add(id);
        this.applyUpgrade(id, player);
      }
    }
  }

  /**
   * Get the serializable list of purchased upgrade IDs (for saving).
   */
  public serialize(): string[] {
    return Array.from(this.purchasedUpgrades);
  }

  /**
   * Clean up.
   */
  public destroy(): void {
    this.purchasedUpgrades.clear();
    this.upgradeMap.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stat application
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Apply a single upgrade's stat modification to the player.
   *
   * Upgrade effects follow these conventions from UpgradeData:
   *
   * **Weapon upgrades** (category WEAPON):
   *   - `target` is the weapon type string (e.g. 'pistol').
   *   - `stat` is the WeaponStats key to modify (e.g. 'damage', 'clipSize').
   *   - `value` is:
   *     - A multiplier (e.g. 0.25 = +25%) for damage, spread, reloadTime.
   *     - An absolute additive value for clipSize.
   *
   * **Player upgrades** (category PLAYER):
   *   - `stat` is the player stat key (maxHp, speed, regen).
   *   - `value` is additive for maxHp, multiplicative for speed, boolean-like for regen.
   *
   * **Defense upgrades** (category DEFENSE):
   *   - `stat` is 'barricadeHp'.
   *   - `value` is a multiplicative increase (0.50 = +50%).
   *
   * **Special upgrades** (category SPECIAL):
   *   - `stat` is 'currencyMult' or 'critChance'.
   *   - `value` is additive (0.25 = +25% currency multiplier, 0.05 = +5% crit).
   */
  public applyUpgrade(id: string, player: any): void {
    const upgrade = this.upgradeMap.get(id);
    if (!upgrade) return;

    switch (upgrade.category) {
      case UpgradeCategory.WEAPON:
        this.applyWeaponUpgrade(upgrade, player);
        break;
      case UpgradeCategory.PLAYER:
        this.applyPlayerUpgrade(upgrade, player);
        break;
      case UpgradeCategory.DEFENSE:
        this.applyDefenseUpgrade(upgrade, player);
        break;
      case UpgradeCategory.SPECIAL:
        this.applySpecialUpgrade(upgrade, player);
        break;
    }
  }

  // ─── Weapon upgrades ───────────────────────────────────────────────────

  private applyWeaponUpgrade(upgrade: UpgradeDefinition, player: any): void {
    if (!upgrade.target) return;

    // Try to get the weapon object from the player
    const weapon = this.getPlayerWeapon(player, upgrade.target);
    if (!weapon) return;

    const stat = upgrade.stat;
    const value = upgrade.value;

    switch (stat) {
      case 'damage': {
        // Multiplicative: +25% = multiply by 1.25
        const current = weapon.baseStats?.damage ?? weapon.damage ?? 0;
        const newVal = Math.round(current * (1 + value));
        if (weapon.baseStats) {
          weapon.baseStats.damage = newVal;
        }
        break;
      }
      case 'clipSize': {
        // Additive: +6 clip size
        const current = weapon.baseStats?.clipSize ?? weapon.clipSize ?? 0;
        const newVal = current + value;
        if (weapon.baseStats) {
          weapon.baseStats.clipSize = newVal;
        }
        break;
      }
      case 'spread': {
        // Multiplicative decrease: -30% = multiply by 0.70
        const current = weapon.baseStats?.spread ?? weapon.spread ?? 0;
        const newVal = current * (1 + value); // value is negative, e.g. -0.30
        if (weapon.baseStats) {
          weapon.baseStats.spread = Math.max(0.005, newVal);
        }
        break;
      }
      case 'reloadTime': {
        // Multiplicative decrease: -20% = multiply by 0.80
        const current = weapon.baseStats?.reloadTime ?? weapon.reloadTime ?? 0;
        const newVal = Math.round(current * (1 + value)); // value is negative
        if (weapon.baseStats) {
          weapon.baseStats.reloadTime = Math.max(100, newVal);
        }
        break;
      }
      case 'fireRate': {
        // Multiplicative decrease for faster firing
        const current = weapon.baseStats?.fireRate ?? weapon.fireRate ?? 0;
        const newVal = Math.round(current * (1 + value));
        if (weapon.baseStats) {
          weapon.baseStats.fireRate = Math.max(30, newVal);
        }
        break;
      }
      default:
        // Generic stat assignment for future extensibility
        if (weapon.baseStats && stat in weapon.baseStats) {
          (weapon.baseStats as any)[stat] += value;
        }
        break;
    }
  }

  // ─── Player upgrades ───────────────────────────────────────────────────

  private applyPlayerUpgrade(upgrade: UpgradeDefinition, player: any): void {
    const stat = upgrade.stat;
    const value = upgrade.value;

    switch (stat) {
      case 'maxHp': {
        // Additive: +25 max HP
        const prevMax = player.maxHp ?? 100;
        player.maxHp = prevMax + value;
        // Also heal for the gained amount
        if (typeof player.hp === 'number') {
          player.hp = Math.min(player.hp + value, player.maxHp);
        }
        break;
      }
      case 'speed': {
        // Multiplicative: +15% move speed
        const prevSpeed = player.speed ?? player.moveSpeed ?? 200;
        const key = 'speed' in player ? 'speed' : 'moveSpeed';
        player[key] = Math.round(prevSpeed * (1 + value));
        break;
      }
      case 'regen': {
        // Enable or boost regeneration
        player.regen = (player.regen ?? 0) + value;
        break;
      }
      default:
        // Generic additive
        if (stat in player) {
          player[stat] = (player[stat] ?? 0) + value;
        }
        break;
    }
  }

  // ─── Defense upgrades ──────────────────────────────────────────────────

  private applyDefenseUpgrade(upgrade: UpgradeDefinition, player: any): void {
    const stat = upgrade.stat;
    const value = upgrade.value;

    switch (stat) {
      case 'barricadeHp': {
        // Multiplicative: +50% barricade HP
        // Store a cumulative multiplier on the player
        player.barricadeHpMult = (player.barricadeHpMult ?? 1.0) * (1 + value);
        break;
      }
      default:
        if (stat in player) {
          player[stat] = (player[stat] ?? 0) + value;
        }
        break;
    }
  }

  // ─── Special upgrades ─────────────────────────────────────────────────

  private applySpecialUpgrade(upgrade: UpgradeDefinition, player: any): void {
    const stat = upgrade.stat;
    const value = upgrade.value;

    switch (stat) {
      case 'currencyMult': {
        // Additive increase to currency multiplier
        player.currencyMult = (player.currencyMult ?? 1.0) + value;
        break;
      }
      case 'critChance': {
        // Additive increase to crit chance
        player.critChance = (player.critChance ?? 0.05) + value;
        break;
      }
      default:
        if (stat in player) {
          player[stat] = (player[stat] ?? 0) + value;
        }
        break;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /**
   * Retrieve a weapon from the player by its type string.
   * Supports several common player-weapon patterns.
   */
  private getPlayerWeapon(player: any, weaponType: string): any {
    // Pattern 1: player.getWeapon(type)
    if (typeof player.getWeapon === 'function') {
      return player.getWeapon(weaponType);
    }

    // Pattern 2: player.weapons map
    if (player.weapons instanceof Map) {
      return player.weapons.get(weaponType) ?? null;
    }

    // Pattern 3: player.weapons object / Record
    if (player.weapons && typeof player.weapons === 'object') {
      return player.weapons[weaponType] ?? null;
    }

    // Pattern 4: player.weaponSlots array with weaponType property
    if (Array.isArray(player.weaponSlots)) {
      return player.weaponSlots.find(
        (w: any) => w && (w.weaponType === weaponType || w.type === weaponType),
      ) ?? null;
    }

    return null;
  }
}
