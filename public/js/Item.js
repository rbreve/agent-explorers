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

export class Item {
  constructor(config) {
    this.type = config.type || 'coin';
    this.x = config.x;
    this.y = config.y;
    this.radius = config.radius || 8;
    this.shopInventory = config.shopInventory || null;
    this.noteText = config.noteText || null;
    this.owner = config.owner || null; // who placed this (for traps)
    this.trapDamage = config.trapDamage || 40;
    this.isCut = false; // for trees
    this.group = new THREE.Group();
    this._build();
  }

  _build() {
    if (this.type === 'coin') {
      const tex = getTexture('/images/coin.png');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      this.mesh = new THREE.Sprite(mat);
      this.mesh.scale.set(18, 18, 1);
      this.mesh.position.z = 1.5;
      this.group.add(this.mesh);
    } else if (this.type === 'health_pack') {
      const tex = getTexture('/images/health_flask.png');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      this.mesh = new THREE.Sprite(mat);
      this.mesh.scale.set(20, 20, 1);
      this.mesh.position.z = 1.5;
      this.group.add(this.mesh);
    } else if (this.type === 'key') {
      const tex = getTexture('/images/key.png');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      this.mesh = new THREE.Sprite(mat);
      this.mesh.scale.set(20, 20, 1);
      this.mesh.position.z = 1.5;
      this.group.add(this.mesh);
    } else if (this.type === 'treasure') {
      this.radius = 15;
      const tex = getTexture('/images/lock.png');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      this.mesh = new THREE.Sprite(mat);
      this.mesh.scale.set(30, 30, 1);
      this.mesh.position.z = 1.5;
      this.group.add(this.mesh);
      this._createLabel('TREASURE');
    } else if (this.type === 'note') {
      this.radius = 12;
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      // Draw a scroll/note icon
      ctx.fillStyle = '#f5e6c8';
      ctx.fillRect(6, 4, 20, 24);
      ctx.strokeStyle = '#8b7355';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(6, 4, 20, 24);
      // Lines on the note
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
      this._createLabel('NOTE');
    } else if (this.type === 'axe') {
      const tex = getTexture('/images/axe.png');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      this.mesh = new THREE.Sprite(mat);
      this.mesh.scale.set(22, 22, 1);
      this.mesh.position.z = 1.5;
      this.group.add(this.mesh);
    } else if (this.type === 'hammer') {
      const tex = getTexture('/images/hammer.png');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      this.mesh = new THREE.Sprite(mat);
      this.mesh.scale.set(22, 22, 1);
      this.mesh.position.z = 1.5;
      this.group.add(this.mesh);
    } else if (this.type === 'wood') {
      const tex = getTexture('/images/wood.png');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      this.mesh = new THREE.Sprite(mat);
      this.mesh.scale.set(20, 20, 1);
      this.mesh.position.z = 1.5;
      this.group.add(this.mesh);
    } else if (this.type === 'tree') {
      this.radius = 18;
      const tex = getTexture('/images/world/tree.png');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      this.mesh = new THREE.Sprite(mat);
      this.mesh.scale.set(50, 50, 1);
      this.mesh.position.z = 1.2;
      this.group.add(this.mesh);
    } else if (this.type === 'trap') {
      this.radius = 12;
      const tex = getTexture('/images/trap.png');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.4 });
      this.mesh = new THREE.Sprite(mat);
      this.mesh.scale.set(22, 22, 1);
      this.mesh.position.z = 0.8; // below agents
      this.group.add(this.mesh);
    } else if (this.type === 'shop') {
      this.radius = 30;
      const tex = getTexture('/images/store.png');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      this.mesh = new THREE.Sprite(mat);
      this.mesh.scale.set(60, 60, 1);
      this.mesh.position.z = 1;
      this.group.add(this.mesh);
      this._createLabel('SHOP');
    }
    this.group.position.set(this.x, this.y, 0);
  }

  _createLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 24px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 64, 28);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const label = new THREE.Sprite(mat);
    label.scale.set(50, 15, 1);
    label.position.set(0, this.radius + 20, 3);
    this.group.add(label);
  }

  cutTree() {
    if (this.type !== 'tree' || this.isCut) return;
    this.isCut = true;
    const tex = getTexture('/images/world/tree_cut.png');
    this.mesh.material.map = tex;
    this.mesh.material.needsUpdate = true;
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
