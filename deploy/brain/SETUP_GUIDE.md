# Cherry Studio + Khoj + VPS Sub2API 配置指南

## 整体架构（你现在用的这套）

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────────────────┐
│ Cherry Studio   │────→│ 本地桥接      │────→│ VPS Sub2API (coolapihub)      │
│ 日常聊天/写代码  │     │ :5892 提炼沉淀 │     │ 账号、额度、分组 已配好          │
└─────────────────┘     └──────┬───────┘     └──────────────────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Khoj :5871      │
                        │ 自动索引、可搜索  │
                        └─────────────────┘

管理后台：Vercel 前端 → 代理到 coolapihub（看额度、管账号、建 API Key）
```

**本地不再跑 Sub2API**，只跑 **Khoj**。

---

## 第一步：在 VPS 创建 API Key（只做一次）

1. 打开你的 **Vercel 部署的 Sub2API 管理页**（和平时管理账号同一个网站）
2. 登录管理员账号
3. 进入 **API Keys** → **新建**
4. 复制生成的 `sk-...`（只显示一次）

在 PowerShell 里写入本地配置并重启 Khoj：

```powershell
cd F:\codex\sub2api\deploy
powershell -ExecutionPolicy Bypass -File scripts\set-api-key.ps1 -ApiKey "sk-你的密钥"
```

---

## 第二步：启动本地 Khoj

```powershell
cd F:\codex\sub2api\deploy
powershell -ExecutionPolicy Bypass -File scripts\setup-khoj.ps1
```

浏览器打开：**http://localhost:5871**

- 发一条测试消息，能回复说明 Khoj 已通过 VPS 调通模型
- 之后在 Khoj 里的对话会自动进入知识库

---

## 第三步：Cherry Studio + 自动知识沉淀（推荐一条命令）

```powershell
cd F:\codex\sub2api\deploy
powershell -ExecutionPolicy Bypass -File scripts\setup-cherry-knowledge.ps1
```

会做四件事：
1. 确保 Khoj 在跑（`http://localhost:5871`）
2. 配置 Khoj 对话模型指向 VPS Sub2API
3. 启动本地桥接 `http://127.0.0.1:5892`（转发 + 知识提炼）
4. 把 Cherry 里所有 CoolAPIHub Provider 指到桥接地址

流量：

```
Cherry Studio → localhost:5892 桥接 → api.coolapihub.khtain.com
                      ↓（仅 #沉淀 / 解决了 等触发时）
              AI 提炼知识卡片 → brain/imports/cherry/cards/*.md → Khoj
```

### 知识沉淀怎么用

**默认不会**把每句闲聊写进 Khoj。在 Cherry 对话里，当一段讨论值得记下时，在消息末尾加：

- `#沉淀` / `#记住` / `#第二大脑`
- 或自然语言：`解决了`、`记下来`、`沉淀一下`

桥接会：
1. 用 AI 判断是否值得沉淀（过滤测试/寒暄）
2. 提炼成结构化**知识卡片**（标题、问题、方案、标签、PARA 分类）
3. `confidence: high` 自动进 Khoj；`medium/low` 进待审核队列

```powershell
# 查看待审核
node scripts\approve-pending-deposit.mjs

# 全部批准入库
node scripts\approve-pending-deposit.mjs --all
```

桥接会自动注入 `brain/profile/user-profile.yaml` 里的技术栈背景，减少重复介绍。

### P2：提问前自动回忆（已启用）

每次 Cherry 聊天前，桥接会搜索 Khoj，把相关历史知识卡片注入上下文（「你之前解决过类似问题」）。

```powershell
# 清理 P0 阶段的原文测试归档（移出 imports + 从 Khoj 删除索引）
node scripts\cleanup-legacy-imports.mjs

# 导出素材大纲（按 PARA 分组，用于自媒体/课程）
node scripts\export-knowledge-outline.mjs
node scripts\export-knowledge-outline.mjs --para Projects --tag khoj
```

### P3：Obsidian / 网页对话 / 素材工坊

```powershell
# 状态面板（或双击桌面 Second Brain Dashboard）
scripts\open-brain-dashboard.bat

# 知识卡片 → Obsidian PARA 目录（Khoj 也会索引 obsidian-vault）
node scripts\sync-cards-to-obsidian.mjs

# 网页对话粘贴导入（Gemini/ChatGPT 复制后存为 .md）
node scripts\import-web-chat.mjs my-chat.md

# 自媒体草稿：course | xhs | thread
node scripts\export-content-draft.mjs --format xhs --tag khoj

# 批准待审核并同步 Obsidian
node scripts\approve-pending-deposit.mjs --all --sync-obsidian
```

仅改 Cherry 配置、不启桥接：

```powershell
powershell -File scripts\configure-cherry-studio.ps1
```

脚本会：
- 从 `deploy/.env` 读取各平台 API Key
- 配置多个 **CoolAPIHub** Provider（Claude / OpenAI / DeepSeek / Kimi / Gemini / MiniMax）
- API 地址默认 `http://127.0.0.1:5892`（桥接）；备份原配置到 `deploy/tmp/cherry-leveldb-backup`

仅启动 Cherry Studio（不修改配置）：

```powershell
powershell -File scripts\open-cherry-studio.ps1
```

### 手动配置（可选）

在 Cherry Studio 里：**设置 → 模型服务 / 提供商 → 添加**

### OpenAI 兼容（DeepSeek / OpenAI / 部分 Gemini）

| 字段 | 填写 |
|------|------|
| 名称 | CoolAPIHub |
| API 地址 | `https://api.coolapihub.khtain.com/v1` |
| API Key | 第一步的 `sk-...` |
| 模型 | 手动添加你在后台分组里有的模型名 |

### Anthropic（Claude）

| 字段 | 填写 |
|------|------|
| API 地址 | `https://api.coolapihub.khtain.com` |
| 路径 | `/v1/messages` |
| API Key | 同上 |

### Antigravity Claude

| 字段 | 填写 |
|------|------|
| API 地址 | `https://api.coolapihub.khtain.com` |
| 路径 | `/antigravity/v1/messages` |
| API Key | 同上 |

### 系统提示词（可选）

设置 → 默认系统提示词，粘贴 `brain/profile/user-profile.yaml` 里的精简版，避免每次重复介绍技术栈。

参考 JSON：`brain/cherry-studio-providers.json`

---

## 日常使用分工

| 你想做什么 | 用哪个 | 会不会进知识库 |
|-----------|--------|----------------|
| 日常聊天、写代码 | **Cherry Studio** | **否**（除非加 `#沉淀` 等触发） |
| 值得记下的讨论 | **Cherry** + `#沉淀` | **是**（提炼为知识卡片） |
| 搜索、回顾历史 | **Khoj** http://localhost:5871 | 是 |
| 看额度、谁触限了 | **Vercel 管理后台** | — |

桥接日志：`deploy/brain/data/cherry-bridge.log`  
审计日志：`deploy/brain/data/cherry/audit.jsonl`（所有对话摘要，不进搜索）  
知识卡片：`deploy/brain/imports/cherry/cards/`  
待审核：`deploy/brain/data/cherry/pending/`

若桥接未启动，Cherry 仍可直连 VPS，但对话不会自动进 Khoj。执行 `scripts\start-cherry-bridge.ps1` 恢复。

---

## 开机自启 + 用量看板快捷方式（装一次）

```powershell
cd F:\codex\sub2api\deploy
powershell -ExecutionPolicy Bypass -File scripts\install-personal-startup.ps1
```

效果：
- 登录 Windows 后 **15s** 自动启动 Cherry→Khoj 桥接（`:5892`）
- 登录后 **45s** 自动启动 Khoj Docker（`:5871`）
- 桌面出现 **Sub2API Usage Dashboard** 快捷方式

打开用量看板（Token、请求、账号状态）：

- 双击桌面 **Sub2API Usage Dashboard**，或
- 运行 `scripts\open-sub2api.bat`（纯 bat，避免杀毒误删 PowerShell 脚本）

浏览器地址：https://coolapihub.khtain.com/admin/dashboard

若杀毒软件拦截 `F:\codex\sub2api\deploy`，请把该目录加入**信任/白名单**（本地自用脚本，非木马）。

---

## 常用命令

```powershell
cd F:\codex\sub2api\deploy

docker compose -f docker-compose.khoj.yml up -d      # 启动 Khoj
docker compose -f docker-compose.khoj.yml down       # 停止
powershell -File scripts\status.ps1                  # 检查 Khoj + VPS 连通
```

---

## 故障排查

| 现象 | 处理 |
|------|------|
| Khoj 无回复 | 检查 `SUB2API_API_KEY` 是否已 set-api-key |
| Cherry 401 | Key 错误或过期，在 VPS 重新建 Key |
| Cherry 模型不存在 | 模型名与 VPS 分组白名单不一致 |
| VPS 不通 | 浏览器打开 https://api.coolapihub.khtain.com/health |
