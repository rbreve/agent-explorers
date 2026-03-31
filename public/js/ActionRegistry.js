import { Item, ITEM_DEFS } from './Item.js';
import { House, HOUSE_WOOD_COST, HOUSE_STONE_COST } from './House.js';
import { Grid, GRID_COLS, GRID_ROWS, TILE_SIZE } from './Grid.js';

export const HEALTHPACK_HEAL = 45;
export const APPLE_HEAL = 15;

/**
 * Returns the agent's best melee weapon { type, damage } or null.
 * Scans ITEM_DEFS for any item with meleeDamage that the agent owns.
 */
function getBestMeleeWeapon(agent) {
  let best = null;
  for (const [type, def] of Object.entries(ITEM_DEFS)) {
    if (!def.meleeDamage) continue;
    // Agent ownership convention: agent.hasAxe, agent.hasHammer, etc.
    const propName = 'has' + type.charAt(0).toUpperCase() + type.slice(1);
    if (!agent[propName]) continue;
    if (!best || def.meleeDamage > best.damage) {
      best = { type, damage: def.meleeDamage };
    }
  }
  return best;
}

// ── Helpers ──

/** Find nearest world item of a type within 1 tile of agent */
function findNearbyItem(agent, world, type, filter) {
  for (const item of world.items) {
    if (item.type !== type) continue;
    if (filter && !filter(item)) continue;
    const dist = Grid.tileDist(item.x, item.y, agent.x, agent.y);
    if (dist <= 1) return item;
  }
  return null;
}

/** Convert grid coords to clamped pixel coords */
function toPixelClamped(px, py, agent, world) {
  if (px <= GRID_COLS && py <= GRID_ROWS) {
    const pixel = Grid.toPixel(px, py);
    px = pixel.x;
    py = pixel.y;
  }
  return {
    x: Math.max(agent.radius, Math.min(world.width - agent.radius, px)),
    y: Math.max(agent.radius, Math.min(world.height - agent.radius, py)),
  };
}

/** Set agent move target from decision coords */
function applyMove(agent, decision, world) {
  if (decision.targetX == null || decision.targetY == null) return;
  const pos = toPixelClamped(decision.targetX, decision.targetY, agent, world);
  agent.targetX = pos.x;
  agent.targetY = pos.y;
}

// ── Action Definitions ──
// Each action: { match, exec }
//   match(action, decision) — returns true if this handler applies
//   exec(agent, decision, world) — runs the action, returns { success, message }

const ACTIONS = [
  // ── Move ──
  {
    match: (action) => action === 'move',
    exec(agent, decision, world) {
      if (decision.targetX == null || decision.targetY == null) return null;
      applyMove(agent, decision, world);
      return { success: true, message: `Moving to ${Grid.toLabel(agent.targetX, agent.targetY)}` };
    },
  },

  // ── Idle ──
  {
    match: (action) => action === 'idle',
    exec(agent) {
      agent.targetX = null;
      agent.targetY = null;
      return { success: true, message: 'Waiting.' };
    },
  },

  // ── Ranged attack (with target name) ──
  {
    match: (action, d) => action === 'attack' && !!d.target,
    exec(agent, decision, world) {
      if (agent.bullets <= 0) {
        return { success: false, message: 'No bullets! Use melee_attack (requires axe/hammer) or buy bullets.' };
      }
      if (agent.attackCooldownTimer > 0) {
        return { success: false, message: 'Weapon still cooling down.' };
      }
      const found = world.findTarget(decision.target, agent.x, agent.y);
      if (!found) {
        return { success: false, message: `Target "${decision.target}" not found nearby.` };
      }
      // Point-blank — within 1.5 tiles, guaranteed hit + visual bullet
      if (found.dist <= 1.5 && found.entity.takeDamage) {
        agent.attack(found.entity.x, found.entity.y, world, found.entity);
        found.entity.takeDamage(agent.attackDamage, world, agent);
        const name = found.entity.name || found.kind;
        if (found.entity.dead) {
          world.eventLog.push({ type: `${found.kind}_kill`, killer: agent.name, color: agent.color, x: Math.round(found.entity.x), y: Math.round(found.entity.y) });
          return { success: true, message: `Shot and killed ${name} at point-blank!` };
        }
        return { success: true, message: `Shot ${name} at point-blank for ${agent.attackDamage} dmg. Target HP: ${found.entity.health}` };
      }
      agent.attack(found.entity.x, found.entity.y, world, found.entity);
      return { success: true, message: `Shot at ${decision.target}` };
    },
  },

  // ── Ranged attack (by coordinates) ──
  {
    match: (action, d) => action === 'attack' && !d.target && d.targetX != null,
    exec(agent, decision, world) {
      agent.attack(decision.targetX, decision.targetY, world);
      return { success: true, message: 'Fired at coordinates.' };
    },
  },

  // ── Melee attack ──
  {
    match: (action) => action === 'melee_attack' || action === 'melee',
    exec(agent, decision, world) {
      const weapon = getBestMeleeWeapon(agent);
      if (!weapon) {
        return { success: false, message: 'You have no melee weapon! Buy one from shop or run away!' };
      }
      const dmg = weapon.damage;
      const meleeRange = 1.5; // tiles
      const targetName = decision.target || 'spider';
      // Search wider to find something to approach
      const found = world.findTarget(targetName, agent.x, agent.y, 8);
      if (!found || !found.entity.takeDamage) {
        return { success: false, message: `Couldn't hit "${targetName}"` };
      }
      // Close enough to strike
      if (found.dist <= meleeRange) {
        found.entity.takeDamage(dmg, world, agent);
        agent.attackCooldownTimer = agent.attackCooldown;
        const name = found.entity.name || found.kind;
        if (found.entity.dead) {
          world.eventLog.push({ type: `${found.kind}_kill`, killer: agent.name, color: agent.color, x: Math.round(found.entity.x), y: Math.round(found.entity.y) });
          return { success: true, message: `Killed ${name} with ${weapon.type}!` };
        }
        return { success: true, message: `Hit ${name} with ${weapon.type} for ${dmg} dmg. Target HP: ${found.entity.health}` };
      }
      // Too far — approach the target
      agent.targetX = found.entity.x;
      agent.targetY = found.entity.y;
      return { success: true, message: `Approaching ${found.entity.name || found.kind} to melee (${Math.round(found.dist)} tiles away)` };
    },
  },

  // ── Buy from shop ──
  {
    match: (action) => action === 'buy' || ['firepower_up', 'reach_up', 'bullet_speed_up', 'speed_up', 'max_health_up'].includes(action),
    exec(agent, decision, world) {
      const items = decision.action === 'buy'
        ? (decision.items || (decision.item ? [decision.item] : []))
        : [decision.action];
      for (const itemName of items) {
        agent._tryBuy(itemName, world);
      }
      return null; // _tryBuy sets lastActionResult
    },
  },

  // ── Send message ──
  {
    match: (action) => action === 'send_message' || action === 'talk',
    exec(agent, decision, world) {
      if (!decision.to || !decision.message) return null;
      // Track recent messages per target to prevent spam
      if (!agent._recentMessages) agent._recentMessages = [];
      const key = `${decision.to}:${decision.message.toLowerCase().trim()}`;
      if (agent._recentMessages.includes(key)) {
        return { success: false, message: `You already said that to ${decision.to}. Say something new or do something else.` };
      }
      agent._recentMessages.push(key);
      if (agent._recentMessages.length > 5) agent._recentMessages.shift();
      agent.sendMessage(decision.to, decision.message, world);
      applyMove(agent, decision, world);
      return { success: true, message: `Sent message to ${decision.to}` };
    },
  },

  // ── Use healthpack ──
  {
    match: (action) => action === 'use_healthpack',
    exec(agent) {
      if (agent.healthPacks <= 0) {
        return { success: false, message: 'No healthpacks in inventory.' };
      }
      agent.healthPacks--;
      agent.health = Math.min(agent.maxHealth, agent.health + HEALTHPACK_HEAL);
      return { success: true, message: `Healed ${HEALTHPACK_HEAL} HP. HP: ${agent.health}` };
    },
  },

  // ── Get apple from tree ──
  {
    match: (action) => action === 'get_apple',
    exec(agent, decision, world) {
      const found = findNearbyItem(agent, world, 'apple_tree', i => i.apples > 0);
      if (!found) {
        return { success: false, message: 'No apple tree nearby with apples.' };
      }
      found.apples--;
      agent.apples++;
      return { success: true, message: `Picked apple (${found.apples} left on tree)` };
    },
  },

  // ── Eat apple ──
  {
    match: (action) => action === 'eat_apple',
    exec(agent) {
      if (agent.apples <= 0) {
        return { success: false, message: 'No apples in inventory.' };
      }
      agent.apples--;
      agent.health = Math.min(agent.maxHealth, agent.health + APPLE_HEAL);
      return { success: true, message: `Ate apple, healed ${APPLE_HEAL} HP. HP: ${agent.health}` };
    },
  },

  // ── Grab item ──
  {
    match: (action) => action === 'grab' || action === 'get' || action === 'take',
    exec(agent, decision, world) {
      const targetType = decision.item;
      let found = null;
      for (const item of world.items) {
        if (!item.grabbable) continue;
        if (targetType && item.type !== targetType) continue;
        const dist = Grid.tileDist(item.x, item.y, agent.x, agent.y);
        if (dist <= 1) { found = item; break; }
      }
      if (!found) {
        return { success: false, message: `Nothing grabbable nearby${targetType ? ` (${targetType})` : ''}.` };
      }
      const picked = found.onPickup(agent);
      if (picked === false) return null;
      found.removeFromScene(world.scene);
      const idx = world.items.indexOf(found);
      if (idx !== -1) world.items.splice(idx, 1);
      return { success: true, message: `Grabbed ${found.type.replace(/_/g, ' ')}` };
    },
  },

  // ── Sell resources ──
  {
    match: (action) => action.startsWith('sell'),
    exec(agent, decision, world) {
      const sellType = decision.action === 'sell' ? decision.item : decision.action.slice(5);
      if (!sellType) return null;
      agent._sell(sellType, decision.amount || 1, world);
      return null; // _sell sets lastActionResult
    },
  },

  // ── Give items ──
  {
    match: (action, d) => (action === 'give' || action.startsWith('give_')) && d.to && d.amount > 0,
    exec(agent, decision, world) {
      const giveType = decision.action === 'give' ? decision.item : decision.action.slice(5);
      if (!giveType) return null;
      agent._give(decision.to, giveType, decision.amount, world);
      return null; // _give sets lastActionResult
    },
  },

  // ── Trade ──
  {
    match: (action, d) => action === 'trade' && d.to && d.offer && d.request,
    exec(agent, decision, world) {
      agent._trade(decision.to, decision.offer, decision.request, world);
      return null; // _trade sets lastActionResult
    },
  },

  // ── Open treasure ──
  {
    match: (action) => action === 'open_treasure',
    exec(agent, decision, world) {
      const found = findNearbyItem(agent, world, 'treasure');
      if (!found) {
        return { success: false, message: 'No treasure chest nearby.' };
      }
      if (agent.keys <= 0) {
        return { success: false, message: 'Need a key to open treasure chest.' };
      }
      agent.keys--;
      agent.coins += 10;
      found.removeFromScene(world.scene);
      const idx = world.items.indexOf(found);
      if (idx !== -1) world.items.splice(idx, 1);
      return { success: true, message: 'Opened treasure chest — found 10 coins!' };
    },
  },

  // ── Cut tree ──
  {
    match: (action) => action === 'cut_tree',
    exec(agent, decision, world) {
      if (!agent.hasAxe) {
        return { success: false, message: 'Need an axe to cut trees! Buy one from the shop.' };
      }
      const found = findNearbyItem(agent, world, 'tree', i => !i.isCut);
      if (!found) {
        return { success: false, message: 'No tree nearby to cut.' };
      }
      found.cutTree();
      for (let i = 0; i < 3; i++) {
        const angle = (Math.PI * 2 * i) / 3 + Math.random() * 0.5;
        const d = 15 + Math.random() * 15;
        world.addItem(new Item({
          type: 'wood',
          x: Math.max(10, Math.min(world.width - 10, found.x + Math.cos(angle) * d)),
          y: Math.max(10, Math.min(world.height - 10, found.y + Math.sin(angle) * d)),
        }));
      }
      agent.workAction = { action: 'cut_tree', item: found, world, elapsed: 0 };
      agent.targetX = null; agent.targetY = null;
      agent.vx = 0; agent.vy = 0;
      new Audio('/sounds/cut_tree.wav').play().catch(e => console.warn('[SOUND] cut_tree blocked:', e.message));
      return { success: true, message: 'Cut down a tree! Got wood.' };
    },
  },

  // ── Break rock ──
  {
    match: (action) => action === 'break_rock',
    exec(agent, decision, world) {
      if (!agent.hasHammer) {
        return { success: false, message: 'Need a hammer to break rocks! Buy one from the shop.' };
      }
      const found = findNearbyItem(agent, world, 'rock', i => !i.isBroken);
      if (!found) {
        return { success: false, message: 'No rock nearby to break.' };
      }
      found.breakRock();
      agent.stones++;
      if (found.hasGold) {
        const gpos = Grid.snap(found.x, found.y);
        world.addItem(new Item({ type: 'coin', x: gpos.x, y: gpos.y }));
      }
      found.removeFromScene(world.scene);
      const idx = world.items.indexOf(found);
      if (idx !== -1) world.items.splice(idx, 1);
      agent.workAction = { action: 'break_rock', item: null, world, elapsed: 0 };
      agent.targetX = null; agent.targetY = null;
      agent.vx = 0; agent.vy = 0;
      new Audio('/sounds/hammer_rock.wav').play().catch(e => console.warn('[SOUND] hammer_rock blocked:', e.message));
      return { success: true, message: found.hasGold ? 'Broke rock — found gold + 1 stone!' : 'Broke rock — got 1 stone.' };
    },
  },

  // ── Place trap ──
  {
    match: (action) => action === 'place_trap',
    exec(agent, decision, world) {
      if (agent.traps <= 0) {
        return { success: false, message: 'No traps in inventory.' };
      }
      agent.traps--;
      world.addItem(new Item({ type: 'trap', x: agent.x, y: agent.y, owner: agent, trapDamage: 40 }));
      return { success: true, message: 'Placed a trap.' };
    },
  },

  // ── Place animal trap ──
  {
    match: (action) => action === 'place_animal_trap',
    exec(agent, decision, world) {
      if (agent.animalTraps <= 0) {
        return { success: false, message: 'No animal traps in inventory.' };
      }
      agent.animalTraps--;
      world.addItem(new Item({ type: 'animal_trap', x: agent.x, y: agent.y, owner: agent, trapDamage: 40 }));
      return { success: true, message: 'Placed an animal trap for spiders.' };
    },
  },

  // ── Drop item ──
  {
    match: (action) => action === 'drop',
    exec(agent, decision, world) {
      const type = (decision.item || '').toLowerCase();
      if (!type) return { success: false, message: 'Specify what to drop with "item":"type".' };

      const dropMap = {
        coins:       { prop: 'coins',       spawn: 'coin' },
        coin:        { prop: 'coins',       spawn: 'coin' },
        wood:        { prop: 'wood',        spawn: 'wood' },
        bullets:     { prop: 'bullets',     spawn: 'bullet' },
        bullet:      { prop: 'bullets',     spawn: 'bullet' },
        healthpack:  { prop: 'healthPacks', spawn: 'health_pack' },
        healthpacks: { prop: 'healthPacks', spawn: 'health_pack' },
        health_pack: { prop: 'healthPacks', spawn: 'health_pack' },
        key:         { prop: 'keys',        spawn: 'key' },
        keys:        { prop: 'keys',        spawn: 'key' },
        trap:        { prop: 'traps',       spawn: 'trap' },
        traps:       { prop: 'traps',       spawn: 'trap' },
        animal_trap: { prop: 'animalTraps', spawn: 'animal_trap' },
        axe:         { prop: 'hasAxe',      spawn: 'axe',    flag: true },
        hammer:      { prop: 'hasHammer',   spawn: 'hammer', flag: true },
        stone:       { prop: 'stones',      spawn: 'rock' },
        stones:      { prop: 'stones',      spawn: 'rock' },
        apple:       { prop: 'apples',      spawn: null },
        apples:      { prop: 'apples',      spawn: null },
      };

      const entry = dropMap[type];
      if (!entry) return { success: false, message: `Can't drop "${type}".` };

      const amount = Math.max(1, parseInt(decision.amount) || 1);

      if (entry.flag) {
        if (!agent[entry.prop]) return { success: false, message: `You don't have a ${type}.` };
        agent[entry.prop] = false;
        if (entry.spawn) {
          world.addItem(new Item({ type: entry.spawn, x: agent.x, y: agent.y }));
        }
        return { success: true, message: `Dropped ${type}.` };
      }

      if ((agent[entry.prop] || 0) < amount) {
        return { success: false, message: `Not enough ${type} (have ${agent[entry.prop] || 0}).` };
      }
      agent[entry.prop] -= amount;
      if (entry.spawn) {
        for (let i = 0; i < amount; i++) {
          const offset = (i - (amount - 1) / 2) * 12;
          world.addItem(new Item({ type: entry.spawn, x: agent.x + offset, y: agent.y }));
        }
      }
      return { success: true, message: `Dropped ${amount} ${type}.` };
    },
  },

  // ── Build house ──
  {
    match: (action) => action === 'build_house',
    exec(agent, decision, world) {
      if (agent.wood < HOUSE_WOOD_COST || agent.stones < HOUSE_STONE_COST) {
        const needs = [];
        if (agent.wood < HOUSE_WOOD_COST) needs.push(`${HOUSE_WOOD_COST} wood (have ${agent.wood})`);
        if (agent.stones < HOUSE_STONE_COST) needs.push(`${HOUSE_STONE_COST} stones (have ${agent.stones})`);
        return { success: false, message: `Need ${needs.join(' and ')} to build.` };
      }
      agent.wood -= HOUSE_WOOD_COST;
      agent.stones -= HOUSE_STONE_COST;
      const house = new House({ x: agent.x, y: agent.y, owner: agent });
      world.addItem(house);
      return { success: true, message: 'Built a house! Enter it to heal and stay safe.' };
    },
  },

  // ── Enter house ──
  {
    match: (action) => action === 'enter_house',
    exec(agent, decision, world) {
      let found = null;
      for (const item of world.items) {
        if (item.type !== 'house' || item.owner !== agent) continue;
        const dist = Grid.tileDist(item.x, item.y, agent.x, agent.y);
        if (dist <= 1) { found = item; break; }
      }
      if (!found) {
        return { success: false, message: 'No house nearby to enter.' };
      }
      if (!found.enter(agent)) {
        return { success: false, message: 'House is occupied.' };
      }
      agent.insideHouse = found;
      agent.targetX = null; agent.targetY = null;
      agent.vx = 0; agent.vy = 0;
      agent.renderer.setOpacity(0.3);
      return { success: true, message: 'Entered house. Healing and safe from damage.' };
    },
  },

  // ── Exit house ──
  {
    match: (action) => action === 'exit_house',
    exec(agent) {
      if (!agent.insideHouse) {
        return { success: false, message: 'Not inside a house.' };
      }
      agent.insideHouse.exit();
      agent.insideHouse = null;
      agent.renderer.setOpacity(1);
      return { success: true, message: 'Left house.' };
    },
  },
];

/**
 * Execute a decision by finding the matching action and running it.
 * Also processes side-effect fields (setGoal, setRelationships, addMemory, stress, instincts).
 */
export function executeDecision(agent, decision, world) {
  if (!decision) return;
  agent.lastActionResult = null;

  // ── Run matching action ──
  let matched = false;
  for (const handler of ACTIONS) {
    if (handler.match(decision.action, decision)) {
      matched = true;
      const result = handler.exec(agent, decision, world);
      if (result) agent.lastActionResult = result;
      break;
    }
  }
  if (!matched) {
    agent.lastActionResult = { success: false, message: `Unknown action "${decision.action}".` };
  }

  // ── Side-effect fields (applied regardless of action) ──

  // Relationships
  if (decision.setRelationships && typeof decision.setRelationships === 'object') {
    for (const [name, rel] of Object.entries(decision.setRelationships)) {
      agent.relationships[name] = rel;
    }
  }
  if (decision.setRelationship && decision.setRelationshipTo) {
    agent.relationships[decision.setRelationshipTo] = decision.setRelationship;
  }

  // Goal
  if (decision.setGoal != null) {
    agent.goal = decision.setGoal;
  }
  if (decision.setGoals) {
    agent.goal = decision.setGoals.high || decision.setGoals.mid || decision.setGoals.low || '';
  }

  // Memory — no duplicates
  if (decision.addMemory) {
    const mem = decision.addMemory;
    const isDuplicate = agent.memory.some(m => m.toLowerCase() === mem.toLowerCase());
    if (!isDuplicate) {
      agent.memory.push(mem);
      if (agent.memory.length > 15) agent.memory.shift();
    }
  }

  // Long-term memory — LLM decides what's important to remember permanently
  if (decision.addLongTermMemory) {
    const mem = decision.addLongTermMemory;
    const isDuplicate = agent.longTermMemory.some(m => m.toLowerCase() === mem.toLowerCase());
    if (!isDuplicate) {
      agent.longTermMemory.push(mem);
      if (agent.longTermMemory.length > 15) agent.longTermMemory.shift();
    }
  }

  // Stress
  if (decision.stress != null) {
    agent.stress = Math.max(0, Math.min(10, Math.round(decision.stress)));
  }

  // Instincts
  if (decision.setInstincts && Array.isArray(decision.setInstincts)) {
    agent.instincts = decision.setInstincts.filter(i => i.trigger && i.action);
    console.log(`[INSTINCTS][${agent.name}] Set ${agent.instincts.length} instinct(s):`, agent.instincts.map(i => i.trigger).join(', '));
  }
}
