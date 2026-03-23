import * as THREE from 'three';
import { Bullet } from './Bullet.js';
import { Item } from './Item.js';
import { LLMController } from './LLMController.js';

export const BROADCAST_KILL = true;

const CHARACTER_SPRITES = [
  '/images/characters/tile_0084.png',
  '/images/characters/tile_0085.png',
  '/images/characters/tile_0086.png',
  '/images/characters/tile_0087.png',
  '/images/characters/tile_0088.png',
  '/images/characters/tile_0096.png',
  '/images/characters/tile_0097.png',
  '/images/characters/tile_0098.png',
  '/images/characters/tile_0099.png',
  '/images/characters/tile_0100.png',
];
let spriteIndex = 0;
const textureLoader = new THREE.TextureLoader();

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
    this.hasAxe = false;
    this.hasHammer = false;
    this.wood = 0;
    this.inventory = config.inventory ?? [];
    this.agentType = config.agentType || 'warrior';

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
    this.awarenessRadius = this.stats.reach.value;
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
    this.pendingDecision = false;
    this.needsReassess = false;

    // Chat & relationships
    this.speechBubble = null;
    this.speechTimer = 0;
    this.speechDuration = 5.0;
    this.thoughtBubble = null;
    this.thoughtTimer = 0;
    this.thoughtDuration = 3.0;
    this.currentSpeech = '';
    this.incomingMessages = []; // new messages since last decision
    this.conversationHistory = {}; // per-agent: { agentName: [{from, message, tick}] }
    this.relationships = {}; // per-agent: { agentName: "ally"|"enemy"|"neutral"|"afraid" }
    this.friends = config.friends ?? []; // list of agent names this agent considers friends from the start
    // Pre-seed relationships from friends list
    for (const f of this.friends) {
      this.relationships[f] = 'ally';
    }
    this.currentGoal = ''; // LLM can update this dynamically

    // Memory
    this.knownShops = []; // [{x, y}] — remembered shop locations
    this.knownTreasures = []; // [{x, y}] — remembered treasure locations
    this.memory = []; // notable events the agent remembers

    // Exploration — track visited quadrants (4x3 grid over 1200x800)
    this.visitedQuadrants = new Set();

    // Health decay
    this.healthDecayTimer = 0;
    this.healthDecayInterval = 5.0; // lose HP every 5 seconds
    this.healthDecayAmount = 2;

    // State
    this.dead = false;
    this.deadTimer = 0;
    this.lastAttacker = null;

    // Three.js objects
    this.mesh = null;
    this.awarenessRing = null;
    this.healthBar = null;
    this.healthBarBg = null;
    this.nameLabel = null;
    this.statsLabel = null;
    this.statsCanvas = null;
    this.statsCtx = null;
    this.lastStatsText = '';
    this.group = new THREE.Group();

    this._buildMesh();
  }

  _buildMesh() {
    // Agent sprite from pixel art
    const spritePath = CHARACTER_SPRITES[spriteIndex % CHARACTER_SPRITES.length];
    spriteIndex++;
    const texture = textureLoader.load(spritePath);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    this.mesh = new THREE.Sprite(spriteMat);
    const spriteSize = this.radius * 2.5;
    this.mesh.scale.set(spriteSize, spriteSize, 1);
    this.mesh.position.z = 2;
    this.group.add(this.mesh);

    // Direction indicator (small dot)
    const dirGeo = new THREE.CircleGeometry(3, 16);
    const dirMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.dirIndicator = new THREE.Mesh(dirGeo, dirMat);
    this.dirIndicator.position.set(this.radius * 0.7, 0, 2.2);
    this.group.add(this.dirIndicator);

    // Awareness ring
    const ringGeo = new THREE.RingGeometry(this.awarenessRadius - 1, this.awarenessRadius, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.color),
      transparent: true,
      opacity: 0.15,
    });
    this.awarenessRing = new THREE.Mesh(ringGeo, ringMat);
    this.awarenessRing.position.z = 0.5;
    this.group.add(this.awarenessRing);

    // Health bar background
    const hbBgGeo = new THREE.PlaneGeometry(this.radius * 2.5, 4);
    const hbBgMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    this.healthBarBg = new THREE.Mesh(hbBgGeo, hbBgMat);
    this.healthBarBg.position.set(0, -this.radius - 10, 3);
    this.group.add(this.healthBarBg);

    // Health bar
    const hbGeo = new THREE.PlaneGeometry(this.radius * 2.5, 4);
    const hbMat = new THREE.MeshBasicMaterial({ color: 0x44ff44 });
    this.healthBar = new THREE.Mesh(hbGeo, hbMat);
    this.healthBar.position.set(0, -this.radius - 10, 3.1);
    this.group.add(this.healthBar);

    // Name label using canvas texture
    this._createNameLabel();

    // Speech bubble (persistent, show/hide)
    this._createBubbleSprite();

    // Thought bubble (persistent, show/hide)
    this._createThoughtSprite();

    // Stats label (coins + healthpacks) below health bar
    this._createStatsLabel();

    this.group.position.set(this.x, this.y, 0);
  }

  _createNameLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 30px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.name, 128, 28);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    this.nameLabel = new THREE.Sprite(mat);
    this.nameLabel.scale.set(80, 12, 1);
    this.nameLabel.position.set(0, this.radius + 14, 3);
    this.group.add(this.nameLabel);
  }

  _createStatsLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 32;
    this.statsCanvas = canvas;
    this.statsCtx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    this.statsLabel = new THREE.Sprite(mat);
    this.statsLabel.scale.set(70, 8, 1);
    this.statsLabel.position.set(0, -this.radius - 20, 3);
    this.group.add(this.statsLabel);
    this._updateStatsLabel();
  }

  _updateStatsLabel() {
    const text = `${this.coins}c  ${this.healthPacks}hp  ${this.bullets}b  ${this.keys}k`;
    if (text === this.lastStatsText) return;
    this.lastStatsText = text;

    const ctx = this.statsCtx;
    ctx.clearRect(0, 0, 256, 32);
    ctx.font = 'bold 30px Courier New';
    ctx.textAlign = 'left';
    const coinText = `${this.coins}c`;
    const hpText = `${this.healthPacks}hp`;
    const bulletText = `${this.bullets}b`;
    const gap = 8;
    const parts = [
      { text: coinText, color: '#ffdd44' },
      { text: hpText, color: '#44ff88' },
      { text: bulletText, color: '#ff6644' },
    ];
    if (this.keys > 0) {
      parts.push({ text: `${this.keys}k`, color: '#ddaa00' });
    }
    const widths = parts.map(p => ctx.measureText(p.text).width);
    const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
    let x = (256 - totalWidth) / 2;
    for (let i = 0; i < parts.length; i++) {
      ctx.fillStyle = parts[i].color;
      ctx.fillText(parts[i].text, x, 22);
      x += widths[i] + gap;
    }

    this.statsLabel.material.map.needsUpdate = true;
  }

  // System-routed message: agent tells the system "send this to X", system delivers it
  sendMessage(to, message, world) {
    if (!world || !to || !message) return;

    // Always show speech bubble on sender (even if target is out of range)
    this._showBubble(message, to);

    const target = world.agents.find(a => a.name === to && !a.dead);
    if (!target) return;

    // Allow messaging up to 1.5x awareness range (agents remember seeing someone)
    const dist = this.distanceTo(target);
    if (dist > this.awarenessRadius * 4) return;

    // System delivers the message to the target agent
    target.incomingMessages.push({ from: this.name, message });

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

  _createBubbleSprite() {
    // Persistent sprite — texture swapped on each message
    const mat = new THREE.SpriteMaterial({ transparent: true, opacity: 0 });
    this.speechBubble = new THREE.Sprite(mat);
    this.speechBubble.visible = false;
    this.speechBubble.position.z = 4;
    this.group.add(this.speechBubble);
  }

  _createThoughtSprite() {
    const mat = new THREE.SpriteMaterial({ transparent: true, opacity: 0 });
    this.thoughtBubble = new THREE.Sprite(mat);
    this.thoughtBubble.visible = false;
    this.thoughtBubble.position.z = 3.8;
    this.group.add(this.thoughtBubble);
  }

  _showThought(text) {
    if (!text) return;
    this.thoughtTimer = this.thoughtDuration;

    const fontSize = 18;
    const font = `italic ${fontSize}px Courier New`;
    const padding = 12;
    const maxWidth = 320;

    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    mctx.font = font;

    // Word-wrap
    const maxTextWidth = maxWidth - padding * 2;
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (mctx.measureText(testLine).width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    let widestLine = 0;
    for (const line of lines) {
      widestLine = Math.max(widestLine, mctx.measureText(line).width);
    }

    const lineHeight = fontSize + 4;
    const bubbleW = Math.max(60, Math.ceil(widestLine) + padding * 2);
    const bubbleH = lines.length * lineHeight + padding * 2;

    const canvas = document.createElement('canvas');
    canvas.width = bubbleW + 4;
    canvas.height = bubbleH + 4;
    const ctx = canvas.getContext('2d');

    // Thought bubble — rounded rect with dotted feel
    const r = 8;
    const bx = 2, by = 2, w = bubbleW, h = bubbleH;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + w - r, by);
    ctx.quadraticCurveTo(bx + w, by, bx + w, by + r);
    ctx.lineTo(bx + w, by + h - r);
    ctx.quadraticCurveTo(bx + w, by + h, bx + w - r, by + h);
    ctx.lineTo(bx + r, by + h);
    ctx.quadraticCurveTo(bx, by + h, bx, by + h - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fillStyle = 'rgba(40, 40, 20, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 180, 80, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = font;
    ctx.fillStyle = '#dddd88';
    ctx.textAlign = 'center';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], canvas.width / 2, padding + fontSize + i * lineHeight);
    }

    const oldTex = this.thoughtBubble.material.map;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    this.thoughtBubble.material.map = texture;
    this.thoughtBubble.material.needsUpdate = true;
    if (oldTex) {
      requestAnimationFrame(() => oldTex.dispose());
    }

    const scale = 0.45;
    const scaleX = canvas.width * scale;
    const scaleY = canvas.height * scale;
    this.thoughtBubble.scale.set(scaleX, scaleY, 1);
    this.thoughtBubble.position.set(0, -this.radius - 35 - scaleY / 2, 3.8);
    this.thoughtBubble.material.opacity = 1;
    this.thoughtBubble.visible = true;
  }

  _showBubble(text, targetName) {
    this.currentSpeech = text;
    this.speechTimer = this.speechDuration;

    const fontSize = 16;
    const font = `${fontSize}px Courier New`;
    const headerFont = `italic 13px Courier New`;
    const lineHeight = fontSize + 6;
    const padding = 14;
    const tailHeight = 12;
    const maxBubbleWidth = 320;
    const header = targetName ? `\u2192 ${targetName}` : null;

    // Measure text with a temp context
    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    mctx.font = font;

    // Word-wrap
    const maxTextWidth = maxBubbleWidth - padding * 2;
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (mctx.measureText(testLine).width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    let widestLine = 0;
    for (const line of lines) {
      widestLine = Math.max(widestLine, mctx.measureText(line).width);
    }
    if (header) {
      mctx.font = headerFont;
      widestLine = Math.max(widestLine, mctx.measureText(header).width);
    }

    const headerHeight = header ? 20 : 0;
    const bubbleW = Math.max(80, Math.ceil(widestLine) + padding * 2);
    const bubbleH = lines.length * lineHeight + padding * 2 + headerHeight;

    // Draw on a fresh canvas
    const canvas = document.createElement('canvas');
    canvas.width = bubbleW + 4;
    canvas.height = bubbleH + tailHeight + 4;
    const ctx = canvas.getContext('2d');

    const r = 10;
    const bx = 2, by = 2, w = bubbleW, h = bubbleH;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + w - r, by);
    ctx.quadraticCurveTo(bx + w, by, bx + w, by + r);
    ctx.lineTo(bx + w, by + h - r);
    ctx.quadraticCurveTo(bx + w, by + h, bx + w - r, by + h);
    ctx.lineTo(bx + w * 0.55, by + h);
    ctx.lineTo(bx + w * 0.5, by + h + tailHeight);
    ctx.lineTo(bx + w * 0.42, by + h);
    ctx.lineTo(bx + r, by + h);
    ctx.quadraticCurveTo(bx, by + h, bx, by + h - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 15, 25, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 100, 140, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    let textY = padding + fontSize;
    if (header) {
      ctx.font = headerFont;
      ctx.fillStyle = '#8888cc';
      ctx.textAlign = 'center';
      ctx.fillText(header, canvas.width / 2, textY);
      textY += headerHeight;
    }
    ctx.font = font;
    ctx.fillStyle = '#eeeeee';
    ctx.textAlign = 'center';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], canvas.width / 2, textY + i * lineHeight);
    }

    // Swap texture — defer dispose to avoid GPU race condition
    const oldTex = this.speechBubble.material.map;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    this.speechBubble.material.map = texture;
    this.speechBubble.material.needsUpdate = true;
    if (oldTex) {
      requestAnimationFrame(() => oldTex.dispose());
    }

    const scale = 0.5;
    const scaleX = canvas.width * scale;
    const scaleY = canvas.height * scale;
    this.speechBubble.scale.set(scaleX, scaleY, 1);
    this.speechBubble.position.set(0, this.radius + 28 + scaleY / 2, 4);
    this.speechBubble.material.opacity = 1;
    this.speechBubble.visible = true;
  }

  addToScene(scene) {
    scene.add(this.group);
  }

  removeFromScene(scene) {
    const textures = [
      this.speechBubble?.material?.map,
      this.thoughtBubble?.material?.map,
      this.nameLabel?.material?.map,
      this.statsLabel?.material?.map,
    ].filter(Boolean);
    scene.remove(this.group);
    // Defer texture disposal to next frame so renderer isn't using them
    if (textures.length > 0) {
      requestAnimationFrame(() => textures.forEach(t => t.dispose()));
    }
  }

  distanceTo(other) {
    return Math.hypot(other.x - this.x, other.y - this.y);
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
      this.mesh.material.opacity = 0.3;
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
      const coin = new Item({
        type: 'coin',
        x: Math.max(10, Math.min(world.width - 10, this.x + Math.cos(angle) * dist)),
        y: Math.max(10, Math.min(world.height - 10, this.y + Math.sin(angle) * dist)),
      });
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

    const perception = world.getPerception(this);
    try {
      const decision = await this.llm.decide(this.systemPrompt, perception, this.name, this.currentGoal);
      if (decision) {
        console.log(`[${this.name}] action=${decision.action} thought="${decision.thought || ''}" ${decision.message ? 'msg="' + decision.message + '"' : ''}`);
      }
      this.lastDecision = decision;
      if (decision?.thought && world.showThoughts) {
        this._showThought(decision.thought);
      }
      this._executeDecision(decision, world);
    } catch (err) {
      console.warn(`LLM error for ${this.name}:`, err.message);
    }
    this.pendingDecision = false;
  }

  _executeDecision(decision, world) {
    if (!decision) return;

    // Movement
    if (decision.action === 'move' && decision.targetX != null && decision.targetY != null) {
      this.targetX = Math.max(this.radius, Math.min(world.width - this.radius, decision.targetX));
      this.targetY = Math.max(this.radius, Math.min(world.height - this.radius, decision.targetY));
    }

    // Attack — by target name (agent or spider)
    if (decision.action === 'attack' && decision.target) {
      // Check agents first
      const targetAgent = world.agents.find(a => a.name === decision.target && !a.dead);
      if (targetAgent) {
        this.attack(targetAgent.x, targetAgent.y, world, targetAgent);
      } else if (decision.target === 'spider') {
        // Find nearest spider
        let closest = null;
        let closestDist = Infinity;
        for (const spider of world.spiders) {
          if (spider.dead) continue;
          const d = Math.hypot(spider.x - this.x, spider.y - this.y);
          if (d < closestDist) { closestDist = d; closest = spider; }
        }
        if (closest) {
          this.attack(closest.x, closest.y, world, closest);
        }
      }
    }
    // Legacy: attack by coordinates
    if (decision.action === 'attack' && !decision.target && decision.targetX != null && decision.targetY != null) {
      this.attack(decision.targetX, decision.targetY, world);
    }

    // Buy from shop — supports single item or array of items, or direct action name
    const shopActions = ['buy', 'firepower_up', 'reach_up', 'bullet_speed_up', 'speed_up', 'max_health_up'];
    if (decision.action === 'buy' || shopActions.includes(decision.action)) {
      const items = decision.action === 'buy'
        ? (decision.items || (decision.item ? [decision.item] : []))
        : [decision.action];
      for (const itemName of items) {
        this._tryBuy(itemName, world);
      }
    }

    // Send message — system routes it to the target agent
    if ((decision.action === 'send_message' || decision.action === 'talk') && decision.to && decision.message) {
      this.sendMessage(decision.to, decision.message, world);
      // Optionally move while messaging
      if (decision.targetX != null && decision.targetY != null) {
        this.targetX = Math.max(this.radius, Math.min(world.width - this.radius, decision.targetX));
        this.targetY = Math.max(this.radius, Math.min(world.height - this.radius, decision.targetY));
      }
    }

    // Update relationships — supports old format and new format
    if (decision.setRelationships && typeof decision.setRelationships === 'object') {
      for (const [name, rel] of Object.entries(decision.setRelationships)) {
        this.relationships[name] = rel;
      }
    }
    if (decision.setRelationship && decision.setRelationshipTo) {
      this.relationships[decision.setRelationshipTo] = decision.setRelationship;
    }

    // Update own goal if the LLM decided to
    if (decision.newGoal) {
      this.currentGoal = decision.newGoal;
    }

    // Use a health pack from inventory
    if (decision.action === 'use_healthpack') {
      if (this.healthPacks > 0) {
        this.healthPacks--;
        this.health = Math.min(this.maxHealth, this.health + 25);
      }
    }

    // Sell bullets (1 coin each)
    if (decision.action === 'sell_bullets' && decision.amount > 0) {
      const actual = Math.min(decision.amount, this.bullets);
      if (actual > 0) {
        this.bullets -= actual;
        this.coins += actual;
      }
    }

    if (decision.action === 'sell_wood' && decision.amount > 0) {
      const actual = Math.min(decision.amount, this.wood);
      if (actual > 0) {
        this.wood -= actual;
        this.coins += actual * 3;
      }
    }

    // Give coins to a nearby agent
    if (decision.action === 'give_coins' && decision.to && decision.amount > 0) {
      this._giveCoins(decision.to, decision.amount, world);
    }

    // Give health packs to a nearby agent
    if (decision.action === 'give_healthpack' && decision.to && decision.amount > 0) {
      this._giveHealthPacks(decision.to, decision.amount, world);
    }

    // Give bullets to a nearby agent
    if (decision.action === 'give_bullets' && decision.to && decision.amount > 0) {
      this._giveBullets(decision.to, decision.amount, world);
    }

    // Trade with a nearby agent
    if (decision.action === 'trade' && decision.to && decision.offer && decision.request) {
      this._trade(decision.to, decision.offer, decision.request, world);
    }

    // Open treasure — must be near one and have a key
    if (decision.action === 'open_treasure') {
      let opened = false;
      for (let i = world.items.length - 1; i >= 0; i--) {
        const item = world.items[i];
        if (item.type !== 'treasure') continue;
        const dist = Math.hypot(item.x - this.x, item.y - this.y);
        if (dist < this.radius + item.radius + 10) {
          if (this.keys > 0) {
            this.keys--;
            this.coins += 10;
            this.incomingMessages.push({ from: 'SYSTEM', message: 'You opened the treasure chest and found 10 coins!' });
            item.removeFromScene(world.scene);
            world.items.splice(i, 1);
            opened = true;
          } else {
            this.incomingMessages.push({ from: 'SYSTEM', message: 'You need a key to open this treasure chest!' });
          }
          break;
        }
      }
      if (!opened && !world.items.some(i => i.type === 'treasure' && Math.hypot(i.x - this.x, i.y - this.y) < this.radius + i.radius + 10)) {
        this.incomingMessages.push({ from: 'SYSTEM', message: 'There is no treasure chest nearby to open.' });
      }
    }

    // Cut tree — must be near one and have an axe
    if (decision.action === 'cut_tree') {
      if (!this.hasAxe) {
        this.incomingMessages.push({ from: 'SYSTEM', message: "You can't cut this tree with your bare hands!." });
      } else {
        let cut = false;
        for (const item of world.items) {
          if (item.type !== 'tree' || item.isCut) continue;
          const dist = Math.hypot(item.x - this.x, item.y - this.y);
          if (dist < this.radius + item.radius + 10) {
            item.cutTree();
            // Drop 3 wood items around the stump
            for (let i = 0; i < 3; i++) {
              const angle = (Math.PI * 2 * i) / 3 + Math.random() * 0.5;
              const d = 15 + Math.random() * 15;
              world.addItem(new Item({
                type: 'wood',
                x: Math.max(10, Math.min(world.width - 10, item.x + Math.cos(angle) * d)),
                y: Math.max(10, Math.min(world.height - 10, item.y + Math.sin(angle) * d)),
              }));
            }
            this.incomingMessages.push({ from: 'SYSTEM', message: 'You cut down a tree! Wood dropped nearby.' });
            cut = true;
            break;
          }
        }
        if (!cut) {
          this.incomingMessages.push({ from: 'SYSTEM', message: 'There is no tree nearby to cut.' });
        }
      }
    }

    // Place trap at current position
    if (decision.action === 'place_trap') {
      if (this.traps > 0) {
        this.traps--;
        const trap = new Item({
          type: 'trap',
          x: this.x,
          y: this.y,
          owner: this,
          trapDamage: 40,
        });
        world.addItem(trap);
      }
    }

    // Save to memory
    if (decision.addMemory) {
      this.memory.push(decision.addMemory);
      if (this.memory.length > 15) this.memory.shift();
    }

    // Idle
    if (decision.action === 'idle') {
      this.targetX = null;
      this.targetY = null;
    }
  }

  _tryBuy(itemName, world) {
    for (const item of world.items) {
      if (item.type !== 'shop') continue;
      const dist = Math.hypot(item.x - this.x, item.y - this.y);
      if (dist < this.awarenessRadius && item.shopInventory) {
        const shopItem = item.shopInventory.find(i => i.name === itemName);
        if (!shopItem) continue;
        // Prevent buying duplicate unique items
        if (itemName === 'axe' && this.hasAxe) {
          this.incomingMessages.push({ from: 'SYSTEM', message: 'You already have an axe!' });
          return;
        }
        if (itemName === 'hammer' && this.hasHammer) {
          this.incomingMessages.push({ from: 'SYSTEM', message: 'You already have a hammer!' });
          return;
        }
        if (this.coins >= shopItem.price) {
          this.coins -= shopItem.price;
          this._applyUpgrade(shopItem.name);
          this.inventory.push(shopItem.name);
        }
      }
    }
  }

  _giveCoins(targetName, amount, world) {
    const target = world.agents.find(a => a.name === targetName && !a.dead);
    if (!target) return;
    const dist = this.distanceTo(target);
    if (dist > this.awarenessRadius) return;
    const actual = Math.min(amount, this.coins);
    if (actual <= 0) return;
    this.coins -= actual;
    target.coins += actual;
    target.incomingMessages.push({ from: this.name, message: `[Gave you ${actual} coin${actual > 1 ? 's' : ''}]` });
  }

  _giveHealthPacks(targetName, amount, world) {
    const target = world.agents.find(a => a.name === targetName && !a.dead);
    if (!target) return;
    const dist = this.distanceTo(target);
    if (dist > this.awarenessRadius) return;
    const actual = Math.min(amount, this.healthPacks);
    if (actual <= 0) return;
    this.healthPacks -= actual;
    target.healthPacks += actual;
    target.incomingMessages.push({ from: this.name, message: `[Gave you ${actual} health pack${actual > 1 ? 's' : ''}]` });
  }

  _giveBullets(targetName, amount, world) {
    const target = world.agents.find(a => a.name === targetName && !a.dead);
    if (!target) return;
    const dist = this.distanceTo(target);
    if (dist > this.awarenessRadius) return;
    const actual = Math.min(amount, this.bullets);
    if (actual <= 0) return;
    this.bullets -= actual;
    target.bullets += actual;
    target.incomingMessages.push({ from: this.name, message: `[Gave you ${actual} bullet${actual > 1 ? 's' : ''}]` });
  }

  _getResource(type) {
    if (type === 'coins') return this.coins;
    if (type === 'bullets') return this.bullets;
    if (type === 'healthpacks') return this.healthPacks;
    return 0;
  }

  _addResource(type, amount) {
    if (type === 'coins') this.coins += amount;
    else if (type === 'bullets') this.bullets += amount;
    else if (type === 'healthpacks') this.healthPacks += amount;
  }

  _removeResource(type, amount) {
    if (type === 'coins') this.coins -= amount;
    else if (type === 'bullets') this.bullets -= amount;
    else if (type === 'healthpacks') this.healthPacks -= amount;
  }

  _trade(targetName, offer, request, world) {
    // offer/request: { type: "coins"|"bullets"|"healthpacks", amount: n }
    const target = world.agents.find(a => a.name === targetName && !a.dead);
    if (!target) return;
    const dist = this.distanceTo(target);
    if (dist > this.awarenessRadius) return;

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
        this._rebuildAwarenessRing();
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
      case 'axe':
        this.hasAxe = true;
        break;
      case 'hammer':
        this.hasHammer = true;
        break;
    }
  }

  _rebuildAwarenessRing() {
    if (this.awarenessRing) {
      this.group.remove(this.awarenessRing);
      this.awarenessRing.geometry.dispose();
      this.awarenessRing.material.dispose();
    }
    const ringGeo = new THREE.RingGeometry(this.awarenessRadius - 1, this.awarenessRadius, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.color),
      transparent: true,
      opacity: 0.15,
    });
    this.awarenessRing = new THREE.Mesh(ringGeo, ringMat);
    this.awarenessRing.position.z = 0.5;
    this.group.add(this.awarenessRing);
  }

  update(dt, world) {
    if (this.dead) {
      this.deadTimer += dt;
      return;
    }

    // Health decay
    this.healthDecayTimer += dt;
    if (this.healthDecayTimer >= this.healthDecayInterval) {
      this.healthDecayTimer = 0;
      this.health -= this.healthDecayAmount;
      if (this.health <= 0) {
        this.health = 0;
        this.dead = true;
        this.mesh.material.opacity = 0.3;
        this._dropCoins(world);
        return;
      }
    }

    // Track exploration — mark current quadrant as visited
    const qx = Math.floor(this.x / 300); // 4 columns (1200/300)
    const qy = Math.floor(this.y / 267); // 3 rows (800/267)
    this.visitedQuadrants.add(`${qx},${qy}`);

    // Remember nearby shops & treasures
    for (const item of world.items) {
      const dist = Math.hypot(item.x - this.x, item.y - this.y);
      if (dist > this.awarenessRadius) continue;

      if (item.type === 'shop') {
        const alreadyKnown = this.knownShops.some(
          s => Math.hypot(s.x - item.x, s.y - item.y) < 10
        );
        if (!alreadyKnown) {
          this.knownShops.push({ x: Math.round(item.x), y: Math.round(item.y) });
        }
      }
      if (item.type === 'treasure') {
        const alreadyKnown = this.knownTreasures.some(
          t => Math.hypot(t.x - item.x, t.y - item.y) < 10
        );
        if (!alreadyKnown) {
          this.knownTreasures.push({ x: Math.round(item.x), y: Math.round(item.y) });
        }
      }
    }

    // Clean up remembered treasures that no longer exist
    this.knownTreasures = this.knownTreasures.filter(t =>
      world.items.some(i => i.type === 'treasure' && Math.hypot(i.x - t.x, i.y - t.y) < 10)
    );

    // Cooldown
    if (this.attackCooldownTimer > 0) {
      this.attackCooldownTimer -= dt;
    }

    // LLM decisions — only call when idle (no active target) or urgent
    if (!this.pendingDecision) {
      const isIdle = this.targetX == null && this.targetY == null;
      const hasUrgency = this.needsReassess ||
        this.incomingMessages.length > 0 ||
        world.spiders.some(s => !s.dead && Math.hypot(s.x - this.x, s.y - this.y) < this.awarenessRadius * 0.5);

      if (isIdle || hasUrgency) {
        this.needsReassess = false;
        this.makeDecision(world);
      }
    }
    // Safety: if pending for too long (>10s), unstick
    if (this.pendingDecision) {
      this.pendingStuckTimer = (this.pendingStuckTimer || 0) + dt;
      if (this.pendingStuckTimer > 10) {
        this.pendingDecision = false;
        this.pendingStuckTimer = 0;
      }
    } else {
      this.pendingStuckTimer = 0;
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
      }
    } else {
      // No target — wander toward other agents so they meet, or explore randomly
      this.wanderTimer = (this.wanderTimer || 0) + dt;
      if (this.wanderTimer > 2.0) {
        this.wanderTimer = 0;
        // 60% chance: move toward nearest living agent to encourage encounters
        const others = world.agents.filter(a => a !== this && !a.dead);
        if (others.length > 0 && Math.random() < 0.6) {
          let nearest = others[0], nearDist = this.distanceTo(others[0]);
          for (let i = 1; i < others.length; i++) {
            const d = this.distanceTo(others[i]);
            if (d < nearDist) { nearest = others[i]; nearDist = d; }
          }
          // Move toward them but not exactly on top
          const jitterX = (Math.random() - 0.5) * 80;
          const jitterY = (Math.random() - 0.5) * 80;
          this.targetX = Math.max(this.radius + 20, Math.min(world.width - this.radius - 20, nearest.x + jitterX));
          this.targetY = Math.max(this.radius + 20, Math.min(world.height - this.radius - 20, nearest.y + jitterY));
        } else {
          // Random wander toward center-ish area
          this.targetX = Math.max(this.radius + 20, Math.min(world.width - this.radius - 20,
            world.width / 2 + (Math.random() - 0.5) * world.width * 0.6));
          this.targetY = Math.max(this.radius + 20, Math.min(world.height - this.radius - 20,
            world.height / 2 + (Math.random() - 0.5) * world.height * 0.6));
        }
      }
      this.vx *= 0.9;
      this.vy *= 0.9;
    }

    // Apply velocity
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Clamp to world bounds
    this.x = Math.max(this.radius, Math.min(world.width - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(world.height - this.radius, this.y));


    // Update Three.js objects
    this.group.position.set(this.x, this.y, 0);

    // Direction indicator
    if (Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1) {
      const angle = Math.atan2(this.vy, this.vx);
      this.dirIndicator.position.set(
        Math.cos(angle) * this.radius * 0.7,
        Math.sin(angle) * this.radius * 0.7,
        2.2
      );
    }

    // Health bar
    const healthPct = this.health / this.maxHealth;
    this.healthBar.scale.x = Math.max(0, healthPct);
    this.healthBar.position.x = -(1 - healthPct) * this.radius * 1.25;
    if (healthPct > 0.5) this.healthBar.material.color.set(0x44ff44);
    else if (healthPct > 0.25) this.healthBar.material.color.set(0xffaa00);
    else this.healthBar.material.color.set(0xff4444);

    // Stats label (coins + healthpacks)
    this._updateStatsLabel();

    // Speech bubble fade
    if (this.speechBubble && this.speechBubble.visible) {
      this.speechTimer -= dt;
      if (this.speechTimer <= 0) {
        this.speechBubble.visible = false;
        this.speechBubble.material.opacity = 0;
        this.currentSpeech = '';
      } else if (this.speechTimer < 1.0) {
        this.speechBubble.material.opacity = this.speechTimer;
      }
    }

    // Thought bubble fade
    if (this.thoughtBubble && this.thoughtBubble.visible) {
      this.thoughtTimer -= dt;
      if (this.thoughtTimer <= 0) {
        this.thoughtBubble.visible = false;
        this.thoughtBubble.material.opacity = 0;
      } else if (this.thoughtTimer < 0.8) {
        this.thoughtBubble.material.opacity = this.thoughtTimer / 0.8;
      }
    }

    // Awareness ring visibility
    this.awarenessRing.visible = world.showAwareness;
  }
}
