/**
 * Shopify Location ID 조회 스크립트
 * 실행: node scripts/shopify-get-locations.js
 */

const bootstrap = require('./_bootstrap');
const { adminQuery } = require('../services/shopify/adminClient');

async function main() {
    await bootstrap(); // system_settings → process.env (SHOPIFY_* 주입)
    const data = await adminQuery(`
        query {
            locations(first: 10) {
                edges {
                    node {
                        id
                        name
                        address { city country }
                        isActive
                    }
                }
            }
        }
    `);

    console.log('Shopify Locations:');
    data.locations.edges.forEach(({ node }) => {
        console.log(`  ID: ${node.id}`);
        console.log(`  이름: ${node.name}`);
        console.log(`  주소: ${node.address.city}, ${node.address.country}`);
        console.log(`  활성: ${node.isActive}`);
        console.log('');
    });
}

main().catch(err => {
    console.error('오류:', err.message);
    process.exit(1);
});
