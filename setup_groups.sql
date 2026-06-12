BEGIN;

DELETE FROM account_groups;
DELETE FROM groups WHERE id > 1;
ALTER SEQUENCE groups_id_seq RESTART WITH 2;

INSERT INTO groups (id, name, description, status, created_at, updated_at) VALUES
(2,  'DeepSeek',      'deepseek-chat / deepseek-reasoner',  'active', now(), now()),
(3,  'Kimi',          'moonshot-v1',                        'active', now(), now()),
(4,  'MiniMax',       'MiniMax-M3 / M2.7 / M2.5',          'active', now(), now()),
(5,  'Claude API',    'Anthropic API',                      'active', now(), now()),
(6,  'OpenAI',        'OpenAI API',                         'active', now(), now()),
(7,  'Gemini',        'Gemini / Google One',                'active', now(), now()),
(8,  'Antigravity',   'Google One Pro Antigravity',         'active', now(), now()),
(9,  'All',           'All accounts - admin only',          'active', now(), now()),
(10, 'Coding',        'Claude + DeepSeek + Kimi',           'active', now(), now());

INSERT INTO account_groups (account_id, group_id)
SELECT a.id, g.id FROM accounts a, groups g
WHERE a.deleted_at IS NULL AND a.name LIKE '%DeepSeek%'
AND g.name IN ('DeepSeek', 'All', 'Coding');

INSERT INTO account_groups (account_id, group_id)
SELECT a.id, g.id FROM accounts a, groups g
WHERE a.deleted_at IS NULL AND LOWER(a.name) LIKE '%kimi%'
AND g.name IN ('Kimi', 'All', 'Coding');

INSERT INTO account_groups (account_id, group_id)
SELECT a.id, g.id FROM accounts a, groups g
WHERE a.deleted_at IS NULL AND LOWER(a.name) LIKE '%minimax%'
AND g.name IN ('MiniMax', 'All');

INSERT INTO account_groups (account_id, group_id)
SELECT a.id, g.id FROM accounts a, groups g
WHERE a.deleted_at IS NULL AND LOWER(a.name) LIKE '%claude%'
AND g.name IN ('Claude API', 'All', 'Coding');

INSERT INTO account_groups (account_id, group_id)
SELECT a.id, g.id FROM accounts a, groups g
WHERE a.deleted_at IS NULL AND LOWER(a.name) = 'openai'
AND g.name = 'OpenAI';

INSERT INTO account_groups (account_id, group_id)
SELECT a.id, g.id FROM accounts a, groups g
WHERE a.deleted_at IS NULL AND LOWER(a.name) LIKE '%google one%' AND a.platform = 'gemini'
AND g.name = 'Gemini';

INSERT INTO account_groups (account_id, group_id)
SELECT a.id, g.id FROM accounts a, groups g
WHERE a.deleted_at IS NULL AND LOWER(a.name) LIKE '%antigravity%'
AND g.name = 'Antigravity';

COMMIT;

SELECT g.name AS grp, string_agg(a.name, ', ') AS accounts
FROM groups g
LEFT JOIN account_groups ag ON g.id = ag.group_id
LEFT JOIN accounts a ON ag.account_id = a.id AND a.deleted_at IS NULL
GROUP BY g.id, g.name
ORDER BY g.id;
