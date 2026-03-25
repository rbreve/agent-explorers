import * as THREE from 'three';
import { Bullet } from './Bullet.js';
import { Item } from './Item.js';
import { LLMController } from './LLMController.js';
import { House, HOUSE_WOOD_COST, HOUSE_STONE_COST } from './House.js';

export const BROADCAST_KILL = true;
export const HEALTHPACK_HEAL = 45;
export const APPLE_HEAL = 15;
export const AXE_DAMAGE = 8;
export const HAMMER_DAMAGE = 5;

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
    this.stones = 0;
    this.apples = 0;
    this.insideHouse = null; // reference to House if agent is inside
    this.stress = 0; // 0-10 stress level, set by LLM
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
    this.decisionCooldown = 0;       // seconds remaining before next LLM call
    this.decisionCooldownTime = 2.5; // seconds to wait between decisions

    // Instinct system — LLM-programmed reflexes
    this.enableInstincts = config.enableInstincts ?? false;
    this.instincts = []; // { trigger, action, thought }

    // Work action (cut_tree, break_rock) — takes time
    this.workAction = null;      // { action, item, world, elapsed }
    this.workDuration = 3.5;     // seconds to complete

    // Chat & relationships
    this.speechBubble = null;
    this.speechTimer = 0;
    this.speechDuration = 5.0;
    this.thoughtBubble = null;
    this.thoughtTimer = 0;
    this.thoughtDuration = 5.0;
    this.currentSpeech = '';
    this.incomingMessages = []; // new messages since last decision
    this.conversationHistory = {}; // per-agent: { agentName: [{from, message, tick}] }
    this.relationships = {}; // per-agent: { agentName: "ally"|"enemy"|"neutral"|"afraid" }
    this.friends = config.friends ?? []; // list of agent names this agent considers friends from the start
    // Pre-seed relationships from friends list
    for (const f of this.friends) {
      this.relationships[f] = 'ally';
    }
    this.goals = {
      high: '',   // Survival, immediate threats
      mid: '',    // Current objective (buy items, go to shop, etc.)
      low: '',    // Long-term plans (explore, build alliances, etc.)
    };

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

    // Tool icons (axe, hammer) — hidden by default
    this._createToolIcons();

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
    canvas.width = 512;
    canvas.height = 64;
    this.statsCanvas = canvas;
    this.statsCtx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    this.statsLabel = new THREE.Sprite(mat);
    this.statsLabel.scale.set(120, 15, 1);
    this.statsLabel.position.set(0, -this.radius - 22, 3);
    this.group.add(this.statsLabel);
    this._updateStatsLabel();
  }

  _updateStatsLabel() {
    const text = `${this.coins}c ${this.healthPacks}hp ${this.bullets}b ${this.wood}w ${this.stones}s ${this.keys}k`;
    if (text === this.lastStatsText) return;
    this.lastStatsText = text;

    const ctx = this.statsCtx;
    ctx.clearRect(0, 0, 512, 64);
    ctx.font = 'bold 42px Courier New';
    ctx.textAlign = 'left';
    const gap = 12;
    const parts = [
      { text: `${this.coins}c`, color: '#ffdd44' },
      { text: `${this.healthPacks}hp`, color: '#44ff88' },
      { text: `${this.bullets}b`, color: '#ff6644' },
      { text: `${this.wood}w`, color: '#8B5E3C' },
      { text: `${this.stones}s`, color: '#888888' },
    ];
    if (this.keys > 0) {
      parts.push({ text: `${this.keys}k`, color: '#ddaa00' });
    }
    const widths = parts.map(p => ctx.measureText(p.text).width);
    const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
    const startX = (512 - totalWidth) / 2;
    const padding = 8;

    // Dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(startX - padding, 4, totalWidth + padding * 2, 52, 8);
    ctx.fill();

    let x = startX;
    for (let i = 0; i < parts.length; i++) {
      ctx.fillStyle = parts[i].color;
      ctx.fillText(parts[i].text, x, 44);
      x += widths[i] + gap;
    }

    this.statsLabel.material.map.needsUpdate = true;
  }

  _createToolIcons() {
    const axeTex = textureLoader.load('/images/axe.png');
    axeTex.magFilter = THREE.NearestFilter;
    axeTex.minFilter = THREE.NearestFilter;
    const axeMat = new THREE.SpriteMaterial({ map: axeTex, transparent: true });
    this.axeIcon = new THREE.Sprite(axeMat);
    this.axeIcon.scale.set(16, 16, 1);
    this.axeIcon.position.set(this.radius + 8, 0, 2.5);
    this.axeIcon.visible = false;
    this.group.add(this.axeIcon);

    const hammerTex = textureLoader.load('/images/hammer.png');
    hammerTex.magFilter = THREE.NearestFilter;
    hammerTex.minFilter = THREE.NearestFilter;
    const hammerMat = new THREE.SpriteMaterial({ map: hammerTex, transparent: true });
    this.hammerIcon = new THREE.Sprite(hammerMat);
    this.hammerIcon.scale.set(16, 16, 1);
    this.hammerIcon.position.set(this.radius + 8, -18, 2.5);
    this.hammerIcon.visible = false;
    this.group.add(this.hammerIcon);
  }

  _updateToolIcons() {
    this.axeIcon.visible = this.hasAxe;
    this.hammerIcon.visible = this.hasHammer;
    // Stack hammer below axe only if axe is visible
    this.hammerIcon.position.y = this.hasAxe ? -18 : 0;
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

    try {
      const perception = world.getPerception(this);
      const decision = await this.llm.decide(this.systemPrompt, perception, this.name, this.goals);
      if (decision) {
        console.log(`[LOG_LLM_OUTPUT][${new Date().toLocaleTimeString()}][${this.name}]`, JSON.stringify(decision));
      }
      this.lastDecision = decision;
      if (decision?.thought && world.showThoughts) {
        this._showThought(decision.thought);
      }
      this._executeDecision(decision, world);
    } catch (err) {
      console.warn(`[DECISION_ERROR][${this.name}]`, err.message, err.stack);
    }
    this.pendingDecision = false;
    this.decisionCooldown = this.decisionCooldownTime;
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
      } else if (/spider/i.test(decision.target)) {
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

    // Melee attack — hit nearby spider/agent with axe or hammer
    if (decision.action === 'melee_attack' || decision.action === 'melee') {
      const meleeRange = this.radius + 30;
      const weapon = this.hasAxe ? 'axe' : this.hasHammer ? 'hammer' : null;
      if (!weapon) {
        this.incomingMessages.push({ from: 'SYSTEM', message: 'You need an axe or hammer to melee attack!' });
      } else {
        const dmg = weapon === 'axe' ? AXE_DAMAGE : HAMMER_DAMAGE;
        let hit = false;

        // Target spider
        if (!decision.target || /spider/i.test(decision.target)) {
          let closest = null;
          let closestDist = Infinity;
          for (const spider of world.spiders) {
            if (spider.dead) continue;
            const d = Math.hypot(spider.x - this.x, spider.y - this.y);
            if (d < meleeRange && d < closestDist) { closestDist = d; closest = spider; }
          }
          if (closest) {
            closest.takeDamage(dmg, this, world);
            if (closest.dead) {
              world.eventLog.push({ type: 'spider_kill', killer: this.name, color: this.color, x: Math.round(closest.x), y: Math.round(closest.y) });
            }
            this.incomingMessages.push({ from: 'SYSTEM', message: `You hit a spider with your ${weapon} for ${dmg} damage!` });
            hit = true;
          }
        }

        // Target agent
        if (!hit && decision.target && !/spider/i.test(decision.target)) {
          const targetAgent = world.agents.find(a => a.name === decision.target && !a.dead);
          if (targetAgent && Math.hypot(targetAgent.x - this.x, targetAgent.y - this.y) < meleeRange) {
            targetAgent.takeDamage(dmg, this, world);
            this.incomingMessages.push({ from: 'SYSTEM', message: `You hit ${decision.target} with your ${weapon} for ${dmg} damage!` });
            hit = true;
          }
        }

        if (!hit) {
          this.incomingMessages.push({ from: 'SYSTEM', message: 'Nothing close enough to hit.' });
        }
        this.attackCooldownTimer = this.attackCooldown;
      }
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

    // Update goals if the LLM decided to
    if (decision.setGoals) {
      if (decision.setGoals.high != null) this.goals.high = decision.setGoals.high;
      if (decision.setGoals.mid != null) this.goals.mid = decision.setGoals.mid;
      if (decision.setGoals.low != null) this.goals.low = decision.setGoals.low;
    }

    // Use a health pack from inventory
    if (decision.action === 'use_healthpack') {
      if (this.healthPacks > 0) {
        this.healthPacks--;
        this.health = Math.min(this.maxHealth, this.health + HEALTHPACK_HEAL);
      }
    }

    // Get apple from nearby apple tree
    if (decision.action === 'get_apple') {
      let found = null;
      for (const item of world.items) {
        if (item.type !== 'apple_tree' || item.apples <= 0) continue;
        const dist = Math.hypot(item.x - this.x, item.y - this.y);
        if (dist < this.radius + item.radius + 10) { found = item; break; }
      }
      if (found) {
        found.apples--;
        this.apples++;
        this._updateStatsLabel();
        this.incomingMessages.push({ from: 'SYSTEM', message: `You picked an apple! (${found.apples} left on tree)` });
      } else {
        this.incomingMessages.push({ from: 'SYSTEM', message: 'No apple tree nearby with apples.' });
      }
    }

    // Eat apple — restore health
    if (decision.action === 'eat_apple') {
      if (this.apples > 0) {
        this.apples--;
        this.health = Math.min(this.maxHealth, this.health + APPLE_HEAL);
        this._updateStatsLabel();
      } else {
        this.incomingMessages.push({ from: 'SYSTEM', message: "You don't have any apples to eat." });
      }
    }

    // Grab a nearby grabbable item
    if (decision.action === 'grab' || decision.action === 'get' || decision.action === 'take') {
      const targetType = decision.item;
      let found = null;
      for (const item of world.items) {
        if (!item.grabbable) continue;
        if (targetType && item.type !== targetType) continue;
        const dist = Math.hypot(item.x - this.x, item.y - this.y);
        if (dist < this.radius + item.radius + 10) { found = item; break; }
      }
      if (found) {
        const picked = found.onPickup(this);
        if (picked !== false) {
          found.removeFromScene(world.scene);
          const idx = world.items.indexOf(found);
          if (idx !== -1) world.items.splice(idx, 1);
          this._updateStatsLabel();
          this.incomingMessages.push({ from: 'SYSTEM', message: `You grabbed a ${found.type.replace(/_/g, ' ')}!` });
        }
      } else {
        this.incomingMessages.push({ from: 'SYSTEM', message: `Nothing grabbable nearby${targetType ? ` of type ${targetType}` : ''}.` });
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

    // Give items to a nearby agent (unified + backward compat)
    if (decision.action === 'give' && decision.to && decision.item && decision.amount > 0) {
      this._give(decision.to, decision.item, decision.amount, world);
    }
    if (decision.action === 'give_coins' && decision.to && decision.amount > 0) {
      this._give(decision.to, 'coins', decision.amount, world);
    }
    if (decision.action === 'give_bullets' && decision.to && decision.amount > 0) {
      this._give(decision.to, 'bullets', decision.amount, world);
    }
    if (decision.action === 'give_healthpack' && decision.to && decision.amount > 0) {
      this._give(decision.to, 'healthpacks', decision.amount, world);
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

    // Cut tree — start work action
    if (decision.action === 'cut_tree') {
      if (!this.hasAxe) {
        this.incomingMessages.push({ from: 'SYSTEM', message: "You can't cut this tree with your bare hands!" });
      } else {
        let found = null;
        for (const item of world.items) {
          if (item.type !== 'tree' || item.isCut) continue;
          const dist = Math.hypot(item.x - this.x, item.y - this.y);
          if (dist < this.radius + item.radius + 10) { found = item; break; }
        }
        if (found) {
          // Cut tree and drop wood immediately
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
          // Agent stays busy for workDuration
          this.workAction = { action: 'cut_tree', item: found, world, elapsed: 0 };
          this.targetX = null; this.targetY = null;
          this.vx = 0; this.vy = 0;
          new Audio('/sounds/cut_tree.wav').play().catch(e => console.warn('[SOUND] cut_tree blocked:', e.message));
          this.incomingMessages.push({ from: 'SYSTEM', message: 'You cut down a tree!' });
        } else {
          this.incomingMessages.push({ from: 'SYSTEM', message: 'There is no tree nearby to cut.' });
        }
      }
    }

    // Break rock — start work action
    if (decision.action === 'break_rock') {
      if (!this.hasHammer) {
        this.incomingMessages.push({ from: 'SYSTEM', message: "You need a hammer to break rocks!" });
      } else {
        let found = null;
        for (const item of world.items) {
          if (item.type !== 'rock' || item.isBroken) continue;
          const dist = Math.hypot(item.x - this.x, item.y - this.y);
          if (dist < this.radius + item.radius + 10) { found = item; break; }
        }
        if (found) {
          // Break rock and drop loot immediately
          found.breakRock();
          this.stones++;
          if (found.hasGold) {
            world.addItem(new Item({ type: 'coin', x: found.x, y: found.y }));
          }
          found.removeFromScene(world.scene);
          const idx = world.items.indexOf(found);
          if (idx !== -1) world.items.splice(idx, 1);
          // Agent stays busy for workDuration
          this.workAction = { action: 'break_rock', item: null, world, elapsed: 0 };
          this.targetX = null; this.targetY = null;
          this.vx = 0; this.vy = 0;
          new Audio('/sounds/hammer_rock.wav').play().catch(e => console.warn('[SOUND] hammer_rock blocked:', e.message));
          const rockMsg = found.hasGold ? 'You broke a rock and found gold + 1 stone!' : 'You broke a rock and got 1 stone.';
          this.incomingMessages.push({ from: 'SYSTEM', message: rockMsg });
        } else {
          this.incomingMessages.push({ from: 'SYSTEM', message: 'There is no rock nearby to break.' });
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

    // Build house — requires wood + stones
    if (decision.action === 'build_house') {
      if (this.wood < HOUSE_WOOD_COST || this.stones < HOUSE_STONE_COST) {
        const needs = [];
        if (this.wood < HOUSE_WOOD_COST) needs.push(`${HOUSE_WOOD_COST} wood (have ${this.wood})`);
        if (this.stones < HOUSE_STONE_COST) needs.push(`${HOUSE_STONE_COST} stones (have ${this.stones})`);
        this.incomingMessages.push({ from: 'SYSTEM', message: `Need ${needs.join(' and ')} to build a house.` });
      } else {
        this.wood -= HOUSE_WOOD_COST;
        this.stones -= HOUSE_STONE_COST;
        const house = new House({ x: this.x, y: this.y, owner: this });
        world.addItem(house);
        this._updateStatsLabel();
        this.incomingMessages.push({ from: 'SYSTEM', message: 'You built a house! Enter it to heal and stay safe.' });
      }
    }

    // Enter house — must be near own house
    if (decision.action === 'enter_house') {
      let found = null;
      for (const item of world.items) {
        if (item.type !== 'house' || item.owner !== this) continue;
        const dist = Math.hypot(item.x - this.x, item.y - this.y);
        if (dist < this.radius + item.radius + 10) { found = item; break; }
      }
      if (found) {
        if (found.enter(this)) {
          this.insideHouse = found;
          this.targetX = null;
          this.targetY = null;
          this.vx = 0;
          this.vy = 0;
          this.mesh.material.opacity = 0.3;
          this.incomingMessages.push({ from: 'SYSTEM', message: 'You entered your house. You are healing and safe from damage.' });
        } else {
          this.incomingMessages.push({ from: 'SYSTEM', message: 'Cannot enter — house is occupied.' });
        }
      } else {
        this.incomingMessages.push({ from: 'SYSTEM', message: 'No house of yours nearby to enter.' });
      }
    }

    // Exit house
    if (decision.action === 'exit_house') {
      if (this.insideHouse) {
        this.insideHouse.exit();
        this.insideHouse = null;
        this.mesh.material.opacity = 1;
        this.incomingMessages.push({ from: 'SYSTEM', message: 'You left your house.' });
      }
    }

    // Save to memory
    if (decision.addMemory) {
      this.memory.push(decision.addMemory);
      if (this.memory.length > 15) this.memory.shift();
    }

    // Update stress level
    if (decision.stress != null) {
      this.stress = Math.max(0, Math.min(10, Math.round(decision.stress)));
    }

    // Set instincts (LLM-programmed reflexes)
    if (decision.setInstincts && Array.isArray(decision.setInstincts)) {
      this.instincts = decision.setInstincts.filter(i => i.trigger && i.action);
      console.log(`[INSTINCTS][${this.name}] Set ${this.instincts.length} instinct(s):`, this.instincts.map(i => i.trigger).join(', '));
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
          this._updateStatsLabel();
        }
      }
    }
  }

  _give(targetName, itemType, amount, world) {
    const target = world.agents.find(a => a.name === targetName && !a.dead);
    if (!target) return;
    const dist = this.distanceTo(target);
    if (dist > this.awarenessRadius) return;

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
      this.incomingMessages.push({ from: 'SYSTEM', message: `Can't give "${itemType}" — unknown item type.` });
      return;
    }
    const actual = Math.min(amount, this[info.prop]);
    if (actual <= 0) {
      this.incomingMessages.push({ from: 'SYSTEM', message: `You don't have any ${info.label}s to give.` });
      return;
    }
    this[info.prop] -= actual;
    target[info.prop] += actual;
    target.incomingMessages.push({ from: this.name, message: `[Gave you ${actual} ${info.label}${actual > 1 ? 's' : ''}]` });
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
        match = world.spiders.some(s => !s.dead && Math.hypot(s.x - this.x, s.y - this.y) < this.awarenessRadius * 0.4);
      }
      else if (t === 'under_attack') match = this.needsReassess && healthPct < 1;
      else if (t === 'no_bullets') match = this.bullets <= 0;
      // Item triggers
      else if (t === 'coin_nearby') {
        const coin = world.items.find(i => i.type === 'coin' && Math.hypot(i.x - this.x, i.y - this.y) < this.awarenessRadius);
        if (coin && isIdle) {
          match = true;
          // Auto-fill targetX/Y for move actions
          if (instinct.action.action === 'move' && instinct.action.targetX == null) {
            instinct.action = { ...instinct.action, targetX: Math.round(coin.x), targetY: Math.round(coin.y) };
          }
        }
      }
      else if (t === 'item_nearby') {
        match = isIdle && world.items.some(i => i.autoPickup && Math.hypot(i.x - this.x, i.y - this.y) < this.awarenessRadius);
      }
      // Location triggers
      else if (t === 'at_shop') {
        match = world.items.some(i => i.type === 'shop' && Math.hypot(i.x - this.x, i.y - this.y) <= this.radius + i.radius);
      }

      if (match) return instinct;
    }
    return null;
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

    // Work action in progress (cut_tree, break_rock)
    if (this.workAction) {
      // Check for danger interrupts
      const dangerSpider = world.spiders.some(s => !s.dead && Math.hypot(s.x - this.x, s.y - this.y) < this.awarenessRadius * 0.5);
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
        if (world.showThoughts) this._showThought(this.lastDecision.thought);
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
        world.spiders.some(s => !s.dead && Math.hypot(s.x - this.x, s.y - this.y) < this.awarenessRadius * 0.5);

      if (hasUrgency || (isIdle && this.decisionCooldown <= 0)) {
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

    // Tool icons
    this._updateToolIcons();

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
