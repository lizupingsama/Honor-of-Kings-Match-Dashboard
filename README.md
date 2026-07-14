# 王者战绩看板

按**王者名称**查询玩家战绩，无需注册登录。

## 快速开始

```bash
npm install
npm run db:setup
npm run dev
```

打开 http://localhost:3000 ，输入王者名称即可查询。

演示昵称：`峡谷旅人` / `边路霸主` / `中路法神`

## 功能

- 首页按王者名称查询并同步战绩
- 玩家页 `/p/王者名称`：段位曲线、英雄统计、对局列表与详情
- 站内排行榜：评分 / 排位 / 巅峰 / 英雄战力 / 胜率 / 英雄 / 活跃（相互独立）
  - 评分：模式评分（可切换排位评分 / 巅峰评分，范围 0–110），纵坐标为评分数值
  - 排位：段位星数、当前排位评分，可展开段位曲线（纵坐标为段位）
  - 巅峰：巅峰分，可展开巅峰分曲线
  - 胜率：可展开胜率曲线
  - 英雄战力需选择英雄，按该英雄战力排名并可展开曲线
- 管理后台 `/admin`：手动增删改玩家、评分快照与英雄战力（默认密码见 `ADMIN_PASSWORD`）
- 支持刷新战绩（带冷却）

## 管理后台

```env
ADMIN_PASSWORD=admin
```

打开 http://localhost:3000/admin ，用上述密码登录后可：

- 新增 / 编辑 / 删除玩家
- 维护排位评分、巅峰评分
- 按英雄维护战力与历史快照（指定录入时间，用于曲线图）

## 数据源

默认对接 [极数本源 ApiZero](https://apizero.cn/marketplace/wzry-battle) 王者荣耀战绩查询：

```env
WZRY_API_PROVIDER=apizero
WZRY_API_BASE_URL=https://v1.apizero.cn/api/wzry-battle
WZRY_API_KEY=你的密钥   # https://apizero.cn/account/keys
```

也可用 `mock` 本地演示，或 `apibyte` / `yujn` 其它第三方。

## 技术栈

Next.js · Prisma · SQLite · Recharts
