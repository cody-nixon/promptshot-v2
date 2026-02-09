import { Loader2, Clock, Hash } from 'lucide-react';
import type { CompareResult, ModelGroup } from '../types';
import ReactMarkdown from 'react-markdown';

export function ResultsGrid({ results, groups }: { results: CompareResult[]; groups: ModelGroup[] }) {
  const findModel = (id: string) => {
    for (const g of groups) {
      const m = g.models.find(m => m.id === id);
      if (m) return { model: m, provider: g.provider };
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {results.map((r, i) => {
        const info = findModel(r.modelId);
        return (
          <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{info?.model.name || r.modelId}</div>
                <div className="text-xs text-gray-500">{info?.provider}</div>
              </div>
              {!r.loading && (
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{(r.time / 1000).toFixed(1)}s</span>
                  <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{r.tokens} tok</span>
                </div>
              )}
            </div>
            <div className="p-4 flex-1 text-sm leading-relaxed overflow-y-auto max-h-[500px]">
              {r.loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
              ) : (
                <div className="markdown-body"><ReactMarkdown>{r.text}</ReactMarkdown></div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
