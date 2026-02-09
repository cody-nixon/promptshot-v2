import { useState } from 'react';
import { Loader2, Clock, Hash, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CompareResult, ModelGroup } from '../types';
import ReactMarkdown from 'react-markdown';

export function ResultsGrid({ results, groups }: { results: CompareResult[]; groups: ModelGroup[] }) {
  const [activeTab, setActiveTab] = useState(0);
  const findModel = (id: string) => {
    for (const g of groups) {
      const m = g.models.find(m => m.id === id);
      if (m) return { model: m, provider: g.provider };
    }
    return null;
  };

  if (results.length === 0) return null;

  // Mobile: tabbed view. Desktop: grid.
  return (
    <div>
      {/* Mobile tabs */}
      <div className="md:hidden">
        <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-2 scrollbar-hide">
          {results.map((r, i) => {
            const info = findModel(r.modelId);
            const name = info?.model.name || r.modelId.split('/').pop() || r.modelId;
            const shortName = name.length > 20 ? name.substring(0, 18) + '…' : name;
            return (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeTab === i
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {shortName}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setActiveTab(Math.max(0, activeTab - 1))}
            disabled={activeTab === 0}
            className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs text-gray-500">{activeTab + 1} / {results.length}</span>
          <button
            onClick={() => setActiveTab(Math.min(results.length - 1, activeTab + 1))}
            disabled={activeTab === results.length - 1}
            className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        {renderCard(results[activeTab], activeTab, findModel)}
      </div>

      {/* Desktop grid */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((r, i) => renderCard(r, i, findModel))}
      </div>
    </div>
  );
}

function renderCard(
  r: CompareResult,
  i: number,
  findModel: (id: string) => { model: any; provider: string } | null
) {
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
}
