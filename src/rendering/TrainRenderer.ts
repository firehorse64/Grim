/**
 * Builds procedural 3D train geometry.
 * Train runs along Z-axis. Each car is a box with interior detail.
 */
import * as THREE from 'three';
import * as Mat from './Materials';
import { NUM_TRAIN_CARS } from '../data/BalanceConstants';

// 3D dimensions (meters)
export const CAR_WIDTH = 3.2;   // x
export const CAR_HEIGHT = 2.8;  // y
export const CAR_LENGTH = 12;   // z (per car)
export const CONNECTOR_LENGTH = 1.5;
export const WALL_THICKNESS = 0.15;
export const FLOOR_Y = 0.8;     // floor height above ground
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
  furnitureGroups: THREE.Group[];
  zStart: number;
  zEnd: number;
}

export interface FurnitureMesh3D {
  mesh: THREE.Group;
  type: string;
  worldPos: THREE.Vector3;
}

export class TrainRenderer {
  public group = new THREE.Group();
  public cars: TrainCarMeshes[] = [];
  public connectors: THREE.Mesh[] = [];
  public furnitureList: FurnitureMesh3D[] = [];
  public totalLength = 0;

  public create(): void {
    const carPurposes = ['ENGINE', 'LIVING', 'STORAGE'];
    let zOffset = 0;

    for (let i = 0; i < NUM_TRAIN_CARS; i++) {
      if (i > 0) {
        // Connector between cars
        const connector = this.createConnector(zOffset);
        this.group.add(connector);
        this.connectors.push(connector);
        zOffset += CONNECTOR_LENGTH;
      }

      const car = this.createCar(zOffset, carPurposes[i] || 'STORAGE');
      this.group.add(car.group);
      this.cars.push(car);
      zOffset += CAR_LENGTH;
    }
    this.totalLength = zOffset;

    // Add wheels
    this.addWheels();

    // Add headlight at front
    this.addHeadlight();
  }

  private createCar(zStart: number, purpose: string): TrainCarMeshes {
    const g = new THREE.Group();
    const wallMeshes: THREE.Mesh[] = [];
    const windowMeshes: THREE.Mesh[] = [];
    const doorMeshes: THREE.Mesh[] = [];
    const furnitureGroups: THREE.Group[] = [];

    const halfW = CAR_WIDTH / 2;
    const zEnd = zStart + CAR_LENGTH;
    const zCenter = zStart + CAR_LENGTH / 2;

    // Floor
    const floorGeo = new THREE.BoxGeometry(CAR_WIDTH, 0.1, CAR_LENGTH);
    const floorMesh = new THREE.Mesh(floorGeo, Mat.trainInteriorFloor());
    floorMesh.position.set(0, FLOOR_Y, zCenter);
    floorMesh.receiveShadow = true;
    g.add(floorMesh);

    // Interior group (for lighting control)
    const interiorGroup = new THREE.Group();
    g.add(interiorGroup);

    // Left wall
    const lWall = this.createWall(halfW, zStart, zEnd, 'left');
    wallMeshes.push(lWall);
    g.add(lWall);

    // Right wall
    const rWall = this.createWall(-halfW, zStart, zEnd, 'right');
    wallMeshes.push(rWall);
    g.add(rWall);

    // Windows along walls
    const numWindows = 4;
    for (let wi = 0; wi < numWindows; wi++) {
      const wz = zStart + 1.5 + wi * ((CAR_LENGTH - 3) / (numWindows - 1));
      // Left window
      const lwMesh = this.createWindow(halfW - 0.01, wz);
      windowMeshes.push(lwMesh);
      g.add(lwMesh);
      // Right window
      const rwMesh = this.createWindow(-(halfW - 0.01), wz);
      windowMeshes.push(rwMesh);
      g.add(rwMesh);
    }

    // Roof — each car gets its own material for per-car transparency
    const roofGeo = new THREE.BoxGeometry(CAR_WIDTH + 0.1, 0.1, CAR_LENGTH + 0.1);
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x4a5a6a, metalness: 0.3, roughness: 0.5,
      transparent: true, opacity: 1.0,
    });
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.set(0, FLOOR_Y + CAR_HEIGHT, zCenter);
    roofMesh.castShadow = true;
    g.add(roofMesh);

    // Front and back end walls (with door openings)
    const frontDoor = this.createEndWall(zStart, true);
    doorMeshes.push(frontDoor);
    g.add(frontDoor);
    const backDoor = this.createEndWall(zEnd, false);
    doorMeshes.push(backDoor);
    g.add(backDoor);

    // Furniture
    const furns = this.createFurniture(purpose, zStart);
    for (const f of furns) {
      interiorGroup.add(f.mesh);
      furnitureGroups.push(f.mesh);
      this.furnitureList.push(f);
    }

    // Interior ceiling lights
    for (let lz = zStart + 2; lz < zEnd - 1; lz += 3) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.05, 0.15),
        Mat.lightBulb(),
      );
      light.position.set(0, FLOOR_Y + CAR_HEIGHT - 0.15, lz);
      interiorGroup.add(light);
    }

    return {
      group: g, floorMesh, wallMeshes, windowMeshes, doorMeshes,
      roofMesh, interiorGroup, furnitureGroups,
      zStart, zEnd,
    };
  }

  private createWall(xPos: number, zStart: number, zEnd: number, _side: string): THREE.Mesh {
    const h = CAR_HEIGHT;
    const len = zEnd - zStart;
    const geo = new THREE.BoxGeometry(WALL_THICKNESS, h, len);
    const mesh = new THREE.Mesh(geo, Mat.trainExterior());
    mesh.position.set(xPos, FLOOR_Y + h / 2, zStart + len / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private createWindow(xPos: number, z: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(0.02, WINDOW_SIZE, WINDOW_SIZE);
    const mesh = new THREE.Mesh(geo, Mat.trainWindow());
    mesh.position.set(xPos, FLOOR_Y + CAR_HEIGHT * 0.55, z);
    return mesh;
  }

  private createEndWall(z: number, isFront: boolean): THREE.Mesh {
    // End wall with a door-sized gap simulated by just showing the top part
    const wallH = CAR_HEIGHT - DOOR_HEIGHT;
    const geo = new THREE.BoxGeometry(CAR_WIDTH, wallH, WALL_THICKNESS);
    const mesh = new THREE.Mesh(geo, Mat.trainExterior());
    mesh.position.set(0, FLOOR_Y + DOOR_HEIGHT + wallH / 2, z);
    mesh.castShadow = true;
    return mesh;
  }

  private createConnector(zStart: number): THREE.Mesh {
    const connW = CAR_WIDTH * 0.5;
    const connH = CAR_HEIGHT * 0.7;
    const geo = new THREE.BoxGeometry(connW, connH, CONNECTOR_LENGTH);
    const mesh = new THREE.Mesh(geo, Mat.trainConnector());
    mesh.position.set(0, FLOOR_Y + connH / 2, zStart + CONNECTOR_LENGTH / 2);
    return mesh;
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

  private addHeadlight(): void {
    const lightGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const lightMesh = new THREE.Mesh(lightGeo, Mat.lightBulb());
    lightMesh.position.set(0, FLOOR_Y + CAR_HEIGHT * 0.5, -0.2);
    this.group.add(lightMesh);
  }

  private createFurniture(purpose: string, zStart: number): FurnitureMesh3D[] {
    const items: FurnitureMesh3D[] = [];

    switch (purpose) {
      case 'ENGINE': {
        items.push(this.makeFurnitureItem('BRAKE_PANEL', 0, zStart + 2));
        items.push(this.makeFurnitureItem('WORKBENCH', -1, zStart + 5));
        items.push(this.makeFurnitureItem('MAP_BOARD', 1, zStart + 2));
        items.push(this.makeFurnitureItem('LIGHT_SWITCH', 1.2, zStart + 4));
        break;
      }
      case 'LIVING': {
        items.push(this.makeFurnitureItem('BED', -1, zStart + 3));
        items.push(this.makeFurnitureItem('COOKING_STOVE', 1, zStart + 4));
        items.push(this.makeFurnitureItem('FIRST_AID', 1, zStart + 7));
        items.push(this.makeFurnitureItem('PLANT_BOX', -1, zStart + 9));
        break;
      }
      case 'STORAGE': {
        items.push(this.makeFurnitureItem('STORAGE_CRATE', -1, zStart + 2));
        items.push(this.makeFurnitureItem('STORAGE_CRATE', 1, zStart + 2));
        items.push(this.makeFurnitureItem('STORAGE_CRATE', -1, zStart + 7));
        break;
      }
    }
    return items;
  }

  private makeFurnitureItem(type: string, x: number, z: number): FurnitureMesh3D {
    const g = new THREE.Group();
    const pos = new THREE.Vector3(x, FLOOR_Y + 0.05, z);

    switch (type) {
      case 'BRAKE_PANEL': {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.3), Mat.furnitureBrake());
        box.position.set(0, 0.6, 0);
        box.castShadow = true;
        g.add(box);
        // Lever
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
        // Legs
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
        // Burner (glowing ring)
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
        // Red cross
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
        // Plants (simple green cylinders)
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
        // Lid line
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.72), Mat.furnitureWorkbench());
        lid.position.set(0, 0.51, 0);
        g.add(lid);
        break;
      }
    }

    g.position.copy(pos);
    return { mesh: g, type, worldPos: pos };
  }

  /** Get the Z-center of the train */
  public getCenter(): number {
    return this.totalLength / 2;
  }

  /** Get bounding box of the entire train */
  public getBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    return {
      minX: -CAR_WIDTH / 2,
      maxX: CAR_WIDTH / 2,
      minZ: 0,
      maxZ: this.totalLength,
    };
  }

  /** Check if a world point is inside a connector */
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

  /** Get the car index at a given z position */
  public getCarIndexAt(z: number): number {
    let zPos = 0;
    for (let i = 0; i < NUM_TRAIN_CARS; i++) {
      if (i > 0) zPos += CONNECTOR_LENGTH;
      if (z >= zPos && z <= zPos + CAR_LENGTH) return i;
      zPos += CAR_LENGTH;
    }
    return -1;
  }
}
