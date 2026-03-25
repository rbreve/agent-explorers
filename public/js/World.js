import * as THREE from 'three';
import { Grid, TILE_SIZE, GRID_COLS, GRID_ROWS, WORLD_WIDTH, WORLD_HEIGHT } from './Grid.js';

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = WORLD_WIDTH;
    this.height = WORLD_HEIGHT;
    this.agents = [];
    this.bullets = [];
    this.items = [];
    this.spiders = [];
    this.paused = false;
    this.showAwareness = true;
    this.showThoughts = true;
    this.showLogs = true;
    this.selectedAgent = null;
    this.selectedShop = null;
    this.eventLog = []; // events for UI to consume

    // Three.js setup - orthographic 2D camera
    const aspect = window.innerWidth / window.innerHeight;
    const viewWidth = this.width;
    const viewHeight = this.height;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2d8a4e);
    this.camera = new THREE.OrthographicCamera(
      0, viewWidth, viewHeight, 0, -10, 10
    );
    this.camera.position.z = 5;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // Grass tiled floor
    this._drawGrassFloor();
    // Arena border
    this._drawBorder();

    // Click detection
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    canvas.addEventListener('click', (e) => this._onClick(e));

    // Drag & drop for shops
    this._dragging = null;
    canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    canvas.addEventListener('mouseup', () => this._onMouseUp());
  }

  _resize() {
    const container = this.canvas.parentElement;
    const panel = document.getElementById('ui-panel');
    const w = container.clientWidth - panel.clientWidth;
    const h = container.clientHeight;
    this.renderer.setSize(w, h);
    // Update camera to fit world while maintaining aspect
    const scaleX = w / this.width;
    const scaleY = h / this.height;
    const scale = Math.min(scaleX, scaleY);
    const visW = w / scale;
    const visH = h / scale;
    const offsetX = (visW - this.width) / 2;
    const offsetY = (visH - this.height) / 2;
    this.camera.left = -offsetX;
    this.camera.right = this.width + offsetX;
    this.camera.top = this.height + offsetY;
    this.camera.bottom = -offsetY;
    this.camera.updateProjectionMatrix();
  }

  _drawGrassFloor() {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/images/world/grass.png');
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // Tile the grass texture across the world
    tex.repeat.set(GRID_COLS, GRID_ROWS);

    const geo = new THREE.PlaneGeometry(this.width, this.height);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const floor = new THREE.Mesh(geo, mat);
    floor.position.set(this.width / 2, this.height / 2, -1);
    this.scene.add(floor);
  }

  _drawBorder() {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(this.width, 0, 0),
      new THREE.Vector3(this.width, this.height, 0),
      new THREE.Vector3(0, this.height, 0),
      new THREE.Vector3(0, 0, 0),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x1a5c30 });
    this.scene.add(new THREE.Line(geo, mat));
  }

  _onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check agents first
    const meshes = this.agents.map(a => a.mesh);
    const intersects = this.raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      const agent = this.agents.find(a => a.mesh === intersects[0].object);
      this.selectedAgent = agent || null;
      this.selectedShop = null;
      return;
    }

    // Check shops
    const shopMeshes = this.items.filter(i => i.type === 'shop').map(i => i.mesh);
    const shopHits = this.raycaster.intersectObjects(shopMeshes);
    if (shopHits.length > 0) {
      const shop = this.items.find(i => i.type === 'shop' && i.mesh === shopHits[0].object);
      this.selectedShop = shop || null;
      this.selectedAgent = null;
      return;
    }

    this.selectedAgent = null;
    this.selectedShop = null;
  }

  _mouseToWorld(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const v = new THREE.Vector3(this.mouse.x, this.mouse.y, 0).unproject(this.camera);
    return { x: v.x, y: v.y };
  }

  _onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const shopMeshes = this.items.filter(i => i.type === 'shop').map(i => i.mesh);
    const hits = this.raycaster.intersectObjects(shopMeshes);
    if (hits.length > 0) {
      const shop = this.items.find(i => i.type === 'shop' && i.mesh === hits[0].object);
      if (shop) {
        this._dragging = shop;
        this.canvas.style.cursor = 'grabbing';
      }
    }
  }

  _onMouseMove(e) {
    if (!this._dragging) return;
    const pos = this._mouseToWorld(e);
    const x = Math.max(30, Math.min(this.width - 30, pos.x));
    const y = Math.max(30, Math.min(this.height - 30, pos.y));
    this._dragging.x = x;
    this._dragging.y = y;
    this._dragging.group.position.set(x, y, 0);
  }

  _onMouseUp() {
    if (this._dragging) {
      this._dragging = null;
      this.canvas.style.cursor = '';
    }
  }

  // Find a targetable entity by name/type from the perspective of a source entity.
  // Searches agents, spiders, and interactive items. Returns { entity, dist, kind } or null.
  // kind: 'agent' | 'spider' | 'item'
  findTarget(name, sourceX, sourceY, maxRange = Infinity) {
    if (!name) return null;
    const lname = name.toLowerCase();
    let best = null;
    let bestDist = maxRange;

    // Search agents by name
    for (const agent of this.agents) {
      if (agent.dead) continue;
      if (agent.name.toLowerCase() === lname) {
        const d = Math.hypot(agent.x - sourceX, agent.y - sourceY);
        if (d < bestDist) { best = { entity: agent, dist: d, kind: 'agent' }; bestDist = d; }
      }
    }

    // Search spiders by type
    for (const spider of this.spiders) {
      if (spider.dead) continue;
      if ('spider'.startsWith(lname) || lname.includes('spider')) {
        const d = Math.hypot(spider.x - sourceX, spider.y - sourceY);
        if (d < bestDist) { best = { entity: spider, dist: d, kind: 'spider' }; bestDist = d; }
      }
    }

    // Search items by type (for attackable/interactive items)
    for (const item of this.items) {
      if (item.type.toLowerCase() === lname || item.type.toLowerCase().includes(lname)) {
        const d = Math.hypot(item.x - sourceX, item.y - sourceY);
        if (d < bestDist) { best = { entity: item, dist: d, kind: 'item' }; bestDist = d; }
      }
    }

    return best;
  }

  // Find all entities of a kind near a position
  findNearby(kind, sourceX, sourceY, range) {
    const results = [];
    const sources = kind === 'agent' ? this.agents
      : kind === 'spider' ? this.spiders
      : this.items;
    for (const entity of sources) {
      if (entity.dead) continue;
      const d = Math.hypot(entity.x - sourceX, entity.y - sourceY);
      if (d <= range) results.push({ entity, dist: d, kind });
    }
    return results;
  }

  addAgent(agent) {
    this.agents.push(agent);
    agent.addToScene(this.scene);
  }

  removeAgent(agent) {
    const idx = this.agents.indexOf(agent);
    if (idx !== -1) {
      this.agents.splice(idx, 1);
      agent.removeFromScene(this.scene);
    }
  }

  addBullet(bullet) {
    this.bullets.push(bullet);
    bullet.addToScene(this.scene);
  }

  addItem(item) {
    this.items.push(item);
    item.addToScene(this.scene);
  }

  removeItem(item) {
    const idx = this.items.indexOf(item);
    if (idx !== -1) {
      this.items.splice(idx, 1);
      item.removeFromScene(this.scene);
    }
  }

  addSpider(spider) {
    this.spiders.push(spider);
    spider.addToScene(this.scene);
  }

  removeSpider(spider) {
    const idx = this.spiders.indexOf(spider);
    if (idx !== -1) {
      this.spiders.splice(idx, 1);
      spider.removeFromScene(this.scene);
    }
  }

  // Get everything an agent can "see" within its awareness radius
  getPerception(agent) {
    const nearby = [];
    const convos = {};

    for (const other of this.agents) {
      if (other === agent || other.dead) continue;
      const dist = agent.distanceTo(other);
      if (dist <= agent.awarenessRadius) {
        nearby.push({
          name: other.name,
          x: Math.round(other.x),
          y: Math.round(other.y),
          health: other.health,
          coins: other.coins,
          type: other.agentType,
          dist: Grid.tileDistance(agent.x, agent.y, other.x, other.y),
          rel: agent.relationships[other.name] || 'neutral',
        });
        // Only last 5 messages to save tokens
        const hist = agent.conversationHistory[other.name];
        if (hist?.length > 0) {
          convos[other.name] = hist.slice(-5);
        }
      }
    }

    const nearbyItems = [];
    for (const item of this.items) {
      if (item.type === 'trap') continue; // traps are invisible to agents
      if (item.type === 'tree' && item.isCut) continue; // cut trees are just stumps
      if (item.type === 'rock' && item.isBroken) continue; // broken rocks disappear
      const dist = Math.hypot(item.x - agent.x, item.y - agent.y);
      if (dist <= agent.awarenessRadius) {
        const entry = { type: item.type, x: Math.round(item.x), y: Math.round(item.y), dist: Grid.tileDistance(agent.x, agent.y, item.x, item.y) };
        if (item.type === 'shop' && item.shopInventory) {
          entry.shop = true;
          entry.shopName = item.shopName || 'Shop';
          const atShop = dist <= agent.radius + item.radius;
          if (atShop) {
            entry.atShop = true;
            entry.inventory = item.shopInventory.map(si => ({
              name: si.name, price: si.price, desc: si.description,
              canAfford: agent.coins >= si.price,
            }));
          }
        }
        if (item.type === 'treasure') {
          entry.needsKey = true;
          entry.youHaveKey = agent.keys > 0;
        }
        if (item.type === 'note') {
          entry.hint = 'There is a note here!';
        }
        if (item.type === 'rock') {
          entry.breakable = true;
          entry.needsHammer = !agent.hasHammer;
        }
        if (item.type === 'apple_tree') {
          entry.apples = item.apples;
        }
        if (item.type === 'house') {
          entry.owner = item.owner?.name || '???';
          entry.isYours = item.owner === agent;
          entry.occupied = !!item.occupant;
        }
        if (item.grabbable) {
          entry.grabbable = true;
        }
        if (item.autoPickup) {
          entry.walkOverToCollect = true;
        }
        nearbyItems.push(entry);
      }
    }

    const nearbySpiders = [];
    for (const spider of this.spiders) {
      if (spider.dead) continue;
      const dist = Math.hypot(spider.x - agent.x, spider.y - agent.y);
      if (dist <= agent.awarenessRadius) {
        nearbySpiders.push({ type: 'spider', x: Math.round(spider.x), y: Math.round(spider.y), dist: Grid.tileDistance(agent.x, agent.y, spider.x, spider.y), hp: spider.health });
      }
    }

    // Build compact messages — separate system alerts from agent messages
    const agentMsgs = [];
    const systemAlerts = [];
    for (const m of agent.incomingMessages) {
      if (m.from === 'SYSTEM') {
        systemAlerts.push(m.message);
      } else {
        agentMsgs.push(`${m.from}: ${m.message}`);
      }
    }
    agent.incomingMessages = [];

    const hw = this._getHealthWarning(agent);

    // Check if agent is at a shop
    const atShopItem = this.items.find(i => i.type === 'shop' && Math.hypot(i.x - agent.x, i.y - agent.y) <= agent.radius + i.radius);

    // Helper: pixel → grid label
    const g = (px, py) => Grid.toLabel(px, py);

    // Exploration — unexplored areas (in grid coords)
    const unexplored = [];
    for (let qx = 0; qx < 4; qx++) {
      for (let qy = 0; qy < 3; qy++) {
        if (!agent.visitedQuadrants.has(`${qx},${qy}`)) {
          unexplored.push(g(qx * 300 + 150, qy * 267 + 133));
        }
      }
    }

    const rels = Object.keys(agent.relationships).length > 0 ? agent.relationships : null;
    const healthPct = agent.health / agent.stats.maxHealth.value;

    // ── Build clear text perception ──
    const lines = [];

    // URGENT section — health warnings, attacks, spider danger
    const urgentLines = [];
    if (hw) urgentLines.push(hw);
    if (nearbySpiders.length > 0) {
      const closest = nearbySpiders.reduce((a, b) => a.dist < b.dist ? a : b);
      if (closest.dist <= 2) {
        urgentLines.push(`DANGER! Spider very close (${closest.dist} tiles away)!`);
      }
    }
    if (systemAlerts.length > 0) {
      for (const alert of systemAlerts) {
        if (/damage|hit|attack|trap|bit/i.test(alert)) {
          urgentLines.push(alert);
        }
      }
    }
    if (urgentLines.length > 0) {
      lines.push('⚠ IMPORTANT:');
      for (const u of urgentLines) lines.push(`  ${u}`);
      lines.push('');
    }

    // Messages from other agents
    if (agentMsgs.length > 0) {
      lines.push('MESSAGES:');
      for (const m of agentMsgs) lines.push(`  ${m}`);
      lines.push('');
    }

    // System alerts (non-urgent)
    const nonUrgentAlerts = systemAlerts.filter(a => !/damage|hit|attack|trap|bit/i.test(a));
    if (nonUrgentAlerts.length > 0) {
      lines.push('ALERTS:');
      for (const a of nonUrgentAlerts) lines.push(`  ${a}`);
      lines.push('');
    }

    // YOU section
    lines.push('YOU:');
    lines.push(`  Position: ${g(agent.x, agent.y)}`);
    if (agent.insideHouse) lines.push('  Current Location: INSIDE YOUR HOUSE (healing, safe from damage)');
    else if (atShopItem) lines.push(`  Current Location: SHOP "${atShopItem.shopName || 'Shop'}"`);
    lines.push(`  HP: ${agent.health}/${agent.stats.maxHealth.value} (${Math.round(healthPct * 100)}%)`);
    lines.push(`  Coins: ${agent.coins} | Bullets: ${agent.bullets} | HP Packs: ${agent.healthPacks}`);
    const extras = [];
    if (agent.wood > 0) extras.push(`Wood: ${agent.wood}`);
    if (agent.stones > 0) extras.push(`Stones: ${agent.stones}`);
    if (agent.apples > 0) extras.push(`Apples: ${agent.apples}`);
    if (agent.keys > 0) extras.push(`Keys: ${agent.keys}`);
    if (agent.traps > 0) extras.push(`Traps: ${agent.traps}`);
    if (extras.length > 0) lines.push(`  ${extras.join(' | ')}`);
    const tools = [];
    if (agent.hasAxe) tools.push('Axe');
    if (agent.hasHammer) tools.push('Hammer');
    lines.push(`  Tools: ${tools.length > 0 ? tools.join(', ') : 'none'}`);
    if (agent.inventory.length > 0) lines.push(`  Inventory: ${agent.inventory.join(', ')}`);
    lines.push(`  Damage: ${agent.stats.firepower.value} | Speed: ${agent.stats.speed.value} | Reach: ${agent.stats.reach.value}`);
    if (agent.attackCooldownTimer > 0) lines.push('  Weapon: cooling down');
    lines.push(`  Stress: ${agent.stress}/10`);
    lines.push('');

    // Goals
    if (agent.goal) {
      lines.push(`GOAL: ${agent.goal}`);
      lines.push('');
    }

    // Last action + result
    if (agent.lastDecision) {
      const d = agent.lastDecision;
      let lastStr = `${d.action}`;
      if (d.target) lastStr += ` target=${d.target}`;
      if (d.to) lastStr += ` to=${d.to}`;
      if (d.items) lastStr += ` items=${d.items.join(',')}`;
      if (d.item) lastStr += ` item=${d.item}`;
      if (d.targetX != null) lastStr += ` at=${g(d.targetX, d.targetY)}`;
      lines.push(`LAST ACTION: ${lastStr}`);
      if (agent.lastActionResult) {
        const r = agent.lastActionResult;
        lines.push(`  Result: ${r.success ? 'SUCCESS' : 'FAILED'} — ${r.message}`);
      }
      if (d.thought) lines.push(`  Thought: "${d.thought}"`);
      lines.push('');
    }

    // Nearby agents
    if (nearby.length > 0) {
      lines.push('NEARBY AGENTS:');
      for (const a of nearby) {
        const rel = agent.relationships[a.name] || 'neutral';
        lines.push(`  ${a.name} [${rel}] — HP:${a.hp} Coins:${a.coins} at ${g(a.x,a.y)} dist:${a.dist}`);
      }
      lines.push('');
    }

    // Nearby items
    if (nearbyItems.length > 0) {
      lines.push('NEARBY ITEMS:');
      for (const it of nearbyItems) {
        let desc = `${it.type} at ${g(it.x,it.y)} dist:${it.dist}`;
        if (it.shop) {
          desc = `SHOP "${it.shopName}" at ${g(it.x,it.y)} dist:${it.dist}`;
          if (it.atShop && it.inventory) {
            lines.push(`  ${desc}`);
            lines.push('    INVENTORY:');
            for (const si of it.inventory) {
              const afford = si.canAfford ? '✓' : '✗';
              lines.push(`      [${afford}] ${si.name} — ${si.price} coins — ${si.desc}`);
            }
            continue;
          }
        }
        if (it.type === 'house') {
          desc = `HOUSE (${it.owner}'s) at ${g(it.x,it.y)} dist:${it.dist}`;
          if (it.isYours) desc += it.occupied ? ' [you are inside]' : ' [yours — use enter_house]';
          else desc += it.occupied ? ' [occupied]' : '';
        }
        if (it.walkOverToCollect) desc += ' [move here to collect]';
        if (it.grabbable) desc += ' [use grab to pick up]';
        if (it.breakable) desc += it.needsHammer ? ' [needs hammer]' : ' [breakable]';
        if (it.apples != null) desc += ` (${it.apples} apples)`;
        if (it.needsKey) desc += it.youHaveKey ? ' [you have a key]' : ' [needs key]';
        if (it.hint) desc += ` — ${it.hint}`;
        lines.push(`  ${desc}`);
      }
      lines.push('');
    }

    // Spiders
    if (nearbySpiders.length > 0) {
      lines.push('SPIDERS:');
      for (const s of nearbySpiders) {
        lines.push(`  Spider at ${g(s.x,s.y)} dist:${s.dist} HP:${s.hp}`);
      }
      lines.push('');
    }

    // Relationships
    if (rels) {
      lines.push('RELATIONSHIPS:');
      for (const [name, rel] of Object.entries(rels)) {
        lines.push(`  ${name}: ${rel}`);
      }
      lines.push('');
    }

    // Recent conversations
    if (Object.keys(convos).length > 0) {
      lines.push('RECENT CONVERSATIONS:');
      for (const [name, msgs] of Object.entries(convos)) {
        lines.push(`  ${name}: ${msgs.slice(-3).join(' | ')}`);
      }
      lines.push('');
    }

    // Memory
    if (agent.memory.length > 0) {
      lines.push('MEMORY:');
      for (const m of agent.memory.slice(-5)) lines.push(`  - ${m}`);
      lines.push('');
    }

    // Instincts
    if (agent.enableInstincts && agent.instincts.length > 0) {
      lines.push('ACTIVE INSTINCTS:');
      for (const inst of agent.instincts) {
        lines.push(`  ${inst.trigger} → ${inst.action.action}`);
      }
      lines.push('');
    } else if (agent.enableInstincts) {
      lines.push('INSTINCTS: none set (you can program reflexes with setInstincts)');
      lines.push('');
    }

    // Known locations
    if (agent.knownShops.length > 0) {
      lines.push(`KNOWN SHOPS: ${agent.knownShops.map(s => g(s.x,s.y)).join(', ')}`);
    }
    if (unexplored.length > 0 && unexplored.length < 12) {
      lines.push(`UNEXPLORED AREAS: ${unexplored.join(', ')}`);
    }

    lines.push(`WORLD GRID: ${GRID_COLS}x${GRID_ROWS} (coords 0-${GRID_COLS-1}, 0-${GRID_ROWS-1})`);

    return lines.join('\n');
  }

  _getHealthWarning(agent) {
    const pct = agent.health / agent.maxHealth;
    const hasCoins = agent.coins >= 3;
    const nearbyHP = this.items.some(
      i => i.type === 'health_pack' && Math.hypot(i.x - agent.x, i.y - agent.y) <= agent.awarenessRadius
    );
    const nearbyShop = this.items.some(
      i => i.type === 'shop' && Math.hypot(i.x - agent.x, i.y - agent.y) <= agent.awarenessRadius
    );
    const knowsShop = agent.knownShops.length > 0;

    if (pct <= 0.2) {
      if (agent.healthPacks > 0) return 'CRITICAL HEALTH LOW!';
      if (nearbyShop && hasCoins) return 'CRITICAL HEALTH LOW';
      if (nearbyHP) return 'CRITICAL, there is a health pack nearby';
      if (knowsShop && hasCoins) return `CRITICAL! Rush to shop at ${Grid.toLabel(agent.knownShops[0].x, agent.knownShops[0].y)}!`;
      return 'CRITICAL! About to die. Find health!';
    }
    if (pct <= 0.4) {
      if (agent.healthPacks > 0) return 'WARNING: Health low.';
      if (nearbyShop && hasCoins) return 'WARNING: Health low.';
      if (nearbyHP) return 'WARNING: Health low..';
      if (knowsShop && hasCoins) return `WARNING: Shops at ${Grid.toLabel(agent.knownShops[0].x, agent.knownShops[0].y)}.`;
      return 'WARNING: Health low. Find healing.';
    }
    if (pct <= 0.6) {
      return null; // Don't waste tokens on mild warnings
    }
    return null;
  }

  update(dt) {
    if (this.paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Update agents
    for (const agent of this.agents) {
      agent.update(dt, this);
    }

    // Update bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.update(dt);

      // Check bounds
      if (bullet.x < 0 || bullet.x > this.width || bullet.y < 0 || bullet.y > this.height) {
        bullet.removeFromScene(this.scene);
        this.bullets.splice(i, 1);
        continue;
      }

      // Check hits on agents
      let bulletRemoved = false;
      for (const agent of this.agents) {
        if (agent === bullet.owner || agent.dead || agent.insideHouse) continue;
        const dist = Math.hypot(agent.x - bullet.x, agent.y - bullet.y);
        if (dist < agent.radius + bullet.radius) {
          agent.takeDamage(bullet.damage, bullet.owner, this);
          bullet.removeFromScene(this.scene);
          this.bullets.splice(i, 1);
          bulletRemoved = true;
          break;
        }
      }
      // Check hits on spiders
      if (!bulletRemoved) {
        for (const spider of this.spiders) {
          if (spider.dead) continue;
          const dist = Math.hypot(spider.x - bullet.x, spider.y - bullet.y);
          if (dist < spider.radius + bullet.radius) {
            spider.takeDamage(bullet.damage, this, bullet.owner);
            if (spider.dead && bullet.owner) {
              this.eventLog.push({ type: 'spider_kill', killer: bullet.owner.name, color: bullet.owner.color, x: Math.round(spider.x), y: Math.round(spider.y) });
              bullet.owner.incomingMessages.push({ from: 'SYSTEM', message: `You killed a spider with a bullet! Loot dropped at ${Grid.toLabel(spider.x, spider.y)}.` });
            } else if (!spider.dead && bullet.owner) {
              bullet.owner.incomingMessages.push({ from: 'SYSTEM', message: `You hit a spider for ${bullet.damage} damage! Spider HP: ${spider.health}` });
            }
            bullet.removeFromScene(this.scene);
            this.bullets.splice(i, 1);
            break;
          }
        }
      }
    }

    // Check item pickup & trap triggers
    for (const agent of this.agents) {
      if (agent.dead || agent.agentType === 'shop' || agent.insideHouse) continue;
      for (let i = this.items.length - 1; i >= 0; i--) {
        const item = this.items[i];
        if (!item.autoPickup && item.type !== 'trap') continue;
        const dist = Math.hypot(agent.x - item.x, agent.y - item.y);
        if (dist < agent.radius + item.radius) {
          // Trap — damages agent (skip owner)
          if (item.type === 'trap') {
            if (item.owner === agent) continue; // don't trigger own trap
            agent.takeDamage(item.trapDamage, item.owner, this);
            const ownerName = item.owner?.name || 'someone';
            agent.incomingMessages.push({
              from: 'SYSTEM',
              message: `You stepped on a trap placed by ${ownerName}! Took ${item.trapDamage} damage!`,
            });
            // Notify owner
            if (item.owner && !item.owner.dead) {
              item.owner.incomingMessages.push({
                from: 'SYSTEM',
                message: `Your trap caught ${agent.name}! Dealt ${item.trapDamage} damage.`,
              });
            }
            item.removeFromScene(this.scene);
            this.items.splice(i, 1);
            continue;
          }
          const picked = item.onPickup(agent);
          if (picked === false) continue; // treasure needs a key
          item.removeFromScene(this.scene);
          this.items.splice(i, 1);
          // Clear target so agent doesn't keep walking to this spot
          agent.targetX = null;
          agent.targetY = null;
          // Force new decision on next tick
          agent.decisionTimer = agent.decisionInterval;
        }
      }
    }

    // Update spiders
    for (const spider of this.spiders) {
      spider.update(dt, this);
    }

    // Spider-agent contact damage
    for (const spider of this.spiders) {
      if (spider.dead) continue;
      spider.contactTimer = Math.max(0, spider.contactTimer - dt);
      for (const agent of this.agents) {
        if (agent.dead || agent.agentType === 'shop' || agent.insideHouse) continue;
        const dist = Math.hypot(agent.x - spider.x, agent.y - spider.y);
        if (dist < agent.radius + spider.radius && spider.contactTimer <= 0) {
          agent.takeDamage(spider.damage, { name: 'spider' }, this);
          agent.incomingMessages.push({
            from: 'SYSTEM',
            message: `A spider bit you for ${spider.damage} damage!`,
          });
          spider.contactTimer = spider.contactCooldown;
        }
      }
    }

    // Remove dead spiders
    for (let i = this.spiders.length - 1; i >= 0; i--) {
      if (this.spiders[i].dead) {
        this.spiders[i].removeFromScene(this.scene);
        this.spiders.splice(i, 1);
      }
    }

    // Remove dead agents after a delay
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const agent = this.agents[i];
      if (agent.dead && agent.deadTimer > 3) {
        if (this.selectedAgent === agent) this.selectedAgent = null;
        agent.removeFromScene(this.scene);
        this.agents.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
