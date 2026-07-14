const GoogleStrategy = require('passport-google-oauth20').Strategy;
const KakaoStrategy = require('passport-kakao').Strategy;
const NaverStrategy = require('passport-naver-v2').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const pool = require('./db');
const { getCallbackUrl, isProviderEnabled } = require('../services/auth/authProviders');
const { verifyPassword } = require('../services/auth/profileService');

// KakaoStrategy 가 'prompt' 파라미터를 그대로 넘기도록 확장 (계정 선택 화면 강제용)
const originalAuthorizationParams = KakaoStrategy.prototype.authorizationParams;
KakaoStrategy.prototype.authorizationParams = function (options) {
    const params = originalAuthorizationParams ? originalAuthorizationParams.call(this, options) : {};
    if (options.prompt) {
        params.prompt = options.prompt;
    }
    return params;
};

/**
 * 소셜 계정 upsert — Google/Kakao/Naver 가 동일한 규칙을 쓴다.
 *
 * 1) provider_id 로 조회 → 있으면 프로필 이미지만 동기화 (이름은 사용자가 고쳤을 수 있으므로 보존)
 * 2) 없으면 email 로 조회 → 있으면 해당 계정에 provider_id 를 연결 (계정 병합)
 * 3) 둘 다 없으면 신규 INSERT. 이때 is_active=0 — 추가정보(/auth/signup-finish)를 채워야 활성화된다.
 */
async function findOrCreateSocialUser({ provider, providerId, email, name, picture }) {
    const idColumn = `${provider}_id`;
    const id = String(providerId);

    const [byProvider] = await pool.query(`SELECT * FROM users WHERE ${idColumn} = ?`, [id]);
    if (byProvider.length > 0) {
        await pool.query('UPDATE users SET last_login = NOW(), picture = ? WHERE id = ?', [picture, byProvider[0].id]);
        return { ...byProvider[0], picture };
    }

    if (email) {
        const [byEmail] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (byEmail.length > 0) {
            await pool.query(
                `UPDATE users SET ${idColumn} = ?, last_login = NOW(), picture = ? WHERE id = ?`,
                [id, picture, byEmail[0].id]
            );
            return { ...byEmail[0], [idColumn]: id, picture };
        }
    }

    const resolvedEmail = email || `${provider}_${id}@no-email.com`;
    const [result] = await pool.query(
        `INSERT INTO users (${idColumn}, email, name, picture, signup_provider, is_active)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [id, resolvedEmail, name, picture, provider.toUpperCase()]
    );

    const [[created]] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    return created;
}

module.exports = function (passport) {
    // --- 자체 로그인 (이메일 + 비밀번호) ---
    passport.use(new LocalStrategy(
        { usernameField: 'email', passwordField: 'password' },
        async (email, password, done) => {
            try {
                const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
                const user = rows[0];

                // 소셜 전용 계정(password_hash IS NULL)에 비밀번호 로그인을 시도한 경우도 같은 메시지로 처리한다
                // — 어떤 이메일이 가입돼 있는지 알려주지 않기 위해.
                if (!user || !await verifyPassword(user, password)) {
                    return done(null, false, { message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
                }

                await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
                return done(null, user);
            } catch (err) {
                console.error('[passport:local]', err);
                return done(err);
            }
        }
    ));

    // --- Google ---
    if (isProviderEnabled('google')) {
        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: getCallbackUrl('google')
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                const user = await findOrCreateSocialUser({
                    provider: 'google',
                    providerId: profile.id,
                    email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                    name: profile.displayName,
                    picture: profile.photos && profile.photos[0] ? profile.photos[0].value : null
                });
                return done(null, user);
            } catch (err) {
                console.error('[passport:google]', err);
                return done(err, null);
            }
        }));
    } else {
        console.warn('Google OAuth 비활성화: 관리자 > 시스템 설정에서 Client ID / Callback URL 을 입력하면 활성화됩니다.');
    }

    // --- Kakao ---
    if (isProviderEnabled('kakao')) {
        passport.use(new KakaoStrategy({
            clientID: process.env.KAKAO_CLIENT_ID,
            clientSecret: process.env.KAKAO_CLIENT_SECRET,
            callbackURL: getCallbackUrl('kakao')
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                const json = profile._json || {};
                const account = json.kakao_account || {};
                const properties = json.properties || {};
                const picture = properties.profile_image
                    || (account.profile && account.profile.profile_image_url)
                    || (account.profile && account.profile.thumbnail_image_url)
                    || null;

                const user = await findOrCreateSocialUser({
                    provider: 'kakao',
                    providerId: profile.id,
                    email: account.email || null,
                    name: profile.displayName || profile.username,
                    picture
                });
                return done(null, user);
            } catch (err) {
                console.error('[passport:kakao]', err);
                return done(err, null);
            }
        }));
    } else {
        console.warn('Kakao OAuth 비활성화: 관리자 > 시스템 설정에서 Client ID / Callback URL 을 입력하면 활성화됩니다.');
    }

    // --- Naver ---
    if (isProviderEnabled('naver')) {
        passport.use(new NaverStrategy({
            clientID: process.env.NAVER_CLIENT_ID,
            clientSecret: process.env.NAVER_CLIENT_SECRET,
            callbackURL: getCallbackUrl('naver')
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                const user = await findOrCreateSocialUser({
                    provider: 'naver',
                    providerId: profile.id,
                    email: profile.email || null,
                    name: profile.name || profile.nickname,
                    picture: profile.profileImage || null
                });
                return done(null, user);
            } catch (err) {
                console.error('[passport:naver]', err);
                return done(err, null);
            }
        }));
    } else {
        console.warn('Naver OAuth 비활성화: 관리자 > 시스템 설정에서 Client ID / Callback URL 을 입력하면 활성화됩니다.');
    }

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
            if (rows.length > 0) {
                done(null, rows[0]);
            } else {
                // 삭제된 사용자 — 세션에서 제거
                done(null, false);
            }
        } catch (err) {
            done(err, null);
        }
    });
};
