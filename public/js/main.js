import { World } from './World.js';
import { Agent } from './Agent.js';
import { Item } from './Item.js';
import { Spider } from './Spider.js';
import { Shop, DEFAULT_INVENTORY } from './Shop.js';

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

  const enableInstincts = document.getElementById('agent-instincts').checked;

  const agent = new Agent({
    name,
    model,
    provider,
    ollamaUrl,
    color,
    temperature,
    friends,
    enableInstincts,
    systemPrompt: prompt,
    x: 100 + Math.random() * (world.width - 200),
    y: 100 + Math.random() * (world.height - 200),
  });
  world.addAgent(agent);
  addLog(name, 'Entered the arena', color);
});

// Add shop
btnAddShop.addEventListener('click', () => {
  const shop = new Shop({ x: world.width / 2, y: world.height / 2 });
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

// Spawn rock cluster helper
function spawnRockCluster() {
  const cx = 80 + Math.random() * (world.width - 160);
  const cy = 80 + Math.random() * (world.height - 160);
  const spacing = 35;
  const goldIdx = Math.floor(Math.random() * 9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      world.addItem(new Item({
        type: 'rock',
        hasGold: true,
        x: cx + (col - 1) * spacing,
        y: cy + (row - 1) * spacing,
      }));
    }
  }
}

const btnAddRocks = document.getElementById('btn-add-rocks');
btnAddRocks.addEventListener('click', () => {
  spawnRockCluster();
  addLog('World', 'A rock cluster appeared! One might contain gold...', '#888888');
});

// Spawn apple tree
const btnAddAppleTree = document.getElementById('btn-add-appletree');
btnAddAppleTree.addEventListener('click', () => {
  const appleTree = new Item({
    type: 'apple_tree',
    x: 50 + Math.random() * (world.width - 100),
    y: 50 + Math.random() * (world.height - 100),
  });
  world.addItem(appleTree);
  addLog('World', 'An apple tree appeared!', '#ff4444');
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
let lastSelectedAgent = null;
function updateInfoPanel() {
  const agent = world.selectedAgent;
  if (!agent) {
    agentInfoDiv.textContent = 'Click an agent to see info';
    lastSelectedAgent = null;
    return;
  }
  if (lastSelectedAgent !== agent) {
    lastSelectedAgent = agent;
    agentInfoDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  const s = agent.stats;
  const rels = Object.entries(agent.relationships)
    .map(([name, rel]) => `  ${name}: ${rel}`)
    .join('\n') || '  (none)';
  agentInfoDiv.textContent =
    `Name: ${agent.name}  [${agent.dead ? 'DEAD' : 'alive'}]\n` +
    `Model: ${agent.model}\n` +
    `Coins: ${agent.coins}  Health Potions: ${agent.healthPacks}  Bullets: ${agent.bullets}  Keys: ${agent.keys}  Traps: ${agent.traps}  Wood: ${agent.wood}  Apples: ${agent.apples}\n` +
    `Tools: ${[agent.hasAxe ? 'Axe' : '', agent.hasHammer ? 'Hammer' : ''].filter(Boolean).join(', ') || 'none'}\n` +
    `--- Stats ---\n` +
    `HEALTH (important):        ${agent.health}/${s.maxHealth.value} (lv${s.maxHealth.level})\n` +
    `Firepower: ${s.firepower.value} (lv${s.firepower.level})\n` +
    `Speed:     ${s.speed.value} (lv${s.speed.level})\n` +
    `Reach:     ${s.reach.value} (lv${s.reach.level})\n` +
    `Bullet Spd:${s.bulletSpeed.value} (lv${s.bulletSpeed.level})\n` +
    `Inventory: ${agent.inventory.join(', ') || 'empty'}\n` +
    `Pos: (${Math.round(agent.x)}, ${Math.round(agent.y)})\n` +
    `Stress: ${agent.stress}/10\n` +
    `Goals:\n` +
    `  HIGH: ${agent.goals.high || '(none)'}\n` +
    `  MID:  ${agent.goals.mid || '(none)'}\n` +
    `  LOW:  ${agent.goals.low || '(none)'}\n` +
    `Relationships:\n${rels}\n` +
    `House: ${agent.insideHouse ? 'INSIDE (healing)' : 'not inside'}\n` +
    `Instincts: ${agent.enableInstincts ? (agent.instincts.length > 0 ? agent.instincts.map(i => i.trigger).join(', ') : 'none set') : 'disabled'}\n` +
    `Thought: ${agent.lastDecision?.thought || '...'}\n` +
    `Saying: ${agent.currentSpeech || '(nothing)'}`;
}

// Shop editor
const shopEditorSection = document.getElementById('shop-editor-section');
const shopEditorDiv = document.getElementById('shop-editor');
let lastEditedShop = null;

function updateShopEditor() {
  const shop = world.selectedShop;
  if (!shop) {
    shopEditorSection.style.display = 'none';
    lastEditedShop = null;
    return;
  }
  shopEditorSection.style.display = '';
  if (lastEditedShop === shop) return; // already showing this shop
  lastEditedShop = shop;
  shopEditorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  shopEditorDiv.innerHTML = '';

  // Shop name input
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = shop.shopName || 'General Store';
  nameInput.placeholder = 'Shop name...';
  nameInput.style.marginBottom = '6px';
  nameInput.addEventListener('input', () => {
    shop.shopName = nameInput.value;
    shop.updateLabel(nameInput.value);
  });
  shopEditorDiv.appendChild(nameInput);

  for (const item of DEFAULT_INVENTORY) {
    const enabled = shop.shopInventory.some(si => si.name === item.name);
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = enabled;
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!shop.shopInventory.some(si => si.name === item.name)) {
          shop.shopInventory.push({ ...item });
        }
      } else {
        shop.shopInventory = shop.shopInventory.filter(si => si.name !== item.name);
      }
    });
    label.appendChild(cb);
    label.append(` ${item.name.replace(/_/g, ' ')} `);
    const priceSpan = document.createElement('span');
    priceSpan.className = 'shop-item-price';
    priceSpan.textContent = `(${item.price} coins)`;
    label.appendChild(priceSpan);
    shopEditorDiv.appendChild(label);
  }
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
      const key = `${d.action}|${d.target || d.to || ''}|${d.message || ''}|${d.items || d.item || ''}`;
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
          case 'give':
          case 'give_coins':
          case 'give_bullets':
          case 'give_healthpack':
            addLog(agent.name, `[GIVE] ${d.amount} ${d.item || d.action.replace('give_', '')} -> ${d.to}`, '#ffdd44');
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
          case 'break_rock':
            addLog(agent.name, `[ROCK] breaking a rock`, '#888888');
            break;
          case 'get_apple':
            addLog(agent.name, `[APPLE] picked an apple`, '#ff4444');
            break;
          case 'eat_apple':
            addLog(agent.name, `[APPLE] ate an apple`, '#44ff88');
            break;
          case 'grab':
          case 'get':
          case 'take':
            addLog(agent.name, `[GRAB] picked up ${d.item || 'an item'}`, '#ddaa00');
            break;
          case 'build_house':
            addLog(agent.name, `[HOUSE] built a house!`, '#8B5E3C');
            break;
          case 'enter_house':
            addLog(agent.name, `[HOUSE] entered their house`, '#8B5E3C');
            break;
          case 'exit_house':
            addLog(agent.name, `[HOUSE] left their house`, '#8B5E3C');
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
  updateShopEditor();
  checkAgentThoughts();

  // Flush world events to log
  for (const evt of world.eventLog) {
    if (evt.type === 'spider_kill') {
      addLog(evt.killer, `killed a spider at (${evt.x}, ${evt.y})!`, evt.color);
    }
  }
  world.eventLog.length = 0;

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

// Spawn initial rock clusters
for (let c = 0; c < 2; c++) {
  spawnRockCluster();
}
