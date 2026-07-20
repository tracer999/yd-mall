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
const manualMallBuilderDir = path.join(docsDir, 'manual', 'mall_builder');

// Doc key → 한글 제목 (운영자 매뉴얼용, docs/manual/admin 기준)
// 제목·순서는 실제 관리자 사이드바(admin_menus 테이블)를 따른다.
const adminTitles = {
    index: '목차',
    login: '로그인/로그아웃',
    // 쇼핑몰 관리
    malls: '몰 리스트 관리',
    settings: '사이트 설정 · 시스템 설정',
    policies: '약관/정책 관리',
    header: 'Header 설정',
    theme: '테마 설정',
    dashboard: '대시보드',
    // 외부몰 연동
    sourcing: '외부몰 연동',
    // 메뉴/카테고리 관리
    categories: '카테고리 관리',
    menus: '메뉴 관리',
    brands: '브랜드 관리',
    // 페이지/전시 관리
    page_builder: '페이지 빌더 · 상품 그룹',
    banners: '배너 관리',
    exhibitions: '기획전 · 전문관 관리',
    group_buys: '공동구매 관리',
    lives: '쇼핑라이브 관리',
    // 상품 관리
    products: '상품 관리',
    'derived-products': '세트·기획상품 관리',
    best: '베스트/랭킹 관리',
    deals: '쇼핑특가 관리',
    recommend: '상품 추천관리',
    outlet: '아울렛 관리',
    // 프로모션 관리
    coupons: '쿠폰 관리',
    points: '포인트 관리',
    events: '이벤트 관리',
    // 멤버십 관리
    membership: '멤버십 관리',
    // 주문/회원 관리
    sales: '판매 관리',
    shipping: '배송 관리 · 배송비 정책',
    claims: '클레임 관리',
    users: '회원 관리',
    // 고객지원 관리
    inquiries: '문의 · 고객센터 관리',
    notices: '공지사항 관리',
    // 시스템 관리
    operators: '운영자 관리',
    // 서비스 관리
    service: '서비스 관리',
    // 통계
    visitors: '방문자 통계',
    search_logs: '검색 로그',
    ga4: 'GA4 설정/추적'
};

// 관리자 매뉴얼 각 항목 설명 (목차 화면에서 사용)
const adminDescriptions = {
    index: '관리자 사이드바 메뉴 순서대로 정리한 전체 목차 — 몰을 만든 뒤 해야 할 일을 차례로 안내',
    login: '관리자 페이지 접속 방법, 로그인·로그아웃, 2단계 인증',
    malls: '몰 만들기·선택(전환)·삭제, 테마 프리셋 재적용',
    settings: '회사 정보·연락처, 결제·소셜 로그인 연동, 신상품 노출 기간 등 세부 설정',
    policies: '이용약관·개인정보처리방침을 버전으로 관리하고 재동의를 받는 방법',
    header: '헤더 레이아웃(기본형·드로어형·에디토리얼형)과 GNB 최대 노출 수 등 메뉴 슬롯 정책',
    theme: '모서리·글꼴·간격 같은 디자인 토큰 조정 (색상·로고는 사이트 설정 소관)',
    dashboard: '회원 수·상품 수·문의·방문자 요약을 한눈에 보는 첫 화면',
    sourcing: '외부 공급처에서 상품을 가져오고 네이버 스마트스토어에 등록·동기화하는 연동 기능',
    categories: '상품 분류(최대 3단계) 추가·수정·삭제와 계층 규칙',
    menus: '고객 화면 상단 메뉴(일반·시스템·커스텀) 켜기/끄기·이름·순서, 메뉴 미리보기, 관리자 사이드바 메뉴 관리',
    brands: '브랜드 소개·로고 입력과 집계 재계산 (브랜드 자체는 카테고리에서 생성)',
    page_builder: '메인(홈) 화면을 섹션으로 조립하고 발행하는 방법, 홈 섹션에 쓰이는 상품 그룹',
    banners: '메인 슬라이더(히어로)·톱바·카테고리·브랜드·팝업·메뉴별 배너 이미지 관리',
    exhibitions: '기간제 기획전과 상시 전문관을 한 화면에서 등록 — 준비물부터 섹션(탭)·상품 담기·발행까지 단계별 안내',
    group_buys: '기간·전용가 조건으로 파는 공동구매 등록과 진행',
    lives: '영상 방송과 함께 상품을 파는 쇼핑라이브 편성',
    products: '상품 등록·수정·삭제, 가격·재고·이미지·옵션(SKU)',
    'derived-products': '여러 상품(SKU)을 묶어 파는 복합 상품 — 묶음·세트·선물세트·선택형세트 구성과 재고 파생',
    best: '자동 순위 집계와 MD 픽(수동 고정)으로 베스트 화면 구성',
    deals: '기간·시간 한정 할인 — 실제 결제 금액이 바뀌므로 주의',
    recommend: '추천 메뉴에 노출할 추천 그룹 구성',
    outlet: '이월·임박·리퍼브 등 상시 할인 채널과 아울렛 전용 분류',
    coupons: '쿠폰 발행·지급·사용 내역 관리',
    points: '회원 포인트 지급·차감과 적립 정책',
    events: '응모형 이벤트 등록과 참여자 관리',
    membership: '등급·혜택 설정, 승급 기준과 평가 실행, 회원별 등급 조회·변경',
    sales: '주문 목록·상세 조회와 주문 상태 변경',
    shipping: '송장 입력·배송 완료 처리, 기본 배송비·무료배송 기준·도서산간 할증',
    claims: '취소·반품 승인/거절과 환불 처리',
    users: '회원 목록·상세 조회, 비활성화',
    inquiries: '고객 1:1 문의 답변과 자주 묻는 질문(FAQ) 관리',
    notices: '공지사항·상품안내 글 등록·수정 (편집 중인 몰에만 저장됨)',
    operators: '관리자 계정 추가·수정·삭제와 권한(역할) 부여',
    service: '납품 고객 명부와 판매 등급별 기능 설정 (최고 관리자 전용)',
    visitors: '기간별 방문자 수와 추이',
    search_logs: '고객이 검색한 단어 확인',
    ga4: '구글 애널리틱스(GA4) 연동과 이벤트 추적'
};

// 관리자 매뉴얼 목차 순서 — 실제 관리자 사이드바 그룹 순서를 따른다.
// (쇼핑몰 관리 → 외부몰 연동 → 메뉴/카테고리 → 페이지/전시 → 상품 → 프로모션
//  → 멤버십 → 주문/회원 → 고객지원 → 시스템 → 서비스 → 통계)
const adminOrder = [
    'index',
    'login',
    // 쇼핑몰 관리
    'malls', 'settings', 'policies', 'header', 'theme', 'dashboard',
    // 외부몰 연동
    'sourcing',
    // 메뉴/카테고리 관리
    'categories', 'menus', 'brands',
    // 페이지/전시 관리
    'page_builder', 'banners', 'exhibitions', 'group_buys', 'lives',
    // 상품 관리
    'products', 'derived-products', 'best', 'deals', 'recommend', 'outlet',
    // 프로모션 관리
    'coupons', 'points', 'events',
    // 멤버십 관리
    'membership',
    // 주문/회원 관리
    'sales', 'shipping', 'claims', 'users',
    // 고객지원 관리
    'inquiries', 'notices',
    // 시스템 관리
    'operators',
    // 서비스 관리
    'service',
    // 통계 (사이드바에는 없고 대시보드에서 확인)
    'visitors', 'search_logs', 'ga4'
];

// 쇼핑몰(고객) 매뉴얼 제목 (docs/manual/user 기준)
// 제목·순서는 실제 고객 화면의 메뉴 구조를 따른다.
const userTitles = {
    index: '목차',
    // 메인 화면
    home: '메인 화면',
    // 카테고리 메뉴
    categories: '카테고리 메뉴',
    // 일반 메뉴 (상단 GNB)
    products: '상품 목록/상세',
    promotions: '혜택·프로모션 메뉴',
    brands: '브랜드관',
    // 커스텀 메뉴
    custom_menu: '커스텀 메뉴',
    // 헤더 유틸 · 구매 동선
    search: '검색',
    cart: '장바구니',
    checkout: '주문/결제',
    mypage: '마이페이지',
    auth: '로그인/회원가입',
    // 고객지원
    cs: '고객센터',
    inquiries: '1:1 문의',
    notices: '공지사항',
    // 기타
    terms_pages: '약관/정책/소개',
    ga4: 'GA4 이벤트 안내'
};

// 쇼핑몰(고객) 매뉴얼 각 항목에 대한 간단 설명
const userDescriptions = {
    index: '고객 화면의 전체 구조(상단 메뉴·우측 레일·모바일 하단바)와 화면별 안내 목록',
    home: '메인 화면에 무엇이 보이는지 — 최상단 큰 배너, 베스트, 쇼핑특가, 베스트 카테고리·브랜드',
    categories: '상단 [☰ 카테고리] 버튼과 모바일 카테고리 화면에서 분류를 따라 상품을 찾는 방법',
    products: '상품 목록·상세에서 정보를 확인하고 옵션 선택·장바구니 담기·찜을 하는 방법',
    promotions: '쇼핑특가·베스트·신상품·추천·기획전·전문관·이벤트·공동구매·아울렛·쇼핑라이브·쿠폰존 안내',
    brands: '브랜드 찾기(초성 검색), 브랜드별 상품·혜택 보기',
    custom_menu: '쇼핑몰마다 직접 만들어 붙이는 메뉴 — 눌렀을 때 무엇이 열리는지',
    search: '검색창으로 상품을 찾는 방법과 검색 결과 화면의 필터·정렬',
    cart: '담은 상품 보기, 수량 변경·삭제, 주문하기',
    checkout: '주문서 작성, 배송지·배송비·쿠폰·포인트, 결제, 주문 완료까지의 흐름',
    mypage: '주문 내역, 취소·반품 신청, 쿠폰함, 포인트, 찜, 프로필·탈퇴',
    auth: '회원가입, 로그인, 추가 정보 입력, 로그아웃',
    cs: '고객센터 화면 — 자주 묻는 질문(FAQ), 문의 경로, 비회원 주문조회',
    inquiries: '1:1 문의 작성과 내 문의 내역·답변 확인 (로그인 필요)',
    notices: '공지사항 목록·상세 보기',
    terms_pages: '이용약관, 개인정보 처리방침, 회사 소개 페이지',
    ga4: 'GA4 이벤트 추적이 사용자 행동에 어떻게 반영되는지 기본 개념 소개'
};

// 쇼핑몰 매뉴얼 목차 순서 — 고객이 보는 프론트 화면 메뉴 순서를 따른다.
// (메인 화면 → 카테고리 메뉴 → 일반 메뉴 → 커스텀 메뉴 → 구매 동선 → 고객지원 → 기타)
const userOrder = [
    'index',
    'home',
    'categories',
    'products', 'promotions', 'brands',
    'custom_menu',
    'search', 'cart', 'checkout', 'mypage', 'auth',
    'cs', 'inquiries', 'notices',
    'terms_pages', 'ga4'
];

// 몰 빌더 가이드 제목 (docs/manual/mall_builder 기준)
const mallBuilderTitles = {
    index: '몰 빌더 시작하기 (퀵 스타트)',
    overview: '솔루션 개요',
    create_mall: '1. 몰 만들기',
    theme_design: '2. 테마·디자인 다듬기',
    fill_content: '3. 몰 채우기',
    delete_rebuild: '4. 몰 지우고 다시 만들기'
};

// 몰 빌더 가이드 각 항목 설명 (목차 화면에서 사용)
const mallBuilderDescriptions = {
    index: '몰 하나를 만드는 데 꼭 필요한 최소한의 작업만 순서대로 담은 퀵 스타트 안내',
    overview: '이 프로젝트가 "몰을 찍어내 납품하는 몰 빌더"라는 성격과 멀티몰 구조를 설명',
    create_mall: '새 몰을 등록하고 테마 3종 중 하나를 골라 디자인·헤더·메뉴·메인 화면을 한 번에 채우는 단계 (샘플 데이터 포함)',
    theme_design: '색상·로고(사이트 설정), 모서리·글꼴(테마 설정), 헤더 레이아웃, 메인 히어로 이미지를 몰에 맞게 다듬는 방법',
    fill_content: '선택한 몰에 카테고리 → 상품 → 메뉴를 채우고 페이지 빌더로 홈을 발행해 스토어프론트로 확인하는 방법',
    delete_rebuild: '만든 몰을 강제 삭제(딸린 데이터 포함)하고 처음부터 다시 만드는 방법'
};

// 몰 빌더 가이드 목차 순서 — 퀵 스타트 흐름(만들기 → 꾸미기 → 채우기 → 지우기)
const mallBuilderOrder = ['index', 'overview', 'create_mall', 'theme_design', 'fill_content', 'delete_rebuild'];

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

// 명시 순서가 정의된 섹션 → 그 순서 배열
const sectionOrders = {
    coding_guide: codingGuideOrder,
    mall_builder: mallBuilderOrder,
    admin: adminOrder,
    user: userOrder
};

function getDocList(section) {
    const dir = section === 'admin' ? manualAdminDir
        : section === 'user' ? manualUserDir
        : section === 'coding_guide' ? manualCodingGuideDir
        : section === 'mall_builder' ? manualMallBuilderDir
        : path.join(docsDir, section);
    if (!fs.existsSync(dir)) return [];
    const keys = fs.readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace(/\.md$/, ''));

    const order = sectionOrders[section];
    if (order) {
        return keys.sort((a, b) => {
            const i = order.indexOf(a);
            const j = order.indexOf(b);
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
    const map = section === 'admin' ? adminTitles
        : section === 'user' ? userTitles
        : section === 'coding_guide' ? codingGuideTitles
        : section === 'mall_builder' ? mallBuilderTitles
        : {};
    return (map[key] !== undefined ? map[key] : key);
}

function getDescription(section, key) {
    const map = section === 'coding_guide' ? codingGuideDescriptions
        : section === 'user' ? userDescriptions
        : section === 'mall_builder' ? mallBuilderDescriptions
        : section === 'admin' ? adminDescriptions
        : {};
    return map[key] || '';
}

// /manual 인덱스: 관리자/사용자/코딩 가이드로 이동할 수 있는 안내 페이지
router.get('/', (req, res) => {
    const sections = [
        {
            key: 'mall_builder',
            title: '몰 빌더 가이드',
            description: '새 쇼핑몰을 처음부터 만들려는 사람을 위한 안내서 — 이 프로젝트는 몰을 찍어내 포팅해 주는 몰 빌더 솔루션입니다. 몰 만들기·채우기·삭제/재생성을 순서대로 설명합니다.',
            href: '/manual/mall_builder'
        },
        {
            key: 'admin',
            title: '관리자 매뉴얼',
            description: '쇼핑몰 운영자가 관리자 페이지에서 상품, 주문, 배너, 카테고리, 회원 등을 어떻게 관리하는지에 대한 사용 설명서',
            href: '/manual/admin'
        },
        {
            key: 'user',
            title: '쇼핑몰 매뉴얼',
            description: '고객이 보는 쇼핑몰 화면 안내 — 메인 화면, 상단 일반 메뉴, 카테고리 메뉴, 커스텀 메뉴, 고객지원까지 프론트 메뉴 순서대로 설명합니다.',
            href: '/manual/user'
        }
        // 코딩 가이드(/manual/coding_guide)는 고객 제공용이 아니라 개발자 참고용이므로
        // 메뉴에서 제외한다. 라우트는 살아 있어 URL 로 직접 접근할 수 있다.
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
    const listWithTitles = docList.map((key) => ({
        key,
        title: getTitle('admin', key),
        description: getDescription('admin', key)
    }));
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
    const listWithTitles = docList.map((key) => ({
        key,
        title: getTitle('admin', key),
        description: getDescription('admin', key)
    }));

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
        sectionTitle: '쇼핑몰 매뉴얼',
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
        sectionTitle: '쇼핑몰 매뉴얼',
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

// 몰 빌더 가이드 목차
router.get('/mall_builder', (req, res) => {
    const docList = getDocList('mall_builder');
    const listWithTitles = docList.map((key) => ({
        key,
        title: getTitle('mall_builder', key),
        description: getDescription('mall_builder', key)
    }));
    res.render('manual/index', {
        layout: 'layouts/manual_layout',
        section: 'mall_builder',
        sectionTitle: '몰 빌더 가이드',
        docList: listWithTitles,
        currentDoc: null,
        contentHtml: null
    });
});

// 몰 빌더 가이드 문서 (docs/manual/mall_builder)
router.get('/mall_builder/:doc', async (req, res) => {
    const docKey = safeDocName(req.params.doc);
    if (!docKey) return res.status(400).send('Bad Request');

    const filePath = path.join(manualMallBuilderDir, `${docKey}.md`);
    const resolved = path.resolve(filePath);
    const mallBuilderDirResolved = path.resolve(manualMallBuilderDir);
    if (!resolved.startsWith(mallBuilderDirResolved) || !fs.existsSync(filePath)) {
        return res.status(404).send('Not Found');
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const marked = await getMarked();
    const contentHtml = marked.parse(raw);

    const docList = getDocList('mall_builder');
    const listWithTitles = docList.map((key) => ({
        key,
        title: getTitle('mall_builder', key),
        description: getDescription('mall_builder', key)
    }));

    res.render('manual/index', {
        layout: 'layouts/manual_layout',
        section: 'mall_builder',
        sectionTitle: '몰 빌더 가이드',
        docList: listWithTitles,
        currentDoc: docKey,
        docTitle: getTitle('mall_builder', docKey),
        contentHtml
    });
});

module.exports = router;
