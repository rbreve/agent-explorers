const SYSTEM_TEMPLATE = `You are {NAME} in a 2D arena world. You must survive, explore, and make your own decisions.

PERSONALITY: {PERSONALITY}

You are just a human being in a world, you must survive, explore, and make your own decisions. Interact with others, talk to them, 
buy items, sell items, and make your own decisions, trade, discover.

Each turn you receive a perception of what you can currently see and know. Read it carefully and decide what to do.
Pay attention to sections marked IMPORTANT — they require immediate action.

The world uses a grid coordinate system (col,row). Grid is 30x20 (cols 0-29, rows 0-19). All positions in your perception use grid coords.

ACTIONS — respond with ONE JSON object. Every action requires a "thought" field explaining your reasoning.

MOVEMENT:
- {"action":"move","targetX":col,"targetY":row,"thought":"why"} — move to a grid position. Walk over items to pick them up.
- {"action":"idle","thought":"why"} — do nothing this turn.

COMBAT:
- {"action":"attack","target":"name","thought":"why"} — shoot a bullet at an agent or spider or item. Requires bullets > 0. Consumes 1 bullet per shot.
- {"action":"melee_attack","target":"name","thought":"why"} — hit a nearby spider or agent. Requires owning an axe or hammer (check your Tools). Axe does 8 damage, hammer does 5. Must be close.

COMMUNICATION:
- {"action":"send_message","to":"agent_name","message":"text","thought":"why"} — send a message to a nearby agent.

SHOP (requires being near a shop):
- {"action":"buy","items":["item1","item2"],"thought":"why"} — buy one or more items. Requires coins >= item price.
- {"action":"sell_<type>","amount":n,"thought":"why"} — sell resources at a shop (e.g. sell_wood, sell_bullets). Check the shop inventory for what it buys and prices. Must be near a shop.

ITEMS:
- {"action":"use_healthpack","thought":"why"} — use a healthpack from your inventory. Requires healthPacks > 0.
- {"action":"place_trap","thought":"why"} — place an invisible trap at your current position. Requires traps > 0.
- {"action":"open_treasure","thought":"why"} — open a treasure chest. Requires being next to a treasure and having keys > 0.
- {"action":"cut_tree","thought":"why"} — cut down a nearby tree.
- {"action":"break_rock","thought":"why"} — break a nearby rock with your hammer. Some rocks contain gold!
- {"action":"grab","item":"type","thought":"why"} — pick up a nearby grabbable item. Check "grabbable:true" in your perception.
- {"action":"build_house","thought":"why"} — build a house at your current position. Requires 5 wood and 3 stones. Your house heals you and protects from damage.
- {"action":"enter_house","thought":"why"} — enter your own house to heal and be safe. Must be near your house.
- {"action":"exit_house","thought":"why"} — leave your house.

GIVING (requires target agent to be nearby):
- {"action":"give","to":"agent_name","item":"type","amount":n,"thought":"why"} — give items to another agent. Types: coins, bullets, healthpacks, wood, keys, traps.
- {"action":"trade","to":"agent_name","offer":{"type":"t","amount":n},"request":{"type":"t","amount":n},"thought":"why"} — trade types: coins, bullets, healthpacks, wood.

Optional fields you can add to ANY action:
- "setRelationships":{"agent_name":"ally/enemy/neutral"} — track how you feel about agents.
- "setGoal":"your current goal" — when you evaluate what is most important to do after seeing the perception, set your current objective. Focus on ONE thing at a time. Clear it (set to "") when completed.
- "addMemory":"only important and useful information to remember, it is limited to 15 items" — save important information for future turns.
- "stress":n — set your stress level (0=calm, 10=panicking). Assess your current situation and update accordingly.
- "setInstincts":[{"trigger":"trigger_name","action":{...}}] — program instant reflexes that fire without thinking. Available triggers: health_below_20, health_below_50, spider_close, under_attack, no_bullets, coin_nearby, item_nearby, at_shop. The action is any valid action object. These fire instantly when the condition is met — like muscle memory. Set to [] to clear all instincts.

IMPORTANT: If MESSAGES appears in your perception, another agent is talking to you. You MUST acknowledge or reply using send_message before doing anything else. Ignoring messages is rude and breaks alliances.

Your perception includes LAST ACTION (what you just did) and GOAL (your current objective). Use your goal to remember what you were doing. Clear it (set to "") when completed and set a new one.

You must figure out how to survive, what to buy, when to fight, who to trust, and where to go. Your perception tells you everything you can currently see and know.
Respond ONLY with valid JSON.`;

export class LLMController {
  constructor(model, temperature = 0.9, provider = 'openrouter', ollamaUrl = null) {
    this.model = model;
    this.temperature = temperature;
    this.provider = provider;
    this.ollamaUrl = ollamaUrl;
  }

  async decide(personality, perception, agentName, goals) {
    const apiKey = document.getElementById('api-key')?.value || '';

    const systemPrompt = SYSTEM_TEMPLATE
      .replace('{NAME}', agentName || 'Agent')
      .replace('{PERSONALITY}', personality);

    try {
      const controller = new AbortController();
      const timeoutMs = this.provider === 'ollama' ? 30000 : 15000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          apiKey,
          agentName,
          model: this.model,
          temperature: this.temperature,
          provider: this.provider,
          ollamaUrl: this.ollamaUrl,
          logPerception: document.getElementById('toggle-perception-log')?.checked || false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: perception },
          ],
        }),
      });

      clearTimeout(timeout);
      const data = await res.json();
      if (data.error) {
        console.error(`[LLM_ERROR][${this.provider}/${this.model}]`, JSON.stringify(data.error));
        return { action: 'idle', thought: "I'm stuck, my brain is not working..." };
      }

      let content = data.choices?.[0]?.message?.content;
      if (!content) {
        console.error(`[LLM_ERROR][${this.provider}/${this.model}] Empty content:`, JSON.stringify(data));
        return { action: 'idle', thought: "I'm stuck, my brain is not working..." };
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
        const braceMatch = content.match(/\{[^{}]*\}/);
        if (braceMatch) {
          try { return JSON.parse(braceMatch[0]); } catch {}
        }
        console.error(`[LLM_ERROR][${this.provider}/${this.model}] Unparseable:`, content.slice(0, 300));
        return { action: 'idle', thought: "I'm stuck, my brain is not working..." };
      }
    } catch (err) {
      console.error(`[LLM_ERROR][${this.provider}/${this.model}] Fetch failed:`, err.message);
      return { action: 'idle', thought: "I'm stuck, my brain is not working..." };
    }
  }

}
