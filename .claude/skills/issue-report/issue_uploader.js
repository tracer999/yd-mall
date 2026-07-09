#!/usr/bin/env node
'use strict';

/**
 * Notion 이슈 및 공유사항 업로더 (/issue-report 스킬)
 *
 * 대상 DB: "이슈 및 공유사항" (.claude/notion_config.json 의 issue_db_id)
 * 속성: 제목(title) · 유형(select: 이슈사항/공유사항) · 우선순위(select: 긴급/높음/보통/낮음)
 *       · 상태(status: 신규/진행중/해결됨/보류) · 등록일(date)
 *
 * 사용법:
 *   node issue_uploader.js --input <json_file_path>
 *
 * JSON 입력 형식:
 * {
 *   "title": "구글 검색 노출 95% 급락 — 원인·조치·향후 변화",
 *   "type": "이슈사항",            // 이슈사항 | 공유사항 (기본 이슈사항)
 *   "priority": "높음",            // 긴급 | 높음 | 보통 | 낮음 (기본 보통)
 *   "status": "진행중",            // 신규 | 진행중 | 해결됨 | 보류 (기본 신규)
 *   "date": "2026-06-11",          // 등록일 (기본 오늘)
 *   "body_markdown": "## 1. 현상 ..."
 * }
 *
 * markdown→Notion 블록 변환은 save-to-notion 스킬의 변환기를 재사용한다.
 */

const fs = require('fs');
const path = require('path');
const { markdownToNotionBlocks, loadConfig } = require('../save-to-notion/notion_uploader.js');

async function createIssuePage(config, data) {
  const { api_key, issue_db_id } = config;
  if (!issue_db_id) {
    throw new Error('.claude/notion_config.json 에 issue_db_id 가 없습니다.');
  }

  const properties = {
    '제목': { title: [{ type: 'text', text: { content: data.title || '(제목 없음)' } }] },
    '유형': { select: { name: data.type || '이슈사항' } },
    '우선순위': { select: { name: data.priority || '보통' } },
    '상태': { status: { name: data.status || '신규' } },
    '등록일': { date: { start: data.date || new Date().toISOString().slice(0, 10) } },
  };

  const allBlocks = markdownToNotionBlocks(data.body_markdown || '');
  const firstBatch = allBlocks.slice(0, 100);

  const createRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${api_key}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id: issue_db_id }, properties, children: firstBatch }),
  });
  if (!createRes.ok) {
    throw new Error(`페이지 생성 실패 (${createRes.status}): ${await createRes.text()}`);
  }
  const page = await createRes.json();

  // 100개 초과 블록 append
  for (let offset = 100; offset < allBlocks.length; offset += 100) {
    const batch = allBlocks.slice(offset, offset + 100);
    const appendRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${api_key}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ children: batch }),
    });
    if (!appendRes.ok) {
      console.warn(`[WARN] 블록 추가 실패 (offset ${offset}): ${await appendRes.text()}`);
    }
  }
  return page;
}

async function main() {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  if (inputIdx === -1 || !args[inputIdx + 1]) {
    console.error('사용법: node issue_uploader.js --input <json_file_path>');
    process.exit(1);
  }
  const inputPath = args[inputIdx + 1];
  if (!fs.existsSync(inputPath)) {
    console.error(`[ERROR] 입력 파일을 찾을 수 없습니다: ${inputPath}`);
    process.exit(1);
  }

  const config = loadConfig();
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

  console.log(`[Notion] 이슈 페이지 생성 중... "${data.title}"`);
  const page = await createIssuePage(config, data);
  console.log(`[Notion] 성공! 페이지 URL: ${page.url}`);
  console.log(`\n__RESULT__${JSON.stringify({ success: true, url: page.url, id: page.id })}__RESULT__`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  });
}
