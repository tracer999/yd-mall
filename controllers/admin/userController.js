const pool = require('../../config/db');
const bcrypt = require('bcrypt');
const emailService = require('../../services/emailService');
const { generateTempPassword } = require('../../shared/tempPassword');

/*
 * ── 일반회원 관리 (기업회원 제외) ──
 *
 * users 테이블은 일반회원과 기업회원이 함께 쓰지만 **관리 화면은 완전히 분리**한다.
 *   - 일반회원 : /admin/users        (이 파일)
 *   - 기업회원 : /admin/b2b/members  (controllers/admin/b2bMemberController.js)
 *
 * 판정 기준은 `business_profile` 행의 존재 하나뿐이다(user_id 가 UNIQUE 라 1:1).
 * 두 화면이 같은 회원을 동시에 다루면 승인 상태(business_profile.status)와
 * 계정 상태(users.is_active)가 서로 모르는 채 갈라져, 관리자가 어느 화면을 보느냐에
 * 따라 다른 답을 얻는다. 그래서 이 화면은 기업회원을 **조회조차 하지 않는다**.
 */
const JOIN_BUSINESS = 'LEFT JOIN business_profile bp ON bp.user_id = u.id';
const ONLY_GENERAL = 'bp.id IS NULL';

/**
 * 회원 삭제 가능 여부 판정.
 *
 * 삭제는 되돌릴 수 없고, users 를 지우면 장바구니·포인트·쿠폰·리뷰가 FK CASCADE 로 함께
 * 사라진다(주문만 ON DELETE SET NULL 로 남는다). 그래서 **탈퇴했거나 아무 활동이 없는
 * 계정만** 지울 수 있게 한다. 활동 이력이 있는 계정은 비활성 처리로 충분하다.
 *
 * @returns {{ok: boolean, reason?: string}}
 */
function judgeDeletable(row) {
    if (!row) return { ok: false, reason: '대상 회원을 찾을 수 없습니다.' };

    // 기업회원은 이 화면의 관할이 아니다. 여기서 지우면 승인된 사업자 신원과
    // 계약 조건이 CASCADE 로 함께 사라진다(fk_bp_user ON DELETE CASCADE).
    if (row.business_profile_id) {
        return { ok: false, reason: '기업회원입니다. B2B 관리 > 기업회원 승인에서 처리해 주세요.' };
    }
    if (row.withdrawn_at) return { ok: true };

    if (Number(row.is_active) === 1) {
        return { ok: false, reason: '이용 중인 회원입니다. 비활성 처리 후 삭제할 수 있습니다.' };
    }
    if (Number(row.order_count) > 0) {
        return { ok: false, reason: `주문 이력이 ${row.order_count}건 있습니다. 삭제할 수 없습니다.` };
    }
    if (Number(row.points_balance) > 0) {
        return { ok: false, reason: `보유 포인트가 ${row.points_balance}P 남아 있습니다. 삭제할 수 없습니다.` };
    }
    return { ok: true };
}

/** 삭제·정지 판정에 필요한 값을 한 번에 읽는다. */
async function loadUserForGuard(id) {
    const [[row]] = await pool.query(
        `SELECT u.id, u.is_active, u.withdrawn_at, u.points_balance,
                bp.id AS business_profile_id,
                (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS order_count
           FROM users u
           ${JOIN_BUSINESS}
          WHERE u.id = ?`,
        [id]
    );
    return row || null;
}

/**
 * 회원 검색 API (JSON) - 이메일, 이름, 연락처, 생년월일 통합 검색
 * 반환: 구글/카카오 프로필, 최근 주문 건수, 총 결제금액, 보유 포인트
 */
exports.searchApi = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) {
            return res.json({ users: [] });
        }
        const like = `%${q}%`;
        const likeBirth = `%${q.replace(/-/g, '')}%`;
        const [users] = await pool.query(
            `SELECT u.id, u.email, u.name, u.phone, u.birthdate, u.google_id, u.kakao_id, u.picture, u.points_balance,
                    COALESCE(o.order_count, 0) AS order_count,
                    COALESCE(o.total_payment, 0) AS total_payment
             FROM users u
             LEFT JOIN (
                 SELECT user_id,
                        COUNT(*) AS order_count,
                        SUM(total_amount) AS total_payment
                 FROM orders
                 WHERE status = 'PAID' AND user_id IS NOT NULL
                 GROUP BY user_id
             ) o ON u.id = o.user_id
             WHERE u.email LIKE ? OR u.name LIKE ? OR u.phone LIKE ?
                OR DATE_FORMAT(u.birthdate, '%Y-%m-%d') LIKE ?
                OR DATE_FORMAT(u.birthdate, '%Y%m%d') LIKE ?
             ORDER BY u.created_at DESC
             LIMIT 50`,
            [like, like, like, like, likeBirth]
        );
        res.json({ users });
    } catch (err) {
        console.error(err);
        res.status(500).json({ users: [], error: err.message });
    }
};

exports.getList = async (req, res) => {
    try {
        const searchQuery = req.query.q ? req.query.q.trim() : '';
        const searchStatus = req.query.status || '';
        let sql = `
            SELECT
                u.*,
                terms.version AS terms_version,
                privacy.version AS privacy_version,
                (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS order_count
            FROM users u
            ${JOIN_BUSINESS}
            LEFT JOIN policy_versions terms ON u.agreed_terms_id = terms.id
            LEFT JOIN policy_versions privacy ON u.agreed_privacy_id = privacy.id
            WHERE ${ONLY_GENERAL}
        `;
        const params = [];
        if (searchQuery) {
            const like = `%${searchQuery}%`;
            sql += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
            params.push(like, like, like);
        }
        if (searchStatus === 'active') {
            sql += ' AND u.is_active = 1';
        } else if (searchStatus === 'withdrawn') {
            sql += ' AND u.is_active = 0 AND u.withdrawn_at IS NOT NULL';
        }
        sql += ' ORDER BY u.created_at DESC';
        const [users] = await pool.query(sql, params);

        // 목록에서 바로 "지울 수 있는지"를 보여준다 — 눌러 본 뒤 거부당하지 않게.
        const rows = users.map((u) => {
            const verdict = judgeDeletable({ ...u, business_profile_id: null });
            return { ...u, deletable: verdict.ok, deleteBlockReason: verdict.reason || null };
        });

        // 기업회원은 이 목록에 없다. 몇 명이 어디에 있는지는 알려 준다.
        const [[bizCount]] = await pool.query('SELECT COUNT(*) AS cnt FROM business_profile');

        res.render('admin/users/list', {
            layout: 'layouts/admin_layout',
            title: '회원 관리',
            users: rows,
            searchQuery,
            searchStatus,
            businessCount: bizCount ? bizCount.cnt : 0,
            message: req.query.message || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.toggleActive = async (req, res) => {
    const id = req.params.id;
    try {
        const row = await loadUserForGuard(id);
        if (!row) return res.redirect('/admin/users?error=' + encodeURIComponent('대상 회원을 찾을 수 없습니다.'));

        // 기업회원의 계정 활성 여부는 B2B 자격 판정(b2bContext)에 직접 물린다.
        // 이 화면에서 끄면 기업회원 승인 화면은 여전히 '승인'으로 보여 상태가 어긋난다.
        if (row.business_profile_id) {
            return res.redirect('/admin/users?error=' + encodeURIComponent(
                '기업회원입니다. B2B 관리 > 기업회원 승인에서 처리해 주세요.'
            ));
        }

        await pool.query(
            'UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?',
            [id]
        );
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getDetail = async (req, res) => {
    const id = req.params.id;
    try {
        const [rows] = await pool.query(
            `SELECT
                u.*,
                terms.version AS terms_version,
                privacy.version AS privacy_version,
                bp.id AS business_profile_id
            FROM users u
            ${JOIN_BUSINESS}
            LEFT JOIN policy_versions terms ON u.agreed_terms_id = terms.id
            LEFT JOIN policy_versions privacy ON u.agreed_privacy_id = privacy.id
            WHERE u.id = ?`,
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).send('User not found');
        }
        const user = rows[0];

        // 기업회원은 이 화면의 관할이 아니다. URL 을 직접 쳐도 담당 화면으로 보낸다.
        if (user.business_profile_id) {
            return res.redirect(`/admin/b2b/members/${user.business_profile_id}`);
        }

        const [issuedCoupons] = await pool.query(
            `SELECT uc.id, uc.issued_at, uc.used_at, uc.issued_by, uc.order_id,
                    c.name AS coupon_name, c.code AS coupon_code, c.discount_amount,
                    o.order_number
             FROM user_coupons uc
             JOIN coupons c ON uc.coupon_id = c.id
             LEFT JOIN orders o ON uc.order_id = o.id
             WHERE uc.user_id = ?
             ORDER BY uc.issued_at DESC
             LIMIT 100`,
            [id]
        );

        const [pointTransactions] = await pool.query(
            `SELECT id, amount, transaction_type, order_id, description, created_at
             FROM point_transactions
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 100`,
            [id]
        );

        const [userOrders] = await pool.query(
            `SELECT id, order_number, status, total_amount, created_at, paid_at
             FROM orders
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 100`,
            [id]
        );
        const totalOrderAmount = userOrders
            .filter(o => o.status === 'PAID')
            .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        res.render('admin/users/detail', {
            layout: 'layouts/admin_layout',
            title: '회원 상세 정보',
            user,
            issuedCoupons,
            pointTransactions,
            userOrders,
            totalOrderAmount,
            message: req.query.message || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/*
 * 회원 정보 수정 — 전화 문의로 들어오는 "주소를 잘못 넣었어요" 를 처리하는 창구.
 *
 * 손대지 않는 값이 있다. **이메일**은 로그인 아이디이자 소셜 계정 연결 키라 관리자가 바꾸면
 * 회원이 자기 계정에 못 들어간다. **포인트 잔액**은 포인트 관리에서 이력을 남기며 조정해야 하고,
 * 여기서 숫자를 덮어쓰면 지급 내역과 잔액이 어긋난다. 그래서 둘 다 이 화면 밖이다.
 */
exports.postEdit = async (req, res) => {
    const id = Number(req.params.id);
    const back = (msg, isError) =>
        res.redirect(`/admin/users/${id}?${isError ? 'error' : 'message'}=` + encodeURIComponent(msg));
    try {
        const row = await loadUserForGuard(id);
        if (!row) return res.redirect('/admin/users?error=' + encodeURIComponent('대상 회원을 찾을 수 없습니다.'));
        if (row.business_profile_id) return res.redirect(`/admin/b2b/members/${row.business_profile_id}`);

        const s = (v, max) => {
            const t = String(v == null ? '' : v).trim();
            return t ? t.slice(0, max) : null;
        };
        const name = s(req.body.name, 50);
        if (!name) return back('이름은 비울 수 없습니다.', true);

        // 생년월일은 비어 있거나 YYYY-MM-DD 여야 한다. 형식이 어긋나면 저장하지 않고 되돌린다.
        const birthdate = s(req.body.birthdate, 10);
        if (birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return back('생년월일 형식이 올바르지 않습니다.', true);

        const gender = ['M', 'F', ''].includes(String(req.body.gender || '')) ? (s(req.body.gender, 10)) : null;

        await pool.query(
            `UPDATE users SET
                name = ?, phone = ?, birthdate = ?, gender = ?,
                zipcode = ?, address = ?, detailed_address = ?,
                receiver_name = ?, phone_sub = ?, delivery_request = ?,
                marketing_agreed = ?
             WHERE id = ?`,
            [
                name, s(req.body.phone, 20), birthdate, gender,
                s(req.body.zipcode, 10), s(req.body.address, 255), s(req.body.detailed_address, 255),
                s(req.body.receiver_name, 50), s(req.body.phone_sub, 20), s(req.body.delivery_request, 255),
                req.body.marketing_agreed ? 1 : 0,
                id,
            ]
        );
        back('회원 정보를 수정했습니다.');
    } catch (err) {
        console.error('[users] postEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/*
 * 비밀번호 초기화 — 임시 비밀번호를 만들어 저장하고 회원에게 메일로 보낸다.
 *
 * 관리자에게 "회원의 비밀번호를 직접 정하게" 하지 않는다. 관리자가 아는 비밀번호를 회원 계정에
 * 심어 두는 꼴이라, 그 계정으로 무엇을 하든 회원이 했는지 관리자가 했는지 구분할 수 없게 된다.
 * 메일 발송이 실패해도 초기화 자체는 유효하므로, 화면에 임시 비밀번호를 함께 보여 전화로 안내할 수 있게 한다.
 */
exports.postResetPassword = async (req, res) => {
    const id = Number(req.params.id);
    const back = (msg, isError) =>
        res.redirect(`/admin/users/${id}?${isError ? 'error' : 'message'}=` + encodeURIComponent(msg));
    try {
        const [[user]] = await pool.query(
            'SELECT id, email, name, password_hash, signup_provider FROM users WHERE id = ?', [id]);
        if (!user) return res.redirect('/admin/users?error=' + encodeURIComponent('대상 회원을 찾을 수 없습니다.'));

        // 소셜 전용 계정은 비밀번호라는 것이 없다. 여기서 만들어 주면 로그인 경로가 둘로 갈린다.
        if (!user.password_hash) {
            return back('소셜 로그인 전용 계정이라 비밀번호가 없습니다. 가입에 쓴 소셜 계정으로 로그인하도록 안내하세요.', true);
        }

        const temp = generateTempPassword();
        const hash = await bcrypt.hash(temp, 10);
        await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);

        let mailNote = '';
        if (user.email) {
            try {
                await emailService.sendEmail({
                    to: user.email,
                    subject: '[비밀번호 초기화] 임시 비밀번호가 발급되었습니다',
                    html: `<p>${user.name || ''}님, 요청하신 비밀번호가 초기화되었습니다.</p>
                           <p>임시 비밀번호: <b style="font-size:18px">${temp}</b></p>
                           <p>로그인 후 <b>마이페이지 &gt; 회원정보 수정</b>에서 반드시 새 비밀번호로 바꿔 주세요.</p>`,
                });
                mailNote = ` ${user.email} 로 안내 메일을 보냈습니다.`;
            } catch (e) {
                console.error('[users] 임시 비밀번호 메일 실패:', e.message);
                mailNote = ' (메일 발송에 실패했으니 아래 비밀번호를 직접 안내해 주세요)';
            }
        }
        back(`임시 비밀번호: ${temp}${mailNote}`);
    } catch (err) {
        console.error('[users] postResetPassword:', err.message);
        res.status(500).send('Server Error');
    }
};

/**
 * 회원 삭제 — 탈퇴했거나 활동 이력이 없는 계정만.
 *
 * 화면에서 버튼을 숨기는 것과 별개로 **서버에서 다시 판정한다**. 목록을 띄워 둔 사이
 * 회원이 주문을 넣었을 수도 있고, POST 는 직접 호출할 수도 있다.
 */
exports.deleteUser = async (req, res) => {
    const id = req.params.id;
    try {
        const row = await loadUserForGuard(id);
        const verdict = judgeDeletable(row);
        if (!verdict.ok) {
            return res.redirect('/admin/users?error=' + encodeURIComponent(verdict.reason));
        }

        await pool.query('DELETE FROM users WHERE id = ?', [id]);
        res.redirect('/admin/users?message=' + encodeURIComponent('회원을 삭제했습니다.'));
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

