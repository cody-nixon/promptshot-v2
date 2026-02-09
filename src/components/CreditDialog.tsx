import { useState } from 'react';
import { X, CreditCard, Loader2 } from 'lucide-react';
import { api } from '@appdeploy/client';

const PACKS = [
  { amount: 5, label: '$5', desc: 'Try it out' },
  { amount: 10, label: '$10', desc: 'Most popular' },
  { amount: 20, label: '$20', desc: 'Best value' },
];

export function CreditDialog({ userId, authToken, onClose }: { userId: string; authToken: string; onClose: () => void }) {
  const [loading, setLoading] = useState(false);

  const buy = async (amount: number) => {
    setLoading(true);
    try {
      const res = await api.post('/api/checkout', { amount, origin: window.location.origin + window.location.pathname });
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl border border-gray-700 max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Add Credits</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-gray-400 text-sm mb-4">Credits are used for paid model API calls. Pricing is based on token usage.</p>
        <div className="space-y-2">
          {PACKS.map(pack => (
            <button
              key={pack.amount}
              onClick={() => buy(pack.amount)}
              disabled={loading}
              className="w-full flex items-center justify-between bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-brand-500 rounded-xl px-4 py-3 transition-all"
            >
              <div>
                <div className="font-bold text-lg">{pack.label}</div>
                <div className="text-xs text-gray-500">{pack.desc}</div>
              </div>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5 text-gray-500" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
