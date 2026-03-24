import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const ITEM_TEXTURES = {};

function getTexture(path) {
  if (!ITEM_TEXTURES[path]) {
    const tex = loader.load(path);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    ITEM_TEXTURES[path] = tex;
  }
  return ITEM_TEXTURES[path];
}

// ── Item type definitions ──────────────────────────────────────────
// Each key is a type name. Properties:
//   icon        – texture path (or null for canvas-drawn items)
//   size        – sprite scale [w, h]
//   radius      – collision/interaction radius
//   z           – sprite z position
//   label       – text label rendered above the item
//   opacity     – sprite opacity (default 1)
//   autoPickup  – walked-over items are collected automatically
//   grabbable   – can be picked up with the "grab" action (not auto)
//   interactive – requires a specific action (shop, treasure, tree…)
export const ITEM_DEFS = {
  coin:        { icon: '/images/coin.png',         size: [18,18], z: 1.5, autoPickup: true,  grabbable: false },
  health_pack: { icon: '/images/health_flask.png',  size: [20,20], z: 1.5, autoPickup: true,  grabbable: false },
  key:         { icon: '/images/key.png',           size: [20,20], z: 1.5, autoPickup: false,  grabbable: true },
  wood:        { icon: '/images/wood.png',          size: [20,20], z: 1.5, autoPickup: false,  grabbable: true },
  axe:         { icon: '/images/axe.png',           size: [22,22], z: 1.5, autoPickup: false,  grabbable: true },
  hammer:      { icon: '/images/hammer.png',        size: [22,22], z: 1.5, autoPickup: false,  grabbable: true },
  bullet:      { icon: '/images/bullet.png',        size: [16,16], z: 1.5, autoPickup: true,  grabbable: false },
  trap:        { icon: '/images/trap.png',          size: [22,22], z: 0.8, autoPickup: false, grabbable: false, opacity: 0.4, radius: 12 },
  note:        { icon: null, /* canvas-drawn */     size: [24,24], z: 1.5, autoPickup: true,  grabbable: false, radius: 12, label: 'NOTE' },
  treasure:    { icon: '/images/lock.png',          size: [30,30], z: 1.5, autoPickup: false, grabbable: true,  radius: 15, label: 'TREASURE', interactive: true },
  tree:        { icon: '/images/world/tree.png',    size: [50,50], z: 1.2, autoPickup: false, grabbable: false, radius: 18, interactive: true },
  rock:        { icon: '/images/rock.png',          size: [60,60], z: 1.2, autoPickup: false, grabbable: false, radius: 14, interactive: true },
  apple_tree:  { icon: '/images/appletree.png',     size: [50,50], z: 1.2, autoPickup: false, grabbable: false, radius: 18, interactive: true },
  shop:        { icon: '/images/store.png',         size: [60,60], z: 1,   autoPickup: false, grabbable: false, radius: 18, interactive: true },
  house:       { icon: '/images/house.png',         size: [50,50], z: 1,   autoPickup: false, grabbable: false, radius: 18, interactive: true },
};

export class Item {
  constructor(config) {
    this.type = config.type || 'coin';
    this.x = config.x;
    this.y = config.y;

    // Look up definition
    const def = ITEM_DEFS[this.type] || {};
    this.radius = config.radius || def.radius || 8;
    this.autoPickup = def.autoPickup ?? true;
    this.grabbable = config.grabbable ?? def.grabbable ?? false;
    this.interactive = def.interactive ?? false;

    // Type-specific state
    this.shopInventory = config.shopInventory || null;
    this.shopName = config.shopName || null;
    this.noteText = config.noteText || null;
    this.owner = config.owner || null;
    this.trapDamage = config.trapDamage || 40;
    this.isCut = false;
    this.hasGold = config.hasGold || false;
    this.isBroken = false;
    this.apples = config.apples ?? (this.type === 'apple_tree' ? 3 : 0);

    this.group = new THREE.Group();
    this._build(def);
  }

  _build(def) {
    if (this.type === 'note') {
      // Canvas-drawn note icon
      this._buildNote();
    } else if (this.type === 'rock' && this.hasGold) {
      // Gold rocks use a different texture
      this._buildSprite('/images/gold.png', def.size, def.z, def.opacity);
    } else if (def.icon) {
      this._buildSprite(def.icon, def.size, def.z, def.opacity);
    }

    // Label
    const labelText = this.type === 'shop' ? (this.shopName || 'SHOP') : def.label;
    if (labelText) this._createLabel(labelText);

    this.group.position.set(this.x, this.y, 0);
  }

  _buildSprite(icon, size, z, opacity) {
    const tex = getTexture(icon);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: opacity ?? 1 });
    this.mesh = new THREE.Sprite(mat);
    this.mesh.scale.set(size[0], size[1], 1);
    this.mesh.position.z = z ?? 1.5;
    this.group.add(this.mesh);
  }

  _buildNote() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5e6c8';
    ctx.fillRect(6, 4, 20, 24);
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(6, 4, 20, 24);
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    for (let ly = 10; ly <= 24; ly += 4) {
      ctx.beginPath();
      ctx.moveTo(9, ly);
      ctx.lineTo(23, ly);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    this.mesh = new THREE.Sprite(mat);
    this.mesh.scale.set(24, 24, 1);
    this.mesh.position.z = 1.5;
    this.group.add(this.mesh);
  }

  _createLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 24px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 128, 28);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const label = new THREE.Sprite(mat);
    label.scale.set(100, 15, 1);
    label.position.set(0, this.radius + 20, 3);
    this.group.add(label);
    this._label = label;
    this._labelCanvas = canvas;
  }

  updateLabel(text) {
    if (!this._labelCanvas) return;
    const ctx = this._labelCanvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 40);
    ctx.font = 'bold 24px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 128, 28);
    this._label.material.map.needsUpdate = true;
  }

  cutTree() {
    if (this.type !== 'tree' || this.isCut) return;
    this.isCut = true;
    const tex = getTexture('/images/world/tree_cut.png');
    this.mesh.material.map = tex;
    this.mesh.material.needsUpdate = true;
  }

  breakRock() {
    if (this.type !== 'rock' || this.isBroken) return;
    this.isBroken = true;
  }

  addToScene(scene) {
    scene.add(this.group);
  }

  removeFromScene(scene) {
    scene.remove(this.group);
  }

  onPickup(agent) {
    if (this.type === 'coin') {
      agent.coins += 1;
    } else if (this.type === 'health_pack') {
      agent.healthPacks = (agent.healthPacks || 0) + 1;
    } else if (this.type === 'note') {
      if (this.noteText) {
        agent.incomingMessages.push({ from: 'SYSTEM', message: `You found a note: "${this.noteText}"` });
        agent.memory.push(`Found note: ${this.noteText}`);
        if (agent.memory.length > 15) agent.memory.shift();
      }
    } else if (this.type === 'axe') {
      agent.hasAxe = true;
      agent.incomingMessages.push({ from: 'SYSTEM', message: 'You picked up an axe!' });
    } else if (this.type === 'hammer') {
      agent.hasHammer = true;
      agent.incomingMessages.push({ from: 'SYSTEM', message: 'You picked up a hammer!' });
    } else if (this.type === 'wood') {
      agent.wood = (agent.wood || 0) + 1;
    } else if (this.type === 'key') {
      agent.keys = (agent.keys || 0) + 1;
      agent.incomingMessages.push({ from: 'SYSTEM', message: 'You picked up a key! Interesting... What is it for?' });
    } else if (this.type === 'treasure') {
      // Treasures require the open_treasure action, not auto-pickup
      return false;
    }
    return true;
  }
}
