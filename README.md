# 王者战绩看板

[English](./README.en.md) | 简体中文

按**王者营地 ID**查询玩家战绩、段位曲线与站内排行榜的自托管看板。访客无需注册登录；管理员通过微信扫码登录王者营地后即可同步官方数据。

> 本项目为非官方第三方工具，与腾讯游戏 / 王者荣耀官方无关。请合理使用接口，遵守相关服务条款与当地法律法规。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [使用方法](#使用方法)
- [部署方法](#部署方法)
- [API 概览](#api-概览)
- [项目结构](#项目结构)
- [数据源说明](#数据源说明)
- [常见问题](#常见问题)
- [贡献与许可](#贡献与许可)

---

## 功能特性

### 访客侧

| 页面 | 说明 |
|------|------|
| 首页 `/` | 输入营地 ID（5–15 位数字）查询并同步战绩 |
| 玩家页 `/p/王者名称` | 段位 / 巅峰曲线、英雄统计（含分均经济 / 场均输出承伤参团等）、对局列表；支持点赞（每浏览器每天一次）；同步进度可轮询展示 |
| 对局详情 `/matches/:id` | 单场明细：经济 / 输出 / 承伤（含占比）、参团率、出装等 |
| 英雄战力 `/hero-power` | 按英雄 + 区服查看全国省标 / 市标 / 县标门槛 |
| 站内排行榜 `/leaderboard` | 多维度独立榜单（见下） |

**排行榜维度（相互独立）：**

- **评分**：模式评分（可切换排位评分 / 巅峰评分，范围 0–110）
- **排位**：段位星数、当前排位评分，可展开段位曲线
- **巅峰**：巅峰分，可展开巅峰分曲线
- **英雄战力**：按对局详情中的英雄战力排名（需同步补全详情），可展开曲线
- **胜率 / 均分 / KDA**：可展开胜率曲线；均分与 KDA 有最低场次门槛
- **贡献**：分均经济 / 场均输出 / 承伤 / 参团（仅统计四项均有数据的对局）
- **英雄 / 活跃**：英雄相关与活跃度榜

### 管理侧 `/admin`

- 密码登录（默认见 `ADMIN_PASSWORD`）
- **微信扫码登录王者营地**（使用 `camp` 数据源时必需）
- 手动新增 / 编辑 / 删除玩家
- 单玩家同步、全量同步
- 维护排位评分、巅峰评分与历史快照
- 按英雄维护战力与历史快照（指定录入时间，用于曲线图）

### 同步机制

- 手动刷新战绩（带冷却，默认 300 秒）
- 查询接口快速返回看板；需要同步时后台异步拉取，前端可轮询 `syncStatus`
- `camp` 模式两阶段：先拉战绩列表入库，再逐场补全详情（出装、经济 / 输出 / 承伤占比、参团、对局战力等），详情写库后页面可逐步刷新
- 进程内定时自动同步到期玩家（默认每小时，可关闭）
- 可选 HTTP Cron：`GET/POST /api/cron/auto-sync`（可用 `CRON_SECRET` 鉴权）
- `camp` 模式：首次全量最多约 8 页 / 100 条；之后增量拉取并与旧数据合并（最多约 100 条）

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | [Next.js](https://nextjs.org/) 16（App Router） |
| 语言 | TypeScript、React 19 |
| 数据库 | SQLite + [Prisma](https://www.prisma.io/) 6 |
| 样式 | Tailwind CSS 4 |
| 图表 | Recharts |
| 校验 / 认证 | Zod、jose（JWT）、bcryptjs |

---

## 环境要求

| 依赖 | 版本要求 |
|------|----------|
| Node.js | **18+**（推荐 20 LTS） |
| npm | 随 Node 附带即可（或 pnpm / yarn） |
| 磁盘 | 少量空间即可；SQLite 数据库与营地登录态落盘 |
| 网络 | 使用 `camp` 时需能访问 `kohcamp.qq.com`；英雄战力默认访问 `v1.apizero.cn` |

**可选：**

- 反向代理（Nginx / 宝塔等）用于生产域名或子路径部署
- 外部 Cron（若关闭进程内自动同步，改用 `/api/cron/auto-sync`）

---

## 快速开始

```bash
# 1. 克隆仓库
git clone https://gitee.com/lizupingsama/honor-of-kings-rankings.git
cd honor-of-kings-rankings

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env

# 4. 初始化数据库并写入种子数据
npm run db:setup

# 5. 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

**首次使用 `camp` 数据源前**，请到 [http://localhost:3000/admin](http://localhost:3000/admin) 用默认密码登录，并通过微信扫码登录王者营地。登录态写入 `data/camp-auth.json`（已 gitignore）。

---

## 配置说明

复制 `.env.example` 为 `.env` 后按需修改。主要变量如下：

### 基础

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `file:./players.db` | Prisma SQLite 路径 |
| `ADMIN_PASSWORD` | `admin` | 管理后台登录密码 |
| `ADMIN_SECRET` | （复用密码） | JWT 签名密钥，生产环境建议单独设置 |
| `NEXT_BASE_PATH` | （空） | 子路径部署，如 `/wzry`；**修改后需重新 build** |

### 数据源

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WZRY_API_PROVIDER` | `camp` | `camp` \| `mock` \| `apizero` \| `apibyte` \| `yujn` |
| `WZRY_API_BASE_URL` | 随 provider 变化 | 第三方备用接口基址 |
| `WZRY_API_KEY` | （空） | 第三方 / 战力接口密钥（生产建议填写） |
| `WZRY_POWER_API_BASE_URL` | `https://v1.apizero.cn/api/wzry` | 全国英雄战力查询 |
| `CAMP_BATTLE_PAGE_DELAY_MS` | `400` | 营地战绩翻页间隔（毫秒，防频控） |

### 同步与排行榜

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SYNC_COOLDOWN_SECONDS` | `300` | 手动刷新冷却（秒） |
| `AUTO_SYNC_ENABLED` | `true` | 进程内定时同步；设 `false` 关闭 |
| `AUTO_SYNC_INTERVAL_SECONDS` | `3600` | 自动同步间隔（秒） |
| `AUTO_SYNC_PLAYER_DELAY_SECONDS` | `5` | 每位玩家同步间隔（秒） |
| `LEADERBOARD_MIN_GAMES` | `10` | 排行榜最低场次门槛 |
| `CRON_SECRET` | （空） | 若设置，调用 `/api/cron/auto-sync` 需 `Authorization: Bearer <secret>` |

---

## 使用方法

### 1. 查询玩家战绩

1. 打开王者营地 App → 个人主页，查看**营地 ID**（纯数字）。
2. 在首页输入营地 ID，点击「查询战绩」。
3. 首次查询会从上游同步并入库，随后跳转到 `/p/游戏昵称`。
4. 已入库玩家也可从排行榜按昵称进入。

若提示登录态失效，请管理员到 `/admin` 重新微信扫码登录营地。

### 2. 浏览玩家页

- 查看段位曲线、巅峰分曲线、英雄统计（含经济 / 输出 / 承伤 / 参团等聚合）
- 筛选 / 翻页对局列表；列表与详情展示出装、承伤、参团等（详情同步完成后可见）
- 同步进行中时页面可展示进度；完成后刷新即可看到补全字段
- 点赞：同一浏览器对同一玩家每天最多一次

### 3. 英雄战力查询

打开 `/hero-power`，选择英雄与区服，查看全国省 / 市 / 县标门槛。该功能走独立战力接口，默认可匿名调用（生产建议配置 `WZRY_API_KEY`）。

站内「英雄战力榜」与曲线优先使用对局详情里的 `fightPower`（按对局时间），与全国门槛查询是不同数据源。

### 4. 站内排行榜

打开 `/leaderboard`，切换评分 / 排位 / 巅峰 / 英雄战力 / 胜率 / 均分 / KDA / 贡献等维度；部分榜单可展开历史曲线。贡献榜可按输出、承伤、参团、分均经济排序。

### 5. 管理后台

```env
ADMIN_PASSWORD=admin
```

1. 访问 `/admin`，使用密码登录。
2. **营地扫码登录**（`WZRY_API_PROVIDER=camp` 时必需）。
3. 按需增删改玩家、维护评分 / 战力快照、触发同步。

本地演示可改用 mock，无需扫码：

```env
WZRY_API_PROVIDER=mock
```

---

## 部署方法

### 生产构建与启动

```bash
# 配置生产环境变量（含 ADMIN_PASSWORD、WZRY_API_PROVIDER 等）
cp .env.example .env
# 编辑 .env

npm install
npm run db:setup   # 首次部署
npm run build
npm run start      # 默认 http://0.0.0.0:3000
```

可用环境变量指定端口：

```bash
PORT=3000 npm run start
```

### 子路径部署

若挂载到 `https://example.com/wzry`：

```env
NEXT_BASE_PATH=/wzry
```

然后重新构建：

```bash
npm run build && npm run start
```

反向代理需把 `/wzry`（或你的 basePath）转发到 Node 进程，并注意**不要对动态 HTML / API 做长时间 CDN 缓存**（项目已为关键页面与 `/api` 设置 `Cache-Control: no-store`）。

### Nginx 示例（根路径）

```nginx
server {
    listen 80;
    server_name your.domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 数据持久化

部署时请持久化以下路径（容器 / 多机时尤其重要）：

| 路径 | 内容 |
|------|------|
| SQLite 文件（如 `prisma/players.db`，取决于 `DATABASE_URL`） | 玩家与对局数据 |
| `data/camp-auth.json` | 营地登录态（含 token，勿提交到 Git） |

### 外部 Cron（可选）

关闭进程内同步时：

```env
AUTO_SYNC_ENABLED=false
CRON_SECRET=your-random-secret
```

由系统 crontab 或外部调度器定期请求：

```bash
curl -X POST \
  -H "Authorization: Bearer your-random-secret" \
  "https://your.domain.com/api/cron/auto-sync?limit=20"
```

### 生产检查清单

- [ ] 修改默认 `ADMIN_PASSWORD`，建议单独设置 `ADMIN_SECRET`
- [ ] `WZRY_API_PROVIDER=camp` 时完成营地扫码，并确认 `data/` 可写
- [ ] 生产环境为战力接口配置 `WZRY_API_KEY`（如使用默认上游）
- [ ] 子路径部署时正确设置 `NEXT_BASE_PATH` 并重新 build
- [ ] 代理层勿缓存 `/api` 与动态页面

---

## API 概览

玩家查询接口文档见：[docs/player-query-api.md](./docs/player-query-api.md)

```http
GET /api/players/:nickname?range=30&mode=all&result=all&page=1
```

常用端点（节选）：

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/lookup` | 按营地 ID 查询 / 同步并返回玩家 |
| `GET` | `/api/players/:nickname` | 玩家详情、对局、曲线数据 |
| `GET/POST` | `/api/players/:nickname/like` | 点赞状态 / 点赞 |
| `GET` | `/api/leaderboard` | 排行榜 |
| `GET` | `/api/hero-power/heroes` | 英雄列表 |
| `GET` | `/api/hero-power/query` | 英雄战力门槛查询 |
| `GET/POST` | `/api/cron/auto-sync` | 触发到期玩家自动同步 |
| — | `/api/admin/*` | 管理端（需登录） |

成功响应外层一般为：

```json
{ "ok": true, "data": { } }
```

---

## 项目结构

```text
.
├── data/                 # 营地登录态等（gitignore）
├── docs/                 # API 等文档
├── prisma/
│   ├── schema.prisma     # 数据模型
│   └── seed.ts           # 种子数据
├── public/               # 静态资源
├── scripts/              # 辅助脚本（抓包 / 回填等）
├── src/
│   ├── app/              # Next.js App Router 页面与 API
│   ├── components/       # UI 组件
│   ├── lib/              # 业务逻辑、营地 API、排行榜等
│   └── instrumentation.ts # 进程内自动同步注册
├── .env.example
├── next.config.ts
└── package.json
```

### npm 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` | `prisma generate` + 生产构建 |
| `npm run start` | 启动生产服务 |
| `npm run lint` | ESLint |
| `npm run db:push` | 同步 Prisma schema 到数据库 |
| `npm run db:seed` | 执行种子 |
| `npm run db:setup` | `db:push` + `seed` |

---

## 数据源说明

| Provider | 说明 |
|----------|------|
| `camp`（推荐） | 直连王者营地官方接口（`kohcamp.qq.com`），需管理后台扫码 |
| `mock` | 本地演示，可用昵称等模拟数据 |
| `apizero` / `apibyte` / `yujn` | 第三方备用战绩接口，通常需 `WZRY_API_KEY` |

全国英雄战力（`/hero-power`）独立走极数本源类战力接口，与战绩 provider 可分开配置。

营地登录态路径：`data/camp-auth.json`。过期后重新扫码即可。

---

## 常见问题

**Q: 查询提示登录态失效？**  
A: 到 `/admin` 重新微信扫码登录营地。确认 `data/` 目录可写且未被误删。

**Q: 子路径下页面能开但 API 404？**  
A: 确认构建时设置了 `NEXT_BASE_PATH`，且反向代理把带 basePath 的请求转到 Node。修改 basePath 后必须重新 `npm run build`。

**Q: 只想本地演示，不想扫码？**  
A: 设置 `WZRY_API_PROVIDER=mock`。

**Q: 自动同步太频繁 / 想关掉？**  
A: 调大 `AUTO_SYNC_INTERVAL_SECONDS`，或设 `AUTO_SYNC_ENABLED=false`，改用外部 Cron。

**Q: 数据库文件在哪？**  
A: 由 `DATABASE_URL` 决定。示例 `file:./players.db` 相对 Prisma 工作目录，一般为 `prisma/players.db`。

---

## 贡献与许可

欢迎提交 Issue 与 Pull Request。

本项目采用 [MIT License](./LICENSE)。

**免责声明：** 本工具仅供学习与交流。使用产生的数据同步、账号风险与合规问题由使用者自行承担。请勿用于商业牟利或任何违反游戏用户协议的行为。
