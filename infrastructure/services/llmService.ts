import { GoogleGenAI } from '@google/genai';
import { LLMConfig } from '../../domain/models';
import { netcattyBridge } from './netcattyBridge';

export interface LLMResponse {
  text: string;
  error?: string;
}

export class LLMService {
  private config: LLMConfig;
  private client: GoogleGenAI | null = null;

  constructor(config: LLMConfig) {
    this.config = config;
    if (config.enabled && config.apiKey) {
      this.initializeClient();
    }
  }

  private initializeClient() {
    if (this.config.provider === 'gemini' && this.config.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.config.apiKey });
    }
  }

  private async httpRequest(opts: {
    url: string;
    headers: Record<string, string>;
    body: string;
    timeoutMs?: number;
  }): Promise<{ ok: boolean; status: number; statusText?: string; bodyText: string }> {
    const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 30_000;

    const bridge = netcattyBridge.get();
    if (bridge?.llmRequest) {
      return bridge.llmRequest({
        url: opts.url,
        method: 'POST',
        headers: opts.headers,
        body: opts.body,
        timeoutMs,
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(opts.url, {
        method: 'POST',
        headers: opts.headers,
        body: opts.body,
        signal: controller.signal,
      });
      const bodyText = await res.text();
      return { ok: res.ok, status: res.status, statusText: res.statusText, bodyText };
    } finally {
      clearTimeout(timer);
    }
  }

  private safeJsonParse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private getNestedString(value: unknown, path: string[]): string | null {
    let cur: unknown = value;
    for (const key of path) {
      if (!this.isRecord(cur)) return null;
      cur = cur[key];
    }
    return typeof cur === 'string' ? cur : null;
  }

  updateConfig(config: LLMConfig) {
    this.config = config;
    this.client = null;
    if (config.enabled && config.apiKey) {
      this.initializeClient();
    }
  }

  async chat(prompt: string): Promise<LLMResponse> {
    if (!this.config.enabled) {
      return { text: '', error: 'LLM is not enabled' };
    }

    try {
      if (this.config.provider === 'gemini') {
        if (!this.config.apiKey) return { text: '', error: 'API key is not configured' };
        return await this.chatGemini(prompt);
      }
      if (this.config.provider === 'claude') {
        if (!this.config.apiKey) return { text: '', error: 'API key is not configured' };
        return await this.chatClaude(prompt);
      }
      if (this.config.provider === 'custom') {
        return await this.chatCustom(prompt);
      } else {
        return { text: '', error: `Provider ${this.config.provider} is not yet supported` };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { text: '', error: errorMessage };
    }
  }

  private async chatGemini(prompt: string): Promise<LLMResponse> {
    if (!this.client) {
      this.initializeClient();
    }

    if (!this.client) {
      return { text: '', error: 'Failed to initialize Gemini client' };
    }

    try {
      const response = await this.client.models.generateContent({
        model: this.config.model || 'gemini-2.5-flash',
        contents: prompt,
      });
      return { text: response.text ?? '' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { text: '', error: `Gemini API error: ${errorMessage}` };
    }
  }

  private async chatClaude(prompt: string): Promise<LLMResponse> {
    const endpoint = (this.config.endpoint || 'https://api.anthropic.com/v1/messages').trim();
    if (!endpoint) return { text: '', error: 'Claude endpoint is not configured' };

    const body = JSON.stringify({
      model: this.config.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const res = await this.httpRequest({
      url: endpoint,
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    });

    if (!res.ok) {
      const parsed = this.safeJsonParse(res.bodyText);
      const message =
        this.getNestedString(parsed, ['error', 'message']) || res.statusText || `HTTP ${res.status}`;
      return { text: '', error: `Claude API error: ${message}` };
    }

    const data = this.safeJsonParse(res.bodyText);
    let text = '';
    if (this.isRecord(data) && Array.isArray(data.content)) {
      text = data.content
        .map((c) => {
          if (!this.isRecord(c)) return '';
          return c.type === 'text' && typeof c.text === 'string' ? c.text : '';
        })
        .filter(Boolean)
        .join('');
    }

    return { text };
  }

  private async chatCustom(prompt: string): Promise<LLMResponse> {
    const endpoint = (this.config.endpoint || '').trim();
    if (!endpoint) return { text: '', error: 'Custom endpoint is not configured' };

    const body = JSON.stringify({
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    });

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.config.apiKey) {
      headers.authorization = this.config.apiKey.startsWith('Bearer ')
        ? this.config.apiKey
        : `Bearer ${this.config.apiKey}`;
    }

    const res = await this.httpRequest({ url: endpoint, headers, body });
    if (!res.ok) {
      const parsed = this.safeJsonParse(res.bodyText);
      const message =
        this.getNestedString(parsed, ['error', 'message']) || res.statusText || `HTTP ${res.status}`;
      return { text: '', error: `Custom API error: ${message}` };
    }

    const data = this.safeJsonParse(res.bodyText);
    const choice0Message = this.getNestedString(data, ['choices', '0', 'message', 'content']);
    const choice0Text = this.getNestedString(data, ['choices', '0', 'text']);
    const messageContent = this.getNestedString(data, ['message', 'content']);
    const topText = this.getNestedString(data, ['text']);

    const text = choice0Message || choice0Text || messageContent || topText || '';
    return { text };
  }

  async suggestCommandFix(command: string, errorOutput: string): Promise<LLMResponse> {
    const prompt = `A command failed to execute. Please analyze the error and suggest a fix.

Command: ${command}
Error output:
${errorOutput}

Please provide:
1. A brief explanation of what went wrong
2. A suggested fix or corrected command
3. Any additional tips to avoid this error in the future

Keep your response concise and practical.`;

    return this.chat(prompt);
  }
}

// Singleton instance
let llmServiceInstance: LLMService | null = null;

export const getLLMService = (config?: LLMConfig): LLMService => {
  if (!llmServiceInstance && config) {
    llmServiceInstance = new LLMService(config);
  } else if (llmServiceInstance && config) {
    llmServiceInstance.updateConfig(config);
  }
  
  if (!llmServiceInstance) {
    // Return a disabled service if no config provided
    llmServiceInstance = new LLMService({
      enabled: false,
      provider: 'gemini',
      apiKey: '',
      model: 'gemini-2.5-flash',
      autoSuggestOnError: false,
      zebraStripingEnabled: false,
    });
  }

  return llmServiceInstance;
};
