-- API keys for Cherry Studio multi-provider setup (one key per platform group)
BEGIN;

-- Claude: dedicate test-01 to Claude API group
UPDATE api_keys SET group_id = 5, updated_at = NOW() WHERE id = 1;

INSERT INTO api_keys (user_id, key, name, group_id, status, quota, quota_used, rate_limit_5h, rate_limit_1d, rate_limit_7d, usage_5h, usage_1d, usage_7d)
VALUES
  (1, 'sk-REPLACE_WITH_DEEPSEEK_KEY', 'cherry-deepseek', 2, 'active', 0, 0, 0, 0, 0, 0, 0, 0),
  (1, 'sk-REPLACE_WITH_KIMI_KEY',     'cherry-kimi',     3, 'active', 0, 0, 0, 0, 0, 0, 0, 0),
  (1, 'sk-REPLACE_WITH_MINIMAX_KEY',  'cherry-minimax',  4, 'active', 0, 0, 0, 0, 0, 0, 0, 0),
  (1, 'sk-REPLACE_WITH_GEMINI_KEY',   'cherry-gemini',   7, 'active', 0, 0, 0, 0, 0, 0, 0, 0)
ON CONFLICT (key) DO UPDATE SET
  group_id = EXCLUDED.group_id,
  name = EXCLUDED.name,
  status = 'active',
  updated_at = NOW();

COMMIT;

SELECT k.id, k.name, k.group_id, g.name AS group_name, g.platform
FROM api_keys k
LEFT JOIN groups g ON g.id = k.group_id
ORDER BY k.id;
