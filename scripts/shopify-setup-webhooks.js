/**
 * Shopify Webhook 등록 스크립트
 * 실행: node scripts/shopify-setup-webhooks.js [--delete]
 *   --delete  기존 Webhook 전체 삭제 후 재등록
 */

const bootstrap = require('./_bootstrap');
const { adminQuery } = require('../services/shopify/adminClient');

// SHOPIFY_* 는 system_settings 에서 로드되므로 bootstrap() 이후에 채운다.
let WEBHOOK_BASE_URL;

const TOPICS = [
    'ORDERS_CREATE',
    'ORDERS_PAID',
    'ORDERS_CANCELLED',
];

const CREATE_WEBHOOK = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        topic
        endpoint {
          ... on WebhookHttpEndpoint { callbackUrl }
        }
      }
      userErrors { field message }
    }
  }
`;

const LIST_WEBHOOKS = `
  query {
    webhookSubscriptions(first: 50) {
      edges {
        node {
          id
          topic
          endpoint {
            ... on WebhookHttpEndpoint { callbackUrl }
          }
        }
      }
    }
  }
`;

const DELETE_WEBHOOK = `
  mutation webhookSubscriptionDelete($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors { field message }
    }
  }
`;

async function listWebhooks() {
    const data = await adminQuery(LIST_WEBHOOKS);
    return data.webhookSubscriptions.edges.map(e => e.node);
}

async function deleteAll(webhooks) {
    for (const wh of webhooks) {
        await adminQuery(DELETE_WEBHOOK, { id: wh.id });
        console.log(`[삭제] ${wh.topic}`);
    }
}

async function main() {
    await bootstrap(); // system_settings → process.env (SHOPIFY_* 주입)
    WEBHOOK_BASE_URL = process.env.SHOPIFY_WEBHOOK_BASE_URL || 'https://dev-mall.ydata.co.kr';

    const doDelete = process.argv.includes('--delete');
    const callbackUrl = `${WEBHOOK_BASE_URL}/shopify/webhooks`;

    console.log(`Webhook URL: ${callbackUrl}\n`);

    const existing = await listWebhooks();
    if (existing.length > 0) {
        console.log('기존 등록된 Webhook:');
        existing.forEach(w => console.log(`  ${w.topic} → ${w.endpoint?.callbackUrl}`));
        console.log('');
    }

    if (doDelete && existing.length > 0) {
        console.log('기존 Webhook 삭제 중...');
        await deleteAll(existing);
        console.log('');
    } else if (!doDelete && existing.length > 0) {
        console.log('이미 등록된 Webhook이 있습니다. 재등록하려면 --delete 옵션을 사용하세요.\n');
        return;
    }

    console.log('Webhook 등록 중...');
    for (const topic of TOPICS) {
        const data = await adminQuery(CREATE_WEBHOOK, {
            topic,
            webhookSubscription: {
                callbackUrl,
                format: 'JSON',
            },
        });

        const { webhookSubscription, userErrors } = data.webhookSubscriptionCreate;

        if (userErrors?.length > 0) {
            console.error(`[ERROR] ${topic}: ${userErrors.map(e => e.message).join(', ')}`);
        } else {
            console.log(`[OK] ${topic} → ${webhookSubscription.endpoint?.callbackUrl}`);
        }
    }

    console.log('\n완료. Webhook 검증은 SHOPIFY_CLIENT_SECRET으로 처리됩니다.');
}

main().catch(err => {
    console.error('오류:', err.message);
    process.exit(1);
});
