# Agent Explorers

A 2D arena simulation where LLM-powered agents autonomously survive, fight, trade, talk, and explore. Every decision an agent makes comes from an LLM — there is no pre-programmed behavior, no scripted AI, no behavior trees. Agents perceive their surroundings, reason about what to do, and act entirely through natural language.

## What is this?

Agent Explorers is a sandbox for observing how large language models behave as autonomous agents in a shared game world. Each agent receives a text-based perception of what it can see (nearby items, other agents, threats, inventory) and responds with a single JSON action. The system executes the action and feeds back the result. That's the entire loop.

Agents can:
- **Explore** the world, pick up items, discover shops and landmarks
- **Fight** spiders and other agents using ranged (bullets) or melee (axe/hammer) combat
- **Trade and talk** with other agents — negotiate, form alliances, warn about dangers
- **Buy and sell** items at shops — health potions, weapons, traps, building materials
- **Build houses** for shelter, place traps, cut trees, mine rocks
- **Remember** — short-term memory (15 events) and long-term memory (30 entries), entirely managed by the LLM
- **Set goals** — the LLM decides its own objectives and updates them as situations change

The key design principle: **the system does nothing for the agent**. If the agent doesn't decide to run from a spider, it dies. If it doesn't remember where the shop is, it has to find it again. Every behavior emerges from the LLM's reasoning.

## Architecture

```
Agent -> Map Perception -> LLM -> Actions -> Agent executes actions
```

Built with **Three.js** (orthographic 2D rendering), **Express** (LLM proxy server), and any LLM provider you want.

### Supported LLM Providers

- **OpenRouter** — GPT-4o-mini, Claude Haiku, Gemini Flash, DeepSeek, and more
- **OpenAI** — direct API (GPT-4o, GPT-4o-mini, o4-mini, etc.)
- **Anthropic** — direct API (Claude Haiku 4.5, Claude Sonnet 4.6, etc.)
- **Ollama** — run local models (Llama 3, Mistral, etc.)

Each agent can use a different model and provider. You can pit GPT against Claude against Gemini and watch how they play differently.

## Getting Started

### Prerequisites

- Node.js 18+
- An [OpenRouter](https://openrouter.ai/) API key, or [Ollama](https://ollama.ai/) running locally

### Install & Run

```bash
git clone https://github.com/rbreve/agent-explorers.git
cd agent-explorers
npm install
npm start
```

Open `http://localhost:3000` in your browser.

### Configuration

Create a `.env` file for defaults:

```env
OPENROUTER_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

Or enter your API key directly in the browser UI.

## How It Works

### The Perception-Action Loop

Every few seconds, each agent:

1. **Receives perception** — a text snapshot of everything it can see: position, health, inventory, nearby agents/items/spiders, messages from others, danger warnings, its own memory and goals
2. **LLM decides** — the model reads the perception and outputs a JSON action (move, attack, buy, talk, etc.)
3. **System executes** — the action is validated and applied to the world
4. **Feedback** — the result (success/failure + message) appears in the next perception

The last 5 perception-decision pairs are sent as conversation history, giving agents short-term continuity.

### NPC System

Create stationary NPCs with custom roles — shopkeepers, quest givers, traders. NPCs use a stripped-down prompt focused on conversation and trading. They don't move or take damage.

### Memory System

Agents have three layers of memory, all controlled by the LLM — the system never stores anything automatically:

- **Conversation history** (last 5 turns) — the most recent perception-decision pairs are sent as chat history to the LLM, giving it short-term continuity. This lets the agent naturally reason "I tried melee three times and missed, maybe I should run" without explicit state tracking.

- **Short-term memory** (max 15) — the LLM can save notes via `"addMemory":"..."`. Used for recent events, plans, and observations. When full, the oldest entry is dropped. Shown in perception as `MEMORY:`.

- **Long-term memory** (max 30) — the LLM can permanently store important knowledge via `"addLongTermMemory":"..."`. This is where agents choose to remember shop locations, danger zones, NPC names, ally information, or anything they decide matters. Shown in perception as `LONG-TERM MEMORY:`.

The critical design choice: **no automatic storage**. The system doesn't remember shops, dangers, or landmarks for the agent. If the agent walks past a shop and doesn't save its location, it's forgotten. This creates observable differences between models — some are meticulous note-takers, others forget everything and wander in circles.

### Zone System

Named grid regions with visual tiling (e.g. "The Muds" — a dangerous swamp). Agents receive a message when entering a zone. Spawners can be attached to zones for periodic enemy generation.

## Controls

- **Add Agent** — choose name, LLM model, personality prompt, starting loadout
- **NPC mode** — checkbox for stationary characters
- **Spawn items** — coins, health packs, spiders, trees, rocks, treasures, traps
- **Shop editor** — click a shop to toggle which items it sells
- **Click agent** — inspect stats, memory, goals, relationships
- **Drag NPCs/shops** — reposition them on the map
- **Pause/Resume** — freeze the simulation

## Project Structure

```
public/
  js/
    main.js           # UI, agent spawning, world setup
    World.js          # Game world, perception, physics
    Agent.js          # Agent state, decision loop
    LLMController.js  # LLM API communication, prompt templates
    ActionRegistry.js # Declarative action handlers (move, attack, buy, etc.)
    AgentRenderer.js  # Three.js visuals for agents
    ChatBubble.js     # Speech/thought bubble rendering
    Grid.js           # Tile coordinate system
    Item.js           # Item definitions and behavior
    Spider.js         # Enemy AI (wander, chase, zone-confined)
    Zone.js           # Named world regions
    Spawner.js        # Periodic entity spawning
    Shop.js           # Shop item definitions
    House.js          # Buildable shelter
    Bullet.js         # Projectile physics
server.js             # Express server, LLM proxy
```

## License

MIT
