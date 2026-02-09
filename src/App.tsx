import { useState, useEffect, useCallback } from 'react';
import { api } from '@appdeploy/client';
import { Header } from './components/Header';
import { PromptArea } from './components/PromptArea';
import { ModelPicker } from './components/ModelPicker';
import { ResultsGrid } from './components/ResultsGrid';
import { UpgradeDialog } from './components/UpgradeDialog';
import { CreditDialog } from './components/CreditDialog';
import { AuthModal } from './components/AuthModal';
import type { ModelGroup, CompareResult } from './types';

function App() {
  const [userId, setUserId] = useState<string>('');
  const [authToken, setAuthToken] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [credits, setCredits] = useState(0);
  const [usage, setUsage] = useState<{ totalTokens: number; totalCost: number; totalQueries: number }>({ totalTokens: 0, totalCost: 0, totalQueries: 0 });
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [results, setResults] = useState<CompareResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);

  // Set up auth header interceptor
  useEffect(() => {
    if (authToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    } else {
      delete api.defaults.headers.common['Authorization'];
    }
  }, [authToken]);

  // Init user
  useEffect(() => {
    const uid = localStorage.getItem('ps_user_id');
    const token = localStorage.getItem('ps_auth_token');
    const storedEmail = localStorage.getItem('ps_email');
    if (!uid || !token) {
      setShowAuth(true);
      return;
    }
    setUserId(uid);
    setAuthToken(token);
    setEmail(storedEmail || '');
    // Validate token
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    api.get('/api/auth/me').then(res => {
      setCredits(res.data.credits || 0);
      setEmail(res.data.email || '');
      setUsage({ totalTokens: res.data.totalTokens || 0, totalCost: res.data.totalCost || 0, totalQueries: res.data.totalQueries || 0 });
      localStorage.setItem('ps_email', res.data.email || '');
    }).catch(() => {
      localStorage.removeItem('ps_user_id');
      localStorage.removeItem('ps_auth_token');
      localStorage.removeItem('ps_email');
      setShowAuth(true);
    });
  }, []);

  // Check for Google OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleCode = params.get('code');
    const googleState = params.get('state');
    const authTokenParam = params.get('auth_token');
    const userIdParam = params.get('user_id');
    const emailParam = params.get('email');
    if (googleCode && googleState) {
      // Exchange Google auth code for session via backend
      api.post('/api/auth/google/callback', { code: googleCode, state: googleState })
        .then(res => {
          handleAuth(res.data.userId, res.data.authToken, res.data.email);
        })
        .catch(err => {
          console.error('Google OAuth failed:', err);
          setShowAuth(true);
        })
        .finally(() => {
          window.history.replaceState({}, '', window.location.pathname);
        });
    } else if (authTokenParam && userIdParam && emailParam) {
      handleAuth(userIdParam, authTokenParam, emailParam);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Check for payment success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (sessionId && authToken) {
      api.post('/api/webhook', { sessionId }).then(() => {
        api.get('/api/auth/me').then(r => setCredits(r.data.credits || 0));
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [authToken]);

  // Load models
  useEffect(() => {
    api.get('/api/models').then(res => {
      setModelGroups(res.data.groups || []);
      setModelsLoading(false);
    }).catch(() => setModelsLoading(false));
  }, []);

  const refreshCredits = useCallback(async () => {
    if (!authToken) return;
    const r = await api.get('/api/auth/me');
    setCredits(r.data.credits || 0);
  }, [authToken]);

  const handleAuth = (uid: string, token: string, userEmail: string) => {
    localStorage.setItem('ps_user_id', uid);
    localStorage.setItem('ps_auth_token', token);
    localStorage.setItem('ps_email', userEmail);
    setUserId(uid);
    setAuthToken(token);
    setEmail(userEmail);
    setShowAuth(false);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    api.get('/api/auth/me').then(r => setCredits(r.data.credits || 0));
  };

  const handleLogout = async () => {
    try { await api.post('/api/auth/logout'); } catch {}
    localStorage.removeItem('ps_user_id');
    localStorage.removeItem('ps_auth_token');
    localStorage.removeItem('ps_email');
    setUserId('');
    setAuthToken('');
    setEmail('');
    setCredits(0);
    setResults([]);
    setSelectedModels([]);
    delete api.defaults.headers.common['Authorization'];
    setShowAuth(true);
  };

  const toggleModel = (modelId: string, isFree: boolean) => {
    if (!isFree && credits <= 0) {
      setShowUpgrade(true);
      return;
    }
    setSelectedModels(prev => {
      if (prev.includes(modelId)) return prev.filter(m => m !== modelId);
      if (prev.length >= 10) return prev;
      return [...prev, modelId];
    });
  };

  const compare = async () => {
    if (!prompt.trim() || selectedModels.length === 0) return;
    setLoading(true);
    setResults(selectedModels.map(m => ({ modelId: m, loading: true, text: '', time: 0, tokens: 0 })));
    try {
      const res = await api.post('/api/chat', { prompt: prompt.trim(), models: selectedModels });
      setResults(res.data.results);
      refreshCredits();
    } catch (e: any) {
      if (e?.response?.status === 401) {
        handleLogout();
        return;
      }
      setResults(selectedModels.map(m => ({ modelId: m, loading: false, text: e?.response?.data?.error || 'Error', time: 0, tokens: 0 })));
    }
    setLoading(false);
  };

  if (showAuth) {
    return <AuthModal onAuth={handleAuth} />;
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Header credits={credits} email={email} usage={usage} onAddCredits={() => setShowCredits(true)} onLogout={handleLogout} />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <PromptArea prompt={prompt} setPrompt={setPrompt} onCompare={compare} loading={loading} selectedCount={selectedModels.length} />
        <ModelPicker groups={modelGroups} selected={selectedModels} onToggle={toggleModel} loading={modelsLoading} credits={credits} />
        {results.length > 0 && <ResultsGrid results={results} groups={modelGroups} />}
      </main>
      {showUpgrade && <UpgradeDialog onClose={() => setShowUpgrade(false)} onBuy={() => { setShowUpgrade(false); setShowCredits(true); }} />}
      {showCredits && <CreditDialog userId={userId} authToken={authToken} onClose={() => setShowCredits(false)} />}
    </div>
  );
}

export default App;
