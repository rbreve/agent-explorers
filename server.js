import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;
const DEBUG_LLM_RESPONSE = process.env.DEBUG_LLM_RESPONSE === 'true';
const LOG_PERCEPTION = process.env.LOG_PERCEPTION === 'true';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// Expose env defaults to frontend
app.get('/api/config', (req, res) => {
  res.json({
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || '',
    hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
  });
});

// ── Reasoning model detection ──
// These models reject temperature, response_format, and use different token/output fields
const REASONING_PATTERNS = [
  /\bo[1-9]/,            // o1, o3, o4-mini
  /gpt-oss/,             // gpt-oss-120b
  /deepseek.*r1/i,       // deepseek-r1
  /qwq/i,                // Qwen QwQ
];

function isReasoningModel(model) {
  return REASONING_PATTERNS.some(p => p.test(model || ''));
}

// Models that don't support response_format: { type: 'json_object' }
function supportsJsonMode(model) {
  if (isReasoningModel(model)) return false;
  if (/minimax/.test(model)) return false;
  return true;
}

// Strip <think>...</think> tags from DeepSeek R1 style reasoning output
function stripThinkingTags(text) {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

// Extract usable content from a response message (handles reasoning model quirks)
function extractContent(msg) {
  if (!msg) return null;
  // Standard content field
  let content = msg.content;
  // Reasoning models may put output in reasoning fields instead
  if (!content) {
    content = msg.reasoning_content || msg.reasoning || null;
  }
  if (!content) return null;
  // Strip thinking tags (DeepSeek R1 style)
  content = stripThinkingTags(content);
  return content || null;
}

// Prepare messages for models that don't support the system role
function convertSystemToUser(messages) {
  return messages.map(m =>
    m.role === 'system'
      ? { role: 'user', content: `[System Instructions]\n${m.content}` }
      : m
  );
}

// LLM proxy endpoint
app.post('/api/llm', async (req, res) => {
  const { model, messages, temperature, provider, ollamaUrl, agentName, apiKey: clientKey, logPerception } = req.body;

  if (logPerception && messages?.length > 1) {
    console.log(`[PERCEPTION][${agentName || '?'}] ${messages[messages.length - 1].content}`);
  }

  const reasoning = isReasoningModel(model);

  try {
    let url, headers, bodyObj;

    if (provider === 'ollama') {
      const base = (ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
      url = `${base}/api/chat`;
      headers = { 'Content-Type': 'application/json' };
      bodyObj = {
        model: model || process.env.OLLAMA_MODEL || 'llama3',
        messages,
        stream: false,
        format: 'json',
        options: {
          ...(reasoning ? {} : { temperature: temperature ?? 0.9 }),
        },
        think: false,
      };
    } else if (provider === 'openai') {
      const apiKey = clientKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'OpenAI API key required' });
      }
      url = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
      bodyObj = {
        model: model || 'gpt-4o-mini',
        messages: reasoning ? convertSystemToUser(messages) : messages,
        ...(reasoning
          ? { max_completion_tokens: 2000 }
          : { temperature: temperature ?? 0.9, max_tokens: 500 }
        ),
        ...(supportsJsonMode(model) ? { response_format: { type: 'json_object' } } : {}),
      };
    } else if (provider === 'anthropic') {
      const apiKey = clientKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'Anthropic API key required' });
      }
      const systemMsg = messages.find(m => m.role === 'system');
      const nonSystemMsgs = messages.filter(m => m.role !== 'system');
      url = 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
      bodyObj = {
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        temperature: temperature ?? 0.9,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
      };
    } else {
      // OpenRouter
      const apiKey = clientKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'OpenRouter API key required' });
      }
      url = 'https://openrouter.ai/api/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'AgentExplorers',
      };
      bodyObj = {
        model: model || 'openai/gpt-4o-mini',
        messages: reasoning ? convertSystemToUser(messages) : messages,
        ...(reasoning
          ? { max_completion_tokens: 2000 }
          : { temperature: temperature ?? 0.9, max_tokens: 500 }
        ),
        ...(supportsJsonMode(model) ? { response_format: { type: 'json_object' } } : {}),
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
    });

    const data = await response.json();

    // ── Normalize Anthropic response to OpenAI format ──
    if (provider === 'anthropic' && data.content && !data.choices) {
      const text = data.content.find(b => b.type === 'text')?.text || '';
      const normalized = {
        choices: [{
          index: 0,
          message: { role: 'assistant', content: text },
          finish_reason: data.stop_reason === 'end_turn' ? 'stop' : data.stop_reason,
        }],
      };
      if (!text) {
        console.error(`[LLM_ERROR][${agentName || '?'}][anthropic/${model}] Empty content. Full response: ${JSON.stringify(data)}`);
      }
      if (DEBUG_LLM_RESPONSE) {
        console.log(`[LOG_LLM_OUTPUT][${new Date().toLocaleTimeString()}][${agentName || '?'}][anthropic/${model}] ${text || JSON.stringify(data)}`);
      }
      return res.json(normalized);
    }

    // ── Normalize Ollama response to OpenAI format ──
    if (provider === 'ollama' && data.message && !data.choices) {
      let ollamaContent = data.message.content || '';
      if (ollamaContent) ollamaContent = stripThinkingTags(ollamaContent);
      const normalized = {
        choices: [{
          index: 0,
          message: { ...data.message, content: ollamaContent },
          finish_reason: data.done ? 'stop' : 'length',
        }],
      };
      if (!ollamaContent) {
        console.error(`[LLM_ERROR][${agentName || '?'}][ollama/${model}] Empty content. Full response: ${JSON.stringify(data)}`);
      }
      if (DEBUG_LLM_RESPONSE) {
        console.log(`[LOG_LLM_OUTPUT][${new Date().toLocaleTimeString()}][${agentName || '?'}][ollama/${model}] ${ollamaContent || JSON.stringify(data)}`);
      }
      return res.json(normalized);
    }

    // ── Extract content (handles reasoning model output fields) ──
    const msg = data.choices?.[0]?.message;
    const content = extractContent(msg);
    if (msg && content) {
      msg.content = content; // normalize into content field for frontend
    }

    if (data.error) {
      console.error(`[LLM_ERROR][${new Date().toLocaleTimeString()}][${agentName || '?'}][${provider}/${model}] ${JSON.stringify(data.error)}`);
    } else if (!content) {
      console.error(`[LLM_ERROR][${new Date().toLocaleTimeString()}][${agentName || '?'}][${provider}/${model}] Empty content. Full response: ${JSON.stringify(data)}`);
    }
    if (DEBUG_LLM_RESPONSE) {
      console.log(`[LOG_LLM_OUTPUT][${new Date().toLocaleTimeString()}][${agentName || '?'}][${provider}/${model}] ${content || JSON.stringify(data)}`);
    }
    res.json(data);
  } catch (err) {
    console.error(`[LLM_ERROR][${agentName || '?'}][${provider}/${model}] Fetch failed:`, err.message);
    res.status(500).json({ error: `Failed to call ${provider || 'LLM'}` });
  }
});

app.listen(PORT, () => {
  console.log(`Agent Explorers running at http://localhost:${PORT}`);
});
