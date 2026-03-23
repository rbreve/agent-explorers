import { World } from './World.js';
import { Agent } from './Agent.js';
import { Item } from './Item.js';
import { Spider } from './Spider.js';

const canvas = document.getElementById('game-canvas');
const world = new World(canvas);

// UI references
const btnAddAgent = document.getElementById('btn-add-agent');
const btnAddShop = document.getElementById('btn-add-shop');
const btnAddCoins = document.getElementById('btn-add-coins');
const btnAddHealth = document.getElementById('btn-add-health');
const btnPause = document.getElementById('btn-pause');
const toggleAwareness = document.getElementById('toggle-awareness');
const toggleLogs = document.getElementById('toggle-logs');
const agentInfoDiv = document.getElementById('agent-info');
const agentLogsDiv = document.getElementById('agent-logs');

// Load server config defaults
fetch('/api/config').then(r => r.json()).then(cfg => {
  document.getElementById('ollama-url').value = cfg.ollamaUrl || 'http://localhost:11434';
  if (cfg.ollamaModel) document.getElementById('agent-ollama-model').value = cfg.ollamaModel;
}).catch(() => {});

// Provider toggle: show/hide model dropdown vs ollama model input
const agentProvider = document.getElementById('agent-provider');
const agentModelSelect = document.getElementById('agent-model');
const agentOllamaModel = document.getElementById('agent-ollama-model');
agentProvider.addEventListener('change', () => {
  const isOllama = agentProvider.value === 'ollama';
  agentModelSelect.style.display = isOllama ? 'none' : '';
  agentOllamaModel.style.display = isOllama ? '' : 'none';
});

// Add agent
btnAddAgent.addEventListener('click', () => {
  const name = document.getElementById('agent-name').value || `Agent-${world.agents.length + 1}`;
  const provider = agentProvider.value;
  const model = provider === 'ollama'
    ? agentOllamaModel.value || 'llama3'
    : agentModelSelect.value;
  const color = document.getElementById('agent-color').value;
  const prompt = document.getElementById('agent-prompt').value;
  const temperature = parseFloat(document.getElementById('agent-temperature').value) || 0.9;
  const friendsRaw = document.getElementById('agent-friends').value;
  const friends = friendsRaw ? friendsRaw.split(',').map(f => f.trim()).filter(Boolean) : [];
  const ollamaUrl = provider === 'ollama'
    ? (document.getElementById('ollama-url').value || 'http://localhost:11434')
    : null;

  const agent = new Agent({
    name,
    model,
    provider,
    ollamaUrl,
    color,
    temperature,
    friends,
    systemPrompt: prompt,
    x: 100 + Math.random() * (world.width - 200),
    y: 100 + Math.random() * (world.height - 200),
  });
  world.addAgent(agent);
  addLog(name, 'Entered the arena', color);
});

// Add shop
btnAddShop.addEventListener('click', () => {
  const shop = new Item({
    type: 'shop',
    x: world.width / 2,
    y: world.height / 2,
    shopInventory: [
      { name: 'health_potion',   price: 3,  description: 'Restore 30 health points instantly' },
      { name: 'wood',            price: 3,  description: 'Wood for 3 coins per wood' },
      { name: 'bullets',         price: 2,  description: '5 bullets for your gun' },
      { name: 'max_health_up',   price: 5,  description: '+25 max HP (also heals 25) Will allow to take more damage' },
      { name: 'firepower_up',    price: 5,  description: '+5 attack damage per bullet' },
      { name: 'speed_up',        price: 4,  description: '+25 movement speed' },
      { name: 'reach_up',        price: 6,  description: '+50 Will allow to see further away for coins and items' },
      { name: 'bullet_speed_up', price: 4,  description: '+60 bullet travel speed' },
      { name: 'trap',            price: 4,  description: 'A hidden trap — place it to deal 40 damage to anyone who steps on it' },
      { name: 'axe',             price: 10,  description: 'An axe — needed to cut down trees for wood' },
      { name: 'hammer',          price: 3,  description: 'A hammer' },
      { name: 'sell_wood',       price: 3,  description: 'Sell wood for 3 coins per wood' },
      { name: 'sell_bullets',    price: 1,  description: 'Sell bullets for 1 coin each' },
    ],
  });
  world.addItem(shop);
  addLog('World', 'Shop opened!', '#886644');
});

// Spawn coins
btnAddCoins.addEventListener('click', () => {
  for (let i = 0; i < 5; i++) {
    const coin = new Item({
      type: 'coin',
      x: 50 + Math.random() * (world.width - 100),
      y: 50 + Math.random() * (world.height - 100),
    });
    world.addItem(coin);
  }
  addLog('World', '5 coins spawned', '#ffdd44');
});

// Spawn health pack
btnAddHealth.addEventListener('click', () => {
  const hp = new Item({
    type: 'health_pack',
    x: 50 + Math.random() * (world.width - 100),
    y: 50 + Math.random() * (world.height - 100),
  });
  world.addItem(hp);
  addLog('World', 'Health pack spawned', '#44ff88');
});

// Spawn spider
const btnAddSpider = document.getElementById('btn-add-spider');
btnAddSpider.addEventListener('click', () => {
  const spider = new Spider({
    x: 50 + Math.random() * (world.width - 100),
    y: 50 + Math.random() * (world.height - 100),
  });
  world.addSpider(spider);
  addLog('World', 'A spider appeared!', '#660044');
});

// Spawn treasure + key
const btnAddTreasure = document.getElementById('btn-add-treasure');
btnAddTreasure.addEventListener('click', () => {
  const treasure = new Item({
    type: 'treasure',
    x: 50 + Math.random() * (world.width - 100),
    y: 50 + Math.random() * (world.height - 100),
  });
  const key = new Item({
    type: 'key',
    x: 50 + Math.random() * (world.width - 100),
    y: 50 + Math.random() * (world.height - 100),
  });
  world.addItem(treasure);
  world.addItem(key);
  addLog('World', 'A treasure chest and key appeared!', '#ddaa00');
});

// Add tree
const btnAddTree = document.getElementById('btn-add-tree');
btnAddTree.addEventListener('click', () => {
  const tree = new Item({
    type: 'tree',
    x: 50 + Math.random() * (world.width - 100),
    y: 50 + Math.random() * (world.height - 100),
  });
  world.addItem(tree);
  addLog('World', 'A tree appeared!', '#2d8a4e');
});

// Add axe
const btnAddAxe = document.getElementById('btn-add-axe');
btnAddAxe.addEventListener('click', () => {
  const axe = new Item({
    type: 'axe',
    x: 50 + Math.random() * (world.width - 100),
    y: 50 + Math.random() * (world.height - 100),
  });
  world.addItem(axe);
  addLog('World', 'An axe appeared!', '#aa6633');
});

// Spawn note
const btnAddNote = document.getElementById('btn-add-note');
btnAddNote.addEventListener('click', () => {
  const noteInput = document.getElementById('note-text');
  const text = noteInput.value.trim();
  if (!text) return;
  const note = new Item({
    type: 'note',
    noteText: text,
    x: 50 + Math.random() * (world.width - 100),
    y: 50 + Math.random() * (world.height - 100),
  });
  world.addItem(note);
  addLog('World', `Note dropped: "${text}"`, '#f5e6c8');
  noteInput.value = '';
});

// Pause
btnPause.addEventListener('click', () => {
  world.paused = !world.paused;
  btnPause.textContent = world.paused ? 'Resume' : 'Pause / Resume';
});

// Toggles
toggleAwareness.addEventListener('change', (e) => {
  world.showAwareness = e.target.checked;
});

const toggleThoughts = document.getElementById('toggle-thoughts');
toggleThoughts.addEventListener('change', (e) => {
  world.showThoughts = e.target.checked;
  // Hide all existing thought bubbles when toggled off
  if (!e.target.checked) {
    for (const agent of world.agents) {
      if (agent.thoughtBubble) {
        agent.thoughtBubble.visible = false;
        agent.thoughtBubble.material.opacity = 0;
      }
    }
  }
});

toggleLogs.addEventListener('change', (e) => {
  world.showLogs = e.target.checked;
  agentLogsDiv.style.display = e.target.checked ? 'block' : 'none';
});

// Agent info panel update
function updateInfoPanel() {
  const agent = world.selectedAgent;
  if (!agent) {
    agentInfoDiv.textContent = 'Click an agent to see info';
    return;
  }
  const s = agent.stats;
  const rels = Object.entries(agent.relationships)
    .map(([name, rel]) => `  ${name}: ${rel}`)
    .join('\n') || '  (none)';
  agentInfoDiv.textContent =
    `Name: ${agent.name}  [${agent.dead ? 'DEAD' : 'alive'}]\n` +
    `Model: ${agent.model}\n` +
    `Coins: ${agent.coins}  HP Packs: ${agent.healthPacks}  Bullets: ${agent.bullets}  Keys: ${agent.keys}  Traps: ${agent.traps}  Wood: ${agent.wood}\n` +
    `Tools: ${[agent.hasAxe ? 'Axe' : '', agent.hasHammer ? 'Hammer' : ''].filter(Boolean).join(', ') || 'none'}\n` +
    `--- Stats ---\n` +
    `HP:        ${agent.health}/${s.maxHealth.value} (lv${s.maxHealth.level})\n` +
    `Firepower: ${s.firepower.value} (lv${s.firepower.level})\n` +
    `Speed:     ${s.speed.value} (lv${s.speed.level})\n` +
    `Reach:     ${s.reach.value} (lv${s.reach.level})\n` +
    `Bullet Spd:${s.bulletSpeed.value} (lv${s.bulletSpeed.level})\n` +
    `Inventory: ${agent.inventory.join(', ') || 'empty'}\n` +
    `Pos: (${Math.round(agent.x)}, ${Math.round(agent.y)})\n` +
    `Goal: ${agent.currentGoal || agent.systemPrompt.slice(0, 50) + '...'}\n` +
    `Relationships:\n${rels}\n` +
    `Thought: ${agent.lastDecision?.thought || '...'}\n` +
    `Saying: ${agent.currentSpeech || '(nothing)'}`;
}

// Logging
function addLog(name, message, color) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-name" style="color:${color}">${name}</span>: ${message}`;
  agentLogsDiv.prepend(entry);
  // Keep max 50 entries
  while (agentLogsDiv.children.length > 50) {
    agentLogsDiv.removeChild(agentLogsDiv.lastChild);
  }
}

// Track agent decisions for logging (dedup by action+target+thought)
let lastDecisionKeys = new Map();

function checkAgentThoughts() {
  for (const agent of world.agents) {
    if (agent.lastDecision?.thought) {
      const d = agent.lastDecision;
      const key = `${d.action}|${d.target || d.to || ''}|${d.thought}`;
      const prev = lastDecisionKeys.get(agent.name);
      if (prev !== key) {
        lastDecisionKeys.set(agent.name, key);
        switch (d.action) {
          case 'send_message':
          case 'talk':
            addLog(agent.name, `-> ${d.to}: "${d.message}"`, agent.color);
            break;
          case 'attack':
            addLog(agent.name, `[ATTACK] fired at ${d.target || `(${d.targetX},${d.targetY})`}`, '#ff4444');
            break;
          case 'buy': {
            const bought = d.items ? d.items.join(', ') : d.item;
            addLog(agent.name, `[BUY] ${bought} from shop`, '#aa8855');
            break;
          }
          case 'give_coins':
            addLog(agent.name, `[GIVE] ${d.amount} coins -> ${d.to}`, '#ffdd44');
            break;
          case 'give_bullets':
            addLog(agent.name, `[GIVE] ${d.amount} bullet(s) -> ${d.to}`, '#ff6644');
            break;
          case 'give_healthpack':
            addLog(agent.name, `[GIVE] ${d.amount} healthpack(s) -> ${d.to}`, '#44ff88');
            break;
          case 'sell_bullets':
            addLog(agent.name, `[SELL] ${d.amount} bullet(s) for coins`, '#ff6644');
            break;
          case 'sell_wood':
            addLog(agent.name, `[SELL] ${d.amount} wood for coins`, '#2d8a4e');
            break;
          case 'trade':
            addLog(agent.name, `[TRADE] ${d.offer?.amount} ${d.offer?.type} <-> ${d.request?.amount} ${d.request?.type} with ${d.to}`, '#dd88ff');
            break;
          case 'use_healthpack':
            addLog(agent.name, `[HEAL] used a health pack`, '#44ff88');
            break;
          case 'place_trap':
            addLog(agent.name, `[TRAP] placed a hidden trap!`, '#cc4400');
            break;
          case 'open_treasure':
            addLog(agent.name, `[TREASURE] trying to open a treasure chest`, '#ddaa00');
            break;
          case 'cut_tree':
            addLog(agent.name, `[TREE] cutting down a tree`, '#2d8a4e');
            break;
          default:
            break;
        }
      }
    }
  }
}

// Game loop
let lastTime = performance.now();
function gameLoop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05); // cap dt
  lastTime = time;

  world.update(dt);
  updateInfoPanel();
  checkAgentThoughts();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

// Spawn some initial coins
for (let i = 0; i < 8; i++) {
  world.addItem(new Item({
    type: 'coin',
    x: 50 + Math.random() * (world.width - 100),
    y: 50 + Math.random() * (world.height - 100),
  }));
}

// Spawn initial trees
for (let i = 0; i < 12; i++) {
  world.addItem(new Item({
    type: 'tree',
    x: 40 + Math.random() * (world.width - 80),
    y: 40 + Math.random() * (world.height - 80),
  }));
}
