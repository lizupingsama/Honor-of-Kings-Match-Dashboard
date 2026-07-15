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
| `currentRank` | string \| null | 当前段位名 |
| `currentStars` | number | 当前星数 |
| `rankScore` | number | 排位评分（0–110） |
| `peakScore` | number | 巅峰分（巅峰赛积分） |
| `seasonGames` | number | 本赛季排位场次（来自营地赛季页） |
| `seasonWins` | number | 本赛季排位胜场 |
| `winRate` | number | 赛季胜率（%），由场次/胜场计算 |
| `mvpCount` | number | MVP 数 |
| `goldCount` | number | 金牌数 |
| `lastSyncAt` | string \| null | 最近同步时间 |
| `lastSyncError` | string \| null | 最近同步错误 |
| `queryCount` | number | 查询次数 |

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
| `rankDelta` | number \| null | 段位变动 |
| `mvp` | boolean | 是否 MVP |
| `gold` | boolean | 是否金牌 |
| `economy` | number \| null | 经济 |
| `damage` | number \| null | 伤害 |
| `rawJson` | string \| null | 上游原始 JSON |
| `createdAt` | string | 入库时间 |

### 分页与筛选元数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | number | 当前筛选条件下对局总数 |
| `page` | number | 当前页 |
| `pageSize` | number | 每页条数（固定 20） |
| `cooldown` | number | 强制刷新冷却秒数 |

### `heroStats` — 英雄汇总

由本地已同步对局聚合（非官方赛季英雄榜）。按场次降序。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 记录 ID |
| `playerId` | string | 玩家 ID |
| `heroId` | string \| null | 英雄 ID |
| `heroName` | string | 英雄名 |
| `heroIcon` | string \| null | 英雄头像 URL |
| `combatPower` | number | 英雄战力 |
| `games` | number | 场次 |
| `wins` | number | 胜场 |
| `kills` | number | 总击杀 |
| `deaths` | number | 总死亡 |
| `assists` | number | 总助攻 |
| `totalScore` | number | 评分合计 |
| `updatedAt` | string | 更新时间 |
| `winRate` | number | 胜率（%，计算字段） |
| `avgKda` | number | 平均 KDA（计算字段） |
| `avgScore` | number | 平均评分（计算字段） |

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

---

## 说明

- `matches` / `rankSeries` / `peakSeries` 受 `range`、`mode`、`result`、`hero`、`page` 影响；`heroStats` 不受这些筛选影响，始终基于本地全部已同步对局。
- 玩家概况里的 `seasonGames` / `seasonWins` / `winRate` 为赛季维度；`mvpCount` / `goldCount` 来自同步写入的概况字段。
- 数据库里还有 `gameAvatarUrl`、`peakRating`、`tierScore` 等，**本接口当前未返回**。
