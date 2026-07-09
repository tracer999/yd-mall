# Test Patterns for Express + MySQL Function-Export Architecture

## Table of Contents
1. [Service Layer Testing](#service-layer-testing)
2. [Controller Layer Testing](#controller-layer-testing)
3. [Worker/Schedule Testing](#workerschedule-testing)
4. [AI Module Testing](#ai-module-testing)
5. [Config/Middleware Testing](#configmiddleware-testing)

---

## Service Layer Testing

All services follow this pattern: `const { query } = require('../infrastructure/db')` + pure async functions exported via `module.exports = { ... }`.

### Basic Service Test Structure

```javascript
// __tests__/services/admin_stats_service.test.js
const { query } = require('../../infrastructure/db');
const statsService = require('../../services/admin_stats_service');

jest.mock('../../infrastructure/db');

describe('admin_stats_service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSignupStats', () => {
    it('should return signup statistics for given period', async () => {
      const mockRows = [
        { date: '2025-01-01', count: 5 },
        { date: '2025-01-02', count: 3 },
      ];
      query.mockResolvedValue([mockRows]);

      const result = await statsService.getSignupStats('2025-01-01', '2025-01-31');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('tb_mbm_user'),
        expect.arrayContaining(['2025-01-01', '2025-01-31'])
      );
      expect(result).toEqual(mockRows);
    });

    it('should throw on DB error', async () => {
      query.mockRejectedValue(new Error('Connection lost'));
      await expect(statsService.getSignupStats('2025-01-01', '2025-01-31'))
        .rejects.toThrow('Connection lost');
    });
  });
});
```

### Key Patterns

**1. query mock returns `[rows]` (mysql2 format)**
mysql2의 `pool.execute()` 는 `[rows, fields]` 를 반환한다. 서비스 코드가 `const [rows] = await query(...)` 또는 `const rows = await query(...)` 중 어느 패턴을 쓰는지 반드시 확인 후 mock return을 맞춰야 한다.

**2. CRUD 서비스 테스트 범위**
각 CRUD 서비스는 최소 다음을 테스트:
- **Create**: 정상 생성 + 중복/유효성 에러
- **Read (list)**: 페이징, 필터, 빈 결과
- **Read (detail)**: 존재하는 ID, 존재하지 않는 ID
- **Update**: 정상 수정 + 낙관적 잠금(있는 경우)
- **Delete**: 정상 삭제 + 연관 데이터 처리

**3. 트랜잭션 패턴**
일부 서비스가 다중 query 호출로 구성된 경우, 각 query 호출 순서와 파라미터를 검증:
```javascript
it('should insert content then translations', async () => {
  query.mockResolvedValueOnce([{ insertId: 42 }]);  // content insert
  query.mockResolvedValueOnce([{ affectedRows: 1 }]); // translation insert

  await service.createContent(data);

  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls[0][0]).toContain('INSERT INTO tb_concert_contents');
  expect(query.mock.calls[1][0]).toContain('INSERT INTO tb_concert_translations');
  expect(query.mock.calls[1][1]).toContain(42); // insertId from first query
});
```

---

## Controller Layer Testing

Controllers follow: `async function handler(req, res) { ... }` with try/catch.

### Basic Controller Test Structure

```javascript
const { createMockReq, createMockRes } = require('../helpers/express-mock');
const service = require('../../services/admin_concert_service');
const controller = require('../../controllers/admin_concert_controller');

jest.mock('../../services/admin_concert_service');

describe('admin_concert_controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = createMockReq();
    res = createMockRes();
  });

  describe('list', () => {
    it('should render concert list page', async () => {
      const mockData = { list: [], total: 0 };
      service.getConcertList.mockResolvedValue(mockData);
      req.query = { page: '1' };

      await controller.list(req, res);

      expect(res.render).toHaveBeenCalledWith(
        expect.stringContaining('concert'),
        expect.objectContaining({ list: [], total: 0 })
      );
    });

    it('should return 500 on service error', async () => {
      service.getConcertList.mockRejectedValue(new Error('DB Error'));

      await controller.list(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
```

### Controller-Specific Patterns

**1. File upload handlers**: Mock `req.body` with base64 image data, verify file system calls
**2. Session-dependent handlers**: Set `req.session.user = { id: 1, username: 'admin' }`
**3. Redirect handlers**: Verify `res.redirect(url)` called correctly
**4. JSON API handlers**: Verify `res.json(data)` structure

---

## Worker/Schedule Testing

Workers use infinite loops with `while(true)`. Test the **inner processing function**, not the loop.

### Worker Test Strategy

```javascript
// Extract testable unit: the single-iteration function
// If worker exports processOneJob(), test that directly
// If not, test the service functions the worker calls

const translationService = require('../../services/admin_translation_service');
jest.mock('../../infrastructure/db');

describe('translation_worker logic', () => {
  it('should process pending translation job', async () => {
    query.mockResolvedValueOnce([[{ id: 1, entity: 'concert', lang: 'en' }]]);
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await translationService.processNextJob();
    expect(result).toBeTruthy();
  });
});
```

### Environment Variable Guards
```javascript
it('should skip when disabled by env', () => {
  process.env.ENABLE_TRANSLATION_WORKER = '0';
  // Verify worker exits early or returns without processing
});
```

---

## AI Module Testing

AI modules call external APIs (OpenAI, Gemini). Always mock the API clients.

### OpenAI Mock Pattern

```javascript
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: '{"title": "Test"}' } }],
        }),
      },
    },
  }));
});
```

### Gemini Mock Pattern

```javascript
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => '{"result": "ok"}' },
      }),
    }),
  })),
}));
```

### AI Common Module Testing

`ai_modules/common.js` 의 유틸리티 함수들(extractJSON, truncateField 등)은 외부 API 호출 없이 순수 함수로 테스트 가능. 우선순위 높음.

---

## Config/Middleware Testing

### Middleware Test Pattern

```javascript
const { createMockReq, createMockRes } = require('../helpers/express-mock');

describe('requireSession middleware', () => {
  it('should call next() when session exists', () => {
    const req = createMockReq({ session: { user: { id: 1 } } });
    const res = createMockRes();
    const next = jest.fn();

    requireSession(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should redirect to login when no session', () => {
    const req = createMockReq({ session: {} });
    const res = createMockRes();
    const next = jest.fn();

    requireSession(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith('/admin/');
  });
});
```
