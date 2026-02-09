
const randomUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};

// --- Password hashing with PBKDF2 ---
async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const encoder = new TextEncoder();
  const saltBytes = salt ? Uint8Array.from(atob(salt), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltB64 = salt || btoa(String.fromCharCode(...saltBytes));
  return { hash: hashB64, salt: saltB64 };
}

async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const { hash } = await hashPassword(password, storedSalt);
  return hash === storedHash;
}

// --- Auth middleware helper ---
async function authenticateRequest(event: LambdaEvent): Promise<{ user: any; userId: string } | null> {
  const authHeader = (event as any).headers?.authorization || (event as any).headers?.Authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;
  const { items } = await db.list('users', { filter: { authToken: token } });
  if (items.length === 0) return null;
  return { user: items[0], userId: (items[0] as any).id };
}

interface JsonResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
}

const json = (data: unknown, status = 200): JsonResponse => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

const error = (message: string, status = 400): JsonResponse => json({ error: message }, status);

// --- Config helpers ---
const ADMIN_SECRET = 'ps-admin-9f8e7d6c5b4a3210';

async function getConfig(key: string): Promise<string | null> {
    const { items } = await db.list('config', { filter: { key } });
    if (items.length > 0) return (items[0] as any).value;
    return null;
}

async function setConfig(key: string, value: string) {
    const { items } = await db.list('config', { filter: { key } });
    if (items.length > 0) {
        await db.update('config', [{ id: (items[0] as any).id, record: { key, value } }]);
    } else {
        await db.add('config', [{ key, value }]);
    }
}

async function getOpenRouterKey(): Promise<string> {
    const key = await getConfig('OPENROUTER_API_KEY');
    if (!key) throw new Error('OPENROUTER_API_KEY not configured. Use POST /api/admin/config to set it.');
    return key;
}

async function getStripeSecret(): Promise<string> {
    const key = await getConfig('STRIPE_SECRET_KEY');
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured. Use POST /api/admin/config to set it.');
    return key;
}

// --- Subscriptions ---
const SUBSCRIPTIONS_TABLE = "entity_subscriptions";

type SubscriptionRecord = {
    id: string;
    entity_type: string;
    entity_id: string;
    connection_id: string;
    created_at: number;
};

async function listSubscriptions(): Promise<SubscriptionRecord[]> {
    const { items } = await db.list(SUBSCRIPTIONS_TABLE, { limit: 1000 });
    return items as SubscriptionRecord[];
}

async function addSubscription(entityType: string, entityId: string, connectionId: string) {
    await db.add(SUBSCRIPTIONS_TABLE, [
        {
            entity_type: entityType,
            entity_id: entityId,
            connection_id: connectionId,
            created_at: Date.now(),
        },
    ]);
}

async function removeSubscriptions(
    entityType: string,
    entityId: string,
    connectionId: string
) {
    const items = await listSubscriptions();
    const matchIds = items
        .filter(
            item =>
                item.entity_type === entityType &&
                item.entity_id === entityId &&
                item.connection_id === connectionId
        )
        .map(item => item.id);
    if (matchIds.length > 0) {
        await db.delete(SUBSCRIPTIONS_TABLE, matchIds);
    }
}

async function removeSubscriptionsByConnection(connectionId: string) {
    const items = await listSubscriptions();
    const matchIds = items
        .filter(item => item.connection_id === connectionId)
        .map(item => item.id);
    if (matchIds.length > 0) {
        await db.delete(SUBSCRIPTIONS_TABLE, matchIds);
    }
}

async function notifySubscribers(
    entityType: string,
    entityId: string,
    payload: unknown,
    excludeConnectionId?: string
) {
    const items = await listSubscriptions();
    const targets = items
        .filter(item => item.entity_type === entityType && item.entity_id === entityId)
        .map(item => item.connection_id)
        .filter(id => id !== excludeConnectionId);

    for (const connectionId of targets) {
        await ws.send(connectionId, {
            v: 1,
            type: "entity.update",
            payload: {
                entity_type: entityType,
                entity_id: entityId,
                data: payload,
            },
        });
    }
}

// --- Router ---
interface RouteParams {
    [key: string]: string;
}

const matchRoute = (pattern: string, method: string, path: string): RouteParams | null => {
    const [patternMethod, patternPath] = pattern.split(' ');
    if (patternMethod !== method) return null;

    const patternParts = patternPath.split('/');
    const pathParts = path.split('/');
    if (patternParts.length !== pathParts.length) return null;

    const params: RouteParams = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = pathParts[i];
        } else if (patternParts[i] !== pathParts[i]) {
            return null;
        }
    }
    return params;
};

interface HandlerContext {
    body: unknown;
    query: Record<string, string>;
    params: RouteParams;
    event: LambdaEvent;
}

interface LambdaEvent {
    httpMethod?: string;
    requestContext?: { http?: { method?: string } };
    rawPath?: string;
    path?: string;
    body?: string | object;
    queryStringParameters?: Record<string, string>;
}

type RouteHandler = (ctx: HandlerContext) => Promise<JsonResponse>;
type Routes = Record<string, RouteHandler>;

const router = (routes: Routes) => async (event: LambdaEvent): Promise<JsonResponse> => {
    const method = event.httpMethod || event.requestContext?.http?.method || '';
    const path = event.rawPath || event.path || '';

    let body: unknown = {};
    try {
        if (event.body) {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        }
    } catch {}

    const query = event.queryStringParameters || {};

    for (const [pattern, handler] of Object.entries(routes)) {
        const params = matchRoute(pattern, method, path);
        if (params !== null) {
            try {
                return await handler({ body, query, params, event });
            } catch (err) {
                console.error(err);
                return error(err instanceof Error ? err.message : 'Internal error', 500);
            }
        }
    }

    return error('Not found', 404);
};

export const handler = router({
    'GET /api/_healthcheck': async () => {
        return json({ message: 'Success' });
    },

    // --- Admin config endpoint ---
    'POST /api/admin/config': async ({ body }) => {
        const { secret, key, value } = (body || {}) as { secret: string; key: string; value: string };
        if (secret !== ADMIN_SECRET) return error('Unauthorized', 401);
        if (!key || !value) return error('key and value required');
        const allowedKeys = ['OPENROUTER_API_KEY', 'STRIPE_SECRET_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
        if (!allowedKeys.includes(key)) return error('Invalid config key. Allowed: ' + allowedKeys.join(', '));
        await setConfig(key, value);
        return json({ ok: true, key });
    },

    'GET /api/admin/config': async ({ query }) => {
        if (query.secret !== ADMIN_SECRET) return error('Unauthorized', 401);
        const keys = ['OPENROUTER_API_KEY', 'STRIPE_SECRET_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
        const result: Record<string, string> = {};
        for (const k of keys) {
            const v = await getConfig(k);
            result[k] = v ? '***' + v.slice(-8) : 'NOT SET';
        }
        return json(result);
    },

    // Subscribe to entity updates
    'POST /api/subscriptions': async ({ body }) => {
        const { entity_type, entity_id, connection_id } = (body || {}) as Record<string, string>;
        if (!entity_type || !entity_id || !connection_id) {
            return error('entity_type, entity_id, connection_id are required');
        }
        await addSubscription(entity_type, entity_id, connection_id);
        return json({ ok: true });
    },

    'POST /api/subscriptions/remove': async ({ body }) => {
        const { entity_type, entity_id, connection_id } = (body || {}) as Record<string, string>;
        if (!entity_type || !entity_id || !connection_id) {
            return error('entity_type, entity_id, connection_id are required');
        }
        await removeSubscriptions(entity_type, entity_id, connection_id);
        return json({ ok: true });
    },

    'GET /api/models': async () => {
        try {
            const { items } = await db.list('model_cache', { limit: 1 });
            const now = Date.now();
            if (items.length > 0 && items[0].timestamp && (now - (items[0].timestamp as number)) < 3600000) {
                return json({ groups: items[0].groups });
            }

            const res = await fetch('https://openrouter.ai/api/v1/models');
            const data = await res.json() as { data: any[] };
            const models = data.data || [];

            const grouped: Record<string, any[]> = {};
            for (const m of models) {
                const provider = m.id.split('/')[0] || 'other';
                const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
                if (!grouped[providerName]) grouped[providerName] = [];
                const promptPrice = parseFloat(m.pricing?.prompt || '0');
                const completionPrice = parseFloat(m.pricing?.completion || '0');
                const isFree = promptPrice === 0 && completionPrice === 0;
                grouped[providerName].push({
                    id: m.id,
                    name: m.name || m.id,
                    pricing: { prompt: m.pricing?.prompt || '0', completion: m.pricing?.completion || '0' },
                    context_length: m.context_length || 4096,
                    isFree,
                });
            }

            const groups = Object.entries(grouped)
                .map(([provider, models]) => ({ provider, models: models.sort((a: any, b: any) => a.name.localeCompare(b.name)) }))
                .sort((a, b) => b.models.length - a.models.length);

            if (items.length > 0) {
                await db.update('model_cache', [{ id: items[0].id, record: { groups, timestamp: now } }]);
            } else {
                await db.add('model_cache', [{ groups, timestamp: now }]);
            }

            return json({ groups });
        } catch (err) {
            console.error(err);
            return error('Failed to fetch models', 500);
        }
    },

    // --- Auth routes ---
    // --- Google OAuth routes ---
    'POST /api/auth/google': async () => {
        const clientId = await getConfig('GOOGLE_CLIENT_ID');
        if (!clientId) return error('Google OAuth not configured', 500);
        const redirectUri = 'https://v2.appdeploy.ai/app/c3dab34749ba422a94/';
        const state = randomUUID();
        await db.add('oauth_states', [{ state, created_at: Date.now() }]);
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'email profile',
            access_type: 'offline',
            state,
        });
        const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        return json({ url });
    },

    'POST /api/auth/google/callback': async ({ body }) => {
        const { code, state } = (body || {}) as { code: string; state: string };
        if (!code || !state) return error('Missing code or state');
        // Verify state
        const { items: stateItems } = await db.list('oauth_states', { filter: { state } });
        if (stateItems.length === 0) return error('Invalid state parameter', 403);
        // Clean up state
        await db.delete('oauth_states', stateItems.map((s: any) => s.id));
        // Clean up old states (older than 10 min)
        const { items: allStates } = await db.list('oauth_states', { limit: 100 });
        const oldStates = allStates.filter((s: any) => Date.now() - s.created_at > 600000);
        if (oldStates.length > 0) await db.delete('oauth_states', oldStates.map((s: any) => s.id));

        const clientId = await getConfig('GOOGLE_CLIENT_ID');
        const clientSecret = await getConfig('GOOGLE_CLIENT_SECRET');
        if (!clientId || !clientSecret) return error('Google OAuth not configured', 500);
        const redirectUri = 'https://v2.appdeploy.ai/app/c3dab34749ba422a94/';

        // Exchange code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
        });
        const tokenData = await tokenRes.json() as any;
        if (tokenData.error) return error('Token exchange failed: ' + tokenData.error_description, 400);

        // Get user info
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userInfo = await userInfoRes.json() as any;
        if (!userInfo.email) return error('Failed to get user email from Google', 400);
        const normalizedEmail = userInfo.email.toLowerCase().trim();

        // Check if user exists
        const { items: existingUsers } = await db.list('users', { filter: { email: normalizedEmail } });
        let userId: string;
        let authToken: string;
        if (existingUsers.length > 0) {
            // Existing user - update with Google info and new auth token
            const user = existingUsers[0] as any;
            authToken = randomUUID();
            await db.update('users', [{ id: user.id, record: { ...user, authToken, googleId: userInfo.id } }]);
            userId = user.id;
        } else {
            // New user
            authToken = randomUUID();
            const [newId] = await db.add('users', [{ email: normalizedEmail, googleId: userInfo.id, authToken, credits: 0, created_at: Date.now() }]);
            if (!newId) return error('Failed to create user', 500);
            userId = newId;
        }

        return json({ authToken, userId, email: normalizedEmail });
    },

    'POST /api/auth/signup': async ({ body }) => {
        const { email, password } = (body || {}) as { email: string; password: string };
        if (!email || !password) return error('Email and password required');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return error('Invalid email format');
        if (password.length < 8) return error('Password must be at least 8 characters');
        const normalizedEmail = email.toLowerCase().trim();
        const { items: existing } = await db.list('users', { filter: { email: normalizedEmail } });
        if (existing.length > 0) return error('Email already registered');
        const { hash, salt } = await hashPassword(password);
        const authToken = randomUUID();
        const [userId] = await db.add('users', [{ email: normalizedEmail, hashedPassword: hash, passwordSalt: salt, authToken, credits: 0, created_at: Date.now() }]);
        if (!userId) return error('Failed to create user', 500);
        return json({ userId, authToken, email: normalizedEmail });
    },

    'POST /api/auth/login': async ({ body }) => {
        const { email, password } = (body || {}) as { email: string; password: string };
        if (!email || !password) return error('Email and password required');
        const normalizedEmail = email.toLowerCase().trim();
        const { items } = await db.list('users', { filter: { email: normalizedEmail } });
        if (items.length === 0) return error('Invalid email or password', 401);
        const user = items[0] as any;
        const valid = await verifyPassword(password, user.hashedPassword, user.passwordSalt);
        if (!valid) return error('Invalid email or password', 401);
        const authToken = randomUUID();
        await db.update('users', [{ id: user.id, record: { ...user, authToken } }]);
        return json({ userId: user.id, authToken, email: user.email });
    },

    'POST /api/auth/logout': async ({ event }) => {
        const auth = await authenticateRequest(event);
        if (!auth) return error('Unauthorized', 401);
        await db.update('users', [{ id: auth.userId, record: { ...(auth.user as any), authToken: '' } }]);
        return json({ ok: true });
    },

    'GET /api/auth/me': async ({ event }) => {
        const auth = await authenticateRequest(event);
        if (!auth) return error('Unauthorized', 401);
        const u = auth.user as any;
        return json({ userId: auth.userId, email: u.email, credits: u.credits || 0, totalTokens: u.totalTokens || 0, totalCost: u.totalCost || 0, totalQueries: u.totalQueries || 0 });
    },

    'GET /api/usage': async ({ event }) => {
        const auth = await authenticateRequest(event);
        if (!auth) return error('Unauthorized', 401);
        const u = auth.user as any;
        const { items } = await db.list('usage_logs', { filter: { userId: auth.userId }, limit: 50 });
        const sorted = items.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
        return json({
            summary: { totalTokens: u.totalTokens || 0, totalCost: u.totalCost || 0, totalQueries: u.totalQueries || 0 },
            recent: sorted.slice(0, 20).map((l: any) => ({ tokens: l.tokens, cost: l.cost, models: l.models, timestamp: l.timestamp }))
        });
    },

    'GET /api/user/:id': async ({ params, event }) => {
        const auth = await authenticateRequest(event);
        if (!auth || auth.userId !== params.id) return error('Unauthorized', 401);
        return json({ credits: (auth.user as any).credits || 0, email: (auth.user as any).email });
    },

    'POST /api/chat': async ({ body, event }) => {
        const { prompt, models } = body as { prompt: string; models: string[] };
        if (!prompt || !models || models.length === 0) return error('prompt and models required');

        // Input validation
        if (typeof prompt !== 'string' || prompt.trim().length === 0 || prompt.length > 10000) return error('Prompt must be 1-10000 characters');
        if (!Array.isArray(models) || models.length > 10) return error('Max 10 models allowed');
        const validModelId = /^[a-zA-Z0-9_\-]+\/[a-zA-Z0-9_.\-:]+$/;
        for (const m of models) { if (typeof m !== 'string' || !validModelId.test(m)) return error('Invalid model ID: ' + m); }

        // Auth via Bearer token
        const auth = await authenticateRequest(event);
        if (!auth) return error('Unauthorized', 401);
        const userId = auth.userId;
        const user = auth.user;
        const userCredits = (user as any).credits || 0;

        // Rate limiting
        const now = Date.now();
        const rateLimitKey = 'rate_' + userId;
        const { items: rateItems } = await db.list('rate_limits', { filter: { key: rateLimitKey } });
        const recentRequests = rateItems.filter((r: any) => now - r.timestamp < 60000);
        const isPaid = userCredits > 0;
        const rateLimit = isPaid ? 30 : 10;
        if (recentRequests.length >= rateLimit) return error('Rate limit exceeded. Try again in a minute.', 429);
        await db.add('rate_limits', [{ key: rateLimitKey, timestamp: now }]);
        const oldEntries = rateItems.filter((r: any) => now - r.timestamp >= 60000).map((r: any) => r.id);
        if (oldEntries.length > 0) await db.delete('rate_limits', oldEntries);

        // Get model info for pricing
        const { items: cacheItems } = await db.list('model_cache', { limit: 1 });
        const allModels = cacheItems.length > 0 ? ((cacheItems[0] as any).groups || []).flatMap((g: any) => g.models) : [];

        // Check if user can afford paid models
        const paidModels = models.filter(mid => {
            const m = allModels.find((am: any) => am.id === mid);
            return m && !m.isFree;
        });

        // Estimate cost upfront and deduct
        const estimatedTokens = 1024;
        let estimatedCost = 0;
        for (const mid of paidModels) {
            const m = allModels.find((am: any) => am.id === mid);
            if (m) estimatedCost += (parseFloat(m.pricing.prompt) + parseFloat(m.pricing.completion)) * estimatedTokens * 2;
        }
        if (estimatedCost > 0 && userCredits < estimatedCost) {
            return error('Insufficient credits for paid models', 402);
        }

        // Deduct upfront
        let deductedCredits = userCredits;
        if (estimatedCost > 0) {
            deductedCredits = Math.max(0, userCredits - estimatedCost);
            await db.update('users', [{ id: userId, record: { ...(user as any), credits: deductedCredits } }]);
        }

        const OPENROUTER_KEY = await getOpenRouterKey();

        let actualTotalCost = 0;
        const results = await Promise.all(models.map(async (modelId) => {
            const start = Date.now();
            try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${OPENROUTER_KEY}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://promptshot.app',
                    },
                    body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: prompt.trim() }], max_tokens: 1024 }),
                });
                const data = await res.json() as any;
                const elapsed = Date.now() - start;
                const text = data.choices?.[0]?.message?.content || data.error?.message || 'No response';
                const tokens = data.usage?.total_tokens || 0;

                const modelInfo = allModels.find((am: any) => am.id === modelId);
                if (modelInfo && !modelInfo.isFree) {
                    actualTotalCost += (parseFloat(modelInfo.pricing.prompt) + parseFloat(modelInfo.pricing.completion)) * tokens * 2;
                }

                return { modelId, loading: false, text, time: elapsed, tokens };
            } catch (e: any) {
                return { modelId, loading: false, text: e.message || 'Error', time: Date.now() - start, tokens: 0, error: true };
            }
        }));

        // Refund unused credits
        if (estimatedCost > 0) {
            const refund = estimatedCost - actualTotalCost;
            if (refund > 0) {
                const [freshUser] = await db.get('users', [userId]);
                if (freshUser) {
                    const currentCredits = (freshUser as any).credits || 0;
                    await db.update('users', [{ id: userId, record: { ...(freshUser as any), credits: currentCredits + refund } }]);
                }
            }
        }

        // Log usage per model
        const totalTokens = results.reduce((sum: number, r: any) => sum + (r.tokens || 0), 0);
        if (totalTokens > 0) {
            await db.add('usage_logs', [{
                userId,
                tokens: totalTokens,
                cost: actualTotalCost,
                models: models.length,
                timestamp: Date.now()
            }]);
            // Update cumulative stats on user record
            const [latestUser] = await db.get('users', [userId]);
            if (latestUser) {
                const lu = latestUser as any;
                await db.update('users', [{ id: userId, record: {
                    ...lu,
                    totalTokens: (lu.totalTokens || 0) + totalTokens,
                    totalCost: (lu.totalCost || 0) + actualTotalCost,
                    totalQueries: (lu.totalQueries || 0) + 1
                }}]);
            }
        }

        return json({ results, usage: { tokens: totalTokens, cost: actualTotalCost } });
    },

    'POST /api/checkout': async ({ body, event }) => {
        const { amount, origin } = body as { amount: number; origin: string };
        if (!amount) return error('amount required');
        if (![5, 10, 20].includes(amount)) return error('Amount must be 5, 10, or 20');

        // Auth via Bearer token
        const auth = await authenticateRequest(event);
        if (!auth) return error('Unauthorized', 401);
        const userId = auth.userId;

        const STRIPE_SECRET = await getStripeSecret();

        try {
            const params = new URLSearchParams();
            params.append('mode', 'payment');
            params.append('success_url', origin + '?session_id={CHECKOUT_SESSION_ID}');
            params.append('cancel_url', origin);
            params.append('line_items[0][price_data][currency]', 'usd');
            params.append('line_items[0][price_data][product_data][name]', `PromptShot ${amount} Credits`);
            params.append('line_items[0][price_data][unit_amount]', String(amount * 100));
            params.append('line_items[0][quantity]', '1');
            params.append('metadata[userId]', userId);
            params.append('metadata[credits]', String(amount));

            const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${STRIPE_SECRET}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });
            const session = await res.json() as any;
            if (session.error) return error(session.error.message, 400);
            return json({ url: session.url, sessionId: session.id });
        } catch (e: any) {
            return error(e.message || 'Checkout failed', 500);
        }
    },

    'POST /api/webhook': async ({ body }) => {
        const { sessionId } = body as { sessionId: string };
        if (!sessionId) return error('sessionId required');

        const STRIPE_SECRET = await getStripeSecret();

        try {
            const { items: processed } = await db.list('processed_payments', { filter: { sessionId } });
            if (processed.length > 0) return json({ ok: true, already: true });

            const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
                headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` },
            });
            const session = await res.json() as any;
            if (session.payment_status !== 'paid') return error('Payment not completed');

            const credits = parseFloat(session.metadata?.credits || '0');
            const userId = session.metadata?.userId;
            if (credits <= 0) return error('Invalid credits');
            if (!userId) return error('Missing userId in session metadata');

            const [user] = await db.get('users', [userId]);
            if (user) {
                const current = (user as any).credits || 0;
                await db.update('users', [{ id: userId, record: { ...(user as any), credits: current + credits } }]);
            }

            await db.add('processed_payments', [{ sessionId, userId, credits, timestamp: Date.now() }]);

            return json({ ok: true, credits });
        } catch (e: any) {
            return error(e.message || 'Webhook failed', 500);
        }
    },
});

