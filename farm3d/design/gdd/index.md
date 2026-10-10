# 工作室配置与目录约定

> 本套目录由 CCGS 工作流建立。下面的约定偏离技能默认，按本项目实际做了调整。

| 项 | 技能默认（Web） | 本项目实际 | 说明 |
| --- | --- | --- | --- |
| 代码根 | `src/` 或 `js/` | **`js/`** | IIFE 挂载到 `window.FARM`，`index.html` 里手写的 `<script>` 顺序即依赖顺序 |
| 测试根 | `tests/` | **根目录 `_smoke.js` / `_e2e.js`** | 不新建 `tests/`，避免与既有约定并存造成"哪套才是真的" |
| 依赖注入 | 打包器 | 无 | 新增模块必须同步在 `index.html`（浏览器）**和** `_smoke.js` 的 `files` 数组（Node）里登记，两处都要 |

## 运行与验收命令

```sh
# 冒烟（Node，无浏览器，覆盖几何生成 / 键表 / 纯逻辑）
node _smoke.js

# 端到端（Playwright + Chromium headless，真实按键点击）
PLAYWRIGHT_BROWSERS_PATH=<pw> node _e2e.js
```

## 本轮开工的四个方向（用户选定，rigor = full / automation = guided）

| 系统 GDD | 文件 | 层 | 状态 |
| --- | --- | --- | --- |
| 战斗技能 | [`combat-skills.md`](combat-skills.md) | Core | **S1 已实现**（ADR-0001，四项裁决已定） |
| 天赋与数值 | [`talents-and-numbers.md`](talents-and-numbers.md) | Core | Draft（存档字段已入档占位，树本体 = S2） |
| 画质 / 贴图 / 模型 / 骨骼动画 | [`art-upgrade.md`](art-upgrade.md) | Polish | Draft → 待开工（S4） |
| 音乐 / 音效 | [`audio.md`](audio.md) | Polish | Draft → 待开工（S5） |
| 设计评审 | [`../reviews/design-review-1.md`](../reviews/design-review-1.md) | — | 三个 BLOCKED 已由用户裁决放行 |
| 架构决策 | [`../architecture/adr-0001-combat-skills.md`](../architecture/adr-0001-combat-skills.md) | — | Accepted |

## 必问类目（automation = guided 下的停点）

数值方案、范围变更、删除文件、**存档 schema 变更**必须停下来让用户拍板。本轮涉及 schema 的提案有两处，都写在对应 GDD 的「开放问题」里，未经批准不动 `Game.load/save`。
