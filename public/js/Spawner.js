import { Grid, TILE_SIZE } from './Grid.js';

/**
 * Spawner — periodically creates entities within a Zone.
 *
 * Usage:
 *   const spawner = new Spawner({
 *     zone,                          // Zone instance — spawn area
 *     factory: (x, y) => new Spider({ x, y }),  // creates the entity
 *     add: (entity) => world.addSpider(entity), // adds it to the world
 *     interval: 60,                  // seconds between spawns
 *     max: 5,                        // max alive at once (0 = unlimited)
 *     count: (zone, world) => ...,   // optional: custom alive-count function
 *     onSpawn: (entity) => {},       // optional: callback after spawn
 *   });
 *   // in update loop:
 *   spawner.update(dt);
 */
export class Spawner {
  constructor(config) {
    this.zone = config.zone;
    this.factory = config.factory;
    this.add = config.add;
    this.interval = config.interval ?? 60;
    this.max = config.max ?? 0;
    this.count = config.count || null;
    this.onSpawn = config.onSpawn || null;

    this.timer = this.interval; // spawn on first tick after interval
    this.spawned = [];          // track entities we created
    this.active = true;
  }

  /** Pick a random pixel position inside the zone, snapped to tile center */
  _randomPosition() {
    const col = this.zone.col + Math.floor(Math.random() * this.zone.tileWidth);
    const row = this.zone.row + Math.floor(Math.random() * this.zone.tileHeight);
    return Grid.toPixel(col, row);
  }

  /** Prune dead/removed entities from our tracked list */
  _pruneSpawned() {
    this.spawned = this.spawned.filter(e => !e.dead);
  }

  /** How many of our spawned entities are still alive */
  aliveCount() {
    this._pruneSpawned();
    return this.spawned.length;
  }

  update(dt) {
    if (!this.active) return;

    this.timer -= dt;
    if (this.timer > 0) return;

    this.timer = this.interval;

    // Check cap
    if (this.max > 0 && this.aliveCount() >= this.max) return;

    // Custom count check (e.g. cap based on world state)
    if (this.count && this.count() >= this.max && this.max > 0) return;

    const pos = this._randomPosition();
    const entity = this.factory(pos.x, pos.y);
    this.add(entity);
    this.spawned.push(entity);

    if (this.onSpawn) this.onSpawn(entity);
  }
}
