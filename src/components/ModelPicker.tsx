import { useState } from 'react';
import { Check, Lock, ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { ModelGroup } from '../types';

export function ModelPicker({ groups, selected, onToggle, loading, credits }: {
  groups: ModelGroup[]; selected: string[]; onToggle: (id: string, isFree: boolean) => void; loading: boolean; credits: number;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (loading) return <div className="text-center py-8 text-gray-500">Loading models...</div>;

  const filtered = groups.map(g => ({
    ...g,
    models: g.models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase()))
  })).filter(g => g.models.length > 0);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Search className="w-4 h-4 text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search models..."
          className="bg-transparent outline-none text-sm flex-1 text-gray-100 placeholder-gray-500"
        />
      </div>
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {filtered.map(group => {
          const isExp = expanded[group.provider] ?? (filtered.length <= 5);
          return (
            <div key={group.provider}>
              <button onClick={() => setExpanded(p => ({ ...p, [group.provider]: !isExp }))} className="flex items-center gap-2 w-full text-left py-1.5 px-2 hover:bg-gray-800 rounded text-sm font-medium text-gray-300">
                {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {group.provider}
                <span className="text-gray-600 text-xs">({group.models.length})</span>
              </button>
              {isExp && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 pl-6 pb-2">
                  {group.models.map(model => {
                    const isSel = selected.includes(model.id);
                    const canUse = model.isFree || credits > 0;
                    return (
                      <button
                        key={model.id}
                        onClick={() => onToggle(model.id, model.isFree)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all ${
                          isSel ? 'bg-brand-600/20 border border-brand-500 text-white' :
                          canUse ? 'hover:bg-gray-800 border border-transparent text-gray-300' :
                          'opacity-50 border border-transparent text-gray-500 hover:bg-gray-800/50'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{model.name}</div>
                          <div className="text-xs text-gray-500">
                            {model.isFree ? <span className="text-green-400">Free</span> : `$${(parseFloat(model.pricing.prompt) * 1000000).toFixed(2)}/M tok`}
                          </div>
                        </div>
                        {isSel ? <Check className="w-4 h-4 text-brand-400 shrink-0" /> :
                         !model.isFree && credits <= 0 ? <Lock className="w-3.5 h-3.5 text-gray-600 shrink-0" /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
