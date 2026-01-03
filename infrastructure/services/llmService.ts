import { GoogleGenerativeAI } from '@google/genai';
import { LLMConfig } from '../../domain/models';

export interface LLMResponse {
  text: string;
  error?: string;
}

export class LLMService {
  private config: LLMConfig;
  private client: GoogleGenerativeAI | null = null;

  constructor(config: LLMConfig) {
    this.config = config;
    if (config.enabled && config.apiKey) {
      this.initializeClient();
    }
  }

  private initializeClient() {
    if (this.config.provider === 'gemini' && this.config.apiKey) {
      this.client = new GoogleGenerativeAI(this.config.apiKey);
    }
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

    if (!this.config.apiKey) {
      return { text: '', error: 'API key is not configured' };
    }

    try {
      if (this.config.provider === 'gemini') {
        return await this.chatGemini(prompt);
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
      const model = this.client.getGenerativeModel({ model: this.config.model || 'gemini-pro' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      return { text };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { text: '', error: `Gemini API error: ${errorMessage}` };
    }
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
      model: 'gemini-pro',
      autoSuggestOnError: false,
      zebraStripingEnabled: false,
    });
  }

  return llmServiceInstance;
};
