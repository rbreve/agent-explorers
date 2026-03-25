import * as THREE from 'three';
import { Item } from './Item.js';

export class Spider {
  constructor(config) {
    this.x = config.x;
    this.y = config.y;
    this.radius = 10;
    this.health = config.health ?? 20;
    this.damage = config.damage ?? 2;
    this.speed = config.speed ?? 20;
    this.contactCooldown = 5.0; // seconds between contact damage
    this.contactTimer = 0;
    this.dead = false;

    // Wander target
    this.targetX = this.x;
    this.targetY = this.y;
    this.wanderTimer = 0;

    this.group = new THREE.Group();
    this._build();
  }

  _build() {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/images/spider.png');
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    this.mesh = new THREE.Sprite(mat);
    const size = this.radius * 2.5;
    this.mesh.scale.set(size, size, 1);
    this.mesh.position.z = 1.8;
    this.group.add(this.mesh);

    this.group.position.set(this.x, this.y, 0);
  }

  addToScene(scene) {
    scene.add(this.group);
  }

  removeFromScene(scene) {
    scene.remove(this.group);
  }

  takeDamage(amount, world, killer) {
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.mesh.material.opacity = 0.3;
      if (world) {
        this._dropLoot(world);
        // Leave a corpse
        world.addItem(new Item({
          type: 'dead_spider',
          x: this.x,
          y: this.y,
        }));
        // Broadcast spider kill
        const killerName = killer?.name || 'unknown';
        const killMsg = `${killerName} killed a spider! Loot dropped at (${Math.round(this.x)}, ${Math.round(this.y)}).`;
        for (const agent of world.agents) {
          if (agent.dead) continue;
          agent.incomingMessages.push({ from: 'SYSTEM', message: killMsg });
        }
      }
    }
  }

  _dropLoot(world) {
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI * 2 * i) / 3 + Math.random() * 0.5;
      const dist = 15 + Math.random() * 20;
      world.addItem(new Item({
        type: 'coin',
        x: this.x + Math.cos(angle) * dist,
        y: this.y + Math.sin(angle) * dist,
      }));
    }
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI * 2 * i) / 3 + Math.random() * 0.5 + Math.PI;
      const dist = 15 + Math.random() * 20;
      world.addItem(new Item({
        type: 'health_pack',
        x: this.x + Math.cos(angle) * dist,
        y: this.y + Math.sin(angle) * dist,
      }));
    }
  }

  update(dt, world) {
    if (this.dead) return;

    this.contactTimer = Math.max(0, this.contactTimer - dt);

    // Wander
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.targetX = Math.max(20, Math.min(world.width - 20, this.x + (Math.random() - 0.5) * 200));
      this.targetY = Math.max(20, Math.min(world.height - 20, this.y + (Math.random() - 0.5) * 200));
      this.wanderTimer = 2 + Math.random() * 3;
    }

    // Chase nearest agent if close
    let chaseTarget = null;
    let closestDist = 120;
    for (const agent of world.agents) {
      if (agent.dead || agent.agentType === 'shop') continue;
      const dist = Math.hypot(agent.x - this.x, agent.y - this.y);
      if (dist < closestDist) {
        closestDist = dist;
        chaseTarget = agent;
      }
    }

    const moveToX = chaseTarget ? chaseTarget.x : this.targetX;
    const moveToY = chaseTarget ? chaseTarget.y : this.targetY;

    const dx = moveToX - this.x;
    const dy = moveToY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const moveSpeed = chaseTarget ? this.speed * 1.3 : this.speed;
      this.x += (dx / dist) * moveSpeed * dt;
      this.y += (dy / dist) * moveSpeed * dt;
    }

    // Push out of agents — don't overlap
    for (const agent of world.agents) {
      if (agent.dead || agent.insideHouse) continue;
      const adx = this.x - agent.x;
      const ady = this.y - agent.y;
      const adist = Math.hypot(adx, ady);
      const minDist = this.radius + agent.radius;
      if (adist < minDist && adist > 0) {
        const push = (minDist - adist);
        this.x += (adx / adist) * push;
        this.y += (ady / adist) * push;
      }
    }

    // Clamp to world
    this.x = Math.max(this.radius, Math.min(world.width - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(world.height - this.radius, this.y));

    this.group.position.set(this.x, this.y, 0);
  }
}
