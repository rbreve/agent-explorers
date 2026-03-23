import * as THREE from 'three';

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = 1200;
    this.height = 800;
    this.agents = [];
    this.bullets = [];
    this.items = [];
    this.spiders = [];
    this.paused = false;
    this.showAwareness = true;
    this.showThoughts = true;
    this.showLogs = true;
    this.selectedAgent = null;

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
    // Tile the grass texture across the world (each tile = 32px world units)
    const tileSize = 32;
    tex.repeat.set(this.width / tileSize, this.height / tileSize);

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
    const meshes = this.agents.map(a => a.mesh);
    const intersects = this.raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      const agent = this.agents.find(a => a.mesh === intersects[0].object);
      this.selectedAgent = agent || null;
    } else {
      this.selectedAgent = null;
    }
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
          dist: Math.round(dist),
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
        const entry = { type: item.type, x: Math.round(item.x), y: Math.round(item.y), dist: Math.round(dist) };
        if (item.type === 'shop' && item.shopInventory) {
          entry.shop = true;
          entry.inventory = item.shopInventory.map(si => ({
            name: si.name, price: si.price, desc: si.description,
            canAfford: agent.coins >= si.price,
          }));
        }
        if (item.type === 'treasure') {
          entry.needsKey = true;
          entry.youHaveKey = agent.keys > 0;
        }
        if (item.type === 'note') {
          entry.hint = 'Pick it up to read the tip!';
        }
        if (item.type === 'rock') {
          entry.breakable = true;
          entry.needsHammer = !agent.hasHammer;
        }
        nearbyItems.push(entry);
      }
    }

    const nearbySpiders = [];
    for (const spider of this.spiders) {
      if (spider.dead) continue;
      const dist = Math.hypot(spider.x - agent.x, spider.y - agent.y);
      if (dist <= agent.awarenessRadius) {
        nearbySpiders.push({ type: 'spider', x: Math.round(spider.x), y: Math.round(spider.y), dist: Math.round(dist), hp: spider.health });
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

    const perception = {
      you: {
        name: agent.name,
        pos: [Math.round(agent.x), Math.round(agent.y)],
        hp: agent.health,
        maxHp: agent.stats.maxHealth.value,
        coins: agent.coins,
        healthPacks: agent.healthPacks,
        bullets: agent.bullets,
        keys: agent.keys,
        traps: agent.traps,
        wood: agent.wood,
        hasAxe: agent.hasAxe,
        hasHammer: agent.hasHammer,
        dmg: agent.stats.firepower.value,
        speed: agent.stats.speed.value,
        reach: agent.stats.reach.value,
        cooldown: agent.attackCooldownTimer > 0,
        stress: agent.stress,
      },
      agents: nearby,
      items: nearbyItems,
      world: [this.width, this.height],
    };

    // Only include non-empty fields to save tokens
    if (nearbySpiders.length > 0) {
      perception.spiders = nearbySpiders;
      const closest = nearbySpiders.reduce((a, b) => a.dist < b.dist ? a : b);
      if (closest.dist < 60) {
        perception.spiderWarning = `DANGER! Spider very close (${closest.dist} away)! Attack it NOW with {"action":"attack","target":"spider"}`;
      }
    }
    if (agent.lastDecision) {
      perception.lastAction = {
        action: agent.lastDecision.action,
        thought: agent.lastDecision.thought,
      };
    }
    if (agentMsgs.length > 0) perception.messages = agentMsgs;
    if (systemAlerts.length > 0) perception.alerts = systemAlerts;
    if (hw) perception.healthWarning = hw;
    if (Object.keys(convos).length > 0) perception.recentConversations = convos;
    const rels = Object.keys(agent.relationships).length > 0 ? agent.relationships : null;
    if (rels) perception.relationships = rels;
    if (agent.friends.length > 0) perception.friends = agent.friends;
    if (agent.knownShops.length > 0) perception.knownShops = agent.knownShops;
    if (agent.knownTreasures.length > 0) perception.knownTreasures = agent.knownTreasures;
    if (agent.memory.length > 0) perception.memory = agent.memory.slice(-5);
    if (agent.goals.high || agent.goals.mid || agent.goals.low) {
      perception.goals = agent.goals;
    }

    // Exploration — suggest unexplored areas
    const unexplored = [];
    for (let qx = 0; qx < 4; qx++) {
      for (let qy = 0; qy < 3; qy++) {
        if (!agent.visitedQuadrants.has(`${qx},${qy}`)) {
          unexplored.push({ x: qx * 300 + 150, y: qy * 267 + 133 });
        }
      }
    }
    if (unexplored.length > 0 && unexplored.length < 12) {
      perception.unexploredAreas = unexplored;
    }

    return perception;
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
      if (agent.healthPacks > 0) return 'CRITICAL! Use use_healthpack NOW!';
      if (nearbyShop && hasCoins) return 'CRITICAL! Buy health_potion NOW!';
      if (nearbyHP) return 'CRITICAL! Grab the nearby health pack!';
      if (knowsShop && hasCoins) return `CRITICAL! Rush to shop at (${agent.knownShops[0].x},${agent.knownShops[0].y})!`;
      return 'CRITICAL! About to die. Find health!';
    }
    if (pct <= 0.4) {
      if (agent.healthPacks > 0) return 'WARNING: Health low. Use use_healthpack.';
      if (nearbyShop && hasCoins) return 'WARNING: Health low. Buy health_potion.';
      if (nearbyHP) return 'WARNING: Health low. Grab nearby health pack.';
      if (knowsShop && hasCoins) return `WARNING: Head to shop at (${agent.knownShops[0].x},${agent.knownShops[0].y}).`;
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
        if (agent === bullet.owner || agent.dead) continue;
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
            bullet.removeFromScene(this.scene);
            this.bullets.splice(i, 1);
            break;
          }
        }
      }
    }

    // Check item pickup & trap triggers
    for (const agent of this.agents) {
      if (agent.dead || agent.agentType === 'shop') continue;
      for (let i = this.items.length - 1; i >= 0; i--) {
        const item = this.items[i];
        if (item.type === 'shop' || item.type === 'treasure' || item.type === 'tree' || item.type === 'rock') continue;
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
        if (agent.dead || agent.agentType === 'shop') continue;
        const dist = Math.hypot(agent.x - spider.x, agent.y - spider.y);
        if (dist < agent.radius + spider.radius && spider.contactTimer <= 0) {
          agent.takeDamage(spider.damage, null, this);
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
