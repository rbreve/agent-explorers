import { Item } from './Item.js';

export const DEFAULT_INVENTORY = [
  { name: 'health_potion',   price: 2,  description: 'Restore 30 health points instantly' },
  { name: 'wood',            price: 3,  description: 'Wood for 3 coins per wood' },
  { name: 'bullets',         price: 5,  description: '5 bullets for your gun (costs 5 coins)' },
  { name: 'max_health_up',   price: 5,  description: '+25 max HP (also heals 25) Will allow to take more damage' },
  { name: 'firepower_up',    price: 5,  description: '+5 attack damage per bullet' },
  { name: 'speed_up',        price: 4,  description: '+25 movement speed' },
  { name: 'reach_up',        price: 3,  description: '+50 Will allow to see further away for coins and items' },
  { name: 'trap',            price: 4,  description: 'A hidden trap — place it to deal 40 damage to anyone who steps on it' },
  { name: 'axe',             price: 3, description: 'An axe — needed to cut down trees for wood' },
  { name: 'hammer',          price: 3,  description: 'A hammer — needed to break rocks' },
  { name: 'sell_wood',       price: 3,  description: 'Sell wood for 3 coins per wood' },
  { name: 'sell_bullets',    price: 1,  description: 'Sell bullets for 1 coin each' },
  { name: 'lottery_ticket',  price: 1,  description: 'A lottery ticket for 1 coin each you can win big!!' },
];

export class Shop extends Item {
  constructor(config = {}) {
    super({
      type: 'shop',
      x: config.x ?? 600,
      y: config.y ?? 400,
      shopInventory: config.shopInventory || DEFAULT_INVENTORY,
    });
    this.shopName = config.name || 'General Store';
  }
}
