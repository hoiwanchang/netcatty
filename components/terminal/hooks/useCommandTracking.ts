import { useCallback, useRef } from 'react';

export interface CommandBlock {
  id: string;
  command: string;
  startTime: number;
  endTime?: number;
  hasError: boolean;
  errorOutput?: string;
}

const ERROR_PATTERNS = [
  /command not found/i,
  /no such file or directory/i,
  /permission denied/i,
  /cannot/i,
  /error:/i,
  /failed/i,
  /syntax error/i,
  /segmentation fault/i,
  /core dumped/i,
];

export const useCommandTracking = () => {
  const commandBlocks = useRef<CommandBlock[]>([]);
  const currentCommand = useRef<CommandBlock | null>(null);
  const outputBuffer = useRef<string>('');
  const zebraIndex = useRef(0);

  const startCommand = useCallback((command: string) => {
    // Complete the previous command if any
    if (currentCommand.current) {
      currentCommand.current.endTime = Date.now();
      commandBlocks.current.push(currentCommand.current);
    }

    // Start new command
    const newCommand: CommandBlock = {
      id: `cmd-${Date.now()}-${Math.random()}`,
      command,
      startTime: Date.now(),
      hasError: false,
    };
    currentCommand.current = newCommand;
    outputBuffer.current = '';
    zebraIndex.current = (zebraIndex.current + 1) % 2;
  }, []);

  const appendOutput = useCallback((data: string) => {
    outputBuffer.current += data;
    
    // Check for error patterns in the output
    if (currentCommand.current && !currentCommand.current.hasError) {
      for (const pattern of ERROR_PATTERNS) {
        if (pattern.test(outputBuffer.current)) {
          currentCommand.current.hasError = true;
          currentCommand.current.errorOutput = outputBuffer.current;
          break;
        }
      }
    }
  }, []);

  const completeCommand = useCallback(() => {
    if (currentCommand.current) {
      currentCommand.current.endTime = Date.now();
      commandBlocks.current.push(currentCommand.current);
      currentCommand.current = null;
      outputBuffer.current = '';
    }
  }, []);

  const getCurrentCommand = useCallback(() => {
    return currentCommand.current;
  }, []);

  const getZebraIndex = useCallback(() => {
    return zebraIndex.current;
  }, []);

  const getRecentErrorCommand = useCallback((): CommandBlock | null => {
    // Find the most recent command with error
    for (let i = commandBlocks.current.length - 1; i >= 0; i--) {
      const cmd = commandBlocks.current[i];
      if (cmd.hasError && cmd.errorOutput) {
        return cmd;
      }
    }
    return null;
  }, []);

  return {
    startCommand,
    appendOutput,
    completeCommand,
    getCurrentCommand,
    getZebraIndex,
    getRecentErrorCommand,
  };
};
