/**
 * Builds procedural 3D train geometry.
 * Train runs along Z-axis. Features locomotive front, proper doors,
 * interior point lights, window damage system.
 */
import * as THREE from 'three';
import * as Mat from './Materials';
import { NUM_TRAIN_CARS, WINDOW_MAX_HP } from '../data/BalanceConstants';

export const CAR_WIDTH = 3.2;
export const CAR_HEIGHT = 2.8;
export const CAR_LENGTH = 12;
export const CONNECTOR_LENGTH = 1.5;
export const WALL_THICKNESS = 0.15;
export const FLOOR_Y = 0.8;
export const WINDOW_SIZE = 0.9;
export const DOOR_WIDTH = 1.0;
export const DOOR_HEIGHT = 2.0;

export interface TrainCarMeshes {
  group: THREE.Group;
  floorMesh: THREE.Mesh;
  wallMeshes: THREE.Mesh[];
  windowMeshes: THREE.Mesh[];
  doorMeshes: THREE.Mesh[];
  roofMesh: THREE.Mesh;
  interiorGroup: THREE.Group;
  lightsGroup: THREE.Group;
  furnitureGroups: THREE.Group[];
  zStart: number;
  zEnd: number;
}

export interface FurnitureMesh3D {
  mesh: THREE.Group;
  type: string;
  worldPos: THREE.Vector3;
  label: string;
}

export interface WindowState3D {
  mesh: THREE.Mesh;
  glowMesh: THREE.Mesh | null;
  hp: number;
  maxHp: number;
  broken: boolean;
  carIndex: number;
  side: 'left' | 'right';
  worldX: number;
  worldZ: number;
}

export class TrainRenderer {
  public group = new THREE.Group();
  public cars: TrainCarMeshes[] = [];
  public connectors: THREE.Mesh[] = [];
  public furnitureList: FurnitureMesh3D[] = [];
  public windows: WindowState3D[] = [];
  public totalLength = 0;
  public locomotiveGroup = new THREE.Group();

  public create(): void {
    const carPurposes = ['ENGINE', 'LIVING', 'STORAGE'];
    let zOffset = 0;

    for (let i = 0; i < NUM_TRAIN_CARS; i++) {
      if (i > 0) {
        const connector = this.createConnector(zOffset);
        this.group.add(connector);
        this.connectors.push(connector);
        zOffset += CONNECTOR_LENGTH;
      }
      const car = this.createCar(zOffset, carPurposes[i] || 'STORAGE', i);
      this.group.add(car.group);
      this.cars.push(car);
      zOffset += CAR_LENGTH;
    }
    this.totalLength = zOffset;

    this.addWheels();
    this.createLocomotiveFront();
    this.group.add(this.locomotiveGroup);
  }

  private createCar(zStart: number, purpose: string, carIndex: number): TrainCarMeshes {
    const g = new THREE.Group();
    const wallMeshes: THREE.Mesh[] = [];
    const windowMeshes: THREE.Mesh[] = [];
    const doorMeshes: THREE.Mesh[] = [];
    const furnitureGroups: THREE.Group[] = [];

    const halfW = CAR_WIDTH / 2;
    const zEnd = zStart + CAR_LENGTH;
    const zCenter = zStart + CAR_LENGTH / 2;

    // Floor with plank texture effect
    const floorGroup = new THREE.Group();
    const plankCount = 8;
    for (let p = 0; p < plankCount; p++) {
      const pw = CAR_WIDTH / plankCount;
      const shade = 0x5a4a3a + (p % 2 === 0 ? 0x050505 : 0);
      const plankMat = new THREE.MeshStandardMaterial({ color: shade, roughness: 0.95 });
      const plank = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.02, 0.1, CAR_LENGTH), plankMat);
      plank.position.set(-halfW + pw / 2 + p * pw, FLOOR_Y, zCenter);
      plank.receiveShadow = true;
      floorGroup.add(plank);
    }
    g.add(floorGroup);
    const floorMesh = floorGroup.children[0] as THREE.Mesh; // ref for interface

    // Interior group for furniture
    const interiorGroup = new THREE.Group();
    g.add(interiorGroup);

    // Lights group (ceiling meshes + point lights + window glows)
    const lightsGroup = new THREE.Group();
    g.add(lightsGroup);

    // Left wall (own material for per-wall occlusion)
    const lWall = this.createWall(halfW, zStart, zEnd);
    wallMeshes.push(lWall);
    g.add(lWall);

    // Right wall
    const rWall = this.createWall(-halfW, zStart, zEnd);
    wallMeshes.push(rWall);
    g.add(rWall);

    // Windows on both sides
    const numWindows = 4;
    for (let wi = 0; wi < numWindows; wi++) {
      const wz = zStart + 1.5 + wi * ((CAR_LENGTH - 3) / (numWindows - 1));

      // Left window
      const lwMesh = this.createWindowMesh(halfW - 0.01, wz);
      windowMeshes.push(lwMesh);
      g.add(lwMesh);
      // Window glow (outside, for light-through effect)
      const lwGlow = this.createWindowGlow(halfW + 0.05, wz);
      lightsGroup.add(lwGlow);
      this.windows.push({
        mesh: lwMesh, glowMesh: lwGlow,
        hp: WINDOW_MAX_HP, maxHp: WINDOW_MAX_HP, broken: false,
        carIndex, side: 'left', worldX: halfW, worldZ: wz,
      });

      // Right window
      const rwMesh = this.createWindowMesh(-(halfW - 0.01), wz);
      windowMeshes.push(rwMesh);
      g.add(rwMesh);
      const rwGlow = this.createWindowGlow(-(halfW + 0.05), wz);
      lightsGroup.add(rwGlow);
      this.windows.push({
        mesh: rwMesh, glowMesh: rwGlow,
        hp: WINDOW_MAX_HP, maxHp: WINDOW_MAX_HP, broken: false,
        carIndex, side: 'right', worldX: -halfW, worldZ: wz,
      });
    }

    // Roof
    const roofGeo = new THREE.BoxGeometry(CAR_WIDTH + 0.1, 0.1, CAR_LENGTH + 0.1);
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x4a5a6a, metalness: 0.3, roughness: 0.5,
      transparent: true, opacity: 1.0,
    });
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.set(0, FLOOR_Y + CAR_HEIGHT, zCenter);
    roofMesh.castShadow = true;
    g.add(roofMesh);

    // End walls with proper door openings
    this.createEndWallWithDoor(g, zStart, wallMeshes, doorMeshes);
    this.createEndWallWithDoor(g, zEnd, wallMeshes, doorMeshes);

    // Furniture
    const furns = this.createFurniture(purpose, zStart);
    for (const f of furns) {
      interiorGroup.add(f.mesh);
      furnitureGroups.push(f.mesh);
      this.furnitureList.push(f);
    }

    // Interior ceiling lights + point lights
    for (let lz = zStart + 3; lz < zEnd - 1; lz += 4) {
      const bulbMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.05, 0.15),
        Mat.lightBulb(),
      );
      bulbMesh.position.set(0, FLOOR_Y + CAR_HEIGHT - 0.15, lz);
      lightsGroup.add(bulbMesh);

      // Actual point light for brightness
      const ptLight = new THREE.PointLight(0xffeecc, 1.2, 10, 1.5);
      ptLight.position.set(0, FLOOR_Y + CAR_HEIGHT - 0.3, lz);
      lightsGroup.add(ptLight);
    }

    return {
      group: g, floorMesh, wallMeshes, windowMeshes, doorMeshes,
      roofMesh, interiorGroup, lightsGroup, furnitureGroups,
      zStart, zEnd,
    };
  }

  private createWall(xPos: number, zStart: number, zEnd: number): THREE.Mesh {
    const h = CAR_HEIGHT;
    const len = zEnd - zStart;
    const geo = new THREE.BoxGeometry(WALL_THICKNESS, h, len);
    // Clone material so each wall can have independent opacity for occlusion
    const mat = Mat.trainExterior().clone();
    (mat as THREE.MeshStandardMaterial).transparent = true;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(xPos, FLOOR_Y + h / 2, zStart + len / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private createWindowMesh(xPos: number, z: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(0.02, WINDOW_SIZE, WINDOW_SIZE);
    const mesh = new THREE.Mesh(geo, Mat.trainWindow());
    mesh.position.set(xPos, FLOOR_Y + CAR_HEIGHT * 0.55, z);
    return mesh;
  }

  private createWindowGlow(xPos: number, z: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(WINDOW_SIZE * 0.8, WINDOW_SIZE * 0.8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffeeaa, transparent: true, opacity: 0.3,
      side: xPos > 0 ? THREE.FrontSide : THREE.BackSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(xPos, FLOOR_Y + CAR_HEIGHT * 0.55, z);
    mesh.rotation.y = Math.PI / 2;
    return mesh;
  }

  private createEndWallWithDoor(
    parent: THREE.Group,
    z: number,
    wallMeshes: THREE.Mesh[],
    doorMeshes: THREE.Mesh[],
  ): void {
    const halfW = CAR_WIDTH / 2;
    const halfDoor = DOOR_WIDTH / 2;

    // Top panel above door
    const topH = CAR_HEIGHT - DOOR_HEIGHT;
    const topGeo = new THREE.BoxGeometry(CAR_WIDTH, topH, WALL_THICKNESS);
    const topMat = Mat.trainExterior().clone();
    (topMat as THREE.MeshStandardMaterial).transparent = true;
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.set(0, FLOOR_Y + DOOR_HEIGHT + topH / 2, z);
    topMesh.castShadow = true;
    wallMeshes.push(topMesh);
    parent.add(topMesh);

    // Left panel beside door
    const sideW = halfW - halfDoor;
    if (sideW > 0.05) {
      const leftGeo = new THREE.BoxGeometry(sideW, DOOR_HEIGHT, WALL_THICKNESS);
      const leftMat = Mat.trainExterior().clone();
      (leftMat as THREE.MeshStandardMaterial).transparent = true;
      const leftMesh = new THREE.Mesh(leftGeo, leftMat);
      leftMesh.position.set(-halfDoor - sideW / 2, FLOOR_Y + DOOR_HEIGHT / 2, z);
      leftMesh.castShadow = true;
      wallMeshes.push(leftMesh);
      parent.add(leftMesh);

      // Right panel
      const rightMesh = new THREE.Mesh(leftGeo, leftMat.clone());
      rightMesh.position.set(halfDoor + sideW / 2, FLOOR_Y + DOOR_HEIGHT / 2, z);
      rightMesh.castShadow = true;
      wallMeshes.push(rightMesh);
      parent.add(rightMesh);
    }

    // Door mesh
    const doorGeo = new THREE.BoxGeometry(DOOR_WIDTH - 0.05, DOOR_HEIGHT - 0.05, 0.06);
    const doorMat = Mat.trainDoor().clone();
    (doorMat as THREE.MeshStandardMaterial).transparent = true;
    const doorMesh = new THREE.Mesh(doorGeo, doorMat);
    doorMesh.position.set(0, FLOOR_Y + DOOR_HEIGHT / 2, z);
    doorMeshes.push(doorMesh);
    parent.add(doorMesh);

    // Door frame accent
    const frameGeo = new THREE.BoxGeometry(DOOR_WIDTH + 0.05, 0.05, 0.08);
    const frame = new THREE.Mesh(frameGeo, Mat.railMetal());
    frame.position.set(0, FLOOR_Y + DOOR_HEIGHT, z);
    parent.add(frame);
  }

  private createConnector(zStart: number): THREE.Mesh {
    const connW = CAR_WIDTH * 0.5;
    const connH = CAR_HEIGHT * 0.7;
    const geo = new THREE.BoxGeometry(connW, connH, CONNECTOR_LENGTH);
    const mesh = new THREE.Mesh(geo, Mat.trainConnector());
    mesh.position.set(0, FLOOR_Y + connH / 2, zStart + CONNECTOR_LENGTH / 2);
    return mesh;
  }

  // --- Locomotive Front ---

  private createLocomotiveFront(): void {
    const g = this.locomotiveGroup;
    const noseLen = 3.0;
    const frontZ = -noseLen;

    // Main nose body (narrower than car)
    const noseW = CAR_WIDTH * 0.85;
    const noseH = CAR_HEIGHT * 0.65;
    const noseGeo = new THREE.BoxGeometry(noseW, noseH, noseLen);
    const noseMesh = new THREE.Mesh(noseGeo, Mat.trainExterior().clone());
    noseMesh.position.set(0, FLOOR_Y + noseH / 2, -noseLen / 2);
    noseMesh.castShadow = true;
    g.add(noseMesh);

    // Sloped top of nose
    const slopeGeo = new THREE.BoxGeometry(noseW - 0.2, 0.25, noseLen * 0.8);
    const slopeMesh = new THREE.Mesh(slopeGeo, Mat.trainExterior().clone());
    slopeMesh.position.set(0, FLOOR_Y + noseH + 0.1, -noseLen * 0.4);
    slopeMesh.rotation.x = -0.25;
    slopeMesh.castShadow = true;
    g.add(slopeMesh);

    // Roof extension
    const roofExtGeo = new THREE.BoxGeometry(CAR_WIDTH * 0.7, 0.08, noseLen * 0.4);
    const roofExt = new THREE.Mesh(roofExtGeo, Mat.trainExterior().clone());
    roofExt.position.set(0, FLOOR_Y + CAR_HEIGHT - 0.1, -noseLen * 0.15);
    g.add(roofExt);

    // Cowcatcher (V-shape at bottom)
    const catcherMat = Mat.railMetal();
    const catcherBase = new THREE.Mesh(
      new THREE.BoxGeometry(CAR_WIDTH * 1.1, 0.12, 0.4),
      catcherMat,
    );
    catcherBase.position.set(0, 0.15, frontZ - 0.1);
    g.add(catcherBase);

    // Catcher bars
    for (const xOff of [-0.5, 0, 0.5]) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.35, 1.2),
        catcherMat,
      );
      bar.position.set(xOff, 0.35, frontZ + 0.5);
      bar.rotation.x = -0.15;
      g.add(bar);
    }

    // Headlights
    const lightGeo = new THREE.SphereGeometry(0.18, 8, 8);
    for (const xOff of [-0.6, 0.6]) {
      const light = new THREE.Mesh(lightGeo, Mat.lightBulb());
      light.position.set(xOff, FLOOR_Y + noseH * 0.6, frontZ + 0.05);
      g.add(light);
    }

    // Front face plate
    const facePlate = new THREE.Mesh(
      new THREE.BoxGeometry(noseW + 0.05, noseH + 0.05, 0.08),
      Mat.trainExterior().clone(),
    );
    facePlate.position.set(0, FLOOR_Y + noseH / 2, frontZ);
    facePlate.castShadow = true;
    g.add(facePlate);

    // Smokestack
    const stackGeo = new THREE.CylinderGeometry(0.15, 0.22, 0.9, 8);
    const stack = new THREE.Mesh(stackGeo, Mat.trainConnector());
    stack.position.set(0, FLOOR_Y + CAR_HEIGHT + 0.45, -1.5);
    stack.castShadow = true;
    g.add(stack);

    // Stack cap
    const capGeo = new THREE.CylinderGeometry(0.22, 0.15, 0.15, 8);
    const cap = new THREE.Mesh(capGeo, Mat.trainConnector());
    cap.position.set(0, FLOOR_Y + CAR_HEIGHT + 0.97, -1.5);
    g.add(cap);

    // Side pipes/details
    for (const xOff of [-0.7, 0.7]) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, noseLen * 0.6, 6),
        catcherMat,
      );
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(xOff, FLOOR_Y + noseH * 0.3, -noseLen * 0.3);
      g.add(pipe);
    }

    // Wheels for locomotive front
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12);
    for (const xOff of [-CAR_WIDTH / 2 - 0.1, CAR_WIDTH / 2 + 0.1]) {
      const w = new THREE.Mesh(wheelGeo, catcherMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(xOff, 0.4, -noseLen * 0.5);
      g.add(w);
    }
  }

  private addWheels(): void {
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.15, 12);
    const wheelMat = Mat.railMetal();
    for (const car of this.cars) {
      const zMid = (car.zStart + car.zEnd) / 2;
      for (const zOff of [-CAR_LENGTH * 0.35, CAR_LENGTH * 0.35]) {
        for (const xOff of [-CAR_WIDTH / 2 - 0.1, CAR_WIDTH / 2 + 0.1]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(xOff, 0.35, zMid + zOff);
          this.group.add(w);
        }
      }
    }
  }

  // --- Furniture ---

  private createFurniture(purpose: string, zStart: number): FurnitureMesh3D[] {
    const items: FurnitureMesh3D[] = [];
    switch (purpose) {
      case 'ENGINE': {
        items.push(this.makeFurnitureItem('BRAKE_PANEL', 0, zStart + 2, 'Brake Panel'));
        items.push(this.makeFurnitureItem('WORKBENCH', -1, zStart + 5, 'Workbench'));
        items.push(this.makeFurnitureItem('MAP_BOARD', 1, zStart + 2, 'Map Board'));
        items.push(this.makeFurnitureItem('LIGHT_SWITCH', 1.2, zStart + 4, 'Light Switch'));
        break;
      }
      case 'LIVING': {
        items.push(this.makeFurnitureItem('BED', -1, zStart + 3, 'Bed'));
        items.push(this.makeFurnitureItem('COOKING_STOVE', 1, zStart + 4, 'Stove'));
        items.push(this.makeFurnitureItem('FIRST_AID', 1, zStart + 7, 'First Aid'));
        items.push(this.makeFurnitureItem('PLANT_BOX', -1, zStart + 9, 'Plant Box'));
        break;
      }
      case 'STORAGE': {
        items.push(this.makeFurnitureItem('STORAGE_CRATE', -1, zStart + 2, 'Storage Crate'));
        items.push(this.makeFurnitureItem('STORAGE_CRATE', 1, zStart + 2, 'Storage Crate'));
        items.push(this.makeFurnitureItem('STORAGE_CRATE', -1, zStart + 7, 'Storage Crate'));
        break;
      }
    }
    return items;
  }

  private makeFurnitureItem(type: string, x: number, z: number, label: string): FurnitureMesh3D {
    const g = new THREE.Group();
    const pos = new THREE.Vector3(x, FLOOR_Y + 0.05, z);

    switch (type) {
      case 'BRAKE_PANEL': {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.3), Mat.furnitureBrake());
        box.position.set(0, 0.6, 0);
        box.castShadow = true;
        g.add(box);
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), Mat.railMetal());
        lever.position.set(0, 1.0, 0.15);
        g.add(lever);
        break;
      }
      case 'WORKBENCH': {
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.8), Mat.furnitureWorkbench());
        top.position.set(0, 0.8, 0);
        top.castShadow = true;
        g.add(top);
        for (const lx of [-0.6, 0.6]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), Mat.furnitureWorkbench());
          leg.position.set(lx, 0.4, 0);
          g.add(leg);
        }
        break;
      }
      case 'MAP_BOARD': {
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.05), Mat.furnitureMapBoard());
        board.position.set(0, 1.2, 0);
        g.add(board);
        break;
      }
      case 'LIGHT_SWITCH': {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.05), Mat.furnitureBrake());
        panel.position.set(0, 1.3, 0);
        g.add(panel);
        break;
      }
      case 'BED': {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 2.0), Mat.furnitureWorkbench());
        frame.position.set(0, 0.2, 0);
        frame.castShadow = true;
        g.add(frame);
        const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 1.9), Mat.furnitureBed());
        mattress.position.set(0, 0.48, 0);
        g.add(mattress);
        break;
      }
      case 'COOKING_STOVE': {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), Mat.furnitureStove());
        body.position.set(0, 0.3, 0);
        body.castShadow = true;
        g.add(body);
        const burner = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 16), Mat.fire());
        burner.rotation.x = -Math.PI / 2;
        burner.position.set(0, 0.62, 0);
        g.add(burner);
        break;
      }
      case 'FIRST_AID': {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), Mat.furnitureFirstAid());
        box.position.set(0, 0.15, 0);
        g.add(box);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        crossH.position.set(0, 0.15, 0.16);
        g.add(crossH);
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.02), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        crossV.position.set(0, 0.15, 0.16);
        g.add(crossV);
        break;
      }
      case 'PLANT_BOX': {
        const pot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.4), Mat.furniturePlantBox());
        pot.position.set(0, 0.15, 0);
        g.add(pot);
        for (let px = -0.15; px <= 0.15; px += 0.15) {
          const plant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.4, 6), Mat.treeLeaves());
          plant.position.set(px, 0.5, 0);
          g.add(plant);
        }
        break;
      }
      case 'STORAGE_CRATE': {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), Mat.furnitureCrate());
        crate.position.set(0, 0.25, 0);
        crate.castShadow = true;
        g.add(crate);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.72), Mat.furnitureWorkbench());
        lid.position.set(0, 0.51, 0);
        g.add(lid);
        break;
      }
    }

    g.position.copy(pos);
    return { mesh: g, type, worldPos: pos, label };
  }

  // --- Window damage system ---

  public damageWindow(win: WindowState3D, amount: number): boolean {
    if (win.broken) return false;
    win.hp = Math.max(0, win.hp - amount);
    if (win.hp <= 0) {
      win.broken = true;
      win.mesh.material = Mat.trainWindowBroken();
      win.mesh.scale.set(1, 0.3, 0.3);
      if (win.glowMesh) win.glowMesh.visible = false;
      return true;
    } else if (win.hp < win.maxHp * 0.5) {
      win.mesh.material = Mat.trainWindowDamaged();
    }
    return false;
  }

  public repairWindow(win: WindowState3D): void {
    win.hp = win.maxHp;
    win.broken = false;
    win.mesh.material = Mat.trainWindow();
    win.mesh.scale.set(1, 1, 1);
    if (win.glowMesh) win.glowMesh.visible = true;
  }

  public getNearestWindow(x: number, z: number, maxDist: number): WindowState3D | null {
    let nearest: WindowState3D | null = null;
    let bestDist = maxDist;
    for (const w of this.windows) {
      const dx = x - w.worldX;
      const dz = z - w.worldZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) { bestDist = dist; nearest = w; }
    }
    return nearest;
  }

  public getNearestBrokenWindow(x: number, z: number, maxDist: number): WindowState3D | null {
    let nearest: WindowState3D | null = null;
    let bestDist = maxDist;
    for (const w of this.windows) {
      if (!w.broken) continue;
      const dx = x - w.worldX;
      const dz = z - w.worldZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) { bestDist = dist; nearest = w; }
    }
    return nearest;
  }

  /** Toggle interior lights visibility (point lights + ceiling bulbs + window glows) */
  public setInteriorLights(on: boolean): void {
    for (const car of this.cars) {
      car.lightsGroup.visible = on;
    }
  }

  // --- Utility ---

  public getCenter(): number { return this.totalLength / 2; }

  public getBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    return {
      minX: -CAR_WIDTH / 2, maxX: CAR_WIDTH / 2,
      minZ: 0, maxZ: this.totalLength,
    };
  }

  public isInConnector(x: number, z: number): boolean {
    const halfW = CAR_WIDTH * 0.25;
    if (x < -halfW || x > halfW) return false;
    let zPos = 0;
    for (let i = 0; i < NUM_TRAIN_CARS; i++) {
      if (i > 0) {
        if (z >= zPos && z <= zPos + CONNECTOR_LENGTH) return true;
        zPos += CONNECTOR_LENGTH;
      }
      zPos += CAR_LENGTH;
    }
    return false;
  }

  public getCarIndexAt(z: number): number {
    let zPos = 0;
    for (let i = 0; i < NUM_TRAIN_CARS; i++) {
      if (i > 0) zPos += CONNECTOR_LENGTH;
      if (z >= zPos && z <= zPos + CAR_LENGTH) return i;
      zPos += CAR_LENGTH;
    }
    return -1;
  }

  /** Get all wall/door meshes that can be occluded */
  public getOccludableMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const car of this.cars) {
      meshes.push(...car.wallMeshes);
      meshes.push(...car.doorMeshes);
    }
    return meshes;
  }
}
