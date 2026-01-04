import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LLMSuggestionProps {
  suggestion: string;
  command: string;
  error: string;
  theme?: 'dark' | 'light';
}

export const LLMSuggestion: React.FC<LLMSuggestionProps> = ({
  suggestion,
  command,
  error,
  theme = 'dark',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={cn(
        'llm-suggestion border-l-4 my-2 rounded',
        theme === 'dark'
          ? 'bg-blue-950/30 border-blue-500/50'
          : 'bg-blue-50 border-blue-500'
      )}
    >
      <button
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
          theme === 'dark'
            ? 'hover:bg-blue-900/20 text-blue-200'
            : 'hover:bg-blue-100 text-blue-900'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        )}
        <Sparkles className="w-4 h-4 flex-shrink-0" />
        <span className="font-medium text-sm">
          AI Suggestion for: <code className="font-mono">{command}</code>
        </span>
      </button>
      
      {isExpanded && (
        <div
          className={cn(
            'px-3 py-2 border-t text-sm',
            theme === 'dark'
              ? 'border-blue-800/50 text-gray-300'
              : 'border-blue-200 text-gray-700'
          )}
        >
          <div className="space-y-3">
            <div>
              <div className="font-semibold mb-1 text-xs uppercase tracking-wide opacity-70">
                Error Output:
              </div>
              <pre
                className={cn(
                  'text-xs font-mono p-2 rounded overflow-x-auto',
                  theme === 'dark' ? 'bg-black/20' : 'bg-white/50'
                )}
              >
                {error}
              </pre>
            </div>
            
            <div>
              <div className="font-semibold mb-1 text-xs uppercase tracking-wide opacity-70">
                Suggestion:
              </div>
              <div className="prose prose-sm max-w-none">
                {suggestion.split('\n').map((line, i) => (
                  <p key={i} className="mb-1 last:mb-0">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
