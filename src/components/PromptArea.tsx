import { Send, Loader2 } from 'lucide-react';

export function PromptArea({ prompt, setPrompt, onCompare, loading, selectedCount }: {
  prompt: string; setPrompt: (s: string) => void; onCompare: () => void; loading: boolean; selectedCount: number;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Enter your prompt here... Compare how different AI models respond."
        className="w-full bg-transparent resize-none outline-none text-gray-100 placeholder-gray-500 min-h-[100px] text-base"
        onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) onCompare(); }}
      />
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
        <span className="text-sm text-gray-500">{selectedCount}/4 models selected • ⌘+Enter to compare</span>
        <button
          onClick={onCompare}
          disabled={loading || !prompt.trim() || selectedCount === 0}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-5 py-2 font-medium transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Compare
        </button>
      </div>
    </div>
  );
}
