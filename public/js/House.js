import { Item } from './Item.js';

export const HOUSE_WOOD_COST = 5;
export const HOUSE_HEAL_RATE = 3; // HP per second while inside

export class House extends Item {
  constructor(config = {}) {
    super({
      type: 'house',
      x: config.x ?? 400,
      y: config.y ?? 400,
      owner: config.owner || null,
    });
    this.occupant = null;
    this.healRate = config.healRate ?? HOUSE_HEAL_RATE;
    this._createLabel(`${config.owner?.name || '???'}'s House`);
  }

  enter(agent) {
    if (this.occupant) return false;
    if (this.owner !== agent) return false;
    this.occupant = agent;
    this.updateLabel(`${agent.name}'s House (inside)`);
    return true;
  }

  exit() {
    if (!this.occupant) return;
    this.updateLabel(`${this.occupant.name}'s House`);
    this.occupant = null;
  }
}
