/**
 * HTML overlay screens: Menu, Inventory, Map, Pause, GameOver.
 * All rendered as DOM overlays on top of the Three.js canvas.
 */
import { EventBus } from '../utils/EventBus';
import { InventoryManager } from '../systems/InventoryManager';
import { CraftingManager } from '../systems/CraftingManager';
import { MAP_LOCATIONS, ROUTE_SEGMENTS, getLocation, getReachableLocations } from '../data/LocationData';
import type { InventoryItem } from '../types/GameTypes';

// Shared CSS for overlay panels
const OVERLAY_CSS = `
  position:fixed; top:0; left:0; right:0; bottom:0;
  background:rgba(0,0,0,0.85); z-index:100;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  font-family:'Courier New',monospace; color:#ccc;
`;

const BTN_CSS = `
  display:block; padding:10px 30px; margin:8px;
  background:#333; color:#ccc; border:1px solid #555;
  font-family:'Courier New',monospace; font-size:14px;
  cursor:pointer; text-align:center;
`;

// ============================
// MAIN MENU
// ============================
export function showMainMenu(onStart: () => void, onContinue?: () => void): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.cssText = OVERLAY_CSS;

  const title = document.createElement('h1');
  title.textContent = 'GRIM LINE';
  title.style.cssText = 'color:#cc4444; font-size:48px; margin-bottom:8px; letter-spacing:8px;';
  panel.appendChild(title);

  const sub = document.createElement('div');
  sub.textContent = 'Zombie Train Survival';
  sub.style.cssText = 'color:#888; font-size:14px; margin-bottom:32px;';
  panel.appendChild(sub);

  const newBtn = document.createElement('button');
  newBtn.textContent = 'NEW GAME';
  newBtn.style.cssText = BTN_CSS;
  newBtn.onmouseenter = () => newBtn.style.background = '#444';
  newBtn.onmouseleave = () => newBtn.style.background = '#333';
  newBtn.onclick = () => { panel.remove(); onStart(); };
  panel.appendChild(newBtn);

  if (onContinue) {
    const contBtn = document.createElement('button');
    contBtn.textContent = 'CONTINUE';
    contBtn.style.cssText = BTN_CSS;
    contBtn.onmouseenter = () => contBtn.style.background = '#444';
    contBtn.onmouseleave = () => contBtn.style.background = '#333';
    contBtn.onclick = () => { panel.remove(); onContinue(); };
    panel.appendChild(contBtn);
  }

  document.body.appendChild(panel);
  return panel;
}

// ============================
// PAUSE
// ============================
export function showPauseMenu(onResume: () => void): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.cssText = OVERLAY_CSS;

  const title = document.createElement('h2');
  title.textContent = 'PAUSED';
  title.style.cssText = 'color:#aaa; font-size:32px; margin-bottom:24px;';
  panel.appendChild(title);

  const resumeBtn = document.createElement('button');
  resumeBtn.textContent = 'RESUME';
  resumeBtn.style.cssText = BTN_CSS;
  resumeBtn.onclick = () => { panel.remove(); onResume(); };
  panel.appendChild(resumeBtn);

  document.body.appendChild(panel);
  return panel;
}

// ============================
// GAME OVER
// ============================
export function showGameOver(message: string, onRestart: () => void): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.cssText = OVERLAY_CSS;

  const title = document.createElement('h2');
  title.textContent = 'GAME OVER';
  title.style.cssText = 'color:#cc4444; font-size:36px; margin-bottom:12px;';
  panel.appendChild(title);

  const msg = document.createElement('div');
  msg.textContent = message;
  msg.style.cssText = 'color:#888; font-size:14px; margin-bottom:24px;';
  panel.appendChild(msg);

  const btn = document.createElement('button');
  btn.textContent = 'TRY AGAIN';
  btn.style.cssText = BTN_CSS;
  btn.onclick = () => { panel.remove(); onRestart(); };
  panel.appendChild(btn);

  document.body.appendChild(panel);
  return panel;
}

// ============================
// INVENTORY
// ============================
export function showInventory(
  inventory: InventoryManager,
  crafting: CraftingManager,
  onClose: () => void,
): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.cssText = OVERLAY_CSS;
  panel.style.justifyContent = 'flex-start';
  panel.style.paddingTop = '40px';
  panel.style.overflowY = 'auto';

  const title = document.createElement('h2');
  title.textContent = 'INVENTORY';
  title.style.cssText = 'color:#aab; font-size:20px; margin-bottom:16px;';
  panel.appendChild(title);

  // Items grid
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; max-width:600px; justify-content:center;';
  const items = inventory.getItems();
  for (const item of items) {
    const slot = document.createElement('div');
    slot.style.cssText = `
      width:80px; height:80px; background:#2a2a2a; border:1px solid #444;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      font-size:9px; cursor:pointer; padding:4px;
    `;
    const icon = item.type === 'food' ? '🥫' : item.type === 'medicine' ? '💊' : item.type === 'ammo' ? '🔫' : '⚙️';
    slot.innerHTML = `<div style="font-size:20px">${icon}</div><div>${item.name}</div><div>x${item.quantity}</div>`;
    slot.onmouseenter = () => slot.style.borderColor = '#888';
    slot.onmouseleave = () => slot.style.borderColor = '#444';

    // Use button for food/medicine
    if (item.type === 'food' || item.type === 'medicine') {
      slot.onclick = () => {
        if (item.type === 'food') {
          EventBus.emit('inventory:use-food');
          inventory.removeItem(item.id, 1);
        } else {
          EventBus.emit('inventory:use-medicine');
          inventory.removeItem(item.id, 1);
        }
        panel.remove();
        showInventory(inventory, crafting, onClose);
      };
    }
    grid.appendChild(slot);
  }
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'Inventory is empty';
    empty.style.color = '#666';
    grid.appendChild(empty);
  }
  panel.appendChild(grid);

  // Crafting section
  const craftTitle = document.createElement('h3');
  craftTitle.textContent = 'CRAFTING';
  craftTitle.style.cssText = 'color:#886; margin-top:24px; margin-bottom:8px;';
  panel.appendChild(craftTitle);

  const recipes = crafting.getRecipes();
  for (const recipe of recipes) {
    const row = document.createElement('div');
    row.style.cssText = `
      display:flex; align-items:center; gap:8px; margin-bottom:4px;
      padding:6px; background:#222; border:1px solid #333; cursor:pointer;
    `;
    const canCraft = crafting.canCraft(recipe.id, inventory);
    row.style.opacity = canCraft ? '1' : '0.4';
    const ings = recipe.ingredients.map(i => `${i.itemId} x${i.quantity}`).join(', ');
    row.innerHTML = `<span style="color:#cc8;width:120px">${recipe.name}</span><span style="font-size:10px;color:#888">${ings}</span>`;
    if (canCraft) {
      row.onclick = () => {
        crafting.craft(recipe.id, inventory);
        panel.remove();
        showInventory(inventory, crafting, onClose);
      };
      row.onmouseenter = () => row.style.borderColor = '#666';
      row.onmouseleave = () => row.style.borderColor = '#333';
    }
    panel.appendChild(row);
  }

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'CLOSE [TAB]';
  closeBtn.style.cssText = BTN_CSS + 'margin-top:16px;';
  closeBtn.onclick = () => { panel.remove(); onClose(); };
  panel.appendChild(closeBtn);

  // Allow TAB to close
  const handleKey = (e: KeyboardEvent) => {
    if (e.code === 'Tab' || e.code === 'Escape') {
      e.preventDefault();
      panel.remove();
      window.removeEventListener('keydown', handleKey);
      onClose();
    }
  };
  window.addEventListener('keydown', handleKey);

  document.body.appendChild(panel);
  return panel;
}

// ============================
// MAP
// ============================
export function showMap(
  currentLocation: string,
  destination: string | null,
  onSetDestination: (destId: string) => void,
  onClose: () => void,
): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.cssText = OVERLAY_CSS;
  panel.style.justifyContent = 'flex-start';
  panel.style.paddingTop = '30px';

  const title = document.createElement('h2');
  title.textContent = 'ROUTE MAP';
  title.style.cssText = 'color:#886; font-size:20px; margin-bottom:12px;';
  panel.appendChild(title);

  // Canvas-based map
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = 800;
  mapCanvas.height = 500;
  mapCanvas.style.cssText = 'border:1px solid #444; background:#1a1a2a; cursor:pointer; max-width:90vw;';
  panel.appendChild(mapCanvas);

  const ctx = mapCanvas.getContext('2d')!;
  const reachable = getReachableLocations(currentLocation);
  const reachableIds = new Set(reachable.map(l => l.id));
  let selectedId: string | null = null;

  function drawMap() {
    ctx.clearRect(0, 0, 800, 500);

    // Draw routes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (const route of ROUTE_SEGMENTS) {
      const from = getLocation(route.from);
      const to = getLocation(route.to);
      if (!from || !to) continue;
      const fx = from.x * 0.8 + 20;
      const fy = from.y * 0.75 + 20;
      const tx = to.x * 0.8 + 20;
      const ty = to.y * 0.75 + 20;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // Distance label
      ctx.fillStyle = '#555';
      ctx.font = '9px monospace';
      ctx.fillText(`${route.distance}km`, (fx + tx) / 2 - 10, (fy + ty) / 2 - 5);
    }

    // Draw locations
    for (const loc of MAP_LOCATIONS) {
      const lx = loc.x * 0.8 + 20;
      const ly = loc.y * 0.75 + 20;

      let color = '#555';
      let radius = 6;
      if (loc.id === currentLocation) { color = '#4c4'; radius = 8; }
      else if (loc.id === destination) { color = '#c84'; radius = 8; }
      else if (loc.id === selectedId) { color = '#88c'; radius = 8; }
      else if (reachableIds.has(loc.id)) { color = '#48c'; radius = 7; }
      else if (loc.id === 'port-echo') { color = '#cc8'; radius = 8; }

      ctx.beginPath();
      ctx.arc(lx, ly, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#aaa';
      ctx.font = '10px monospace';
      ctx.fillText(loc.name, lx + 10, ly + 4);

      // Danger stars
      ctx.fillStyle = '#c44';
      ctx.font = '8px monospace';
      ctx.fillText('★'.repeat(loc.dangerLevel), lx + 10, ly + 14);
    }

    // Legend
    ctx.fillStyle = '#4c4'; ctx.fillRect(20, 460, 10, 10);
    ctx.fillStyle = '#888'; ctx.font = '10px monospace';
    ctx.fillText('Current', 35, 470);
    ctx.fillStyle = '#48c'; ctx.fillRect(100, 460, 10, 10);
    ctx.fillText('Reachable', 115, 470);
    ctx.fillStyle = '#c84'; ctx.fillRect(200, 460, 10, 10);
    ctx.fillText('Destination', 215, 470);
    ctx.fillStyle = '#cc8'; ctx.fillRect(310, 460, 10, 10);
    ctx.fillText('The Coast', 325, 470);
  }

  drawMap();

  // Click to select location
  mapCanvas.onclick = (e) => {
    const rect = mapCanvas.getBoundingClientRect();
    const scaleX = mapCanvas.width / rect.width;
    const scaleY = mapCanvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    for (const loc of MAP_LOCATIONS) {
      const lx = loc.x * 0.8 + 20;
      const ly = loc.y * 0.75 + 20;
      const dist = Math.sqrt((mx - lx) ** 2 + (my - ly) ** 2);
      if (dist < 15 && reachableIds.has(loc.id)) {
        selectedId = loc.id;
        drawMap();
        break;
      }
    }
  };

  // Info + set destination
  const infoRow = document.createElement('div');
  infoRow.style.cssText = 'display:flex; gap:16px; margin-top:12px; align-items:center;';

  const setBtn = document.createElement('button');
  setBtn.textContent = 'SET DESTINATION';
  setBtn.style.cssText = BTN_CSS;
  setBtn.onclick = () => {
    if (selectedId) {
      panel.remove();
      window.removeEventListener('keydown', handleKey);
      onSetDestination(selectedId);
      onClose();
    }
  };
  infoRow.appendChild(setBtn);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'CLOSE [M]';
  closeBtn.style.cssText = BTN_CSS;
  closeBtn.onclick = () => { panel.remove(); window.removeEventListener('keydown', handleKey); onClose(); };
  infoRow.appendChild(closeBtn);
  panel.appendChild(infoRow);

  const handleKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyM' || e.code === 'Escape') {
      e.preventDefault();
      panel.remove();
      window.removeEventListener('keydown', handleKey);
      onClose();
    }
  };
  window.addEventListener('keydown', handleKey);

  document.body.appendChild(panel);
  return panel;
}

// ============================
// VICTORY
// ============================
export function showVictory(onRestart: () => void): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.cssText = OVERLAY_CSS;

  const title = document.createElement('h1');
  title.textContent = 'YOU MADE IT';
  title.style.cssText = 'color:#cc8; font-size:40px; margin-bottom:8px;';
  panel.appendChild(title);

  const sub = document.createElement('div');
  sub.textContent = 'You reached Port Echo — the coast. The boats are waiting.';
  sub.style.cssText = 'color:#888; font-size:14px; margin-bottom:24px;';
  panel.appendChild(sub);

  const btn = document.createElement('button');
  btn.textContent = 'PLAY AGAIN';
  btn.style.cssText = BTN_CSS;
  btn.onclick = () => { panel.remove(); onRestart(); };
  panel.appendChild(btn);

  document.body.appendChild(panel);
  return panel;
}
