# 个人第二大脑

**Sub2API 在 VPS**（账号已配好） + **Khoj 在本地 Docker**（知识沉淀） + **Cherry Studio**（日常聊天）。

## 架构

```
Cherry Studio  ──→  https://api.coolapihub.khtain.com  ──→  你的 AI 账号
Khoj :5871     ──→  同上（同一 API Key）
管理后台        ──→  Vercel 前端 → coolapihub
```

本地 **不运行** Sub2API Docker。

## 三步配置

```powershell
cd F:\codex\sub2api\deploy

# 1. 启动 Khoj
powershell -ExecutionPolicy Bypass -File scripts\setup-khoj.ps1

# 2. 填入 VPS API Key（在管理后台 API Keys 里创建）
powershell -ExecutionPolicy Bypass -File scripts\set-api-key.ps1 -ApiKey "sk-你的密钥"

# 3. 配置 Cherry Studio
powershell -File scripts\open-cherry-studio.ps1
```

详细图文说明：**`deploy/brain/SETUP_GUIDE.md`**

## 地址

| 用途 | 地址 |
|------|------|
| **用量看板**（双击桌面快捷方式） | https://coolapihub.khtain.com/admin/dashboard |
| Khoj 知识库 | http://localhost:5871 |
| VPS API | https://api.coolapihub.khtain.com/v1 |
| Cherry 桥接 | http://127.0.0.1:5892 |

### 开机自启（装一次）

```powershell
cd F:\codex\sub2api\deploy
powershell -ExecutionPolicy Bypass -File scripts\install-personal-startup.ps1
```

会注册：登录后自动启动 **Cherry 桥接** + **Khoj Docker**，并在桌面创建 **「Sub2API 用量看板」** 快捷方式。

打开看板：双击桌面 **Sub2API Usage Dashboard**，或运行 `deploy\scripts\open-sub2api.bat`

## Cherry 知识沉淀（触发式 + AI 提炼）

```powershell
cd F:\codex\sub2api\deploy
powershell -File scripts\setup-cherry-knowledge.ps1
```

流程：`Cherry → :5892 桥接 → VPS API`；对话末尾 `#沉淀` → AI 提炼知识卡片 → Khoj。

| 环境变量 | 默认 | 含义 |
|---------|------|------|
| `CHERRY_DEPOSIT_MODE` | `trigger` | `off` / `trigger` / `always` |
| `CHERRY_DEPOSIT_AUTO_INDEX` | `high` | `high` 仅高置信自动入库 / `manual` 全进待审核 |
| `CHERRY_DISTILL_MODEL` | `claude-sonnet-4-6` | 提炼用的模型 |
| `CHERRY_INJECT_PROFILE` | `true` | 自动注入技术栈 profile |

待审核批准：`node scripts\approve-pending-deposit.mjs --all`

**P2 已启用**：提问前自动搜索 Khoj 注入相关历史（`CHERRY_RECALL_ENABLED=true`）。

```powershell
node scripts\cleanup-legacy-imports.mjs      # 清理旧原文测试归档
node scripts\export-knowledge-outline.mjs      # 导出素材大纲 → brain/exports/
node scripts\export-content-draft.mjs --format course  # 课程/小红书草稿
node scripts\sync-cards-to-obsidian.mjs                # 同步 Obsidian PARA
node scripts\import-web-chat.mjs pasted-chat.md        # 网页对话导入
scripts\open-brain-dashboard.bat                       # 本地状态面板
```

重新安装开机任务（含 Second Brain 桌面快捷方式）：`scripts\install-personal-startup.ps1`

## 日常分工

- **Cherry Studio**：日常聊天；值得记的加 `#沉淀`
- **Khoj**：搜索、回顾、基于知识库对话
- **Vercel 后台**：看额度、管账号
