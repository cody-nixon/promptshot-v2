import { db } from '@appdeploy/sdk';

const SUBSCRIPTIONS_TABLE = "entity_subscriptions";

type SubscriptionRecord = {
    id: string;
    entity_type: string;
    entity_id: string;
    connection_id: string;
};

async function listSubscriptions(): Promise<SubscriptionRecord[]> {
    const { items } = await db.list(SUBSCRIPTIONS_TABLE, { limit: 1000 });
    return items as SubscriptionRecord[];
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

export const realtime = async (event: any) => {
    let msg: any = {};
    try {
        msg = JSON.parse(event.body || '{}');
    } catch {}

    if (msg.type === 'system.connected') {
        return { statusCode: 200 };
    }

    if (msg.type === 'system.disconnected') {
        const connectionId = msg.payload?.connection_id;
        if (connectionId) {
            await removeSubscriptionsByConnection(connectionId);
        }
        return { statusCode: 200 };
    }

    return { statusCode: 200 };
};
