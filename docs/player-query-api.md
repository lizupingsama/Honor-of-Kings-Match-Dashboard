# 玩家数据查询接口

`GET /api/players/:nickname`

响应外层统一为：

```json
{ "ok": true, "data": { ... } }
```

## 查询参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `range` | `30` | 对局时间范围：`7` / `30` / 其它（不限） |
| `mode` | `all` | 模式：`all` / `ranked` / `peak` 等 |
| `result` | `all` | 结果：`all` / `win` / `lose` |
| `side` | `all` | 阵营：`all` / `blue`（蓝方） / `red`（红方） |
| `hero` | 空 | 按英雄名筛选对局 |
| `page` | `1` | 对局分页，每页 20 条 |
| `refresh` | — | `1` 时强制重新同步上游后再返回 |

---

## `data` 字段一览

### `player` — 玩家概况

| 字段 | 类型 | 说明 |
|------|------|------|
| `gameNickname` | string | 游戏昵称 |
| `campId` | string | 营地 ID |
| `area` | string | 区服，如 `wechat` / `qq` |
| `gameAvatarUrl` | string \| null | 营地头像 URL |
| `currentRank` | string \| null | 当前段位名 |
| `currentStars` | number | 当前星数 |
| `rankScore` | number | 排位评分（0–110） |
| `peakRating` | number | 巅峰评分（0–110） |
| `peakScore` | number | 巅峰分（巅峰赛积分） |
| `seasonGames` | number | 本赛季排位场次（来自营地赛季页） |
| `seasonWins` | number | 本赛季排位胜场 |
| `winRate` | number | 赛季胜率（%），由场次/胜场计算 |
| `mvpCount` | number | MVP 数 |
| `goldCount` | number | 金牌数 |
| `lastSyncAt` | string \| null | 最近同步时间 |
| `lastSyncError` | string \| null | 最近同步错误 |
| `queryCount` | number | 查询次数 |
| `likeCount` | number | 点赞总数 |

### `matches` — 对局列表（当前筛选 + 分页）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 本地对局 ID |
| `playerId` | string | 玩家 ID |
| `externalId` | string | 上游对局唯一键 |
| `playedAt` | string | 对局时间 |
| `mode` | string | 模式代码，如 `ranked` / `peak` |
| `modeName` | string \| null | 模式展示名 |
| `heroId` | string \| null | 英雄 ID |
| `heroName` | string | 英雄名 |
| `heroIcon` | string \| null | 英雄头像 URL |
| `result` | string | `win` / `lose` |
| `kills` | number | 击杀 |
| `deaths` | number | 死亡 |
| `assists` | number | 助攻 |
| `score` | number \| null | 本场评分 |
| `evaluate` | string \| null | 评价文案（如 MVP / 金牌） |
| `durationSec` | number \| null | 时长（秒） |
| `rankName` | string \| null | 对局时段位名 |
| `stars` | number \| null | 对局时星数 |
| `rankScore` | number \| null | 对局时排位换算分 |
| `peakScore` | number \| null | 对局后巅峰分 |
| `peakDelta` | number \| null | 本场巅峰分变化 |
| `rankDelta` | number \| null | 段位变动 |
| `mvp` | boolean | 是否 MVP |
| `gold` | boolean | 是否金牌 |
| `medal` | string \| null | 奖牌文案，如 `银牌打野` / `顶级中路` |
| `medalIcon` | string \| null | 官方奖牌图标 URL |
| `mvpType` | string \| null | `mvp` / `svp` |
| `mvpIcon` | string \| null | 官方 MVP/SVP 图标 URL |
| `side` | string \| null | 阵营：`blue` / `red` |
| `economy` | number \| null | 经济 |
| `economyPct` | number \| null | 经济占本队比例（0–100） |
| `damage` | number \| null | 输出 |
| `damagePct` | number \| null | 输出占本队比例（0–100） |
| `takenDamage` | number \| null | 承伤 |
| `takenDamagePct` | number \| null | 承伤占本队比例（0–100） |
| `joinPct` | number \| null | 参团率（0–100） |
| `combatPower` | number \| null | 对局时该英雄战力 |
| `equips` | array \| null | 出装列表 `[{ equipId, equipIcon, equipName }]` |
| `createdAt` | string | 入库时间 |

### 分页、筛选与聚合元数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | number | 当前筛选条件下对局总数 |
| `wins` | number | 当前筛选条件下胜场数 |
| `matchWinRate` | number | 当前筛选条件下胜率（%） |
| `matchAvgKda` | number | 当前筛选条件下平均 KDA |
| `matchAvgScore` | number | 当前筛选条件下平均评分 |
| `page` | number | 当前页 |
| `pageSize` | number | 每页条数（固定 20） |
| `cooldown` | number | 强制刷新冷却秒数 |

### `heroStats` — 英雄汇总

由本地已同步对局聚合（非官方赛季英雄榜）。按场次降序。

| 字段 | 类型 | 说明 |
|------|------|------|
| `heroName` | string | 英雄名 |
| `heroIcon` | string \| null | 英雄头像 URL |
| `combatPower` | number \| null | 英雄战力（>0 时返回，否则 null） |
| `games` | number | 场次 |
| `wins` | number | 胜场 |
| `winRate` | number | 胜率（%，计算字段） |
| `avgKda` | number | 平均 KDA（计算字段） |
| `avgKills` | number | 场均击杀 |
| `avgDeaths` | number | 场均死亡 |
| `avgAssists` | number | 场均助攻 |
| `avgScore` | number | 平均评分（计算字段） |
| `avgEconomyPerMin` | number \| null | 分均经济 |
| `avgDamage` | number \| null | 场均输出 |
| `avgTakenDamage` | number \| null | 场均承伤 |
| `avgJoinPct` | number \| null | 平均参团率（%） |

### `rankSeries` — 排位分曲线点

当前筛选时间范围内、`mode=ranked` 且有 `rankScore` 的对局。

| 字段 | 类型 | 说明 |
|------|------|------|
| `t` | string | 时间（ISO） |
| `score` | number \| null | 排位分 |
| `label` | string \| null | 段位名 |
| `stars` | number \| null | 星数 |
| `result` | string | 胜负 |
| `hero` | string | 英雄名 |

### `peakSeries` — 巅峰分曲线点

当前筛选时间范围内、`mode=peak` 且有 `peakScore` 的对局。

| 字段 | 类型 | 说明 |
|------|------|------|
| `t` | string | 时间（ISO） |
| `value` | number | 巅峰分 |
| `result` | string | 胜负 |
| `hero` | string | 英雄名 |

### `syncStatus` — 同步状态

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | `idle` / `running` / `success` / `failed` |
| `message` | string \| undefined | 同步进度或错误信息 |
| `pulled` | number \| undefined | 已拉取对局数 |

---

## 排行榜接口补充

`GET /api/leaderboard?type=medal&sortBy=total`

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `type` | — | 设为 `medal` 获取奖牌榜 |
| `sortBy` | `total` | `total` / `top` / `gold` / `silver` / `bronze` |
| `area` | `all` | 区服筛选 |
| `limit` / `offset` | `100` / `0` | 分页 |

返回 `rows` 中每项含 `topMedals`、`goldMedals`、`silverMedals`、`bronzeMedals`、`totalMedals`。

---

## 装备排行榜接口

`GET /api/leaderboard?type=equipment&category=all`

装备榜按本地已同步对局中的最终合成装备统计。每场同一装备只计一次，铁剑、大棒、陨星等中间件不计入；`category=all` 还包含鞋子、打野装和辅助装。

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `type` | — | 设为 `equipment` 获取装备榜 |
| `category` | `all` | `all` / `physical`（物攻装）/ `magic`（法装）/ `defense`（防装） |
| `area` | `all` | 区服筛选 |
| `limit` / `offset` | `100` / `0` | 分页，最多返回 100 条 |

响应包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `totalMatches` | number | 有出装数据的本地对局数，也是出场率的分母 |
| `rows` | array | 装备排行数据 |

`rows` 中每项包含 `rank`、`equipId`、`equipName`、`equipIcon`、`category`、`categoryLabel`、`appearances`（出场次数）、`appearanceRate`（出场率 %）、`wins`（胜场）和 `winRate`（胜率 %）。结果默认按出场次数降序排列。

---

## 说明

- `matches` / `rankSeries` / `peakSeries` 受 `range`、`mode`、`result`、`side`、`hero`、`page` 影响；`heroStats` 不受这些筛选影响，始终基于本地全部已同步对局。
- 玩家概况里的 `seasonGames` / `seasonWins` / `winRate` 为赛季维度；`mvpCount` / `goldCount` 来自同步写入的概况字段。
- 本地最多保留 1000 场对局；上游每次同步最多拉取约 100 条，详情字段需后台补全后才可见。
- 数据库里还有 `tierScore` 等字段，**本接口当前未返回**。
