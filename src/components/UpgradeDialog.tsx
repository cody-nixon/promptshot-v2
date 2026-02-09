import { X, Zap } from 'lucide-react';

export function UpgradeDialog({ onClose, onBuy }: { onClose: () => void; onBuy: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl border border-gray-700 max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Unlock Paid Models</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-gray-400 text-sm mb-6">This model requires credits. Add credits to your account to use premium models from OpenAI, Anthropic, Google, and more.</p>
        <button onClick={onBuy} className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg py-3 font-medium transition-colors">
          <Zap className="w-5 h-5" />
          Add Credits
        </button>
      </div>
    </div>
  );
}
