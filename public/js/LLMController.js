const SYSTEM_TEMPLATE = `You are {NAME} in a 2D arena world. You must survive, explore, and make your own decisions.

PERSONALITY: {PERSONALITY}
CURRENT GOAL: {CURRENT_GOAL}

Each turn you receive a JSON perception of what you can currently see and know. Study it carefully and decide what to do.

ACTIONS — respond with ONE JSON object. Every action requires a "thought" field explaining your reasoning.

MOVEMENT:
- {"action":"move","targetX":n,"targetY":n,"thought":"why"} — move to any coordinate on the map. Walk over items to pick them up.
- {"action":"idle","thought":"why"} — do nothing this turn.

COMBAT:
- {"action":"attack","target":"name","thought":"why"} — shoot a bullet at an agent or spider. Requires bullets > 0. Consumes 1 bullet per shot.

COMMUNICATION:
- {"action":"send_message","to":"agent_name","message":"text","thought":"why"} — send a message to a nearby agent.

SHOP (requires being near a shop):
- {"action":"buy","items":["item1","item2"],"thought":"why"} — buy one or more items. Requires coins >= item price.
- {"action":"sell_bullets","amount":n,"thought":"why"} — sell bullets for 1 coin each. Must be near a shop.

ITEMS:
- {"action":"use_healthpack","thought":"why"} — use a healthpack from your inventory. Requires healthPacks > 0.
- {"action":"place_trap","thought":"why"} — place an invisible trap at your current position. Requires traps > 0.
- {"action":"open_treasure","thought":"why"} — open a treasure chest. Requires being next to a treasure and having keys > 0.
- {"action":"cut_tree","thought":"why"} — cut down a nearby tree.

GIVING (requires target agent to be nearby):
- {"action":"give_coins","to":"agent_name","amount":n,"thought":"why"}
- {"action":"give_bullets","to":"agent_name","amount":n,"thought":"why"}
- {"action":"give_healthpack","to":"agent_name","amount":n,"thought":"why"}
- {"action":"trade","to":"agent_name","offer":{"type":"t","amount":n},"request":{"type":"t","amount":n},"thought":"why"} — trade types: coins, bullets, healthpacks.

Optional fields you can add to ANY action:
- "setRelationships":{"agent_name":"ally/enemy/neutral"} — track how you feel about agents.
- "newGoal":"new goal" — update what you're working toward.
- "addMemory":"something to remember" — save important information for future turns.

You must figure out how to survive, what to buy, when to fight, who to trust, and where to go. Pay attention to your perception data — it tells you everything you can currently see and know.
Respond ONLY with valid JSON.`;

export class LLMController {
  constructor(model, temperature = 0.9, provider = 'openrouter', ollamaUrl = null) {
    this.model = model;
    this.temperature = temperature;
    this.provider = provider;
    this.ollamaUrl = ollamaUrl;
  }

  async decide(personality, perception, agentName, currentGoal) {
    const apiKey = document.getElementById('api-key')?.value || '';

    const systemPrompt = SYSTEM_TEMPLATE
      .replace('{NAME}', agentName || 'Agent')
      .replace('{PERSONALITY}', personality)
      .replace('{CURRENT_GOAL}', currentGoal || 'Follow your personality.');

    try {
      const controller = new AbortController();
      const timeoutMs = this.provider === 'ollama' ? 30000 : 8000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          apiKey,
          model: this.model,
          temperature: this.temperature,
          provider: this.provider,
          ollamaUrl: this.ollamaUrl,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(perception) },
          ],
        }),
      });

      clearTimeout(timeout);
      const data = await res.json();
      if (data.error) {
        console.warn(`LLM API error [${this.provider}/${this.model}]:`, JSON.stringify(data.error));
        return { action: 'idle', thought: `LLM error: ${data.error.message || JSON.stringify(data.error)}` };
      }

      let content = data.choices?.[0]?.message?.content;
      if (!content) {
        console.warn(`LLM empty content [${this.provider}/${this.model}]:`, JSON.stringify(data));
        return { action: 'idle', thought: 'LLM returned empty response' };
      }

      // Strip markdown code fences (```json ... ```)
      content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

      try {
        return JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*?\}(?=[^}]*$)/);
        if (match) {
          try { return JSON.parse(match[0]); } catch {}
        }
        // Try to find any JSON object
        const braceMatch = content.match(/\{[^{}]*\}/);
        if (braceMatch) {
          try { return JSON.parse(braceMatch[0]); } catch {}
        }
        console.warn(`LLM unparseable [${this.provider}/${this.model}]:`, content.slice(0, 300));
        return { action: 'idle', thought: `LLM parse error: ${content.slice(0, 80)}` };
      }
    } catch (err) {
      console.warn(`LLM fetch error [${this.provider}/${this.model}]:`, err.message);
      return { action: 'idle', thought: `LLM fetch error: ${err.message}` };
    }
  }

  _fallbackAI(perception) {
    const self = perception.you;
    const agents = perception.agents || [];
    const items = perception.items || [];
    const messages = perception.messages || [];
    const knownShops = perception.knownShops || [];
    const friends = perception.friends || [];

    const maxHp = self.maxHp || 100;
    const healthPct = self.hp / maxHp;
    const nearbyShop = items.find(i => i.shop);
    const healthPack = items.find(i => i.type === 'health_pack');

    // CRITICAL health
    if (healthPct <= 0.2) {
      if (self.healthPacks > 0) return { action: 'use_healthpack', thought: 'CRITICAL: using health pack' };
      if (nearbyShop && self.coins >= 3) return { action: 'buy', item: 'health_potion', thought: 'CRITICAL: buying potion' };
      if (healthPack) return { action: 'move', targetX: healthPack.x, targetY: healthPack.y, thought: 'CRITICAL: grabbing health pack' };
      if (knownShops.length > 0 && self.coins >= 3) return { action: 'move', targetX: knownShops[0].x, targetY: knownShops[0].y, thought: 'CRITICAL: rushing to shop' };
    }

    // Low health
    if (healthPct <= 0.4) {
      if (self.healthPacks > 0) return { action: 'use_healthpack', thought: 'Low health, using pack' };
      if (nearbyShop && self.coins >= 3) return { action: 'buy', item: 'health_potion', thought: 'Low health, buying potion' };
      if (healthPack) return { action: 'move', targetX: healthPack.x, targetY: healthPack.y, thought: 'Low health, getting pack' };
      if (knownShops.length > 0 && self.coins >= 3) return { action: 'move', targetX: knownShops[0].x, targetY: knownShops[0].y, thought: 'Heading to shop to heal' };
    }

    // Attack nearby spiders (urgent — they bite!)
    const spiders = perception.spiders || [];
    if (spiders.length > 0 && self.bullets > 0 && !self.cooldown) {
      return { action: 'attack', target: 'spider', thought: 'Spider nearby — shooting it' };
    }

    // Introduce yourself to a stranger (first meeting only)
    const convos = perception.recentConversations || {};
    const stranger = agents.find(a => a.type !== 'shop' && !convos[a.name]);
    if (stranger) {
      return { action: 'send_message', to: stranger.name, message: `Hey, I'm ${self.name}.`, thought: `Introducing myself to ${stranger.name}` };
    }

    // Sell excess bullets for coins
    if (self.bullets > 10) {
      const sellAmt = self.bullets - 5;
      return { action: 'sell_bullets', amount: sellAmt, thought: 'Selling excess bullets for coins' };
    }

    // Moderate health — head to shop
    if (healthPct <= 0.6) {
      if (healthPack) return { action: 'move', targetX: healthPack.x, targetY: healthPack.y, thought: 'Getting health pack' };
      if (knownShops.length > 0 && self.coins >= 3) return { action: 'move', targetX: knownShops[0].x, targetY: knownShops[0].y, thought: 'Health dropping, going to shop' };
    }

    // Buy bullets if out
    if (nearbyShop && self.bullets <= 0 && self.coins >= 2) {
      return { action: 'buy', items: ['bullets'], thought: 'Need ammo' };
    }

    // Buy upgrades
    if (nearbyShop && self.coins >= 7 && healthPct > 0.5) {
      const picks = ['firepower_up', 'speed_up', 'reach_up'];
      return { action: 'buy', items: [picks[Math.floor(Math.random() * picks.length)]], thought: 'Buying upgrade' };
    }

    // Collect coins
    const coin = items.find(i => i.type === 'coin');
    if (coin) return { action: 'move', targetX: coin.x, targetY: coin.y, thought: 'Collecting coin' };

    // Nearby agent — pick a random action: attack, move away, or keep exploring
    const nearby = agents.find(a => a.type !== 'shop');
    if (nearby) {
      const isFriend = friends.includes(nearby.name);
      const roll = Math.random();
      if (!isFriend && !self.cooldown && self.bullets > 0 && healthPct > 0.4 && roll < 0.4) {
        return { action: 'attack', target: nearby.name, thought: `Attacking ${nearby.name}` };
      }
      if (roll < 0.6) {
        // Move away
        const dx = self.pos[0] - nearby.x;
        const dy = self.pos[1] - nearby.y;
        const len = Math.hypot(dx, dy) || 1;
        return {
          action: 'move',
          targetX: Math.max(50, Math.min(1150, self.pos[0] + (dx / len) * 150)),
          targetY: Math.max(50, Math.min(750, self.pos[1] + (dy / len) * 150)),
          thought: `Moving away from ${nearby.name}`,
        };
      }
    }

    // Wander
    if (healthPct < 0.7 && knownShops.length > 0) {
      return { action: 'move', targetX: knownShops[0].x, targetY: knownShops[0].y, thought: 'Heading to shop' };
    }

    return {
      action: 'move',
      targetX: Math.max(50, Math.min(1150, self.pos[0] + (Math.random() - 0.5) * 300)),
      targetY: Math.max(50, Math.min(750, self.pos[1] + (Math.random() - 0.5) * 300)),
      thought: 'Exploring',
    };
  }
}
