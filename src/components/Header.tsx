import { Zap, Plus, Sparkles, LogOut, BarChart3 } from 'lucide-react';
import { useState } from 'react';

export function Header({ credits, email, onAddCredits, onLogout, usage }: {
  credits: number; email: string; onAddCredits: () => void; onLogout: () => void;
  usage?: { totalTokens: number; totalCost: number; totalQueries: number };
}) {
  const [showUsage, setShowUsage] = useState(false);

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  };

  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-12 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-brand-400" />
          <span className="text-base font-bold bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent hidden sm:inline">PromptShot</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 hidden md:block">{email}</span>
          <button
            onClick={() => setShowUsage(!showUsage)}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
            title="Usage stats"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5 bg-gray-800/50 rounded-full px-2.5 py-1 text-xs">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            <span className="font-mono font-medium">${credits.toFixed(2)}</span>
          </div>
          <button onClick={onAddCredits} className="flex items-center gap-1 bg-brand-600 hover:bg-brand-500 text-white rounded-full px-3 py-1 text-xs font-medium transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Credits</span>
          </button>
          <button onClick={onLogout} className="text-gray-400 hover:text-white transition-colors" title="Log out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      {showUsage && usage && (
        <div className="border-t border-gray-800 bg-gray-900/90 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-gray-500 text-xs">Total Queries</div>
              <div className="font-mono font-medium text-white">{usage.totalQueries}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">Tokens Used</div>
              <div className="font-mono font-medium text-white">{formatTokens(usage.totalTokens)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">Total Spend</div>
              <div className="font-mono font-medium text-white">${usage.totalCost.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">Balance</div>
              <div className="font-mono font-medium text-green-400">${credits.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
