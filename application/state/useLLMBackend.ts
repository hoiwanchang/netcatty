import { useCallback } from "react";
import type { LLMConfig } from "../../domain/models";
import { getLLMService } from "../../infrastructure/services/llmService";

export const useLLMBackend = () => {
  const testChat = useCallback(async (config: LLMConfig, prompt: string) => {
    const service = getLLMService(config);
    return await service.chat(prompt);
  }, []);

  return { testChat };
};
