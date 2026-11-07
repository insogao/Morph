# M1 报告：精确矢量轨道

- 日期：2026-11-07；分支 `morph-master`
- 范围：PLAN v0.3 第 2 节、里程碑 M1

## 1. 交付内容

| 文件 | 内容 |
| --- | --- |
| `packages/morph-engine/src/vector/geom.ts` | 闭合折线几何：弧长参数、转角、质心、自交检测（网格分桶）、点在多边形内 |
| `vector/shape.ts` | SVG path 解析（M L H V C S Q T A Z，含相对坐标和紧凑弧标志）、按包含关系自动分洞、外轮廓 / 洞的绕向约定 |
| `vector/correspond.ts` | 对应关系：最佳起点偏移 + 拐角单调对齐（编辑距离 DP，凹凸同号优先）+ pins（全局约束、允许一对多、顺序冲突报 `PinOrderError`）+ 可读锚点 |
| `vector/morph.ts` | 片配对（小规模穷举指派）、消失点（`self` / `partner` / 定点）、多余的洞闭合、预旋转（`auto` 搜索）、`linear` / `intrinsic` / `auto` 三种插值 |
| `vector/timeline.ts` | 缓动、回弹（Amplitude / Frequency / Decay）、序列（可循环，每段独立参数） |
| `vector/render.ts` | 填充 / 描边、OKLab 颜色插值、调试视图 `drawMatch`（线框、顶点连线、拐角结点、pin） |
| `vector/qc.ts` | 有形度（拐角数、圆度）、单侧 Hausdorff 偏差、自交计数 |
| `fixtures/s0/shapes.ts` | S0 测试图形（全部原创）：心、星、圆、方、沙漏、X + 四菱形、环、Y、木、人、E、M |
| `tests/vector.test.ts` | 18 项单测 |
| `lab/mm-vs-linear` | 四栏对比：对应关系图 / flubber / linear / intrinsic，四组题目 |
| `lab/mm-icon-loop` | 成品：环 → Y → 木 → 人 → 环，回弹、残影挤出、倾斜挤压、OKLab 变色、洞的闭合和重开 |
| `skills/morph-master/references/vector-track.md` | 给 AI 用的使用说明 |

## 2. 验证（三项分开）

- **编译**：`tsc --noEmit` 通过。`tsconfig` 的 include 加入了 `lab/` 和 `fixtures/`，原来 `lab/` 没有被类型检查。
- **测试**：`npm test` 共 38 项，全部通过（原有 20 项 + 新增 18 项）。
- **确定性**：`npm run check:visual` 12 个场景全部 PASS（正放、倒放、拖动得到相同帧）。
- **看起来对**：用 `tools/frames.mjs` 逐帧看过每段形变最快的部分，结论见第 3 节。

## 3. 门禁结果（如实记录）

| 门禁 | 结果 |
| --- | --- |
| 首尾帧与输入一致 | ✅ 所有题目偏差 ≤ 0.13 px（测试阈值 0.5 px） |
| 25 / 50 / 75% 无自交 | ✅ 全部为 0 |
| 直角保持锐利 | ✅ 星形 16 个拐角、E 的 12 个拐角在终点全部保留 |
| 明显好于 flubber | ✅ 字母类最明显：flubber 的 E → M 撕裂成碎块，我们的方法读起来是“一个字母在转身变形” |
| **50% 帧有形度明显高于 linear 基线** | ❌ **未通过，假设本身不成立**，见下 |

**关于 linear 基线**：调研时推测“顶点线性插值会让中间帧变成圆团”，这个推测是错的。在对应关系做得好（拐角对拐角、起点对齐）的前提下，linear 的中间帧并不糊，按圆度指标甚至比 intrinsic 更“有棱角”（心 → 星：linear 0.50，intrinsic 0.64；1 表示正圆）。

intrinsic 的优势在别处：图形需要转动时（E → M 自动旋转），它保持笔画粗细和整体结构，形状读起来是“同一个物体在转身”，而 linear 会把笔画压薄。

所以：**质量主要来自对应关系，不是插值方式**。这和 Morph Studio 的产品重心一致：它的全部交互都在对应关系和 pin 上。

默认值保持 `auto`（优先 intrinsic，出现自交时退回 linear）。M2 起每个 Demo 都要附 linear / intrinsic 对照，再决定是否改默认值。

## 4. 过程中发现并修好的问题

1. intrinsic 中段面积膨胀（只保持边长、角度在变，面积就会长大）→ 改为按 √面积 线性控制大小。
2. intrinsic 的整体朝向由第一条边的角度决定，加 pin 后整个图形会无故旋转约 30° → 改为对直线插值结果做 Procrustes 最佳拟合旋转。
3. `{angle}` 锚点只在顶点里找，正上方是平边中点时会吸到角上，导致对称 pin 变成不对称 → 改为从质心发射线求交。射线落空时（人字形的质心在两腿之间）退回按方向最接近的点。
4. `wrapPi(0)` 返回 π（`x || π` 把 0 当成假值）→ 已修复，并加了测试。
5. 重叠的片用 even-odd 填充会互相抵消成洞 → 改为 nonzero（绕向约定保证洞仍然是洞）。
6. 两个对称图形之间不加 pin 时，中间帧会歪成“鸟形” → 这是自动切点的固有局限。写进了 `vector-track.md`：对称图形加 12 点和 6 点的 pin。

## 5. 未完成 / 留给后续

- `via` 中间形状路线：PLAN 第 2 节的可选项，未做。
- 播放器里的“只看当前段 / 整条”切换和调试视图开关：调试视图目前只是函数 `drawMatch`，在 `mm-vs-linear` 第一栏使用。
- 描边作为独立通道形变（描边 ↔ 填充）：未做，描边目前由场景绘制。
- `split`、`blend`、`parallel`、`part-remap`：按 PLAN 属于 M3。
- 自动旋转在 E → M 上选了 75°，而不是直觉上的 90°。结果看起来自然，但候选角是否只取 45° 的倍数，需要更多题目来决定。
