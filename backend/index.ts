import { db, storage, ws } from '@appdeploy/sdk';

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
