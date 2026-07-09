const GoogleStrategy = require('passport-google-oauth20').Strategy;
const KakaoStrategy = require('passport-kakao').Strategy;
const pool = require('./db');

// Override KakaoStrategy authorizationParams to support 'prompt'
const originalAuthorizationParams = KakaoStrategy.prototype.authorizationParams;
KakaoStrategy.prototype.authorizationParams = function(options) {
    const params = originalAuthorizationParams ? originalAuthorizationParams.call(this, options) : {};
    if (options.prompt) {
        params.prompt = options.prompt;
    }
    return params;
};

module.exports = function(passport) {
    // Google Strategy (optional, skip if env 미설정)
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const googleCallback = process.env.NODE_ENV === 'production'
        ? process.env.GOOGLE_CALLBACK_URL_PROD
        : process.env.GOOGLE_CALLBACK_URL_DEV;

    if (googleClientId && googleClientSecret && googleCallback) {
        passport.use(new GoogleStrategy({
            clientID: googleClientId,
            clientSecret: googleClientSecret,
            callbackURL: googleCallback
        },
        async (accessToken, refreshToken, profile, done) => {
            const newUser = {
                google_id: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName,
                picture: profile.photos[0].value
            };

            try {
                // Check by Google ID
                const [rows] = await pool.query('SELECT * FROM users WHERE google_id = ?', [profile.id]);

                if (rows.length > 0) {
                    // Update existing user: sync picture only, preserve user-edited name
                    await pool.query('UPDATE users SET last_login = NOW(), picture = ? WHERE id = ?',
                        [newUser.picture, rows[0].id]);
                    rows[0].picture = newUser.picture;
                    return done(null, rows[0]);
                } else {
                    // Check by Email (merge accounts)
                    const [emailRows] = await pool.query('SELECT * FROM users WHERE email = ?', [newUser.email]);
                    if (emailRows.length > 0) {
                        // Update existing user with Google ID: sync picture only, preserve user-edited name
                        await pool.query('UPDATE users SET google_id = ?, last_login = NOW(), picture = ? WHERE id = ?',
                            [newUser.google_id, newUser.picture, emailRows[0].id]);

                        emailRows[0].google_id = newUser.google_id;
                        emailRows[0].picture = newUser.picture;
                        return done(null, emailRows[0]);
                    } else {
                        // New user (비활성 상태로 생성 후 약관 동의 시 활성화)
                        const [result] = await pool.query('INSERT INTO users (google_id, email, name, picture, is_active) VALUES (?, ?, ?, ?, 0)',
                            [newUser.google_id, newUser.email, newUser.name, newUser.picture]);
                        newUser.id = result.insertId;
                        return done(null, newUser);
                    }
                }
            } catch (err) {
                console.error(err);
                return done(err, null);
            }
        }));
    } else {
        console.warn('Google OAuth 비활성화: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL_DEV|PROD 를 설정하면 활성화됩니다.');
    }

    // Kakao Strategy (optional, skip if env 미설정)
    const kakaoClientId = process.env.KAKAO_CLIENT_ID;
    const kakaoClientSecret = process.env.KAKAO_CLIENT_SECRET;
    const kakaoCallback = process.env.NODE_ENV === 'production'
        ? process.env.KAKAO_CALLBACK_URL_PROD
        : process.env.KAKAO_CALLBACK_URL_DEV;

    if (kakaoClientId && kakaoCallback) {
        passport.use(new KakaoStrategy({
            clientID: kakaoClientId,
            clientSecret: kakaoClientSecret, // Required when Client Secret is enabled
            callbackURL: kakaoCallback
        },
        async (accessToken, refreshToken, profile, done) => {
            // Profile structure varies, usually profile.id is unique
            // profile._json.kakao_account.email
            // profile.username or profile.displayName

            const kakaoId = String(profile.id);
            const email = profile._json && profile._json.kakao_account ? profile._json.kakao_account.email : null;
            const name = profile.displayName || profile.username;

            // 카카오 프로필 이미지: properties 또는 kakao_account.profile에서 추출
            let picture = null;
            if (profile._json) {
                const props = profile._json.properties;
                const acctProfile = profile._json.kakao_account && profile._json.kakao_account.profile;
                picture = (props && props.profile_image)
                       || (acctProfile && acctProfile.profile_image_url)
                       || (acctProfile && acctProfile.thumbnail_image_url)
                       || null;
                console.log('[KAKAO PROFILE]', JSON.stringify({ properties: props, kakao_account_profile: acctProfile, resolved_picture: picture }));
            }

            try {
                // Check by Kakao ID
                const [rows] = await pool.query('SELECT * FROM users WHERE kakao_id = ?', [kakaoId]);

                if (rows.length > 0) {
                    // Update existing user: sync picture only, preserve user-edited name
                    await pool.query('UPDATE users SET last_login = NOW(), picture = ? WHERE id = ?',
                        [picture, rows[0].id]);

                    rows[0].picture = picture;
                    return done(null, rows[0]);
                } else {
                    // Check by Email (merge)
                    if (email) {
                        const [emailRows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
                        if (emailRows.length > 0) {
                            // Merge: sync picture only, preserve user-edited name
                            await pool.query('UPDATE users SET kakao_id = ?, last_login = NOW(), picture = ? WHERE id = ?',
                                [kakaoId, picture, emailRows[0].id]);

                            emailRows[0].kakao_id = kakaoId;
                            emailRows[0].picture = picture;
                            return done(null, emailRows[0]);
                        }
                    }

                    // New User (비활성 상태로 생성 후 약관 동의 시 활성화)
                    const [result] = await pool.query('INSERT INTO users (kakao_id, email, name, picture, is_active) VALUES (?, ?, ?, ?, 0)',
                        [kakaoId, email || `kakao_${kakaoId}@no-email.com`, name, picture]);

                    const newUser = {
                        id: result.insertId,
                        kakao_id: kakaoId,
                        email: email,
                        name: name
                    };
                    return done(null, newUser);
                }
            } catch (err) {
                console.error(err);
                return done(err, null);
            }
        }));
    } else {
        console.warn('Kakao OAuth 비활성화: KAKAO_CLIENT_ID / KAKAO_CALLBACK_URL_DEV|PROD (선택: KAKAO_CLIENT_SECRET) 설정 시 활성화됩니다.');
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
                // User not found (e.g. deleted), remove from session
                done(null, false);
            }
        } catch (err) {
            done(err, null);
        }
    });
};
