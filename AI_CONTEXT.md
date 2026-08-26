# AI_CONTEXT.md

> 本文件是本项目所有 AI Coding Agent 共用的持久化项目上下文。
>
> This file is the shared persistent project context for all AI coding agents.
>
> 本文件应适用于不同的 AI Agent、Coding 软件、账号、Session 和设备。
>
> This file is intended to work across different AI agents, coding tools, accounts, sessions, and devices.
>
> 本文件只记录对未来 Agent 有长期价值的信息。
>
> Record only information that is likely to be useful to future agents.
>
> 不记录完整聊天记录，也不记录临时推理过程。
>
> Do not store conversation transcripts or temporary reasoning.
>
> 请保持本文件简洁、准确，并始终反映项目当前的有效状态。
>
> Keep this file concise, accurate, and representative of the current project state.
>
> 本文件初始化于首次提审前；事实依据为仓库当前代码与配置（已逐项抽查核实），标注"推断"处为文档口径推断。

---

# 1. 项目概览 / Project Overview

## 项目用途 / Purpose

**声声入册 (Echo Ledger)**，原名"落牌有声 (Echo of Cards)"（因微信小程序名称不得含棋牌类字眼而改名，见 commit `af52fbc`）。

这是一款微信原生小程序**纯本地牌桌积分记录器**：开局选择玩法与玩家 → 逐轮录入积分变化 → 实时查看排名/战况 → 终局结算 → 归档历史战绩。全部数据仅存于本机（`wx` 本地存储），无后端、无网络请求、无账号体系，卸载即清。

面向场景：线下牌局（斗地主、跑得快、掼蛋、德州扑克记分、UNO 罚分等）的即兴计分与战绩留存。内置 8 种玩法（详见第 2 节模式注册表）。

- **appid**：`wxfa79cbd689acb144`（正式注册）
- **projectname**：`echo-ledger`

## 当前阶段 / Current Stage

**开发完成，待首次提审**（推断：依据 `发布资料.md` 版本号"1.0.0（首次提审）"口径及其发布前检查清单 7 项均为待办；代码侧佐证 `project.config.json` 中 `uploadWithSourceMap` 仍为 `true`，而发布清单要求正式上传前置为 `false`）。

## 技术栈 / Technology Stack

- 主要语言 / Primary language: JavaScript（ES5 兼容写法：全 `var`/`function`，无箭头函数）、WXML、WXSS
- 后端框架 / Backend framework: 无（纯前端，无服务器）
- 前端框架 / Frontend framework: 微信原生小程序（`compileType: miniprogram`），不使用任何第三方 UI 框架
- Runtime: 微信基础库（开发者工具本地 `libVersion: 3.4.10`；`发布资料.md` 要求提审时公众平台最低基础库设为 2.30.2+）
- 数据库 / Database: 无；仅 `wx.getStorageSync/setStorageSync` 本地持久化（两个存储键，见第 3 节）
- 基础设施 / Infrastructure: 无；不依赖任何云服务
- 其他重要技术 / Other important technologies: **零第三方依赖**（无 npm、无 node_modules）；`app.json` 关键配置：`navigationStyle: custom`（沉浸式导航）、`darkmode: true` + `themeLocation: theme.json`、`lazyCodeLoading: requiredComponents`


---

# 2. 项目架构 / Architecture

## 整体架构 / High-Level Architecture

三层结构 + 配置驱动模式注册表，仓库共 33 个文件（根目录 13 + utils 4 + components 4 + pages 12）：

```
页面层（3 页，零计算）          引擎层（纯函数）              存储层（唯一出口）
pages/index   开局配置    →    utils/scoreEngine.js    ←    utils/storageKit.js
pages/round   逐轮录入         · MODES 注册表（8 模式）      · 数据键  echo_cards_data_v1
pages/history 归档战绩         · 全部操作不可变返回新对象      · 主题键  echo_cards_theme_v1
      │                        · 零 wx 依赖                  · migrate() 预留钩子
      └── 只收集输入 → 调引擎 → setData 渲染；排序/格式化在页面 JS 预计算，WXML 只绑变量
```

辅助设施：

- **主题三层叠加体系**（`app.wxss`）：① `page{}` 浅色基线 + `@media (prefers-color-scheme: dark)` 全覆盖（系统跟随）；② 手动三态（system→light→dark 循环切换，偏好经 `storageKit.getThemePref/saveThemePref` 持久化，`app.js` 的 `themeClassFor(pref)` 映射为页面根 `.theme-light/.theme-dark` 类）；③ 原生窗口色由 `theme.json` 双套 @变量提供。三份变量表（基线/媒体查询/手动类）内容必须保持一致。
- **`utils/navKit.js` + `components/custom-nav`**：沉浸式导航度量与渲染（状态栏占位 + 胶囊右侧避让），custom-nav 内含白夜模式手动切换键。
- **`utils/feedbackKit.js`**：触感反馈两档——`tap()` light / 150ms 闸门、`impact()` medium / 300ms 闸门，`wx.vibrateShort` 失败静默（兼容 PC 端）。

## 主要模块 / Important Modules

| 模块 / Module | 作用 / Purpose | 当前状态 / Status |
| ------------- | -------------- | ----------------- |
| `utils/scoreEngine.js` | 核心引擎：MODES 注册表（8 模式）、不可变对局操作（createGame/appendRound/undoLastRound/voidRound/archiveGame）、实时重算（computeTotals/computeRanking/computeBigWinner/isGameOver）、掼蛋 v2 重放（computeGuandanState 等） | 稳定，近期经掼蛋 v2 大改造 |
| `utils/storageKit.js` | 全项目唯一接触 `wx` 本地存储的模块；双键、schemaVersion=1、normalize 兜底、预留空 `migrate()` 钩子 | 稳定 |
| `utils/navKit.js` | 导航度量（优先 `wx.getWindowInfo`，回落 `getSystemInfoSync`，全 try-catch） | 稳定 |
| `utils/feedbackKit.js` | 触感反馈节流封装 | 稳定 |
| `components/custom-nav` | 沉浸式导航组件 + 主题三态切换键 | 稳定 |
| `pages/index` | 开局配置：模式卡片、人数、昵称/头像、目标分、平衡校验开关、进行中对局列表 | 完成 |
| `pages/round` | 计分局：自绘键盘、四种输入形态、提交结算、撤销、左滑废弃、仪表盘、终局面板 | 完成 |
| `pages/history` | 归档列表、回合流水展开、整局删除、再来一局 | 完成 |

### MODES 注册表（8 模式，展示顺序由 `MODE_ORDER` 驱动）

| # | id | 名称 | 人数 | 零和 | 关键特性 |
| --- | --- | --- | --- | --- | --- |
| 1 | `free` | 通用累分 | 2~8 | 否 | 无约束，永不终局 |
| 2 | `zeroSum` | 零和局 | 2~8 | 是 | 前 N-1 录入、末位 `zeroSumComplete` 补全，引擎零和断言 |
| 3 | `landlord` | 斗地主 | 固定 3 | 是 | 底分×（炸弹/火箭/春天各 ×2 连乘），内置零和断言 |
| 4 | `paodekuai` | 跑得快 | 2~4 | 是 | 剩余牌数×底分计负，扣分池归先出完者，零和断言 |
| 5 | `target` | 目标分 | 2~8 | 否 | `hasTargetScore`，默认 500，任一人达标终局 |
| 6 | `guandan` | 掼蛋·升级打A | 固定 4 | 否 | v1/v2 双版本，详见下文 |
| 7 | `uno` | UNO·派对罚分 | 2~8 | 否 | `ascending: true`（低分胜）、非负罚分、达上限（默认 500）终局 |
| 8 | `texas` | 德州扑克记分 | 2~8 | 是 | 直接复用 zeroSum 的 fields/validate/settle 函数引用 |

**模式元数据机制**：`ascending`（方向感知排名/最优者/终局）、`hasTargetScore`/`defaultTarget`（开局面板目标分输入）、`allowZeroSumAssist`（false 时禁用零和补全输入形态 + 豁免平衡校验 + createGame 强制 `strictZeroSum=false`）、可选 `roundMeta(inputs, game)` 钩子（回合元信息随回合落库）。

**掼蛋 v1/v2 双版本**（近期最重要改造）：`isGuandanV2(game)` = `modeId==='guandan' && gdVer===2`；新开局恒为 v2，历史攒分局（带 targetScore、无 gdVer）走 v1 委托 `MODES.target`。v2 按真实掼蛋规则：deltas 编码级数变化（累计=progress，打几=2+progress，12=打A，13=过A终局）；座次 `idx%2` 定队伍（1&3=1队）；双上升 3 级/头游+三游升 2 级/头游+末游升 1 级；打A未过记失败，三次不过归 2；过A后全部操作冻结。`computeGuandanState(game)` 从 valid 回合重放得出两队 progress/fails/获胜队（废弃轮跳过）。round 页 `inputKind='guandan'` 为纯选择式录入（头游 + 队友名次），配队伍战况面板 `gdBoard` 与回合备注 `round.meta.note`。

## 重要依赖 / Important Dependencies

- **无第三方依赖**：无 npm、无 node_modules、无网络请求；唯一运行时依赖为微信基础库（见第 1 节 Runtime）


---

# 3. 项目开发规则 / Development Rules

未来 Agent 必须遵守的项目级规则（不变量）：

1. **引擎纯函数不可变**：`scoreEngine.js` 所有操作返回新对象（深克隆），绝不修改传入对象；引擎零 `wx` 依赖。
2. **总分永不落库**：只存每轮 `deltas` 增量；总分/排名/大赢家/掼蛋队伍状态全部实时重算（`computeTotals` 等）。
3. **废弃轮语义**：`voidRound` 仅标记 `status:'void'`，记录保留但不计分，一切重算跳过 void 轮。
4. **存储键不可改名**：`echo_cards_data_v1` / `echo_cards_theme_v1` 带版本前缀，用户本机数据挂在这两个键上；应用改名等重大变更也不得动存储键。
5. **字段级兼容策略**：新增对局字段（如 `strictZeroSum`、`gdVer`）不提升 `schemaVersion`，旧对局缺字段按兼容默认处理（`strictZeroSum !== false` 视为开；`gdVer` 缺失视为 v1）。schema 大版本演进只走 `storageKit.migrate()` 钩子。
6. **deltas 语义**：掼蛋 v2 的 deltas 编码级数变化而非分数；过A终局后一切操作冻结。先改引擎再改页面（引擎是单一事实源）。
7. **文案禁词规范**：全仓文案仅用"积分/分"中性口径，严禁"钱/币/赌/押注/筹码/下注/底池/现金/金额"等涉赌敏感词（`发布资料.md` 7.1 有完整清单）；任何文案改动后须 grep 全仓自查。
8. **页面零计算**：页面只收集输入、调引擎、setData；排序/格式化在页面 JS 预计算，WXML 只绑变量、不做排序过滤。
9. **`MODE_ORDER` 只追加**：既有模式展示顺序不可变，新模式只能在末尾追加。
10. **主题三份变量同步维护**：`app.wxss` 中浅色基线、深色媒体查询、手动 `.theme-light/.theme-dark` 类三份变量表必须同步修改。
11. **不引入第三方依赖与网络请求**：保持零依赖、纯本地特性。


---

# 4. 当前项目状态 / Current Status

## 整体状态 / Overall Status

全功能开发完成，处于**首次提审前的收尾阶段**（推断依据见第 1 节"当前阶段"）。代码侧无进行中的开发任务；待办集中在文档同步与发布清单执行。Git 最新提交：`1d6afcf feat(game): 新增掼蛋升级打A模式并优化游戏体验`。

## 已完成 / Completed

- 8 种玩法全部实现（含掼蛋升级打A v2 完整改造：引擎重放、纯选择式录入、队伍战况面板、回合备注、三页展示）
- 三页面全功能：开局配置（平衡校验开关、目标分、固定人数锁定）、计分局（自绘键盘、零和末位自动补全、无限撤销、左滑废弃、终局面板、屏幕常亮、两档震动）、历史页（流水展开、删除、再来一局复刻配置）
- 日夜主题三层叠加体系 + 手动三态切换（持久化记忆、跨页同步）
- 沉浸式自定义导航（custom-nav + navKit）
- 改名"落牌有声"→"声声入册"（代码/配置/文档触点已改；存储键按决策保留）
- 图标、`发布资料.md`、`README.md`、`项目计划书.md` 初版

## 进行中 / In Progress

- 无代码侧进行中任务；文档同步（见第 5 节任务 1）尚未开始

## 阻塞问题 / Blocked

- 无 / None

## 已知问题 / Known Issues

- `README.md` 与 `项目计划书.md` 的掼蛋描述过时：仍写"掼蛋·攒分升级、先达目标分（默认 1000）终局、4 人逐位录入"，代码已改为"掼蛋·升级打A" v2 规则（`发布资料.md` 已同步）
- `README.md` 主题描述过时：写"跟随系统自动切换，无需手动设置"，实际已有三态手动切换键并持久化记忆
- `README.md` 称"共 29 个文件"，实际 33 个（新增 `AGENTS.md`、`AI_CONTEXT.md`、`发布资料.md`、根目录截图，未列入 README 目录树）
- `README.md` 中"38+39 项断言回归全绿"为历史口径：仓内当前**无任何测试文件**（项目无测试框架，验证依赖开发者工具手工/脚本），掼蛋 v2 改造后该记录未更新
- `project.config.json` 的 `uploadWithSourceMap` 仍为 `true`，发布清单要求正式上传前置为 `false`
- `AGENTS.md` 与 `AI_CONTEXT.md` 在 Git 中为未跟踪新文件，尚未提交


---

# 5. 当前任务 / Active Tasks

## 任务 1 / Task 1

### 目标 / Goal

提审前文档同步：将 `README.md` 与 `项目计划书.md` 的掼蛋模式与主题描述更新至与代码一致（掼蛋·升级打A v2、主题三态手动切换），并修正文件数 29→33。

### 状态 / Status

NOT_STARTED

### 当前进度 / Current Progress

差异点已由调研完整列出（见第 4 节"已知问题"前四项）；尚未开始修改。

### 下一步 / Next Step

按 `发布资料.md` 已同步的掼蛋 v2 口径改写 README 特性清单/模式表/使用说明与项目计划书 3.4 节，改后全仓禁词 grep 自查。

### 相关文件 / Related Files

- `README.md`
- `项目计划书.md`
- `发布资料.md`（正确口径的参照）


---

# 6. 重要技术决策 / Important Decisions


## 决策 1 / Decision 1

**决定 / Decision:** 应用改名为"声声入册 (Echo Ledger)"，但存储键 `echo_cards_data_v1` / `echo_cards_theme_v1` 保持不变。

**原因 / Reason:** 微信小程序名称不得含棋牌类字眼（原名"落牌有声"涉棋牌联想）；而存储键承载用户本机历史数据，改名会导致数据丢失。

**影响 / Impact:** 名称"声声入册"与存储键前缀"echo_cards"不一致属预期状态，未来 Agent 不得以"统一命名"为由改存储键。


## 决策 2 / Decision 2

**决定 / Decision:** 掼蛋模式采用 v1/v2 双版本分流（`game.gdVer` 区分），而非原地替换旧规则。

**原因 / Reason:** 存在按旧"攒分升级"规则进行中的历史对局，直接替换规则会导致老数据结算异常。

**影响 / Impact:** 新开局恒为 v2；旧档走 v1（委托 `MODES.target`）；history"再来一局"对旧档显式传 `gdVer=1` 复刻。修改掼蛋规则时必须同时验证两分支；新增字段须遵守缺字段兼容策略。


## 决策 3 / Decision 3

**决定 / Decision:** 主题采用纯 CSS 方案（基线 + `prefers-color-scheme` 媒体查询 + 手动三态类），零主题 JS 状态机，偏好仅存一个字符串键。

**原因 / Reason:** 避免主题状态管理复杂度；系统跟随与手动覆盖可自然叠加（'system' 不加类、回退媒体查询）。

**影响 / Impact:** `app.wxss` 三份变量表必须同步维护（见第 3 节规则 10），改任何颜色需三处同改。


## 决策 4 / Decision 4

**决定 / Decision:** 回合废弃交互由长按改为左滑露出"废弃"按钮（方向锁 + 帧级节流 + 阻尼 + 半宽吸附），保留二次确认弹窗。

**原因 / Reason:** 长按与页面滚动冲突且可发现性差；左滑更符合列表行操作直觉。

**影响 / Impact:** 废弃仍为不可逆操作，任何改动必须保留二次确认；`refreshView` 重建行会将所有行 `tx` 归零（即收起展开行），勿视为缺陷。


---

# 7. 重要约束 / Important Constraints

- **审核合规**：文案禁词规范（第 3 节规则 7）；模式名称"斗地主/跑得快/掼蛋/德州扑克"作为玩法功能描述予以保留
- **基础库版本**：`发布资料.md` 要求提审时公众平台最低基础库设 2.30.2+（当前代码依赖的 API 如 `wx.getWindowInfo` 已做 `getSystemInfoSync` 回落）
- **提审前置项**：`uploadWithSourceMap` 必须置 `false` 后方可正式上传（发布清单 7 项待办之一）
- **旧数据兼容**：历史对局缺 `strictZeroSum` 视为开启、缺 `gdVer` 视为掼蛋 v1；任何新字段须沿用此兼容策略
- **文档与代码不一致**：当前 `README.md` / `项目计划书.md` 掼蛋与主题描述落后于代码，以代码为准（差异明细见第 4 节"已知问题"）
- **无测试框架**：仓内无测试文件，回归验证依赖开发者工具手工操作或临时脚本（用完即删，不入库）


---

# 8. 最近的重要变化 / Recent Significant Changes

（按 Git 提交顺序，最新在前；本仓库提交未附日期，故不标注具体日期）

- `1d6afcf` — 掼蛋改造为"升级打A" v2 玩法（双版本分流、纯选择式录入、队伍战况面板、回合备注）并优化游戏体验
- `82500fe` — 德州扑克人数 2~9 修复为 2~8；明暗模式切换按钮位置调整
- `8b12007` — 应用图标
- `af52fbc` — 改名"落牌有声"→"声声入册"
- `c1b6d38` — 新增 `发布资料.md` 并更新项目配置
- `f549460` — 主题偏好持久化与白夜模式三态手动切换
- `374b961` — 主题颜色变量与文字对比度优化
- `b8947e5` — V2 迭代：新增 3 模式（掼蛋/UNO/德州）及多项功能（含 strictZeroSum 字段、方向支持、左滑废弃、触感反馈）


---

# 9. 下一步建议 / Next Recommended Actions

1. **文档同步**：更新 `README.md` 与 `项目计划书.md` 的掼蛋 v2 与主题三态描述、修正文件数（详见第 5 节任务 1）；改后禁词全仓自查
2. **执行发布清单**：按 `发布资料.md` 发布前检查清单逐项执行——`uploadWithSourceMap` 置 `false`、公众平台最低基础库设 2.30.2+、体验版全流程自测等 7 项
3. **首次提审**：以上完成后以 1.0.0 提交微信审核；可将 `AGENTS.md`、`AI_CONTEXT.md` 一并纳入 Git 提交
4. （可选）清理根目录临时截图 `PixPin_2026-08-12_11-22-29.png`，或在发布前确认其用途


---

# 10. 上下文维护规则 / Context Maintenance

本文件描述的是：

> “项目现在是什么状态”

This file describes:

> "What is the current state of the project?"

而不是：

> “这个项目过去发生过什么”

It is not:

> "A complete history of what happened in the project."

当信息过期时：

When information becomes outdated:

- 更新它 / Update it
- 删除它 / Remove it
- 合并它 / Consolidate it

不要无限追加历史记录。

Do not continuously append historical information.

如果某项信息未知：

If information is unknown:

使用：

Use:

`UNKNOWN`

不要猜测。

Do not guess.
