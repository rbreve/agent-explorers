import * as THREE from 'three';
import { Grid, TILE_SIZE } from './Grid.js';

const textureLoader = new THREE.TextureLoader();

/**
 * Zone — a named grid region with a tiled sprite, enter message, and optional effects.
 *
 * Usage:
 *   const muds = new Zone({
 *     name: 'The Muds',
 *     col: 0, row: 0,       // grid origin (bottom-left tile)
 *     width: 5, height: 2,  // size in tiles
 *     sprite: '/images/mud.png',
 *     enterMessage: 'You entered The Muds — spiders lurk here!',
 *   });
 *   muds.addToScene(scene);
 */
export class Zone {
  constructor(config) {
    // Identity
    this.name = config.name || 'Zone';
    this.enterMessage = config.enterMessage || `You entered ${this.name}.`;

    // Grid position & size (in tiles)
    this.col = config.col ?? 0;
    this.row = config.row ?? 0;
    this.tileWidth = config.width ?? 1;
    this.tileHeight = config.height ?? 1;

    // Pixel bounds (computed from grid)
    this.x = this.col * TILE_SIZE;
    this.y = this.row * TILE_SIZE;
    this.pixelWidth = this.tileWidth * TILE_SIZE;
    this.pixelHeight = this.tileHeight * TILE_SIZE;

    // Sprite
    this.spritePath = config.sprite || null;

    // Track which agents are currently inside (to send message only on enter)
    this.agentsInside = new Set();

    // Three.js group
    this.group = new THREE.Group();
    this._build();
  }

  _build() {
    if (!this.spritePath) return;

    const texture = textureLoader.load(this.spritePath);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    // Tile the texture across the zone
    for (let c = 0; c < this.tileWidth; c++) {
      for (let r = 0; r < this.tileHeight; r++) {
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(TILE_SIZE, TILE_SIZE, 1);

        // Position each tile at its center
        const pos = Grid.toPixel(this.col + c, this.row + r);
        sprite.position.set(pos.x, pos.y, 0.3);
        this.group.add(sprite);
      }
    }
  }

  /** Check if a pixel position is inside this zone */
  contains(px, py) {
    return px >= this.x && px < this.x + this.pixelWidth &&
           py >= this.y && py < this.y + this.pixelHeight;
  }

  /** Check agents entering/leaving. Call each frame. Returns list of newly entered agents. */
  checkAgents(agents) {
    const entered = [];
    const currentInside = new Set();

    for (const agent of agents) {
      if (agent.dead) continue;
      if (this.contains(agent.x, agent.y)) {
        currentInside.add(agent.name);
        if (!this.agentsInside.has(agent.name)) {
          // Agent just entered
          agent.incomingMessages.push({ from: 'SYSTEM', message: this.enterMessage });
          entered.push(agent);
        }
      }
    }

    this.agentsInside = currentInside;
    return entered;
  }

  /** Get zone label for perception (e.g. "The Muds (0,0)-(4,1)") */
  getLabel() {
    return `${this.name} (${this.col},${this.row})-(${this.col + this.tileWidth - 1},${this.row + this.tileHeight - 1})`;
  }

  /** Get the zone name if pixel position is inside, or null */
  getZoneAt(px, py) {
    return this.contains(px, py) ? this.name : null;
  }

  addToScene(scene) {
    scene.add(this.group);
  }

  removeFromScene(scene) {
    scene.remove(this.group);
  }
}
