export type BuiltinPluginId = 'ai' | 'zebra' | 'commandCandidates' | 'serverStatus';

// Overall plugin ids can include installed plugins.
export type PluginId = string;

export type BuiltinPluginDefinition = {
  id: BuiltinPluginId;
  nameKey: string;
  descriptionKey: string;
  defaultEnabled: boolean;
};

export const BUILTIN_PLUGINS: BuiltinPluginDefinition[] = [
  {
    id: 'ai',
    nameKey: 'settings.plugins.ai.name',
    descriptionKey: 'settings.plugins.ai.desc',
    defaultEnabled: false,
  },
  {
    id: 'zebra',
    nameKey: 'settings.plugins.zebra.name',
    descriptionKey: 'settings.plugins.zebra.desc',
    defaultEnabled: false,
  },
  {
    id: 'commandCandidates',
    nameKey: 'settings.plugins.commandCandidates.name',
    descriptionKey: 'settings.plugins.commandCandidates.desc',
    defaultEnabled: false,
  },
  {
    id: 'serverStatus',
    nameKey: 'settings.plugins.serverStatus.name',
    descriptionKey: 'settings.plugins.serverStatus.desc',
    defaultEnabled: false,
  },
];
