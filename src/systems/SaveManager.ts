import { SaveData, SavedWeapon, GameSettings, DEFAULT_SETTINGS, SAVE_VERSION, SAVE_KEY } from '../types/SaveTypes';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';

// ─────────────────────────────────────────────────────────────────────────────
// SaveManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persistence system using localStorage. Handles saving, loading, versioning,
 * and migration of game state. Auto-saves are triggered at the start of each
 * wave via the EventBus.
 *
 * Save data is stored as JSON under the key defined by SAVE_KEY.
 * Version mismatches trigger migration logic; incompatible saves are discarded.
 */
export class SaveManager {
  private autoSaveEnabled: boolean = true;

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Initialise the save manager. Binds the auto-save listener to WAVE_START.
   */
  public create(): void {
    EventBus.on(GameEvents.WAVE_START, this.onWaveStart, this);
  }

  /**
   * Serialize and persist the current game state to localStorage.
   *
   * @param gameState An object containing the fields needed to build a SaveData.
   *   Expected shape:
   *   ```
   *   {
   *     wave: number,
   *     score: number,
   *     currency: number,
   *     playerHp: number,
   *     playerMaxHp: number,
   *     weapons: SavedWeapon[],
   *     upgrades: string[],
   *     survivors: number,
   *     settings?: GameSettings,
   *   }
   *   ```
   */
  public save(gameState: {
    wave: number;
    score: number;
    currency: number;
    playerHp: number;
    playerMaxHp: number;
    weapons: SavedWeapon[];
    upgrades: string[];
    survivors: number;
    settings?: GameSettings;
  }): boolean {
    try {
      const saveData: SaveData = {
        version: SAVE_VERSION,
        wave: gameState.wave,
        score: gameState.score,
        currency: gameState.currency,
        playerHp: gameState.playerHp,
        playerMaxHp: gameState.playerMaxHp,
        weapons: gameState.weapons,
        upgrades: gameState.upgrades,
        survivors: gameState.survivors,
        settings: gameState.settings ?? { ...DEFAULT_SETTINGS },
        timestamp: Date.now(),
      };

      const json = JSON.stringify(saveData);
      localStorage.setItem(SAVE_KEY, json);

      EventBus.emit(GameEvents.GAME_SAVED, { wave: gameState.wave });
      return true;
    } catch (err) {
      console.warn('SaveManager: Failed to save game state', err);
      return false;
    }
  }

  /**
   * Load the saved game state from localStorage.
   *
   * - If the saved version matches SAVE_VERSION, returns the parsed SaveData.
   * - If the version differs, attempts migration. Returns migrated data on
   *   success, or null if migration fails.
   * - Returns null if no save exists or the data is corrupt.
   */
  public load(): SaveData | null {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (!json) return null;

      const raw = JSON.parse(json);
      if (!raw || typeof raw !== 'object') return null;

      // Version check
      if (raw.version === SAVE_VERSION) {
        return this.validateSaveData(raw) ? raw as SaveData : null;
      }

      // Attempt migration
      const migrated = this.migrate(raw);
      if (migrated) {
        // Re-persist the migrated data so future loads don't need migration
        localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
        return migrated;
      }

      // Migration failed; discard the save
      console.warn(
        `SaveManager: Incompatible save version ${raw.version} (expected ${SAVE_VERSION}). Discarding.`,
      );
      this.deleteSave();
      return null;
    } catch (err) {
      console.warn('SaveManager: Failed to load save', err);
      return null;
    }
  }

  /**
   * Check whether a save exists in localStorage.
   */
  public hasSave(): boolean {
    try {
      return localStorage.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Delete the saved game.
   */
  public deleteSave(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (err) {
      console.warn('SaveManager: Failed to delete save', err);
    }
  }

  /**
   * Enable or disable auto-save at wave start.
   */
  public setAutoSave(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
  }

  /**
   * Save only settings (useful for settings screen changes without affecting gameplay save).
   */
  public saveSettings(settings: GameSettings): boolean {
    try {
      const existing = this.load();
      if (existing) {
        existing.settings = settings;
        existing.timestamp = Date.now();
        localStorage.setItem(SAVE_KEY, JSON.stringify(existing));
        return true;
      }

      // No existing save; store settings in a minimal save shell
      const minimalSave: SaveData = {
        version: SAVE_VERSION,
        wave: 1,
        score: 0,
        currency: 0,
        playerHp: 100,
        playerMaxHp: 100,
        weapons: [],
        upgrades: [],
        survivors: 0,
        settings,
        timestamp: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(minimalSave));
      return true;
    } catch (err) {
      console.warn('SaveManager: Failed to save settings', err);
      return false;
    }
  }

  /**
   * Load just the settings portion. Falls back to DEFAULT_SETTINGS.
   */
  public loadSettings(): GameSettings {
    const save = this.load();
    return save?.settings ?? { ...DEFAULT_SETTINGS };
  }

  /**
   * Clean up event listeners.
   */
  public destroy(): void {
    EventBus.off(GameEvents.WAVE_START, this.onWaveStart, this);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Auto-save callback triggered at the start of each wave.
   * The actual gameState must be gathered from the game scene; here we emit
   * an event requesting it.
   */
  private onWaveStart = (_data: { wave: number }): void => {
    if (!this.autoSaveEnabled) return;

    // The SaveManager itself does not have direct access to the full game
    // state. It emits a request and expects the GameScene to call save()
    // with the current state. Alternatively, if the GameScene provides a
    // stateGetter callback, we can call it directly.
    //
    // For now, we emit the save event so the scene can respond.
    // The scene should listen for 'request-save' and call saveManager.save(state).
    EventBus.emit('request-save', { trigger: 'wave-start' });
  };

  /**
   * Basic validation that a parsed object contains the required SaveData fields.
   */
  private validateSaveData(data: any): boolean {
    if (typeof data.version !== 'number') return false;
    if (typeof data.wave !== 'number') return false;
    if (typeof data.score !== 'number') return false;
    if (typeof data.currency !== 'number') return false;
    if (typeof data.playerHp !== 'number') return false;
    if (typeof data.playerMaxHp !== 'number') return false;
    if (!Array.isArray(data.weapons)) return false;
    if (!Array.isArray(data.upgrades)) return false;
    if (typeof data.survivors !== 'number') return false;
    if (typeof data.timestamp !== 'number') return false;

    // Validate settings object
    if (data.settings && typeof data.settings === 'object') {
      const s = data.settings;
      if (typeof s.masterVolume !== 'number') return false;
      if (typeof s.musicVolume !== 'number') return false;
      if (typeof s.sfxVolume !== 'number') return false;
    }

    // Validate each weapon entry
    for (const w of data.weapons) {
      if (typeof w.type !== 'string') return false;
      if (typeof w.ammo !== 'number') return false;
      if (typeof w.reserve !== 'number') return false;
      if (typeof w.level !== 'number') return false;
    }

    return true;
  }

  /**
   * Attempt to migrate save data from an older version to the current version.
   *
   * Migration strategy:
   * - Each version bump should have a migration step from (version - 1).
   * - Migrations are applied sequentially until the data reaches SAVE_VERSION.
   *
   * Returns the migrated SaveData, or null if migration is not possible.
   */
  private migrate(data: any): SaveData | null {
    let current = { ...data };

    // Example migration from version 0 to version 1
    if (current.version === 0 || current.version === undefined) {
      // V0 -> V1: Add settings and survivors fields if missing
      current.version = 1;
      current.settings = current.settings ?? { ...DEFAULT_SETTINGS };
      current.survivors = current.survivors ?? 0;
      current.timestamp = current.timestamp ?? Date.now();

      // Ensure weapons array entries have the 'level' field
      if (Array.isArray(current.weapons)) {
        current.weapons = current.weapons.map((w: any) => ({
          type: w.type ?? 'pistol',
          ammo: w.ammo ?? 0,
          reserve: w.reserve ?? 0,
          level: w.level ?? 0,
        }));
      }
    }

    // Add future migration steps here:
    // if (current.version === 1) { ... current.version = 2; }
    // if (current.version === 2) { ... current.version = 3; }

    // Verify final version
    if (current.version !== SAVE_VERSION) {
      return null;
    }

    // Validate the migrated data
    if (!this.validateSaveData(current)) {
      return null;
    }

    return current as SaveData;
  }
}
