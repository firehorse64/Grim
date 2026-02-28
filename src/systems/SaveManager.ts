import { SaveData, SurvivalState, InventoryItem, GameMode, TimeOfDay } from '../types/GameTypes';
import { SAVE_KEY, SAVE_VERSION } from '../data/BalanceConstants';
import { EventBus } from '../utils/EventBus';

/**
 * Handles saving and loading game state to localStorage.
 */
export class SaveManager {

  /** Save the current game state. */
  public save(data: SaveData): void {
    try {
      data.version = SAVE_VERSION;
      const json = JSON.stringify(data);
      localStorage.setItem(SAVE_KEY, json);
      EventBus.emit('save:completed');
    } catch (e) {
      console.warn('Failed to save game:', e);
      EventBus.emit('save:failed');
    }
  }

  /** Load saved game data. Returns null if no save or corrupt. */
  public load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== SAVE_VERSION) {
        console.warn('Save version mismatch, ignoring save');
        return null;
      }
      return data;
    } catch (e) {
      console.warn('Failed to load save:', e);
      return null;
    }
  }

  /** Check if a save file exists. */
  public hasSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data && data.version === SAVE_VERSION;
    } catch {
      return false;
    }
  }

  /** Delete the save file. */
  public deleteSave(): void {
    localStorage.removeItem(SAVE_KEY);
  }

  /** Create a SaveData object from current game state. */
  public static createSaveData(
    survival: SurvivalState,
    inventory: InventoryItem[],
    gameMode: GameMode,
    timeOfDay: TimeOfDay,
    dayTime: number,
    trainMoving: boolean,
    npcNames: string[],
    windowStates: SaveData['windowStates'],
    maintenanceHp: SaveData['maintenanceHp'],
  ): SaveData {
    return {
      version: SAVE_VERSION,
      survival: { ...survival },
      inventory: JSON.parse(JSON.stringify(inventory)),
      gameMode,
      timeOfDay,
      dayTime,
      trainMoving,
      npcNames,
      windowStates,
      maintenanceHp,
    };
  }
}
