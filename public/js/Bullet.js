import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const bulletTex = loader.load('/images/bullet.png');
bulletTex.magFilter = THREE.NearestFilter;
bulletTex.minFilter = THREE.NearestFilter;

export class Bullet {
  constructor(config) {
    this.x = config.x;
    this.y = config.y;
    this.dirX = config.dirX;
    this.dirY = config.dirY;
    this.speed = config.speed || 350;
    this.damage = config.damage || 10;
    this.radius = 4;
    this.owner = config.owner;
    this.target = config.target || null;
    this.autoHit = config.autoHit || false;

    const mat = new THREE.SpriteMaterial({ map: bulletTex, transparent: true });
    this.mesh = new THREE.Sprite(mat);
    this.mesh.scale.set(14, 14, 1);
    this.mesh.position.set(this.x, this.y, 2.5);

    // Trail
    const trailGeo = new THREE.CircleGeometry(2, 8);
    const trailMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(config.color || '#ffffff'),
      transparent: true,
      opacity: 0.4,
    });
    this.trail = new THREE.Mesh(trailGeo, trailMat);
    this.trail.position.set(this.x - this.dirX * 8, this.y - this.dirY * 8, 2.4);
  }

  addToScene(scene) {
    scene.add(this.mesh);
    scene.add(this.trail);
  }

  removeFromScene(scene) {
    scene.remove(this.mesh);
    scene.remove(this.trail);
  }

  update(dt) {
    // Home in on target if auto-hit
    if (this.autoHit && this.target && !this.target.dead) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        this.dirX = dx / dist;
        this.dirY = dy / dist;
      }
    }
    this.x += this.dirX * this.speed * dt;
    this.y += this.dirY * this.speed * dt;
    this.mesh.position.set(this.x, this.y, 2.5);
    this.trail.position.set(this.x - this.dirX * 10, this.y - this.dirY * 10, 2.4);
  }
}
