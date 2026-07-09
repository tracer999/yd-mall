# Mock Strategies

## Table of Contents
1. [DB (infrastructure/db.js)](#db-mock)
2. [AI APIs (OpenAI, Gemini, Vision)](#ai-api-mock)
3. [HTTP Clients (axios, node-fetch)](#http-client-mock)
4. [File System (fs)](#file-system-mock)
5. [Puppeteer](#puppeteer-mock)
6. [bcrypt](#bcrypt-mock)
7. [Environment Variables](#environment-variables)

---

## DB Mock

**가장 중요한 mock**. 모든 서비스가 `require('../infrastructure/db')` 로 DB에 접근한다.

### 자동 모킹 (jest.mock)

```javascript
const { query } = require('../../infrastructure/db');
jest.mock('../../infrastructure/db');

// mysql2 pool.execute() 는 [rows, fields] 반환
// 서비스가 const [rows] = await query(...) 패턴인 경우:
query.mockResolvedValue([[{ id: 1, name: 'test' }], []]);

// 서비스가 const rows = await query(...) 패턴인 경우:
query.mockResolvedValue([{ id: 1, name: 'test' }]);
```

**IMPORTANT**: 대상 서비스 코드를 반드시 읽고 query 반환값 destructuring 패턴을 확인할 것.

### 헬퍼 사용 (__tests__/helpers/db-mock.js)

```javascript
const { mockQuery, mockQuerySequence } = require('../helpers/db-mock');

// 단일 쿼리 결과
mockQuery([{ id: 1 }]);

// 순차 쿼리 결과 (INSERT → SELECT 등 다중 쿼리)
mockQuerySequence([
  [{ insertId: 42 }],        // 1st query result
  [[{ id: 42, title: 'x' }]], // 2nd query result
]);
```

### SELECT vs INSERT/UPDATE/DELETE 반환값

```javascript
// SELECT: rows 배열
query.mockResolvedValue([[{ id: 1, title: 'Event' }]]);

// INSERT: insertId
query.mockResolvedValue([{ insertId: 42, affectedRows: 1 }]);

// UPDATE/DELETE: affectedRows
query.mockResolvedValue([{ affectedRows: 1, changedRows: 1 }]);

// 빈 결과
query.mockResolvedValue([[]]);
```

---

## AI API Mock

### OpenAI SDK

```javascript
jest.mock('openai', () => {
  const mockCreate = jest.fn();
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

// 테스트에서:
const OpenAI = require('openai');
const mockCreate = new OpenAI().chat.completions.create;
mockCreate.mockResolvedValue({
  choices: [{
    message: { content: JSON.stringify({ title: 'Test', summary: 'Summary' }) },
    finish_reason: 'stop',
  }],
  usage: { total_tokens: 100 },
});
```

### Rate Limit (429) 시뮬레이션

```javascript
mockCreate.mockRejectedValueOnce({
  status: 429,
  message: 'Rate limit exceeded',
});
// → cooldown 로직 테스트
```

### Gemini SDK

```javascript
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => '{"translated": "Hello"}' },
      }),
    }),
  })),
}));
```

### Google Vision API

```javascript
jest.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
    textDetection: jest.fn().mockResolvedValue([{
      textAnnotations: [{ description: 'detected text' }],
    }]),
  })),
}));
```

---

## HTTP Client Mock

### axios

```javascript
jest.mock('axios');
const axios = require('axios');

// GET 응답
axios.get.mockResolvedValue({
  status: 200,
  data: { results: [{ title: 'Festival' }] },
  headers: { 'content-type': 'application/json' },
});

// POST 응답
axios.post.mockResolvedValue({ status: 201, data: { id: 1 } });

// 에러 시뮬레이션
axios.get.mockRejectedValue(new Error('Network Error'));

// arraybuffer 응답 (이미지 다운로드)
axios.get.mockResolvedValue({
  status: 200,
  data: Buffer.from('fake-image-data'),
  headers: { 'content-type': 'image/jpeg' },
});
```

### node-fetch

```javascript
jest.mock('node-fetch');
const fetch = require('node-fetch');

fetch.mockResolvedValue({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ data: 'test' }),
  text: () => Promise.resolve('<html>...</html>'),
  buffer: () => Promise.resolve(Buffer.from('data')),
});
```

---

## File System Mock

이미지 저장, locale 파일 읽기/쓰기에 사용.

```javascript
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue('{"key": "value"}'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

// fs/promises
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{"key": "value"}'),
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
}));
```

---

## Puppeteer Mock

스크래핑 서비스용. 브라우저, 페이지 객체를 모킹한다.

```javascript
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      goto: jest.fn().mockResolvedValue(null),
      content: jest.fn().mockResolvedValue('<html><body>Scraped</body></html>'),
      evaluate: jest.fn().mockResolvedValue({ title: 'Test' }),
      waitForSelector: jest.fn().mockResolvedValue(null),
      close: jest.fn().mockResolvedValue(null),
      setUserAgent: jest.fn().mockResolvedValue(null),
      setViewport: jest.fn().mockResolvedValue(null),
    }),
    close: jest.fn().mockResolvedValue(null),
  }),
}));
```

---

## bcrypt Mock

`password_service.js` 테스트용.

```javascript
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$hashedPassword'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('$2b$12$salt'),
}));

// 실패 케이스
const bcrypt = require('bcrypt');
bcrypt.compare.mockResolvedValueOnce(false); // 비밀번호 불일치
```

---

## Environment Variables

테스트 시 환경변수 관리. `__tests__/helpers/setup.js` 에서 기본값을 설정한다.

```javascript
// 특정 테스트에서 환경변수 변경
const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.DB_HOST = 'localhost';
  process.env.OPENAI_API_KEY = 'test-key';
});

afterEach(() => {
  process.env = originalEnv;
});
```

### Worker 환경변수 플래그 테스트

```javascript
describe('worker disabled', () => {
  beforeEach(() => {
    process.env.ENABLE_TRANSLATION_WORKER = '0';
  });

  it('should not process when disabled', async () => {
    // worker 비활성 시 동작 검증
  });
});
```
