import { Bullet } from './Bullet.js';
import { Item } from './Item.js';
import { LLMController } from './LLMController.js';
import { Grid, GRID_COLS, GRID_ROWS, TILE_SIZE } from './Grid.js';
import { AgentRenderer } from './AgentRenderer.js';
import { executeDecision } from './ActionRegistry.js';

export const BROADCAST_KILL = true;


export class Agent {
  constructor(config) {
    this.name = config.name || 'Agent';
    this.x = config.x ?? 600;
    this.y = config.y ?? 400;
    this.radius = config.radius ?? 18;
    this.color = config.color || '#ff4444';
    this.coins = config.coins ?? 0;
    this.healthPacks = config.healthPacks ?? 0;
    this.bullets = config.bullets ?? 0;
    this.keys = config.keys ?? 0;
    this.traps = config.traps ?? 0;
    this.animalTraps = config.animalTraps ?? 0;
    this.hasAxe = false;
    this.hasHammer = false;
    this.wood = 0;
    this.stones = 0;
    this.apples = 0;
    this.insideHouse = null; // reference to House if agent is inside
    this.stress = 0; // 0-10 stress level, set by LLM
    this.inventory = config.inventory ?? [];
    this.agentType = config.agentType || 'warrior';
    this.isNPC = config.isNPC || false;

    // Core stats (trackable, upgradeable)
    this.stats = {
      maxHealth:   { value: config.maxHealth ?? 100,  level: 1 },
      firepower:   { value: config.attackDamage ?? 15, level: 1 },
      speed:       { value: config.speed ?? 120,       level: 1 },
      reach:       { value: config.awarenessRadius ?? 200, level: 1 },
      bulletSpeed: { value: config.bulletSpeed ?? 650, level: 1 },
    };

    this.health = config.health ?? this.stats.maxHealth.value;
    this.maxHealth = this.stats.maxHealth.value;
    this.speed = this.stats.speed.value;
    this.awarenessRadius = this.stats.reach.value; // pixels (used by renderer)
    this.awarenessRange = this.stats.reach.value / TILE_SIZE; // tiles
    this.attackDamage = this.stats.firepower.value;
    this.bulletSpeed = this.stats.bulletSpeed.value;
    this.attackCooldown = config.attackCooldown ?? 1.0;
    this.attackCooldownTimer = 0;

    // Movement
    this.vx = 0;
    this.vy = 0;
    this.targetX = null;
    this.targetY = null;

    // LLM
    this.model = config.model || 'openai/gpt-4o-mini';
    this.provider = config.provider || 'openrouter';
    this.ollamaUrl = config.ollamaUrl || null;
    this.temperature = config.temperature ?? 0.9;
    this.systemPrompt = config.systemPrompt || '';
    this.llm = new LLMController(this.model, this.temperature, this.provider, this.ollamaUrl);
    this.lastDecision = null;
    this.lastActionResult = null; // { success: bool, message: string }
    this.turnHistory = []; // sliding window of recent { perception, decision } pairs
    this.maxTurnHistory = 5;
    this.pendingDecision = false;
    this.needsReassess = false;
    this.decisionCooldown = 0;       // seconds remaining before next LLM call
    this.decisionCooldownTime = 2.5; // seconds to wait between decisions

    // Instinct system — LLM-programmed reflexes
    this.enableInstincts = config.enableInstincts ?? false;
    this.instincts = []; // { trigger, action, thought }

    // Work action (cut_tree, break_rock) — takes time
    this.workAction = null;      // { action, item, world, elapsed }
    this.workDuration = 3.5;     // seconds to complete

    // Chat & relationships
    this.currentSpeech = '';
    this.incomingMessages = []; // new messages since last decision
    this.conversationHistory = {}; // per-agent: { agentName: [{from, message, tick}] }
    this.relationships = {}; // per-agent: { agentName: "ally"|"enemy"|"neutral"|"afraid" }
    this.friends = config.friends ?? []; // list of agent names this agent considers friends from the start
    // Pre-seed relationships from friends list
    for (const f of this.friends) {
      this.relationships[f] = 'ally';
    }
    this.goal = '';

    // Short-term memory (recent events, max 15)
    this.memory = [];

    // Long-term memory — LLM decides what to store here
    this.longTermMemory = [];  // [string] — max 30 entries

    // Legacy aliases
    this.knownShops = [];
    this.knownTreasures = [];

    // Exploration — track visited quadrants (4x3 grid over 1200x800)
    this.visitedQuadrants = new Set();

    // Health decay
    this.healthDecayTimer = 0;
    this.healthDecayInterval = 15.0; // lose HP every 5 seconds
    this.healthDecayAmount = 1;

    // State
    this.dead = false;
    this.deadTimer = 0;
    this.lastAttacker = null;

    // Renderer — all Three.js visuals
    this.renderer = new AgentRenderer(this);
    this.group = this.renderer.group;
  }


  // System-routed message: agent tells the system "send this to X", system delivers it
  sendMessage(to, message, world) {
    if (!world || !to || !message) return;

    // Show speech bubble via renderer
    this.renderer.showSpeech(message, to);

    const target = world.agents.find(a => a.name === to && !a.dead);
    if (!target) return;

    // Allow messaging up to 1.5x awareness range (agents remember seeing someone)
    const dist = this.distanceTo(target);
    if (dist > this.awarenessRange * 4) return;

    // System delivers the message to the target agent
    target.incomingMessages.push({ from: this.name, message });
    target.needsReassess = true;

    // Record conversation history on both sides
    if (!target.conversationHistory[this.name]) target.conversationHistory[this.name] = [];
    target.conversationHistory[this.name].push({ from: this.name, message });
    if (target.conversationHistory[this.name].length > 10) {
      target.conversationHistory[this.name] = target.conversationHistory[this.name].slice(-10);
    }

    if (!this.conversationHistory[to]) this.conversationHistory[to] = [];
    this.conversationHistory[to].push({ from: this.name, message });
    if (this.conversationHistory[to].length > 10) {
      this.conversationHistory[to] = this.conversationHistory[to].slice(-10);
    }
  }


  addToScene(scene) {
    this.renderer.addToScene(scene);
  }

  removeFromScene(scene) {
    this.renderer.removeFromScene(scene);
  }

  /** Distance to another entity in tiles */
  distanceTo(other) {
    return Grid.tileDist(this.x, this.y, other.x, other.y);
  }

  _isEnRouteToItem(world) {
    if (this.targetX == null || this.targetY == null) return false;
    // Check if current target is near a pickupable item
    for (const item of world.items) {
      if (item.type === 'shop') continue;
      const distToTarget = Math.hypot(item.x - this.targetX, item.y - this.targetY);
      if (distToTarget < 20) {
        // Still heading there?
        const distToMe = Math.hypot(this.targetX - this.x, this.targetY - this.y);
        if (distToMe > 10) return true;
      }
    }
    return false;
  }

  takeDamage(amount, attacker, world) {
    if (this.dead) return;
    if (this.insideHouse) return; // safe inside house
    this.health -= amount;
    this.lastAttacker = attacker?.name || 'unknown';
    this.needsReassess = true;
    // Notify the agent they were hit
    const attackerName = attacker?.name || 'unknown';
    this.incomingMessages.push({
      from: 'SYSTEM',
      message: `You were hit by a bullet from ${attackerName} for ${amount} damage! Your HP: ${this.health}/${this.stats.maxHealth.value}`,
    });
    this.memory.push(`Hit by ${attackerName} for ${amount} dmg (HP: ${this.health})`);
    if (this.memory.length > 15) this.memory.shift();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.renderer.setOpacity(0.3);
      // Attacker remembers the kill and loot
      if (attacker && !attacker.dead) {
        attacker.memory.push(`Killed ${this.name} who dropped ${this.coins} coins at (${Math.round(this.x)}, ${Math.round(this.y)})`);
        if (attacker.memory.length > 15) attacker.memory.shift();
      }
      // Broadcast kill to all living agents
      if (BROADCAST_KILL && world) {
        const killMsg = `${attackerName} killed ${this.name}. Loot dropped at (${Math.round(this.x)}, ${Math.round(this.y)}).`;
        for (const agent of world.agents) {
          if (agent === this || agent.dead) continue;
          agent.incomingMessages.push({ from: 'SYSTEM', message: killMsg });
        }
      }
      this._dropCoins(world);
    }
  }

  _dropCoins(world) {
    if (!world || this.coins <= 0) return;
    for (let i = 0; i < this.coins; i++) {
      const angle = (Math.PI * 2 * i) / this.coins + Math.random() * 0.5;
      const dist = 20 + Math.random() * 30;
      const raw = { x: this.x + Math.cos(angle) * dist, y: this.y + Math.sin(angle) * dist };
      const pos = Grid.snap(Math.max(10, Math.min(world.width - 10, raw.x)), Math.max(10, Math.min(world.height - 10, raw.y)));
      const coin = new Item({ type: 'coin', x: pos.x, y: pos.y });
      world.addItem(coin);
    }
    this.coins = 0;

    // Drop health packs
    for (let i = 0; i < this.healthPacks; i++) {
      const angle = (Math.PI * 2 * i) / Math.max(1, this.healthPacks) + Math.random() * 0.5 + Math.PI;
      const dist = 20 + Math.random() * 30;
      const hp = new Item({
        type: 'health_pack',
        x: Math.max(10, Math.min(world.width - 10, this.x + Math.cos(angle) * dist)),
        y: Math.max(10, Math.min(world.height - 10, this.y + Math.sin(angle) * dist)),
      });
      world.addItem(hp);
    }
    this.healthPacks = 0;

    // Drop keys
    for (let i = 0; i < this.keys; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 30;
      const key = new Item({
        type: 'key',
        x: Math.max(10, Math.min(world.width - 10, this.x + Math.cos(angle) * dist)),
        y: Math.max(10, Math.min(world.height - 10, this.y + Math.sin(angle) * dist)),
      });
      world.addItem(key);
    }
    this.keys = 0;

    // Drop wood
    for (let i = 0; i < this.wood; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 30;
      world.addItem(new Item({
        type: 'wood',
        x: Math.max(10, Math.min(world.width - 10, this.x + Math.cos(angle) * dist)),
        y: Math.max(10, Math.min(world.height - 10, this.y + Math.sin(angle) * dist)),
      }));
    }
    this.wood = 0;

    // Drop axe
    if (this.hasAxe) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 25;
      world.addItem(new Item({
        type: 'axe',
        x: Math.max(10, Math.min(world.width - 10, this.x + Math.cos(angle) * dist)),
        y: Math.max(10, Math.min(world.height - 10, this.y + Math.sin(angle) * dist)),
      }));
      this.hasAxe = false;
    }

    // Drop hammer
    if (this.hasHammer) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 25;
      world.addItem(new Item({
        type: 'hammer',
        x: Math.max(10, Math.min(world.width - 10, this.x + Math.cos(angle) * dist)),
        y: Math.max(10, Math.min(world.height - 10, this.y + Math.sin(angle) * dist)),
      }));
      this.hasHammer = false;
    }
  }

  attack(targetX, targetY, world, targetAgent = null) {
    if (this.attackCooldownTimer > 0 || this.dead || this.bullets <= 0) return;
    this.bullets--;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    const dirX = dx / dist;
    const dirY = dy / dist;

    const bullet = new Bullet({
      x: this.x + dirX * (this.radius + 8),
      y: this.y + dirY * (this.radius + 8),
      dirX,
      dirY,
      speed: this.bulletSpeed,
      damage: this.attackDamage,
      color: this.color,
      owner: this,
      target: targetAgent,
      autoHit: !!targetAgent,
    });
    world.addBullet(bullet);
    this.attackCooldownTimer = this.attackCooldown;
  }

  async makeDecision(world) {
    if (this.pendingDecision || this.dead) return;
    this.pendingDecision = true;

    try {
      const perception = world.getPerception(this);
      const decision = await this.llm.decide(this.systemPrompt, perception, this.name, this.goal, this.turnHistory, this.isNPC);
      if (decision) {
        console.log(`[LOG_LLM_OUTPUT][${new Date().toLocaleTimeString()}][${this.name}]`, JSON.stringify(decision));
      }
      // Store turn in sliding window
      this.turnHistory.push({ perception, decision: JSON.stringify(decision) });
      if (this.turnHistory.length > this.maxTurnHistory) {
        this.turnHistory.shift();
      }
      this.lastDecision = decision;
      if (decision?.thought && world.showThoughts) {
        this.renderer.showThought(decision.thought);
      }
      this._executeDecision(decision, world);
    } catch (err) {
      console.warn(`[DECISION_ERROR][${this.name}]`, err.message, err.stack);
    }
    this.pendingDecision = false;
    this.decisionCooldown = this.decisionCooldownTime;
  }

  _executeDecision(decision, world) {
    executeDecision(this, decision, world);
  }

  _tryBuy(itemName, world) {
    for (const item of world.items) {
      if (item.type !== 'shop') continue;
      const dist = Grid.tileDist(item.x, item.y, this.x, this.y);
      if (dist <= this.awarenessRange && item.shopInventory) {
        const shopItem = item.shopInventory.find(i => i.name === itemName);
        if (!shopItem) continue;
        // Prevent buying duplicate unique items
        if (itemName === 'axe' && this.hasAxe) {
          this.lastActionResult = { success: false, message: 'Already have an axe!' };
          return;
        }
        if (itemName === 'hammer' && this.hasHammer) {
          this.lastActionResult = { success: false, message: 'Already have a hammer!' };
          return;
        }
        if (this.coins >= shopItem.price) {
          this.coins -= shopItem.price;
          this._applyUpgrade(shopItem.name);
          this.inventory.push(shopItem.name);
      
          this.lastActionResult = { success: true, message: `Bought ${itemName} for ${shopItem.price} coins.` };
        } else {
          this.lastActionResult = { success: false, message: `Not enough coins for ${itemName} (need ${shopItem.price}, have ${this.coins}).` };
        }
        return;
      }
    }
    this.lastActionResult = { success: false, message: 'No shop nearby or item not available.' };
  }

  _give(targetName, itemType, amount, world) {
    const target = world.agents.find(a => a.name === targetName && !a.dead);
    if (!target) return;
    const dist = this.distanceTo(target);
    if (dist > this.awarenessRange) return;

    const itemMap = {
      coins:       { prop: 'coins',       label: 'coin' },
      bullets:     { prop: 'bullets',      label: 'bullet' },
      healthpacks: { prop: 'healthPacks',  label: 'health pack' },
      healthpack:  { prop: 'healthPacks',  label: 'health pack' },
      wood:        { prop: 'wood',         label: 'wood' },
      keys:        { prop: 'keys',         label: 'key' },
      traps:       { prop: 'traps',        label: 'trap' },
      stones:      { prop: 'stones',       label: 'stone' },
      apples:      { prop: 'apples',       label: 'apple' },
    };
    const info = itemMap[itemType];
    if (!info) {
      this.lastActionResult = { success: false, message: `Unknown item type: "${itemType}".` };
      return;
    }
    const actual = Math.min(amount, this[info.prop]);
    if (actual <= 0) {
      this.lastActionResult = { success: false, message: `No ${info.label}s to give.` };
      return;
    }
    this[info.prop] -= actual;
    target[info.prop] += actual;
    target.incomingMessages.push({ from: this.name, message: `[Gave you ${actual} ${info.label}${actual > 1 ? 's' : ''}]` });
    this.lastActionResult = { success: true, message: `Gave ${actual} ${info.label}${actual > 1 ? 's' : ''} to ${targetName}.` };
  }

  _sell(resourceType, amount, world) {
    // Must be near a shop that has a sell_<type> entry
    const shop = world.items.find(i =>
      i.type === 'shop' && i.shopInventory &&
      Grid.tileDist(i.x, i.y, this.x, this.y) <= this.awarenessRange
    );
    if (!shop) {
      this.lastActionResult = { success: false, message: 'No shop nearby to sell.' };
      return;
    }
    const sellEntry = shop.shopInventory.find(si => si.name === `sell_${resourceType}`);
    if (!sellEntry) {
      this.lastActionResult = { success: false, message: `Shop doesn't buy ${resourceType}.` };
      return;
    }
    const prop = this._resourceProp(resourceType);
    if (!prop) {
      this.lastActionResult = { success: false, message: `Unknown resource: ${resourceType}.` };
      return;
    }
    const actual = Math.min(amount, this[prop]);
    if (actual <= 0) {
      this.lastActionResult = { success: false, message: `No ${resourceType} to sell.` };
      return;
    }
    this[prop] -= actual;
    this.coins += actual * sellEntry.price;

    this.lastActionResult = { success: true, message: `Sold ${actual} ${resourceType} for ${actual * sellEntry.price} coins.` };
  }

  _resourceProp(type) {
    const map = { coins: 'coins', bullets: 'bullets', healthpacks: 'healthPacks', wood: 'wood', stones: 'stones', keys: 'keys', traps: 'traps', apples: 'apples' };
    return map[type] || null;
  }

  _getResource(type) {
    const p = this._resourceProp(type);
    return p ? this[p] : 0;
  }

  _addResource(type, amount) {
    const p = this._resourceProp(type);
    if (p) this[p] += amount;
  }

  _removeResource(type, amount) {
    const p = this._resourceProp(type);
    if (p) this[p] -= amount;
  }

  _trade(targetName, offer, request, world) {
    // offer/request: { type: "coins"|"bullets"|"healthpacks", amount: n }
    const target = world.agents.find(a => a.name === targetName && !a.dead);
    if (!target) return;
    const dist = this.distanceTo(target);
    if (dist > this.awarenessRange) return;

    const offerAmt = Math.min(offer.amount, this._getResource(offer.type));
    const requestAmt = Math.min(request.amount, target._getResource(request.type));
    if (offerAmt <= 0 || requestAmt <= 0) {
      target.incomingMessages.push({
        from: this.name,
        message: `[Trade failed: wanted ${request.amount} ${request.type} for ${offer.amount} ${offer.type} — not enough resources]`,
      });
      return;
    }

    // Execute swap
    this._removeResource(offer.type, offerAmt);
    target._addResource(offer.type, offerAmt);
    target._removeResource(request.type, requestAmt);
    this._addResource(request.type, requestAmt);

    target.incomingMessages.push({
      from: this.name,
      message: `[Trade complete: gave you ${offerAmt} ${offer.type}, took ${requestAmt} ${request.type}]`,
    });
  }

  _applyUpgrade(name) {
    switch (name) {
      case 'health_potion':
        this.healthPacks++;
        break;
      case 'max_health_up':
        this.stats.maxHealth.level++;
        this.stats.maxHealth.value += 25;
        this.maxHealth = this.stats.maxHealth.value;
        this.health = Math.min(this.maxHealth, this.health + 25);
        break;
      case 'firepower_up':
        this.stats.firepower.level++;
        this.stats.firepower.value += 5;
        this.attackDamage = this.stats.firepower.value;
        break;
      case 'speed_up':
        this.stats.speed.level++;
        this.stats.speed.value += 25;
        this.speed = this.stats.speed.value;
        break;
      case 'reach_up':
        this.stats.reach.level++;
        this.stats.reach.value += 50;
        this.awarenessRadius = this.stats.reach.value;
        this.awarenessRange = this.stats.reach.value / TILE_SIZE;
        this.renderer.rebuildAwarenessRing();
        break;
      case 'bullet_speed_up':
        this.stats.bulletSpeed.level++;
        this.stats.bulletSpeed.value += 60;
        this.bulletSpeed = this.stats.bulletSpeed.value;
        break;
      case 'bullets':
        this.bullets += 5;
        break;
      case 'trap':
        this.traps++;
        break;
      case 'animal_trap':
        this.animalTraps++;
        break;
      case 'axe':
        this.hasAxe = true;
        break;
      case 'hammer':
        this.hasHammer = true;
        break;
      case 'lottery_ticket': {
        const roll = Math.random();
        if (roll < 0.1) {
          this.coins += 10;
          this.incomingMessages.push({ from: 'SYSTEM', message: 'JACKPOT! You won 10 coins from the lottery!' });
        } else if (roll < 0.3) {
          this.coins += 1;
          this.incomingMessages.push({ from: 'SYSTEM', message: 'You won 1 coin from the lottery!' });
        } else {
          this.incomingMessages.push({ from: 'SYSTEM', message: 'Lottery ticket — no luck this time.' });
        }
        break;
      }
    }
  }

  _completeWork(work) {
    // Work done — agent becomes idle, next perception will show nearby items naturally
  }

  _checkInstincts(world) {
    const healthPct = this.health / this.maxHealth;
    const isIdle = this.targetX == null && this.targetY == null;

    for (const instinct of this.instincts) {
      let match = false;
      const t = instinct.trigger;

      // Health triggers
      if (t === 'health_below_20') match = healthPct <= 0.2;
      else if (t === 'health_below_50') match = healthPct <= 0.5;
      // Combat triggers
      else if (t === 'spider_close') {
        match = world.spiders.some(s => !s.dead && Grid.tileDist(s.x, s.y, this.x, this.y) < this.awarenessRange * 0.4);
      }
      else if (t === 'under_attack') match = this.needsReassess && healthPct < 1;
      else if (t === 'no_bullets') match = this.bullets <= 0;
      // Item triggers
      else if (t === 'coin_nearby') {
        const coin = world.items.find(i => i.type === 'coin' && Grid.tileDist(i.x, i.y, this.x, this.y) < this.awarenessRange);
        if (coin && isIdle) {
          match = true;
          if (instinct.action.action === 'move' && instinct.action.targetX == null) {
            instinct.action = { ...instinct.action, targetX: Math.round(coin.x), targetY: Math.round(coin.y) };
          }
        }
      }
      else if (t === 'item_nearby') {
        match = isIdle && world.items.some(i => i.autoPickup && Grid.tileDist(i.x, i.y, this.x, this.y) < this.awarenessRange);
      }
      // Location triggers
      else if (t === 'at_shop') {
        match = world.items.some(i => i.type === 'shop' && Grid.tileDist(i.x, i.y, this.x, this.y) <= 1.5);
      }

      if (match) return instinct;
    }
    return null;
  }

  update(dt, world) {
    if (this.dead) {
      this.deadTimer += dt;
      return;
    }

    // Health decay (NPCs don't decay)
    if (this.isNPC) this.healthDecayTimer = 0;
    this.healthDecayTimer += dt;
    if (this.healthDecayTimer >= this.healthDecayInterval) {
      this.healthDecayTimer = 0;
      this.health -= this.healthDecayAmount;
      if (this.health <= 0) {
        this.health = 0;
        this.dead = true;
        this.renderer.setOpacity(0.3);
        this._dropCoins(world);
        return;
      }
    }

    // House healing — regen HP while inside
    if (this.insideHouse) {
      this.health = Math.min(this.maxHealth, this.health + this.insideHouse.healRate * dt);
      this.vx = 0;
      this.vy = 0;
    }

    // Track exploration — mark current quadrant as visited
    const qx = Math.floor(this.x / 300); // 4 columns (1200/300)
    const qy = Math.floor(this.y / 267); // 3 rows (800/267)
    this.visitedQuadrants.add(`${qx},${qy}`);


    // Cooldown
    if (this.attackCooldownTimer > 0) {
      this.attackCooldownTimer -= dt;
    }

    // Work action in progress (cut_tree, break_rock)
    if (this.workAction) {
      // Check for danger interrupts
      const dangerSpider = world.spiders.some(s => !s.dead && Grid.tileDist(s.x, s.y, this.x, this.y) < this.awarenessRange * 0.5);
      const criticalHealth = (this.health / this.maxHealth) <= 0.25;
      if (dangerSpider || criticalHealth) {
        this.incomingMessages.push({ from: 'SYSTEM', message: 'Work interrupted — danger!' });
        this.workAction = null;
        this.needsReassess = true;
      } else {
        this.workAction.elapsed += dt;
        this.vx = 0; this.vy = 0;
        if (this.workAction.elapsed >= this.workDuration) {
          this._completeWork(this.workAction);
          this.workAction = null;
        }
      }
    }

    // Instinct check — fire reflexes before LLM call
    if (this.enableInstincts && this.instincts.length > 0 && !this.pendingDecision && !this.workAction) {
      const triggered = this._checkInstincts(world);
      if (triggered) {
        console.log(`[INSTINCT_FIRED][${this.name}] ${triggered.trigger} → ${triggered.action.action}`);
        this.lastDecision = { ...triggered.action, thought: triggered.action.thought || `instinct: ${triggered.trigger}` };
        if (world.showThoughts) this.renderer.showThought(this.lastDecision.thought);
        this._executeDecision(this.lastDecision, world);
        this.decisionCooldown = this.decisionCooldownTime;
        return; // skip LLM call this frame
      }
    }

    // LLM decisions — only call when idle (no active target/work) or urgent
    if (!this.pendingDecision && !this.workAction) {
      this.decisionCooldown = Math.max(0, this.decisionCooldown - dt);
      const isIdle = this.targetX == null && this.targetY == null;
      const hasUrgency = this.needsReassess ||
        this.incomingMessages.length > 0 ||
        world.spiders.some(s => !s.dead && Grid.tileDist(s.x, s.y, this.x, this.y) < this.awarenessRange * 0.5);

      if ((hasUrgency && this.decisionCooldown <= 0) || (isIdle && this.decisionCooldown <= 0)) {
        this.needsReassess = false;
        this.decisionCooldown = this.decisionCooldownTime;
        this.makeDecision(world);
      }
    }
    // Safety: if pending for too long, unstick
    if (this.pendingDecision) {
      this.pendingStuckTimer = (this.pendingStuckTimer || 0) + dt;
      if (this.pendingStuckTimer > 20) {
        console.warn(`[STUCK] ${this.name} was pending for 20s, forcing unstick`);
        this.pendingDecision = false;
        this.pendingStuckTimer = 0;
      }
    } else {
      this.pendingStuckTimer = 0;
    }

    // NPCs don't move
    if (this.isNPC) {
      this.vx = 0;
      this.vy = 0;
      this.targetX = null;
      this.targetY = null;
    }

    // Move toward target
    if (this.targetX != null && this.targetY != null) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 3) {
        this.vx = (dx / dist) * this.speed;
        this.vy = (dy / dist) * this.speed;
      } else {
        this.vx = 0;
        this.vy = 0;
        this.targetX = null;
        this.targetY = null;
        this.decisionCooldown = this.decisionCooldownTime; // pause before next decision
      }
    } else {
      // No target — stand still, wait for LLM decision
      this.vx *= 0.9;
      this.vy *= 0.9;
    }

    // Apply velocity
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Clamp to world bounds
    this.x = Math.max(this.radius, Math.min(world.width - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(world.height - this.radius, this.y));


    // Update all visuals via renderer
    this.renderer.update(dt, world.showAwareness);
    // Sync currentSpeech from renderer's speech bubble
    this.currentSpeech = this.renderer.speechBubble.currentText;
  }
}
