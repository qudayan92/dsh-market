# 上游策展 PR 计划（awesome-dsh-plugin）

> 对象：**`awesome-dsh-plugin/awesome-dsh-plugin`**（精选目录），不是本市场仓库。
> 依据：`QUALITY-AUDIT.md`（视角化盘点）+ `data/curation-export.md`（精确条目清单）。
> 目标：把盘点出的三类内容问题——空分类、同名碎片、子包未发布——变成可执行的**上游 PR / issue 计划**。

---

## 0. 前提与边界（先认清，别白改）

- **数据链路**：本市场消费的正是上游 `awesome-dsh-plugin.com/plugins.json`；`data/registry-snapshot.json` 的头就是 `source: awesome-dsh-plugin/awesome-dsh-plugin`。所以"内容"改在上游，本市场只消费。
- **我们已知的上游schema**（从市场 `RegistryPlugin` / `validate-registry.mjs` 反推）：`name, owner, url, page, category, description{en,zh}, npm?, tarball?, stars?, downloads?, install, added, screenshots?, deprecated?, replacement?`。
- ⚠️ **品类坑**：市场消费层已支持 `category: string | string[]`（多分类），但**发布门禁 `validate-registry.mjs` 的 E7 只认单个字符串**（`categories.has(p.category)`）。因此——上游如果用多分类数组，本市场门禁会报错。**本次上游 PR 请勿引入多分类数组**，或同步改本市场门禁（`pluginCategories()` 已存在，E7 应改用它）。这是一定要先对齐的点。
- **同名并非错误**：市场 `validate-registry.mjs` 的 **W1** 已明确"不同作者 / monorepo 的展示名允许相同"——`name` 是插件安装、`/p/` 页面、身份的核心键，**上游不应为"去重"去改 `name`**，那会破坏 `install`/`page`/identity。

---

## 1. WS-3 · 子包未发布 npm / tarball（**最优先** · 最具体 · ROI 最高）

### 现状
`monorepo 子包`共 245 条，其中 **119 条** `npm=null && tarball=null`，只能走 git 源码 + `#path:` 安装。整仓源码 + 子包合计占全目录 **55.8%**，属"慢 / 依赖网络 / 可能带构建脚本"的风险面。

### 目标
把"只能源码装"的脆弱条目，转成"有 npm 或 Release tarball"的稳健条目；实在做不到且不常用的，显式降级。

### 动作（按对上游的侵入度从小到大切）
| 层次 | 动作 | 靠谁 | 形式 |
|---|---|---|---|
| A | **催作者发布**：发 npm，或至少给 GitHub **Release tarball** | 社区/作者 | issue（逐一或按作者批量） |
| B | 已能出 `prebuilt` 归档的 -> 上游给条目补 **`tarball`** 字段指向 release 包 | 作者 / 我们 | PR（字段级小改） |
| C | 作者明确不做、且低星不常用的 -> 上游加 **`uninstallable`** 标记或**从精选列表移除** | 上游维护者 | PR |
| D | 消费者侧兜底：市场把"git-only + 子包未发布"在**质量分里降权**、排序靠后 | 本市场 | 本仓库代码 |

### 具体条目
见 `data/curation-export.md` **WS-3**（119 条，含 `仓库#子目录 / name / star`）。这是"给谁发 issue、给哪几条补 tarball、哪几条可考虑移除"的清单。

### 建议
- **A（催发布）+ D（消费侧降权）先做**：前者是治本的动作，后者是立刻缓解体验风险、且不卡上游。
- **B/C** 按 WS-3 清单里"有预构建归档能力 / 低星近似死置"的子集分别开 PR，一次一个子集。

---

## 2. WS-2 · 同名碎片化（**抽查 / 合规判定**，消歧放消费侧）

### 现状
**98 组**同名，最严重：`dsh-memory`（**7 作者**）、`dsh-wallpaper`/`dsh-archive-manager`/`dsh-session-manager`/`dsh-voice`（各 5）。

### 目标
**不是改名**（见"边界"），而是区分两类：**① 合规的同名**（不同作者、不同实现，各自独立，保留）；**② 疑似"换皮/重复/低质"**（同名但明显照搬)。后者才值得上游动作。

### 上游能做的 PR
- 抽查 WS-2 全表，对**明确低质 / 作者走样白 / 明显重复**的条目：移除或加 `deprecated` + `replacement`（市场已支持这两个字段，见 `RegistryPlugin`）。
- 对合规同名：**不动**。

### 真正的消歧（放消费者侧，不在上游）
同名会让用户困惑，但原因是"市场卡片只显示 `name`"。正确做法是**市场 UI 按 `owner`/`repo` 区分**（卡片显示"作者 @ repo"、详情页区分来源），而不是上游改名。这属于本市场代码改动，不纳入上游 PR。

### 具体条目
见 `data/curation-export.md` **WS-2**（98 组，`显示名 / 作者数 / 作者(仓库)`）。

### 建议
上游 PR 只做"判定是否合规/移除"；**不要为了消歧改 `name`**。同一份表给市场侧做"区分展示"。

---

## 3. WS-1 · 空分类补内容（**判断为主** · 新策展优先）

### 现状
`identity`（身份与通信）= **4 条**，`agi`（AGI 架构探索）= **1 条**。这是内容策展缺口，不是 bug。

### 两条路线（取舍）
| 路线 | 做法 | 优点 | 代价 / 风险 |
|---|---|---|---|
| **A 填充** | 把明显属于该分类的现有插件**重归类** + **新策展**更多此方向插件 | 分类更平衡、搜索命中更好 | 重归类会改变作者意图、用户已有心智；关键词误伤（见下） |
| **B 精简/合并** | 若这两类过细不值得单独成类 -> 上游**合并**进相邻分类（如 identity→notify/ui，agi→dev/workflow） | 消灭空分类，taxonomy 更务实 | 需要上下游一致改 `category` 白名单 + 市场门禁 |

### 推荐
- **B 更稳妥**：`identity`(4) 和 `agi`(1) 单独成类但几乎无内容，说明这两类**当前不具备独立分类的支撑**。合并进相邻分类（`identity→notify`、`agi→dev`/`workflow`）比"硬填"更符合现状。
- 若坚持 **A**：**只重归类高置信的那几条**（名称本身即该方向的），并且**新策展为主**。候选见下，但**含误伤**——`dsh-compressor`（因名字含 "sso"）、`dsh-qq-skin`/`dsh-qq2007-skin`（QQ 主题皮，其实是 theme）属于误标，**不能照搬**。

### 具体条目
见 `data/curation-export.md` **WS-1**（identity 候选 47，agi 候选 7）。**仅作提示，必须人工语义确认。**

---

## 4. 提交与校验要点（PR 必看）

- 每个条目必须仍满足市场门禁 **`npm run validate:registry`**（E1–E12）：
  - **E2** 双语描述 `en`+`zh` 非空；
  - **E5/E6** `url` 是 github repo/tree、`owner` 与 url 一致；
  - **E7** category 在白名单内（**唯一**——见"品类坑"，勿用数组）；
  - **E10** `install` 指向真实 target（npm 名 / `github:owner/repo[#path:]` / 本仓库自己的 release archive）；
  - **E12** `screenshots` 仅 1–8 个 GitHub 图床 https 链接（防追踪像素，#61）。
- 改动后，本市场侧快速回归：`node scripts/validate-registry.mjs`（应 0 error）、`node scripts/quality-audit.mjs`（看是否改善短板）。

---

## 5. 优先级与执行顺序

| 顺序 | 工作流 | 形式 | 理由 |
|---|---|---|---|
| **1** | WS-3 A + D | 上游 issue + 本市场降权 | 最具体、直接消"慢/脆"体验风险，且 D 不卡上游 |
| 2 | WS-2 抽查（合规/移除） | 上游 PR | 判"是否换皮/低质"，不动合规同名 |
| 3 | WS-1 决定填充 or 合并 | 上游 PR（合并）或新策展 | 判断为主，需先定路线 |

## 6. 验收标准
- **WS-3**：无 npm 的子包条目，要么有 `npm`/`tarball`，要么显式标记；市场 `validate:registry` 仍 0 error。
- **WS-2**：低质/重复同名已处理（移除或 `deprecated`)；合规同名保留且市场 UI 能按作者区分。
- **WS-1**：`identity`/`agi` 要么被填充到有实质内容，要么被合并消解——二者必为其一，不留"空分类"。
- 全程 `quality-audit.mjs` 报告里对应的"待修复/短板"数字下降。

---

### 参考数据文件
- `QUALITY-AUDIT.md` —— 视角化盘点（分节 + 一句话结论）。
- `data/curation-export.md` —— 本计划的精确条目清单（WS-1/2/3）。
- `scripts/quality-audit.mjs` / `scripts/curation-export.mjs` —— 可重跑生成上面两份。
