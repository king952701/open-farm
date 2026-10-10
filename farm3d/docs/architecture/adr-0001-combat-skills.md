# ADR-0001：战斗技能系统的三项裁决与架构

- **日期**：2026-10-09
- **状态**：Accepted（用户已拍板）
- **关联**：`design/gdd/combat-skills.md` · `design/gdd/talents-and-numbers.md` · `design/reviews/design-review-1.md`

## 决策

| # | 决策点 | 选择 | 落地 |
| --- | --- | --- | --- |
| 1 | 技能资源 | **体力**（不新增法力） | `Ability.cast` 扣 `P.energy`，门槛 `energy >= cost`，不足时 toast + `Audio2.bad()` |
| 2 | 释放按键 | **Q / E / 鼠标右键** | `KEY_DEFAULT.seed` 从 `q` 改为 `z`；`ab1/ab2` 进键表可自定义；右键走 canvas `mousedown(button===2)` 事件直触发（不依赖帧率） |
| 3 | 存档 | **批准 schema 变更 + 建立版本迁移机制** | `F.Migrate`（`util.js`）：单向链 v1→v2，只加字段不删字段；`G.talents / G.talentPts / G.abil` 入档；旧档 `seed:'q'` 自动清除防键位打架 |

## 架构要点

1. **统一伤害管线**：`Combat.resolve(m, mult)` 是唯一结算入口（普攻与技能共用），公式按 GDD talents-and-numbers §3.1；`F.Talents.mods()` 是 S2 天赋系统的注入点，未实现时为 null。
2. **技能模块 `js/ability.js`（`F.Ability`）**：数据表 `F.ABILITY_DEF` 八技能集中一处；三段式时间线 windup→damageT→recover→cd；五种路径 melee / around / dash / projectile / ground（+ self / chain）。
3. **特效零泄漏**：每类特效预分配池（≤8），全部忙碌时复用最早的；`dispose` 不需要——几何/材质常驻。
4. **位移安全顺序**：`Builds.pushOut` → 世界半径 283 → `Dungeon/House.clampPlayer`，写死在 `place()` 一处。
5. **热路径**：单帧 `dt` 上限 1/20 防弹道跳穿；`fx` 数组复用，无逐帧 new 对象。

## 后果

- 旧存档升级透明：金币/天数/装备等一切保留，玩家无感。
- 普攻伤害公式变化：现在吃战斗等级加成（`1 + lv*0.02`），满级普攻约为旧版的 2.2×——**这是 GDD 数值重构的一部分**，若试玩后发现过强，调 `LV_COEF`（combat.js 顶部，一处）即可。
- 天赋字段本轮已入档但未生效（占位），S2 天赋树接入时不再动存档。
