// Event bus event names
export const GameEvents = {
  // Player events
  PLAYER_DAMAGED: 'player-damaged',
  PLAYER_HEALED: 'player-healed',
  PLAYER_DIED: 'player-died',
  PLAYER_MOVED_CAR: 'player-moved-car',

  // Combat events
  ZOMBIE_KILLED: 'zombie-killed',
  ZOMBIE_DAMAGED: 'zombie-damaged',
  BULLET_FIRED: 'bullet-fired',
  GRENADE_EXPLODED: 'grenade-exploded',

  // Weapon events
  WEAPON_SWITCHED: 'weapon-switched',
  WEAPON_RELOADING: 'weapon-reloading',
  WEAPON_RELOADED: 'weapon-reloaded',
  AMMO_CHANGED: 'ammo-changed',
  AMMO_EMPTY: 'ammo-empty',

  // Wave events
  WAVE_START: 'wave-start',
  WAVE_COMPLETE: 'wave-complete',
  WAVE_COUNTDOWN: 'wave-countdown',
  BOSS_INCOMING: 'boss-incoming',
  BOSS_DEFEATED: 'boss-defeated',

  // Economy events
  CURRENCY_CHANGED: 'currency-changed',
  UPGRADE_PURCHASED: 'upgrade-purchased',
  ITEM_PURCHASED: 'item-purchased',

  // Defense events
  BARRICADE_PLACED: 'barricade-placed',
  BARRICADE_DAMAGED: 'barricade-damaged',
  BARRICADE_DESTROYED: 'barricade-destroyed',

  // Environment events
  TIME_CHANGED: 'time-changed',
  WEATHER_CHANGED: 'weather-changed',
  EVENT_TRIGGERED: 'event-triggered',
  EVENT_ENDED: 'event-ended',
  TUNNEL_ENTER: 'tunnel-enter',
  TUNNEL_EXIT: 'tunnel-exit',
  STATION_ARRIVE: 'station-arrive',
  STATION_DEPART: 'station-depart',

  // NPC events
  SURVIVOR_FOUND: 'survivor-found',
  SURVIVOR_RESCUED: 'survivor-rescued',
  SURVIVOR_DIED: 'survivor-died',

  // Game state events
  GAME_PAUSED: 'game-paused',
  GAME_RESUMED: 'game-resumed',
  GAME_OVER: 'game-over',
  GAME_SAVED: 'game-saved',

  // UI events
  SCORE_CHANGED: 'score-changed',
  HEALTH_CHANGED: 'health-changed',
  SHOW_DIALOG: 'show-dialog',
  SCREEN_SHAKE: 'screen-shake',
  SCREEN_FLASH: 'screen-flash',

  // Mobile touch events
  WEAPON_SWITCH_REQUEST: 'weapon-switch-request',
} as const;

export interface EnvironmentEvent {
  type: 'tunnel' | 'bridge' | 'station';
  duration: number;
  intensity: number;
}
