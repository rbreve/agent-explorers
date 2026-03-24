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
  });
});

// LLM proxy endpoint (OpenRouter + Ollama)
app.post('/api/llm', async (req, res) => {
  const { model, messages, temperature, provider, ollamaUrl, agentName, apiKey: clientKey, logPerception } = req.body;

  if (logPerception && messages?.length > 1) {
    console.log(`[PERCEPTION][${agentName || '?'}] ${messages[messages.length - 1].content}`);
  }

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
          temperature: temperature ?? 0.9,
        },
        think: false,
      };
    } else {
      const apiKey = clientKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'OpenRouter API key required' });
      }
      url = 'https://openrouter.ai/api/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'AgentFighters',
      };
      bodyObj = {
        model: model || 'openai/gpt-4o-mini',
        messages,
        temperature: temperature ?? 0.9,
        max_tokens: /deepseek|gpt-oss|gpt-5|minimax|o[1-9]|reasoning/.test(model) ? 1000 : 500,
        ...(model?.includes('minimax') ? {} : {
          response_format: { type: 'json_object' },
        }),
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
    });

    const data = await response.json();

    // Normalize Ollama native response to OpenAI format
    if (provider === 'ollama' && data.message && !data.choices) {
      const normalized = {
        choices: [{
          index: 0,
          message: data.message,
          finish_reason: data.done ? 'stop' : 'length',
        }],
      };
      if (!data.message.content) {
        console.error(`[LLM_ERROR][${agentName || '?'}][ollama/${model}] Empty content. Full response: ${JSON.stringify(data)}`);
      }
      if (DEBUG_LLM_RESPONSE) {
        console.log(`[LOG_LLM_OUTPUT][${new Date().toLocaleTimeString()}][${agentName || '?'}][ollama/${model}] ${data.message.content || JSON.stringify(data)}`);
      }
      return res.json(normalized);
    }

    const content = data.choices?.[0]?.message?.content;
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
  console.log(`Agent Fighters running at http://localhost:${PORT}`);
});
