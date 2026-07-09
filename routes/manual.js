const express = require('express');
const path = require('path');
const fs = require('fs');

// marked v17+는 ESM 전용이므로 CommonJS에서는 동적 import로 로딩하고,
// 최초 1회 옵션(gfm/breaks)을 설정한 뒤 동일 인스턴스를 재사용한다.
let markedPromise;
function getMarked() {
    if (!markedPromise) {
        markedPromise = import('marked').then(({ marked }) => {
            // Marked 설정: 테이블 등 읽기 좋게
            marked.setOptions({ gfm: true, breaks: true });
            return marked;
        });
    }
    return markedPromise;
}

const router = express.Router();
const docsDir = path.join(__dirname, '..', 'docs');
// 관리자·사용자 매뉴얼은 비개발자용 문서만 사용 (docs/manual/admin, docs/manual/user)
const manualAdminDir = path.join(docsDir, 'manual', 'admin');
const manualUserDir = path.join(docsDir, 'manual', 'user');
const manualCodingGuideDir = path.join(docsDir, 'manual', 'coding_guide');

// Doc key → 한글 제목 (운영자 매뉴얼용, docs/manual/admin 기준)
const adminTitles = {
    index: '목차',
    login: '로그인/로그아웃',
    dashboard: '대시보드',
    search_logs: '검색 로그',
    categories: '카테고리 관리',
    products: '상품 관리',
    banners: '배너 관리',
    users: '회원 관리',
    sales: '주문/매출 관리',
    shipping: '배송 관리',
    visitors: '방문자 통계',
    settings: '사이트 설정',
    operators: '운영자 관리',
    policies: '약관/정책 관리',
    inquiries: '문의 관리',
    menus: '관리자 메뉴',
    ga4: 'GA4 설정/추적'
};

// 사용자 매뉴얼 제목 (docs/manual/user 기준)
const userTitles = {
    index: '목차',
    home: '홈(메인)',
    search: '검색',
    products: '상품 목록/상세',
    terms_pages: '약관/정책/소개',
    notices: '공지사항',
    inquiries: '1:1 문의',
    auth: '로그인/회원가입',
    cart: '장바구니',
    checkout: '주문/결제',
    ga4: 'GA4 이벤트 안내'
};

// 사용자 매뉴얼 각 항목에 대한 간단 설명
const userDescriptions = {
    index: '사용자(쇼핑몰) 매뉴얼 전체 개요와 화면별 안내 목록',
    home: '쇼핑몰 메인 화면 구성과 주요 영역(배너, 추천 상품 등)을 어떻게 사용하는지 안내',
    search: '검색창을 활용해 상품을 찾는 방법, 검색 결과 화면에서 필터/정렬을 사용하는 방법 설명',
    products: '상품 목록/상세 페이지에서 상품 정보를 확인하고 옵션을 선택하는 방법 안내',
    terms_pages: '이용약관, 개인정보처리방침, 회사 소개 등 정책/소개 페이지를 확인하는 방법',
    notices: '공지사항 목록과 상세 페이지를 통해 쇼핑몰의 공지/이벤트를 확인하는 방법',
    inquiries: '1:1 문의 작성, 내 문의 내역 확인, 답변 확인 등 문의하기 기능 사용 방법',
    auth: '회원가입, 로그인, 비밀번호 찾기 등 계정 관련 기능을 사용하는 방법',
    cart: '상품을 장바구니에 담고 수량 변경/삭제를 하는 방법, 장바구니 화면 구성 안내',
    checkout: '주문서 작성, 배송지/결제수단 선택, 주문 완료까지의 전체 결제 흐름 설명',
    ga4: 'GA4 이벤트 추적이 사용자 행동에 어떤 식으로 반영되는지, 기본 개념을 간단히 소개'
};

// 코딩 가이드 제목 (docs/manual/coding_guide 기준)
const codingGuideTitles = {
    index: '목차',
    vibe_coding: '바이브코딩이란',
    tech_stack: '사용 기술과 이유',
    nodejs: 'Node.js란',
    express_libs: 'Express와 주요 라이브러리',
    example_express_basic: '예제: 간단 Express 로그인 & REST API 맛보기',
    mvc: 'MVC 패턴과 app.js',
    mysql: 'MySQL과 DBMS',
    mysql2: 'MySQL 실전 (Node.js 연동)',
    project_structure: '프로젝트 폴더 구조',
    workflow: '바이브코딩으로 만드는 순서',
    example_google_login: '바이브코딩으로 구글 로그인 구현하기',
    example_notice: '바이브코딩으로 공지사항 구현하기',
    git_github_basics: 'Git/GitHub 기초와 소스 관리',
    glossary: '용어집'
};

// 코딩 가이드 각 항목에 대한 간단 설명 (목차 화면에서 사용)
const codingGuideDescriptions = {
    index: '코딩 가이드 전체 개요, 대상 독자, 다루는 내용을 한눈에 정리한 페이지',
    vibe_coding: '바이브코딩의 개념과 잘하는 방법, AI에게 프롬프트를 쓰는 요령을 정리한 가이드',
    tech_stack: 'Node.js, Express, MySQL8, Tailwind CSS, Redis 등 이 프로젝트에서 사용하는 전체 기술 스택과 선택 이유를 간단히 정리',
    nodejs: 'Node.js가 무엇인지, npm과 package.json, 이 쇼핑몰에서 Node.js를 왜 사용하는지 소개',
    express_libs: 'Express, EJS + express-ejs-layouts, Tailwind CSS, bcrypt, multer 등 이 프로젝트에서 사용하는 주요 Node.js 라이브러리의 개념과 사용 이유 설명',
    example_express_basic: 'DB 없이 Express + EJS로 두 화면짜리 로그인을 먼저 만든 뒤, 같은 로그인을 REST API 방식으로 바꿔 보며 컨트롤러/라우터/뷰 각각의 변환 과정을 익히는 예제',
    mvc: 'MVC 패턴과 함께 라우터·컨트롤러·뷰·app.js가 어떻게 연결되는지, 요청 흐름을 중심으로 설명',
    mysql: 'DBMS와 MySQL8의 기본 개념, 자주 쓰는 CRUD/DDL 쿼리와 컬럼 타입을 소개하는 입문 가이드',
    mysql2: 'Node.js + Express + mysql2 환경에서 MySQL을 연동하는 방법, JOIN, 집계, 트랜잭션, 보안, 성능 디버깅까지 실전 코드 중심으로 설명',
    project_structure: '이 프로젝트의 폴더 구조와 각 디렉터리의 역할, 어떤 상황에 어디를 보면 되는지 안내',
    workflow: '기능을 설계 → DB → 컨트롤러 → 라우터 → 뷰 순서로 바이브코딩으로 구현하는 전체 워크플로우',
    example_google_login: '구글 로그인을 예시로 OAuth 설정부터 코드 작성까지, 단계별로 바이브코딩하는 실전 튜토리얼',
    example_notice: '공지사항 기능을 예시로 DB·관리자·사용자 화면을 바이브코딩으로 추가하는 전체 시나리오',
    git_github_basics: 'Git과 GitHub의 개념, commit/push/pull 같은 핵심 용어, 복원/브랜치 기반 소스관리, CI/CD 개념을 입문자 관점에서 정리한 문서',
    glossary: '코딩가이드 전반에서 자주 등장하는 기술/개발 용어를 가나다순으로 정리한 참고 문서'
};

// 코딩 가이드 목차 순서: 개념/기술 → 워크플로우/바이브코딩 → 예제
const codingGuideOrder = [
    'index',
    'tech_stack',
    'nodejs',
    'express_libs',
    'example_express_basic',
    'mvc',
    'mysql',
    'mysql2',
    'project_structure',
    'vibe_coding',
    'workflow',
    'example_google_login',
    'example_notice',
    'git_github_basics',
    'glossary'
];

function getDocList(section) {
    const dir = section === 'admin' ? manualAdminDir : section === 'user' ? manualUserDir : section === 'coding_guide' ? manualCodingGuideDir : path.join(docsDir, section);
    if (!fs.existsSync(dir)) return [];
    const keys = fs.readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace(/\.md$/, ''));

    if (section === 'coding_guide') {
        return keys.sort((a, b) => {
            const i = codingGuideOrder.indexOf(a);
            const j = codingGuideOrder.indexOf(b);
            if (i === -1 && j === -1) return a.localeCompare(b);
            if (i === -1) return 1;
            if (j === -1) return -1;
            return i - j;
        });
    }

    return keys.sort((a, b) => {
        if (a === 'index') return -1;
        if (b === 'index') return 1;
        return a.localeCompare(b);
    });
}

function safeDocName(name) {
    return /^[a-zA-Z0-9_-]+$/.test(name) ? name : null;
}

function getTitle(section, key) {
    const map = section === 'admin' ? adminTitles : section === 'user' ? userTitles : section === 'coding_guide' ? codingGuideTitles : {};
    return (map[key] !== undefined ? map[key] : key);
}

function getDescription(section, key) {
    if (section === 'coding_guide') {
        return codingGuideDescriptions[key] || '';
    }
    if (section === 'user') {
        return userDescriptions[key] || '';
    }
    return '';
}

// /manual 인덱스: 관리자/사용자/코딩 가이드로 이동할 수 있는 안내 페이지
router.get('/', (req, res) => {
    const sections = [
        {
            key: 'admin',
            title: '관리자 매뉴얼',
            description: '쇼핑몰 운영자가 관리자 페이지에서 상품, 주문, 배너, 카테고리, 회원 등을 어떻게 관리하는지에 대한 사용 설명서',
            href: '/manual/admin'
        },
        {
            key: 'user',
            title: '사용자(쇼핑몰) 매뉴얼',
            description: '일반 사용자가 쇼핑몰에서 상품을 찾고, 장바구니/주문/결제를 어떻게 진행하는지에 대한 화면별 안내',
            href: '/manual/user'
        },
        {
            key: 'coding_guide',
            title: '코딩 가이드',
            description: '이 프로젝트를 예제로 삼아 Node.js, Express, MySQL, MVC, 바이브코딩을 학습할 수 있는 개발자용 가이드',
            href: '/manual/coding_guide'
        }
    ];

    res.render('manual/home', {
        layout: 'layouts/manual_layout',
        section: null,
        sectionTitle: '매뉴얼 전체 안내',
        docList: [],
        currentDoc: null,
        sections
    });
});

// 관리자 매뉴얼 목차
router.get('/admin', (req, res) => {
    const docList = getDocList('admin');
    const listWithTitles = docList.map((key) => ({ key, title: getTitle('admin', key) }));
    res.render('manual/index', {
        layout: 'layouts/manual_layout',
        section: 'admin',
        sectionTitle: '관리자 매뉴얼',
        docList: listWithTitles,
        currentDoc: null,
        contentHtml: null
    });
});

// 관리자 매뉴얼 문서 (docs/manual/admin)
router.get('/admin/:doc', async (req, res) => {
    const docKey = safeDocName(req.params.doc);
    if (!docKey) return res.status(400).send('Bad Request');

    const filePath = path.join(manualAdminDir, `${docKey}.md`);
    const resolved = path.resolve(filePath);
    const adminDirResolved = path.resolve(manualAdminDir);
    if (!resolved.startsWith(adminDirResolved) || !fs.existsSync(filePath)) {
        return res.status(404).send('Not Found');
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const marked = await getMarked();
    const contentHtml = marked.parse(raw);

    const docList = getDocList('admin');
    const listWithTitles = docList.map((key) => ({ key, title: getTitle('admin', key) }));

    res.render('manual/index', {
        layout: 'layouts/manual_layout',
        section: 'admin',
        sectionTitle: '관리자 매뉴얼',
        docList: listWithTitles,
        currentDoc: docKey,
        docTitle: getTitle('admin', docKey),
        contentHtml
    });
});

// 사용자 매뉴얼 목차
router.get('/user', (req, res) => {
    const docList = getDocList('user');
    const listWithTitles = docList.map((key) => ({
        key,
        title: getTitle('user', key),
        description: getDescription('user', key)
    }));
    res.render('manual/index', {
        layout: 'layouts/manual_layout',
        section: 'user',
        sectionTitle: '사용자(쇼핑몰) 매뉴얼',
        docList: listWithTitles,
        currentDoc: null,
        contentHtml: null
    });
});

// 사용자 매뉴얼 문서 (docs/manual/user)
router.get('/user/:doc', async (req, res) => {
    const docKey = safeDocName(req.params.doc);
    if (!docKey) return res.status(400).send('Bad Request');

    const filePath = path.join(manualUserDir, `${docKey}.md`);
    const resolved = path.resolve(filePath);
    const userDirResolved = path.resolve(manualUserDir);
    if (!resolved.startsWith(userDirResolved) || !fs.existsSync(filePath)) {
        return res.status(404).send('Not Found');
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const marked = await getMarked();
    const contentHtml = marked.parse(raw);

    const docList = getDocList('user');
    const listWithTitles = docList.map((key) => ({
        key,
        title: getTitle('user', key),
        description: getDescription('user', key)
    }));

    res.render('manual/index', {
        layout: 'layouts/manual_layout',
        section: 'user',
        sectionTitle: '사용자(쇼핑몰) 매뉴얼',
        docList: listWithTitles,
        currentDoc: docKey,
        docTitle: getTitle('user', docKey),
        contentHtml
    });
});

// 코딩 가이드 목차
router.get('/coding_guide', (req, res) => {
    const docList = getDocList('coding_guide');
    const listWithTitles = docList.map((key) => ({
        key,
        title: getTitle('coding_guide', key),
        description: getDescription('coding_guide', key)
    }));
    res.render('manual/index', {
        layout: 'layouts/manual_layout',
        section: 'coding_guide',
        sectionTitle: '코딩 가이드',
        docList: listWithTitles,
        currentDoc: null,
        contentHtml: null
    });
});

// 코딩 가이드 문서 (docs/manual/coding_guide)
router.get('/coding_guide/:doc', async (req, res) => {
    const docKey = safeDocName(req.params.doc);
    if (!docKey) return res.status(400).send('Bad Request');

    const filePath = path.join(manualCodingGuideDir, `${docKey}.md`);
    const resolved = path.resolve(filePath);
    const codingGuideDirResolved = path.resolve(manualCodingGuideDir);
    if (!resolved.startsWith(codingGuideDirResolved) || !fs.existsSync(filePath)) {
        return res.status(404).send('Not Found');
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const marked = await getMarked();
    const contentHtml = marked.parse(raw);

    const docList = getDocList('coding_guide');
    const listWithTitles = docList.map((key) => ({
        key,
        title: getTitle('coding_guide', key),
        description: getDescription('coding_guide', key)
    }));

    res.render('manual/index', {
        layout: 'layouts/manual_layout',
        section: 'coding_guide',
        sectionTitle: '코딩 가이드',
        docList: listWithTitles,
        currentDoc: docKey,
        docTitle: getTitle('coding_guide', docKey),
        contentHtml
    });
});

module.exports = router;
