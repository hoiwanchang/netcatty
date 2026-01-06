import { useCallback, useMemo } from "react";
import {
  commandCandidatesCache,
  type CommandCandidatesCacheEntry,
} from "../../infrastructure/persistence/commandCandidatesCache";

export const useCommandCandidatesCache = () => {
  const get = useCallback((hostId: string): CommandCandidatesCacheEntry | null => {
    return commandCandidatesCache.get(hostId);
  }, []);

  const set = useCallback((hostId: string, entry: CommandCandidatesCacheEntry) => {
    commandCandidatesCache.set(hostId, entry);
  }, []);

  const remove = useCallback((hostId: string) => {
    commandCandidatesCache.remove(hostId);
  }, []);

  return useMemo(() => ({ get, set, remove }), [get, remove, set]);
};
