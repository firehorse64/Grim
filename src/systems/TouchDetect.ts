/**
 * Utility to detect if we're running on a touch/mobile device.
 * Used throughout the game to conditionally show touch controls
 * and adjust UI layout.
 */

let _isMobile: boolean | null = null;

export function isMobileDevice(): boolean {
  if (_isMobile !== null) return _isMobile;

  _isMobile =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return _isMobile;
}

/** Force override (useful for testing touch UI on desktop) */
export function setMobileOverride(value: boolean): void {
  _isMobile = value;
}
