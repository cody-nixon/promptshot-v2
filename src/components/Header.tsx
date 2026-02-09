import { Zap, Plus, Sparkles, LogOut } from 'lucide-react';

export function Header({ credits, email, onAddCredits, onLogout }: { credits: number; email: string; onAddCredits: () => void; onLogout: () => void }) {
  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-brand-400" />
          <span className="text-xl font-bold bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">PromptShot</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400 hidden sm:block">{email}</span>
          <div className="flex items-center gap-1.5 bg-gray-800/50 rounded-full px-3 py-1.5 text-sm">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="font-mono font-medium">${credits.toFixed(2)}</span>
          </div>
          <button onClick={onAddCredits} className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-full px-4 py-1.5 text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            Add Credits
          </button>
          <button onClick={onLogout} className="text-gray-400 hover:text-white transition-colors" title="Log out">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
