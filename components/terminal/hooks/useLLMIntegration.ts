import { useEffect, useRef, useState, useCallback } from 'react';
import { LLMConfig } from '../../../domain/models';
import { getLLMService, LLMResponse } from '../../../infrastructure/services/llmService';

export interface CommandOutput {
  command: string;
  output: string;
  exitCode?: number;
  hasError: boolean;
  timestamp: number;
}

export interface LLMSuggestionData {
  command: string;
  error: string;
  suggestion: string;
  timestamp: number;
}

export const useLLMIntegration = (llmConfig?: LLMConfig) => {
  const [suggestions, setSuggestions] = useState<LLMSuggestionData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const llmServiceRef = useRef(getLLMService(llmConfig));

  // Update LLM service when config changes
  useEffect(() => {
    if (llmConfig) {
      llmServiceRef.current.updateConfig(llmConfig);
    }
  }, [llmConfig]);

  const handleLLMChat = useCallback(async (prompt: string): Promise<LLMResponse> => {
    if (!llmConfig?.enabled) {
      return { text: '', error: 'LLM is not enabled. Please configure it in settings.' };
    }

    setIsProcessing(true);
    try {
      const response = await llmServiceRef.current.chat(prompt);
      return response;
    } finally {
      setIsProcessing(false);
    }
  }, [llmConfig?.enabled]);

  const suggestCommandFix = useCallback(async (command: string, errorOutput: string) => {
    if (!llmConfig?.enabled || !llmConfig?.autoSuggestOnError) {
      return;
    }

    setIsProcessing(true);
    try {
      const response = await llmServiceRef.current.suggestCommandFix(command, errorOutput);
      
      if (response.text && !response.error) {
        const newSuggestion: LLMSuggestionData = {
          command,
          error: errorOutput,
          suggestion: response.text,
          timestamp: Date.now(),
        };
        setSuggestions(prev => [...prev, newSuggestion]);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [llmConfig?.enabled, llmConfig?.autoSuggestOnError]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  return {
    suggestions,
    isProcessing,
    handleLLMChat,
    suggestCommandFix,
    clearSuggestions,
  };
};
