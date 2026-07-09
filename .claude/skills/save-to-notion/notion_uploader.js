#!/usr/bin/env node
'use strict';

/**
 * Notion Work Log Uploader
 *
 * 사용법:
 *   node notion_uploader.js --input <json_file_path>
 *
 * JSON 입력 형식:
 * {
 *   "title": "SEO 개선",
 *   "branch": "develop",
 *   "status": "Feature",
 *   "tags": ["SEO", "다국어"],
 *   "file_count": 26,
 *   "summary": "다국어 canonical URL 정상화, 홈 SEO 강화 등 6건 수정",
 *   "body_markdown": "# 전체 작업 내용..."
 * }
 */

const fs = require('fs');
const path = require('path');

// ─── 설정 로드 ──────────────────────────────────────────────
const CONFIG_PATH = path.resolve(__dirname, '../../notion_config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[ERROR] 설정 파일을 찾을 수 없습니다: ${CONFIG_PATH}`);
    console.error('        .claude/notion_config.json 파일을 생성하세요.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// ─── Markdown → Notion Blocks 변환 ─────────────────────────
function markdownToNotionBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 빈 줄 건너뛰기
    if (line.trim() === '') { i++; continue; }

    // 수평선
    if (/^---+$/.test(line.trim())) {
      blocks.push({ object: 'block', type: 'divider', divider: {} });
      i++; continue;
    }

    // 코드 블록 (``` ... ```)
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim() || 'plain text';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // closing ```
      const codeText = codeLines.join('\n');
      // Notion API 제한: rich_text content 최대 2000자
      if (codeText.length <= 2000) {
        blocks.push({
          object: 'block', type: 'code',
          code: {
            language: mapLanguage(lang),
            rich_text: [{ type: 'text', text: { content: codeText } }],
          },
        });
      } else {
        // 2000자 초과 시 분할
        for (let offset = 0; offset < codeText.length; offset += 2000) {
          blocks.push({
            object: 'block', type: 'code',
            code: {
              language: mapLanguage(lang),
              rich_text: [{ type: 'text', text: { content: codeText.slice(offset, offset + 2000) } }],
            },
          });
        }
      }
      continue;
    }

    // 테이블 (| ... | 패턴)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const row = lines[i].trim();
        // 구분선 행 (|---|---|) 건너뛰기
        if (/^\|[\s\-:|]+\|$/.test(row)) { i++; continue; }
        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        tableRows.push(cells);
        i++;
      }
      if (tableRows.length > 0) {
        const colCount = Math.max(...tableRows.map(r => r.length));
        blocks.push({
          object: 'block', type: 'table',
          table: {
            table_width: colCount,
            has_column_header: true,
            has_row_header: false,
            children: tableRows.map(cells => ({
              object: 'block', type: 'table_row',
              table_row: {
                cells: Array.from({ length: colCount }, (_, idx) => [
                  { type: 'text', text: { content: (cells[idx] || '').slice(0, 2000) } }
                ]),
              },
            })),
          },
        });
      }
      continue;
    }

    // 제목 (h1, h2, h3)
    const h3Match = line.match(/^###\s+(.*)/);
    if (h3Match) {
      blocks.push({
        object: 'block', type: 'heading_3',
        heading_3: { rich_text: parseInlineMarkdown(h3Match[1]) },
      });
      i++; continue;
    }

    const h2Match = line.match(/^##\s+(.*)/);
    if (h2Match) {
      blocks.push({
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: parseInlineMarkdown(h2Match[1]) },
      });
      i++; continue;
    }

    const h1Match = line.match(/^#\s+(.*)/);
    if (h1Match) {
      blocks.push({
        object: 'block', type: 'heading_1',
        heading_1: { rich_text: parseInlineMarkdown(h1Match[1]) },
      });
      i++; continue;
    }

    // 번호 목록
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      blocks.push({
        object: 'block', type: 'numbered_list_item',
        numbered_list_item: { rich_text: parseInlineMarkdown(olMatch[2]) },
      });
      i++; continue;
    }

    // 불릿 목록
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      blocks.push({
        object: 'block', type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: parseInlineMarkdown(ulMatch[1]) },
      });
      i++; continue;
    }

    // 인용 (> ...)
    const quoteMatch = line.match(/^>\s*(.*)/);
    if (quoteMatch) {
      blocks.push({
        object: 'block', type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: 'ℹ️' },
          rich_text: parseInlineMarkdown(quoteMatch[1]),
        },
      });
      i++; continue;
    }

    // 일반 문단
    blocks.push({
      object: 'block', type: 'paragraph',
      paragraph: { rich_text: parseInlineMarkdown(line) },
    });
    i++;
  }

  return blocks;
}

/**
 * 인라인 마크다운 파싱 (bold, code, italic)
 */
function parseInlineMarkdown(text) {
  if (!text) return [{ type: 'text', text: { content: '' } }];

  const segments = [];
  // 간단한 패턴: **bold**, `code`, *italic*
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // 매치 이전 텍스트
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      if (plain) segments.push({ type: 'text', text: { content: plain } });
    }

    if (match[2]) {
      // **bold**
      segments.push({
        type: 'text', text: { content: match[2] },
        annotations: { bold: true },
      });
    } else if (match[3]) {
      // `code`
      segments.push({
        type: 'text', text: { content: match[3] },
        annotations: { code: true },
      });
    } else if (match[4]) {
      // *italic*
      segments.push({
        type: 'text', text: { content: match[4] },
        annotations: { italic: true },
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // 나머지 텍스트
  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: { content: text.slice(lastIndex) } });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', text: { content: text } });
  }

  // Notion 2000자 제한 처리
  return segments.map(seg => {
    if (seg.text.content.length > 2000) {
      seg.text.content = seg.text.content.slice(0, 2000);
    }
    return seg;
  });
}

/**
 * 코드 블록 언어 매핑 (Notion API 지원 목록)
 */
function mapLanguage(lang) {
  const map = {
    js: 'javascript', ts: 'typescript', py: 'python',
    sh: 'bash', shell: 'bash', sql: 'sql', json: 'json',
    html: 'html', css: 'css', ejs: 'html', yml: 'yaml', yaml: 'yaml',
    bash: 'bash', javascript: 'javascript', typescript: 'typescript',
    python: 'python', java: 'java', 'plain text': 'plain text',
  };
  return map[lang.toLowerCase()] || 'plain text';
}

// ─── Notion API 호출 ────────────────────────────────────────
async function createNotionPage(config, data) {
  const { api_key, work_log_db_id } = config;

  // 속성 구성
  const properties = {
    '작업 요약': {
      title: [{ type: 'text', text: { content: data.title || '작업 기록' } }],
    },
    '브랜치': {
      select: { name: data.branch || 'develop' },
    },
    '상태': {
      select: { name: data.status || 'Feature' },
    },
    '태그': {
      multi_select: (data.tags || []).map(t => ({ name: t })),
    },
    '변경파일수': {
      number: data.file_count || 0,
    },
    '변경요약': {
      rich_text: [{ type: 'text', text: { content: (data.summary || '').slice(0, 2000) } }],
    },
  };

  // 본문 Markdown → Notion blocks
  const allBlocks = markdownToNotionBlocks(data.body_markdown || '');

  // Notion API 제한: 한 번에 최대 100개 블록
  const firstBatch = allBlocks.slice(0, 100);

  // 1단계: 페이지 생성 (첫 100블록)
  const createRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${api_key}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: work_log_db_id },
      properties,
      children: firstBatch,
    }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`페이지 생성 실패 (${createRes.status}): ${errBody}`);
  }

  const page = await createRes.json();
  const pageId = page.id;

  // 2단계: 100개 초과 블록이 있으면 추가 append
  for (let offset = 100; offset < allBlocks.length; offset += 100) {
    const batch = allBlocks.slice(offset, offset + 100);
    const appendRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${api_key}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ children: batch }),
    });

    if (!appendRes.ok) {
      const errBody = await appendRes.text();
      console.warn(`[WARN] 블록 추가 실패 (offset ${offset}): ${errBody}`);
    }
  }

  return page;
}

// ─── CLI 실행 ───────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');

  if (inputIdx === -1 || !args[inputIdx + 1]) {
    console.error('사용법: node notion_uploader.js --input <json_file_path>');
    process.exit(1);
  }

  const inputPath = args[inputIdx + 1];
  if (!fs.existsSync(inputPath)) {
    console.error(`[ERROR] 입력 파일을 찾을 수 없습니다: ${inputPath}`);
    process.exit(1);
  }

  const config = loadConfig();
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

  console.log(`[Notion] 페이지 생성 중... "${data.title}"`);

  const page = await createNotionPage(config, data);

  console.log(`[Notion] 성공! 페이지 URL: ${page.url}`);
  console.log(`[Notion] 페이지 ID: ${page.id}`);

  // 결과를 stdout JSON으로도 출력 (스킬에서 파싱용)
  const result = { success: true, url: page.url, id: page.id };
  console.log(`\n__RESULT__${JSON.stringify(result)}__RESULT__`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  });
}

// 다른 스킬(issue-report 등)에서 markdown→Notion 블록 변환기 재사용
module.exports = { markdownToNotionBlocks, loadConfig };
