-- Bind personal API key to "All" group and enable cross-platform model routing.
BEGIN;

-- Per-provider groups should use matching platform for /v1/models + scheduling.
UPDATE groups SET platform = 'openai'    WHERE id IN (2, 3, 6);
UPDATE groups SET platform = 'anthropic' WHERE id IN (4, 5, 10);
UPDATE groups SET platform = 'gemini'    WHERE id = 7;
UPDATE groups SET platform = 'antigravity' WHERE id = 8;
UPDATE groups SET platform = 'anthropic' WHERE id = 9;

-- All group must include every account.
INSERT INTO account_groups (account_id, group_id) VALUES
  (2, 9), (3, 9), (4, 9)
ON CONFLICT (account_id, group_id) DO NOTHING;

-- Personal key -> All group (was Antigravity-only).
UPDATE api_keys SET group_id = 9 WHERE key LIKE 'sk-2da0ba1ae9%';

UPDATE groups SET
  model_routing_enabled = true,
  model_routing = '{
    "deepseek-chat": [5],
    "deepseek-reasoner": [5],
    "gpt-4o": [4],
    "gpt-4o-mini": [4],
    "o3-mini": [4],
    "o1": [4],
    "o1-mini": [4],
    "moonshot-v1-8k": [6],
    "moonshot-v1-32k": [6],
    "moonshot-v1-128k": [6],
    "kimi-*": [6],
    "gemini-*": [2, 3],
    "claude-*": [1, 3, 7],
    "MiniMax-*": [7],
    "abab*": [7]
  }'::jsonb,
  supported_model_scopes = '["claude", "gemini_text", "gemini_image", "openai"]'::jsonb,
  models_list_config = '{
    "enabled": true,
    "models": [
      "claude-opus-4-5-20251101",
      "claude-opus-4-6",
      "claude-opus-4-7",
      "claude-opus-4-8",
      "claude-sonnet-4-6",
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5-20251001",
      "deepseek-chat",
      "deepseek-reasoner",
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
      "gemini-2.0-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "MiniMax-Text-01"
    ]
  }'::jsonb
WHERE id = 9;

COMMIT;

SELECT k.id, k.name, k.group_id, g.name AS grp
FROM api_keys k LEFT JOIN groups g ON g.id = k.group_id
ORDER BY k.id;

SELECT g.id, g.name, g.platform, g.model_routing_enabled,
       jsonb_array_length(COALESCE(g.models_list_config->'models', '[]'::jsonb)) AS model_list_count
FROM groups g WHERE g.id = 9;
