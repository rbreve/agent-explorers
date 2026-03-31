import { Agent } from './Agent.js';
import { Item } from './Item.js';
import { Spider } from './Spider.js';
import { Shop } from './Shop.js';
import { Grid } from './Grid.js';
import { Zone } from './Zone.js';
import { Spawner } from './Spawner.js';

export class SceneLoader {
  constructor(world, onLog) {
    this.world = world;
    this.onLog = onLog || (() => {});
  }

  load(scene) {
    this.world.clearAll();

    if (scene.zones) this._loadZones(scene.zones);
    if (scene.spawners) this._loadSpawners(scene.spawners);
    if (scene.shops) this._loadShops(scene.shops);
    if (scene.items) this._loadItems(scene.items);
    if (scene.agents) this._loadAgents(scene.agents);

    this.onLog('World', `Scene "${scene.name}" loaded`, '#57b7ff');
  }

  _loadZones(zones) {
    for (const z of zones) {
      const zone = new Zone(z);
      this.world.addZone(zone);
      // Store reference by name for spawners
      if (!this.world._zonesByName) this.world._zonesByName = {};
      this.world._zonesByName[z.name] = zone;
    }
  }

  _loadSpawners(spawners) {
    for (const s of spawners) {
      const zone = this.world._zonesByName?.[s.zone];
      if (!zone) continue;
      this.world.addSpawner(new Spawner({
        zone,
        factory: (x, y) => new Spider({ x, y, zone }),
        add: (spider) => {
          this.world.addSpider(spider);
          this.onLog('World', `A spider crawled out of ${s.zone}!`, '#660044');
        },
        interval: s.interval ?? 60,
        max: s.max ?? 5,
      }));
    }
  }

  _loadShops(shops) {
    for (const s of shops) {
      const pos = Grid.toPixel(s.col, s.row);
      const shop = new Shop({ x: pos.x, y: pos.y });
      if (s.name) {
        shop.shopName = s.name;
        shop.updateLabel(s.name);
      }
      this.world.addItem(shop);
    }
  }

  _loadItems(items) {
    for (const def of items) {
      const count = def.count || 1;
      for (let i = 0; i < count; i++) {
        const pos = this._randomPos(def);
        this.world.addItem(new Item({ type: def.type, x: pos.x, y: pos.y, ...def.props }));
      }
    }
  }

  _loadAgents(agents) {
    for (const a of agents) {
      const pos = a.col != null && a.row != null
        ? Grid.toPixel(a.col, a.row)
        : this._randomPos(a);

      const agent = new Agent({
        name: a.name,
        model: a.model,
        provider: a.provider || 'openrouter',
        color: a.color,
        temperature: a.temperature ?? 0.9,
        isNPC: a.isNPC || false,
        enableInstincts: a.enableInstincts || false,
        systemPrompt: a.prompt,
        x: pos.x,
        y: pos.y,
      });

      // Apply loadout
      if (a.coins) agent.coins = a.coins;
      if (a.bullets) agent.bullets = a.bullets;
      if (a.health) agent.health = Math.min(a.health, agent.maxHealth);
      if (a.hasAxe) agent.hasAxe = true;
      if (a.hasHammer) agent.hasHammer = true;
      if (a.animalTraps) agent.animalTraps = a.animalTraps;
      if (a.healthPacks) agent.healthPacks = a.healthPacks;
      if (a.wood) agent.wood = a.wood;

      this.world.addAgent(agent);
      this.onLog(a.name, a.isNPC ? 'Set up shop' : 'Entered the arena', a.color);
    }
  }

  _randomPos(def) {
    if (def.col != null && def.row != null) {
      return Grid.toPixel(def.col, def.row);
    }
    const w = this.world.width;
    const h = this.world.height;
    return Grid.snap(
      50 + Math.random() * (w - 100),
      50 + Math.random() * (h - 100)
    );
  }
}
