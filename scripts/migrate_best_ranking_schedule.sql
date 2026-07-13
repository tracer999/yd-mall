-- 베스트/랭킹 집계 스케줄 — 관리자 화면에서 관리한다
--
-- 왜 crontab 을 앱이 직접 쓰지 않는가:
--   푸시 = 배포는 `git reset --hard` 로 **코드만** 갈아치운다. crontab 은 건드리지 않는다.
--   앱이 crontab 을 exec 하면 관리 주체가 어긋나고(누가 정본인가), PM2 프로세스에
--   crontab 권한을 주게 된다.
--
-- 그래서 역할을 나눈다:
--   서버 crontab   5분마다 scripts/best_ranking_cron.sh 를 때린다. **한 줄. 영원히 안 바뀐다.**
--   이 테이블      기간별 on/off · 주기를 정한다. 관리자 /admin/best-groups 에서 편집.
--   --scheduled    스크립트가 이 표와 best_ranking_run(마지막 성공 시각)을 대조해
--                  "지금 돌 차례인 기간"만 실행한다.
--
-- 주기를 바꾸려면 서버에 들어갈 필요가 없다. 관리자 화면에서 숫자만 고치면 된다.

CREATE TABLE IF NOT EXISTS best_ranking_schedule (
  period           varchar(20) NOT NULL COMMENT 'REALTIME/DAILY/WEEKLY/MONTHLY',
  enabled          tinyint(1)  NOT NULL DEFAULT 1,
  interval_minutes int         NOT NULL DEFAULT 60 COMMENT '이 간격이 지나면 다시 집계한다',
  updated_at       datetime    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='베스트/랭킹 집계 스케줄';

-- 기간별 주기는 다르다. 월간을 10분마다 돌릴 이유가 없다.
INSERT INTO best_ranking_schedule (period, enabled, interval_minutes) VALUES
  ('REALTIME', 1, 10),
  ('DAILY',    1, 60),
  ('WEEKLY',   1, 1440),
  ('MONTHLY',  1, 1440)
ON DUPLICATE KEY UPDATE period = VALUES(period);

SELECT * FROM best_ranking_schedule;
