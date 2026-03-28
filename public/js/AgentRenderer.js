import * as THREE from 'three';
import { ChatBubble } from './ChatBubble.js';

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

/**
 * AgentRenderer — owns all Three.js visuals for a single agent.
 * Reads agent state to update visuals each frame, but never modifies game state.
 */
export class AgentRenderer {
  constructor(agent) {
    this.agent = agent;
    this.group = new THREE.Group();

    // Stats label optimization
    this.statsCanvas = null;
    this.statsCtx = null;
    this.lastStatsText = '';

    this._build();
  }

  _build() {
    const agent = this.agent;

    // Agent sprite
    const spritePath = CHARACTER_SPRITES[spriteIndex % CHARACTER_SPRITES.length];
    spriteIndex++;
    const texture = textureLoader.load(spritePath);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    this.mesh = new THREE.Sprite(spriteMat);
    const spriteSize = agent.radius * 2.5;
    this.mesh.scale.set(spriteSize, spriteSize, 1);
    this.mesh.position.z = 2;
    this.group.add(this.mesh);

    // Direction indicator
    const dirGeo = new THREE.CircleGeometry(3, 16);
    const dirMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.dirIndicator = new THREE.Mesh(dirGeo, dirMat);
    this.dirIndicator.position.set(agent.radius * 0.7, 0, 2.2);
    this.group.add(this.dirIndicator);

    // Awareness ring
    this._buildAwarenessRing();

    // Health bar background
    const hbBgGeo = new THREE.PlaneGeometry(agent.radius * 2.5, 4);
    const hbBgMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    this.healthBarBg = new THREE.Mesh(hbBgGeo, hbBgMat);
    this.healthBarBg.position.set(0, -agent.radius - 10, 3);
    this.group.add(this.healthBarBg);

    // Health bar
    const hbGeo = new THREE.PlaneGeometry(agent.radius * 2.5, 4);
    const hbMat = new THREE.MeshBasicMaterial({ color: 0x44ff44 });
    this.healthBar = new THREE.Mesh(hbGeo, hbMat);
    this.healthBar.position.set(0, -agent.radius - 10, 3.1);
    this.group.add(this.healthBar);

    // Name label
    this._buildNameLabel();

    // Stats label
    this._buildStatsLabel();

    // Tool icons
    this._buildToolIcons();

    // Chat bubbles
    this.speechBubble = new ChatBubble(this.group, { type: 'speech', duration: 5.0 });
    this.thoughtBubble = new ChatBubble(this.group, { type: 'thought', duration: 5.0 });

    this.group.position.set(agent.x, agent.y, 0);
  }

  _buildNameLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 30px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.agent.name, 128, 28);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    this.nameLabel = new THREE.Sprite(mat);
    this.nameLabel.scale.set(80, 12, 1);
    this.nameLabel.position.set(0, this.agent.radius + 14, 3);
    this.group.add(this.nameLabel);
  }

  _buildStatsLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    this.statsCanvas = canvas;
    this.statsCtx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    this.statsLabel = new THREE.Sprite(mat);
    this.statsLabel.scale.set(120, 15, 1);
    this.statsLabel.position.set(0, -this.agent.radius - 22, 3);
    this.group.add(this.statsLabel);
    this._updateStatsLabel();
  }

  _updateStatsLabel() {
    const a = this.agent;
    const text = `${a.coins}c ${a.healthPacks}hp ${a.bullets}b ${a.wood}w ${a.stones}s ${a.keys}k`;
    if (text === this.lastStatsText) return;
    this.lastStatsText = text;

    const ctx = this.statsCtx;
    ctx.clearRect(0, 0, 512, 64);
    ctx.font = 'bold 42px Courier New';
    ctx.textAlign = 'left';
    const gap = 12;
    const parts = [
      { text: `${a.coins}c`, color: '#ffdd44' },
      { text: `${a.healthPacks}hp`, color: '#44ff88' },
      { text: `${a.bullets}b`, color: '#ff6644' },
      { text: `${a.wood}w`, color: '#8B5E3C' },
      { text: `${a.stones}s`, color: '#888888' },
    ];
    if (a.keys > 0) parts.push({ text: `${a.keys}k`, color: '#ddaa00' });

    const widths = parts.map(p => ctx.measureText(p.text).width);
    const totalWidth = widths.reduce((sum, w) => sum + w, 0) + gap * (parts.length - 1);
    const startX = (512 - totalWidth) / 2;
    const padding = 8;

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

  _buildToolIcons() {
    const axeTex = textureLoader.load('/images/axe.png');
    axeTex.magFilter = THREE.NearestFilter;
    axeTex.minFilter = THREE.NearestFilter;
    const axeMat = new THREE.SpriteMaterial({ map: axeTex, transparent: true });
    this.axeIcon = new THREE.Sprite(axeMat);
    this.axeIcon.scale.set(16, 16, 1);
    this.axeIcon.position.set(this.agent.radius + 8, 0, 2.5);
    this.axeIcon.visible = false;
    this.group.add(this.axeIcon);

    const hammerTex = textureLoader.load('/images/hammer.png');
    hammerTex.magFilter = THREE.NearestFilter;
    hammerTex.minFilter = THREE.NearestFilter;
    const hammerMat = new THREE.SpriteMaterial({ map: hammerTex, transparent: true });
    this.hammerIcon = new THREE.Sprite(hammerMat);
    this.hammerIcon.scale.set(16, 16, 1);
    this.hammerIcon.position.set(this.agent.radius + 8, -18, 2.5);
    this.hammerIcon.visible = false;
    this.group.add(this.hammerIcon);
  }

  _buildAwarenessRing() {
    if (this.awarenessRing) {
      this.group.remove(this.awarenessRing);
      this.awarenessRing.geometry.dispose();
      this.awarenessRing.material.dispose();
    }
    const ringGeo = new THREE.RingGeometry(this.agent.awarenessRadius - 1, this.agent.awarenessRadius, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.agent.color),
      transparent: true,
      opacity: 0.15,
    });
    this.awarenessRing = new THREE.Mesh(ringGeo, ringMat);
    this.awarenessRing.position.z = 0.5;
    this.group.add(this.awarenessRing);
  }

  // ── Public API ──

  showSpeech(text, targetName) {
    this.speechBubble.show(text, this.agent.radius, targetName);
  }

  showThought(text) {
    this.thoughtBubble.show(text, this.agent.radius);
  }

  addToScene(scene) {
    scene.add(this.group);
  }

  removeFromScene(scene) {
    const textures = [
      this.nameLabel?.material?.map,
      this.statsLabel?.material?.map,
    ].filter(Boolean);
    this.speechBubble.dispose();
    this.thoughtBubble.dispose();
    scene.remove(this.group);
    if (textures.length > 0) {
      requestAnimationFrame(() => textures.forEach(t => t.dispose()));
    }
  }

  setOpacity(value) {
    this.mesh.material.opacity = value;
  }

  rebuildAwarenessRing() {
    this._buildAwarenessRing();
  }

  /** Read agent state and sync all visuals. Called once per frame. */
  update(dt, showAwareness) {
    const a = this.agent;

    // Position
    this.group.position.set(a.x, a.y, 0);

    // Direction indicator
    if (Math.abs(a.vx) > 1 || Math.abs(a.vy) > 1) {
      const angle = Math.atan2(a.vy, a.vx);
      this.dirIndicator.position.set(
        Math.cos(angle) * a.radius * 0.7,
        Math.sin(angle) * a.radius * 0.7,
        2.2
      );
    }

    // Health bar
    const healthPct = a.health / a.maxHealth;
    this.healthBar.scale.x = Math.max(0, healthPct);
    this.healthBar.position.x = -(1 - healthPct) * a.radius * 1.25;
    if (healthPct > 0.5) this.healthBar.material.color.set(0x44ff44);
    else if (healthPct > 0.25) this.healthBar.material.color.set(0xffaa00);
    else this.healthBar.material.color.set(0xff4444);

    // Stats label
    this._updateStatsLabel();

    // Tool icons
    this.axeIcon.visible = a.hasAxe;
    this.hammerIcon.visible = a.hasHammer;
    this.hammerIcon.position.y = a.hasAxe ? -18 : 0;

    // Bubbles
    this.speechBubble.update(dt);
    this.thoughtBubble.update(dt);

    // Awareness ring
    this.awarenessRing.visible = showAwareness;

    // Death opacity
    if (a.dead) {
      this.mesh.material.opacity = 0.3;
    }
  }
}
