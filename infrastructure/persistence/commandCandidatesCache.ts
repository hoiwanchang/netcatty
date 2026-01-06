import { STORAGE_KEY_COMMAND_CANDIDATES_CACHE } from "../config/storageKeys";
import { localStorageAdapter } from "./localStorageAdapter";

export type CommandCandidatesCacheEntry = {
  fetchedAt: number;
  commands: string[];
  lastAttemptAt?: number;
  error?: string;
  strategy?: string;
  shell?: string;
  version?: number;
};

type CommandCandidatesCacheState = Record<string, CommandCandidatesCacheEntry>;

const MAX_COMMANDS_TO_STORE = 15_000;

const readState = (): CommandCandidatesCacheState => {
  return localStorageAdapter.read<CommandCandidatesCacheState>(
    STORAGE_KEY_COMMAND_CANDIDATES_CACHE,
  ) ?? {};
};

const writeState = (state: CommandCandidatesCacheState) => {
  localStorageAdapter.write(STORAGE_KEY_COMMAND_CANDIDATES_CACHE, state);
};

export const commandCandidatesCache = {
  get(hostId: string): CommandCandidatesCacheEntry | null {
    const state = readState();
    return state[hostId] ?? null;
  },

  set(hostId: string, entry: CommandCandidatesCacheEntry) {
    const state = readState();
    state[hostId] = {
      fetchedAt: entry.fetchedAt,
      commands: (entry.commands ?? []).slice(0, MAX_COMMANDS_TO_STORE),
      lastAttemptAt: entry.lastAttemptAt,
      error: entry.error,
      strategy: entry.strategy,
      shell: entry.shell,
      version: entry.version,
    };
    writeState(state);
  },

  remove(hostId: string) {
    const state = readState();
    if (!(hostId in state)) return;
    delete state[hostId];
    writeState(state);
  },

  clearAll() {
    localStorageAdapter.remove(STORAGE_KEY_COMMAND_CANDIDATES_CACHE);
  },
};
