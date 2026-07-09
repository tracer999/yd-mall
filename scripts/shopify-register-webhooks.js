/**
 * Shopify Webhook 등록 스크립트
 * orders/paid, orders/cancelled, inventory_levels/update 를 Admin API로 등록
 * 사용: node scripts/shopify-register-webhooks.js [--list] [--delete-all]
 *
 * --list       : 현재 등록된 Webhook 목록 출력
 * --delete-all : 기존 Webhook 전체 삭제 후 재등록
 */
const bootstrap = require('./_bootstrap');
const { adminQuery } = require('../services/shopify/adminClient');

// SHOPIFY_WEBHOOK_BASE_URL 은 system_settings 에서 로드되므로 bootstrap() 이후에 채운다.
let WEBHOOK_URL;

const TOPICS = [
    'ORDERS_CREATE',
    'ORDERS_PAID',
    'ORDERS_CANCELLED',
    'INVENTORY_LEVELS_UPDATE',
];

const LIST_QUERY = `
  query ListWebhooks {
    webhookSubscriptions(first: 50) {
      edges {
        node { id topic callbackUrl format }
      }
    }
  }
`;

const CREATE_MUTATION = `
  mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!, $format: WebhookSubscriptionFormat!) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: { callbackUrl: $callbackUrl, format: $format }
    ) {
      webhookSubscription { id topic callbackUrl }
      userErrors { field message }
    }
  }
`;

const DELETE_MUTATION = `
  mutation DeleteWebhook($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors { field message }
    }
  }
`;

async function listWebhooks() {
    const data = await adminQuery(LIST_QUERY);
    return (data.webhookSubscriptions?.edges || []).map(e => e.node);
}

async function deleteWebhook(id) {
    const data = await adminQuery(DELETE_MUTATION, { id });
    const errors = data.webhookSubscriptionDelete?.userErrors || [];
    if (errors.length > 0) throw new Error(errors.map(e => e.message).join(', '));
}

async function createWebhook(topic) {
    const data = await adminQuery(CREATE_MUTATION, {
        topic,
        callbackUrl: WEBHOOK_URL,
        format: 'JSON',
    });
    const errors = data.webhookSubscriptionCreate?.userErrors || [];
    if (errors.length > 0) throw new Error(errors.map(e => e.message).join(', '));
    return data.webhookSubscriptionCreate?.webhookSubscription;
}

async function main() {
    await bootstrap(); // system_settings → process.env (SHOPIFY_* 주입)
    const BASE_URL = process.env.SHOPIFY_WEBHOOK_BASE_URL;
    if (!BASE_URL) {
        console.error('SHOPIFY_WEBHOOK_BASE_URL 이 system_settings 에 설정되지 않았습니다.');
        process.exit(1);
    }
    WEBHOOK_URL = `${BASE_URL}/shopify/webhooks`;

    const args = process.argv.slice(2);
    const doList = args.includes('--list');
    const doDeleteAll = args.includes('--delete-all');

    if (doList) {
        const list = await listWebhooks();
        if (list.length === 0) {
            console.log('등록된 Webhook 없음');
        } else {
            console.log(`\n=== 등록된 Webhook (${list.length}개) ===`);
            list.forEach(w => console.log(`  [${w.id.split('/').pop()}] ${w.topic} → ${w.callbackUrl}`));
        }
        process.exit(0);
    }

    // 기존 목록 확인
    const existing = await listWebhooks();
    const existingTopics = new Set(existing.map(w => w.topic));

    if (doDeleteAll && existing.length > 0) {
        console.log(`기존 Webhook ${existing.length}개 삭제 중...`);
        for (const w of existing) {
            await deleteWebhook(w.id);
            console.log(`  삭제: ${w.topic}`);
        }
        existingTopics.clear();
    }

    console.log(`\nWebhook URL: ${WEBHOOK_URL}`);
    console.log('등록 중...\n');

    let created = 0, skipped = 0;
    for (const topic of TOPICS) {
        if (existingTopics.has(topic)) {
            console.log(`  [SKIP] ${topic} — 이미 등록됨`);
            skipped++;
            continue;
        }
        try {
            const sub = await createWebhook(topic);
            console.log(`  [OK]   ${sub.topic} → ${sub.callbackUrl} (id: ${sub.id.split('/').pop()})`);
            created++;
        } catch (err) {
            console.error(`  [FAIL] ${topic}: ${err.message}`);
        }
    }

    console.log(`\n완료: ${created}개 등록, ${skipped}개 스킵`);
    console.log('\n※ SHOPIFY_WEBHOOK_SECRET을 설정하지 않은 경우 SHOPIFY_CLIENT_SECRET으로 HMAC 검증합니다.');
    process.exit(0);
}

main().catch(err => {
    console.error('오류:', err.message);
    process.exit(1);
});
