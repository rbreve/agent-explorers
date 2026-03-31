import { World } from './World.js';
import { Agent } from './Agent.js';
import { Item } from './Item.js';
import { Spider } from './Spider.js';
import { Shop, DEFAULT_INVENTORY } from './Shop.js';
import { Grid } from './Grid.js';
import { Zone } from './Zone.js';
import { Spawner } from './Spawner.js';
import { SceneLoader } from './SceneLoader.js';

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

// Load server config defaults and populate provider dropdown based on available keys
fetch('/api/config').then(r => r.json()).then(cfg => {
  const ollamaUrlInput = document.getElementById('ollama-url');
  if (ollamaUrlInput) {
    ollamaUrlInput.value = cfg.ollamaUrl || 'http://localhost:11434';
  }
  if (cfg.ollamaModel) document.getElementById('agent-ollama-model').value = cfg.ollamaModel;

  // Build provider dropdown based on which API keys are set
  const providerSelect = document.getElementById('agent-provider');
  const apiNotice = document.getElementById('api-key-notice');
  const providers = [];
  if (cfg.hasOpenRouterKey) providers.push({ value: 'openrouter', label: 'OpenRouter' });
  if (cfg.hasOpenAIKey) providers.push({ value: 'openai', label: 'OpenAI' });
  if (cfg.hasAnthropicKey) providers.push({ value: 'anthropic', label: 'Anthropic' });
  providers.push({ value: 'ollama', label: 'Ollama' });

  providerSelect.innerHTML = providers.map(p => `<option value="${p.value}">${p.label}</option>`).join('');

  // Show notice only if config confirms no cloud API keys are configured
  const hasAnyKey = cfg.hasOpenRouterKey || cfg.hasOpenAIKey || cfg.hasAnthropicKey;
  apiNotice.style.display = (hasAnyKey || !('hasOpenRouterKey' in cfg)) ? 'none' : '';

  // Enable/disable Create Random World based on available providers
  const btnLoadScene = document.getElementById('btn-load-scene');
  if (btnLoadScene) {
    if (hasAnyKey) {
      btnLoadScene.disabled = false;
      btnLoadScene.title = '';
    } else {
      btnLoadScene.disabled = true;
      btnLoadScene.title = 'Add an API key in your .env file first';
    }
  }

  // Trigger change to populate model list for the default provider
  providerSelect.dispatchEvent(new Event('change'));
}).catch(() => {});

// Provider toggle: show/hide model dropdown vs ollama model input
const agentProvider = document.getElementById('agent-provider');
const agentModelSelect = document.getElementById('agent-model');
const agentOllamaModel = document.getElementById('agent-ollama-model');
const AGENT_COLORS = ['#ff6b57', '#57b7ff', '#5bff8a', '#ffd166', '#d97bff', '#ffffff'];

function getDefaultAgentColor(agentCount) {
  return AGENT_COLORS[agentCount % AGENT_COLORS.length];
}

const PROVIDER_MODELS = {
  openrouter: [
    'google/gemini-2.5-flash-lite', 'google/gemini-3.1-flash-lite-preview','openai/gpt-oss-120b', 
    'minimax/minimax-m2.7', 'deepseek/deepseek-v3.2', 'x-ai/grok-4.1-fast',
    'anthropic/claude-haiku-4.5', 'openai/gpt-4o-mini', 'openai/gpt-5-mini', 'minimax/minimax-m2.5',
  ],
  openai: [
    'gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o4-mini',
  ],
  anthropic: [
    'claude-haiku-4-5-20251001', 'claude-sonnet-4-6-20250514',
  ],
};

agentProvider.addEventListener('change', () => {
  const prov = agentProvider.value;
  const isOllama = prov === 'ollama';
  agentModelSelect.style.display = isOllama ? 'none' : '';
  agentOllamaModel.style.display = isOllama ? '' : 'none';

  const models = PROVIDER_MODELS[prov];
  if (models) {
    agentModelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
  }
});

// Add agent
btnAddAgent.addEventListener('click', () => {
  const name = document.getElementById('agent-name').value || `Agent-${world.agents.length + 1}`;
  const provider = agentProvider.value;
  const model = provider === 'ollama'
    ? agentOllamaModel.value || 'llama3'
    : agentModelSelect.value;
  const color = getDefaultAgentColor(world.agents.length);
  const prompt = document.getElementById('agent-prompt').value;
  const temperature = parseFloat(document.getElementById('agent-temperature').value) || 0.9;
  const friends = [];
  const ollamaUrlInput = document.getElementById('ollama-url');
  const ollamaUrl = provider === 'ollama'
    ? (ollamaUrlInput?.value || 'http://localhost:11434')
    : null;

  const enableInstincts = document.getElementById('agent-instincts').checked;
  const isNPC = document.getElementById('agent-npc').checked;

  // Optional starting loadout
  const startX = document.getElementById('agent-start-x').value;
  const startY = document.getElementById('agent-start-y').value;
  const startCoins = parseInt(document.getElementById('agent-start-coins').value) || 0;
  const startBullets = parseInt(document.getElementById('agent-start-bullets').value) || 0;
  const startHealth = parseInt(document.getElementById('agent-start-health').value) || 0;
  const startAxe = document.getElementById('agent-start-axe').checked;

  // Position: use grid coords if provided, otherwise random
  let spawnX, spawnY;
  if (startX !== '' && startY !== '') {
    const pos = Grid.toPixel(parseInt(startX), parseInt(startY));
    spawnX = pos.x;
    spawnY = pos.y;
  } else {
    // Spawn near center of map (within ~30% of center)
    const cx = world.width / 2;
    const cy = world.height / 2;
    const spread = world.width * 0.15;
    spawnX = cx + (Math.random() - 0.5) * spread * 2;
    spawnY = cy + (Math.random() - 0.5) * spread * 2;
  }

  const agent = new Agent({
    name,
    model,
    provider,
    ollamaUrl,
    color,
    temperature,
    friends,
    enableInstincts,
    isNPC,
    systemPrompt: prompt,
    x: spawnX,
    y: spawnY,
  });

  // Apply optional loadout
  if (startCoins > 0) agent.coins = startCoins;
  if (startBullets > 0) agent.bullets = startBullets;
  if (startHealth > 0) agent.health = Math.min(startHealth, agent.maxHealth);
  if (startAxe) agent.hasAxe = true;
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
    const pos = Grid.snap(50 + Math.random() * (world.width - 100), 50 + Math.random() * (world.height - 100));
    const coin = new Item({ type: 'coin', x: pos.x, y: pos.y });
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
  for (let row = 0; row < 2; row++) {
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
      if (agent.renderer?.thoughtBubble) {
        agent.renderer.thoughtBubble.sprite.visible = false;
        agent.renderer.thoughtBubble.sprite.material.opacity = 0;
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
    `Coins: ${agent.coins}  Health Potions: ${agent.healthPacks}  Bullets: ${agent.bullets}  Keys: ${agent.keys}  Traps: ${agent.traps}  Wood: ${agent.wood}  Stones: ${agent.stones}  Apples: ${agent.apples}\n` +
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
    `Goal: ${agent.goal || '(none)'}\n` +
    `Relationships:\n${rels}\n` +
    `House: ${agent.insideHouse ? 'INSIDE (healing)' : 'not inside'}\n` +
    `Instincts: ${agent.enableInstincts ? (agent.instincts.length > 0 ? agent.instincts.map(i => i.trigger).join(', ') : 'none set') : 'disabled'}\n` +
    `Thought: ${agent.lastDecision?.thought || '...'}\n` +
    `Saying: ${agent.currentSpeech || '(nothing)'}\n` +
    `--- Memory (${agent.memory.length}/15) ---\n` +
    (agent.memory.length > 0 ? agent.memory.map((m, i) => `  ${i + 1}. ${m}`).join('\n') : '  (empty)') + '\n' +
    `--- Long-Term Memory (${agent.longTermMemory.length}/15) ---\n` +
    (agent.longTermMemory.length > 0 ? agent.longTermMemory.map((m, i) => `  ${i + 1}. ${m}`).join('\n') : '  (empty)');
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
  nameInput.className = 'shop-name-input';
  nameInput.value = shop.shopName || 'General Store';
  nameInput.placeholder = 'Shop name...';
  nameInput.addEventListener('input', () => {
    shop.shopName = nameInput.value;
    shop.updateLabel(nameInput.value);
  });
  shopEditorDiv.appendChild(nameInput);

  for (const item of DEFAULT_INVENTORY) {
    const enabled = shop.shopInventory.some(si => si.name === item.name);
    const row = document.createElement('div');
    row.className = 'shop-item-row';

    const checkboxId = `shop-item-${item.name}`;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = checkboxId;
    cb.className = 'shop-item-toggle';
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

    const details = document.createElement('label');
    details.className = 'shop-item-details';
    details.htmlFor = checkboxId;

    const header = document.createElement('div');
    header.className = 'shop-item-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'shop-item-name';
    nameSpan.textContent = item.name.replace(/_/g, ' ');

    const priceSpan = document.createElement('span');
    priceSpan.className = 'shop-item-price';
    priceSpan.textContent = `${item.price} coins`;

    const description = document.createElement('span');
    description.className = 'shop-item-description';
    description.textContent = item.description;

    header.appendChild(nameSpan);
    header.appendChild(priceSpan);
    details.appendChild(header);
    details.appendChild(description);

    row.appendChild(cb);
    row.appendChild(details);
    shopEditorDiv.appendChild(row);
  }
}

// Logging with categories
let activeLogTab = 'all';

// Tab switching
document.querySelectorAll('.log-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeLogTab = tab.dataset.tab;
    // Show/hide existing entries
    for (const entry of agentLogsDiv.children) {
      entry.style.display = (activeLogTab === 'all' || entry.dataset.cat === activeLogTab) ? '' : 'none';
    }
  });
});

function addLog(name, message, color, category = 'world') {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.dataset.cat = category;
  entry.innerHTML = `<span class="log-name" style="color:${color}">${name}</span>: ${message}`;
  if (activeLogTab !== 'all' && category !== activeLogTab) {
    entry.style.display = 'none';
  }
  agentLogsDiv.prepend(entry);
  // Keep max 80 entries
  while (agentLogsDiv.children.length > 80) {
    agentLogsDiv.removeChild(agentLogsDiv.lastChild);
  }
}

// ── Scene Loader ──
const sceneLoader = new SceneLoader(world, addLog);
document.getElementById('btn-load-scene')?.addEventListener('click', async () => {
  const provider = agentProvider.value;
  const model = provider === 'ollama'
    ? (agentOllamaModel.value || 'llama3')
    : agentModelSelect.value;

  const res = await fetch('/scenes/default.json');
  const scene = await res.json();

  // Override all agents to use the selected provider/model
  for (const a of scene.agents) {
    a.provider = provider;
    a.model = model;
  }

  sceneLoader.load(scene);
  agentLogsDiv.innerHTML = '';
});

// Track agent decisions for logging — one log per decision object
let lastLoggedDecisions = new Map();

function checkAgentThoughts() {
  for (const agent of world.agents) {
    if (agent.lastDecision?.thought) {
      const d = agent.lastDecision;
      if (lastLoggedDecisions.get(agent.name) === d) continue; // already logged this exact decision
      lastLoggedDecisions.set(agent.name, d);
        switch (d.action) {
          case 'send_message':
          case 'talk':
            addLog(agent.name, `-> ${d.to}: "${d.message}"`, agent.color, 'chat');
            break;
          case 'attack':
            addLog(agent.name, `[ATTACK] fired at ${d.target || `(${d.targetX},${d.targetY})`}`, '#ff4444', 'chat');
            break;
          case 'melee_attack':
          case 'melee':
            addLog(agent.name, `[MELEE] hit ${d.target || 'something'} with ${agent.hasAxe ? 'axe' : 'hammer'}`, '#ff8844', 'chat');
            break;
          case 'buy': {
            const bought = d.items ? d.items.join(', ') : d.item;
            addLog(agent.name, `[BUY] ${bought} from shop`, '#aa8855', 'shop');
            break;
          }
          case 'give':
          case 'give_coins':
          case 'give_bullets':
          case 'give_healthpack':
            addLog(agent.name, `[GIVE] ${d.amount} ${d.item || d.action.replace('give_', '')} -> ${d.to}`, '#ffdd44', 'chat');
            break;
          case 'sell_bullets':
            addLog(agent.name, `[SELL] ${d.amount} bullet(s) for coins`, '#ff6644', 'shop');
            break;
          case 'sell_wood':
            addLog(agent.name, `[SELL] ${d.amount} wood for coins`, '#2d8a4e', 'shop');
            break;
          case 'trade':
            addLog(agent.name, `[TRADE] ${d.offer?.amount} ${d.offer?.type} <-> ${d.request?.amount} ${d.request?.type} with ${d.to}`, '#dd88ff', 'chat');
            break;
          case 'use_healthpack':
            addLog(agent.name, `[HEAL] used a health pack`, '#44ff88', 'world');
            break;
          case 'place_trap':
            addLog(agent.name, `[TRAP] placed a hidden trap!`, '#cc4400', 'world');
            break;
          case 'open_treasure':
            addLog(agent.name, `[TREASURE] trying to open a treasure chest`, '#ddaa00', 'world');
            break;
          case 'cut_tree':
            addLog(agent.name, `[TREE] cutting down a tree`, '#2d8a4e', 'world');
            break;
          case 'break_rock':
            addLog(agent.name, `[ROCK] breaking a rock`, '#888888', 'world');
            break;
          case 'get_apple':
            addLog(agent.name, `[APPLE] picked an apple`, '#ff4444', 'world');
            break;
          case 'eat_apple':
            addLog(agent.name, `[APPLE] ate an apple`, '#44ff88', 'world');
            break;
          case 'grab':
          case 'get':
          case 'take':
            addLog(agent.name, `[GRAB] picked up ${d.item || 'an item'}`, '#ddaa00', 'world');
            break;
          case 'build_house':
            addLog(agent.name, `[HOUSE] built a house!`, '#8B5E3C', 'world');
            break;
          case 'enter_house':
            addLog(agent.name, `[HOUSE] entered their house`, '#8B5E3C', 'world');
            break;
          case 'exit_house':
            addLog(agent.name, `[HOUSE] left their house`, '#8B5E3C', 'world');
            break;
          default:
            break;
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
  const pos = Grid.snap(50 + Math.random() * (world.width - 100), 50 + Math.random() * (world.height - 100));
  world.addItem(new Item({ type: 'coin', x: pos.x, y: pos.y }));
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

// ── Zones ──
const muds = new Zone({
  name: 'The Muds',
  col: 0, row: 16,
  width: 30, height: 4,
  sprite: '/images/mud.png',
  enterMessage: 'You entered The Muds — a dangerous swamp where spiders spawn. Be careful!',
});
world.addZone(muds);

// ── Spawners ──
world.addSpawner(new Spawner({
  zone: muds,
  factory: (x, y) => new Spider({ x, y, zone: muds }),
  add: (spider) => {
    world.addSpider(spider);
    addLog('World', `A spider crawled out of The Muds!`, '#660044');
  },
  interval: 60,
  max: 5,
}));

// ── NPC Templates ──
document.getElementById('btn-add-bullet-seller')?.addEventListener('click', () => {
  const pos = Grid.toPixel(11, 16);
  const npc = new Agent({
    name: 'Bullet Bill',
    model: 'google/gemini-2.5-flash-lite',
    provider: 'openrouter',
    color: '#ffd166',
    temperature: 0.7,
    isNPC: true,
    systemPrompt: 'You are a bullet seller, and animal trap seller. You sell bullets and animal traps to adventurers. Tell people that bullets are great for spider hunting in the north. Be friendly and persuasive. If someone wants to buy, tell them to visit the shop. Add to your memories, previous sales, customer information, prices, things about your trades and shop',
    x: pos.x,
    y: pos.y,
  });
  npc.bullets = 99;
  npc.animalTraps = 20;
  world.addAgent(npc);
  addLog('Bullet Bill', 'Set up shop near The Muds', '#ffd166');
});
