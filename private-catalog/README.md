# 私有插件市场（A2：完全自主 / 自品牌的 fork）

本仓库已是一套**完全自主的私有市场 fork**，全部跑通（typecheck / build / 全量单测 / 目录校验 /
preflight 全绿）。品牌与外部引用集中在 **`src/brand.ts`** 一处，改它即完成品牌化，源码别动。

**当前状态（已品牌化并扩充，可直接运行）**：
- 市场显示名 / 仓库地址 / 收录入口 / 目录托管地址 / 更新源地址 / 反馈主名 —— 已指向 `qudayan92`
  （`src/brand.ts`）；giscus 的 `repoId`/`categoryId` 需你从 giscus 应用填入（占位不会崩，仅评论区不加载）。
- `private-catalog/plugins.json` 已收录 **34 条**真实插件（含私有 `@wxg-prc-cpg/browser-skill-dsh-plugin`、
  `modlens`、`dsh-meme`、`dsh-emoji`；另 30 条由 `scripts/catalog-expansion.mjs` 从公共列表按质量分筛选，
  经 `validate-catalog.mjs` 校验通过）。`scripts/merge-catalog.mjs` 可把 `expansion-draft.json` 并入。
- `private-catalog/updates.json` 已生成（`{}` 合法 payload；市场回退 npm 发布时间/“无更新说明”，不报错）。

## 原理（一句话）

`dshmarket` 每次打开市场网页，都会实时向一个 registry URL 拉取 `plugins.json`，然后**只安装
清单里出现过的插件**（`routes.ts` 的 `registry.plugins.find(p => p.url === url)`）。所以：

- **清单 = 你的可安装白名单**（这是安全特性，不是限制）
- 把默认的 `https://awesome-dsh-plugin.com/plugins.json` 换成你自己的地址，市场就变成你的了

> 注意：设了 `DSHM_REGISTRY_URL` 是**整体替换**默认清单，不是"官方 + 你自己"并存。要全官方就
> 别设，要全自己的就设。源码 `src/regions.ts` 明确这么设计。

## 目录结构

```
private-catalog/
  plugins.json        ← 你的插件清单（唯一的"数据源"）
  updates.json        ← 可选更新说明（插件版本/commit 的说明，`{}` 合法；市场会回退 npm 发布时间）
scripts/
  validate-catalog.mjs ← 离线校验脚本（依赖无关，直接用 node 跑）
```

## 清单字段（格式必须严格遵守）

顶层：

```json
{
  "name": "acme-plugin-catalog",
  "url": "https://plugins.acme.example",
  "source": "https://git.acme.example/acme/plugin-catalog",
  "updated": "2026-08-28",
  "count": 3,
  "categories": { "tools": { "en": "Tools & Capabilities", "zh": "工具与能力" } },
  "plugins": [ ... ]
}
```

单个插件条目（对 npm 私有库来源）：

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✅ | 显示名。同一目录内可重名（允许不同 owner/monorepo），但建议唯一 |
| `owner` | ✅ | 必须等于 `url` 里的 owner（`github.com/<owner>/<repo>` 的 `<owner>`） |
| `url` | ✅ | **必须是 `https://github.com/<owner>/<repo>` 形式**。即使走 npm 也得填——运行时的 `parseSourceUrl` 只认 github.com，身份去重和安装目标解析都读它；真正的字节来自 npm |
| `category` | ✅ | 必须是顶层 `categories` 里声明过的 id |
| `description` | ✅ | 对象，`en` 和 `zh` 都非空（市场双语渲染） |
| `npm` | npm 来源必填 | 你的私有 npm 包名（scoped 如 `@acme/pkg` 或简单名）。填了它安装就走 npm，`npm: null` 则走 GitHub |
| `install` | ✅ | 必须匹配 `dsh plugin --profile web add <npm名>`（npm 来源），或 `github:<owner>/<repo>` |
| `added` | ✅ | `YYYY-MM-DD`，不能是未来日期 |
| `stars` / `downloads` | 选 | 数字或 `null`；`stars` 非负整数 |
| `tarball` | 选 | 预构建 GitHub Release `.tgz`（必须属于本条目自己的 `owner/repo`），无 npm 时代替源码整仓 |
| `screenshots` | 选 | 1–8 张，`https` 且必须是 GitHub 图床（`raw.githubusercontent.com` 等） |
| `page` | 不需要 | 运行时不用它；私有目录省略即可 |

## 部署与启动

### 1) 把 `plugins.json` 放到你能托管的地方

任何静态可 GET 的地方都行：GitHub Pages、对象存储/CDN、Nginx、公司内网静态服务器。
市场对它会发 `if-none-match` / `if-modified-since`（ETag/Last-Modified），托管方最好支持条件请求，
这样每次打开能拿到 304 而不是重传整份。

**最快路径（GitHub Pages，已备好工作流）**：把本仓库推到你的 GitHub 仓库，`.github/workflows/
publish-catalog.yml` 会在你 push 改动到 `private-catalog/` 时自动把 `plugins.json` + `updates.json`
发布到 Pages。部署后在设置里启用 Pages，然后：

```sh
# 把下列地址填进 src/brand.ts 的 catalogBaseUrl（或交给 DSHM_REGISTRY_URL / DSHM_UPDATES_ORIGIN 覆盖）
# plugins.json : https://<owner>.github.io/<repo>/plugins.json
# updates.json : https://<owner>.github.io/<repo>/updates.json
```

### 2) 发布你要上架的插件到私有 npm registry

每个清单条目里 `npm` 指向的包名，必须能在你**配置给市场用的 npm registry** 里拉到。

### 3) 启动 `dsh web` 时注入环境变量

```sh
export DSHM_REGISTRY_URL="https://plugins.acme.example/plugins.json"  # 你的清单地址
export DSHM_NPM_MIRROR="https://npm.acme.example"                    # 你的私有 npm registry
dsh web
```

- `DSHM_REGISTRY_URL`（选）：不设时用 `BRAND.defaultCatalogUrl`；你的域名与 brand.ts 不一致时用这个覆盖。
- `DSHM_NPM_MIRROR`：让它 spawn 的 pnpm 从你的 registry 装插件；不设就回退默认 npmjs。
- `DSHM_UPDATES_ORIGIN`（选）：不设时用 `BRAND.defaultUpdatesUrl`，用于更新检查。
  对自家插件做更新检测，就让你托管的 `updates.json` 返回含插件版本信息的更新说明。

systemd / 前台进程都同理，只要这两个变量在 `dsh web` 进程的环境里。桌面客户端如果要跑私有市场，
要看它是否把环境变量透传给内部 `dsh web`（不少客户端是独立自托管 dsh 的，需要相应配置）。

### 4) 验证

```sh
node scripts/validate-catalog.mjs                      # 校验默认 private-catalog/plugins.json
node scripts/validate-catalog.mjs path/to/plugins.json   # 校验你自己的
```

通过（`catalog ok ✓`）后，重新打开 **设置 → 插件市场**，应显示你的清单。

## 私有化程度说明

本仓库现在已经是一套 **A2：完全自主（自品牌）的私有市场 fork**，你只要改一个文件即可完成
品牌化：

- **`src/brand.ts`**（品牌/外部引用集中配置）：市场显示名、仓库链接、收录入口、默认目录
  (`defaultCatalogUrl`)、默认更新源 (`defaultUpdatesUrl`)、讨论区 giscus、反馈主名。
  改这一个文件即完成品牌化，其余源码一律读它。
- 默认数据源已指向 `BRAND.defaultCatalogUrl`（`src/regions.ts`），不再写死 awesome-dsh-plugin.com；
  更新源默认取 `BRAND.defaultUpdatesUrl`（`src/changelog.ts`），仍受 `DSHM_REGISTRY_URL` /
  `DSHM_UPDATES_ORIGIN` 环境变量覆盖。
- 评论区 giscus（`src/client/comments.ts`）、页头仓库/收录链接（`src/client/MarketSection.tsx`）、
  导航/副标题/收录文案（`src/client/locales.ts`）、收录失效反馈文案（`src/routes.ts`）均已去官方化，
  全部读 `BRAND`。

**刻意保留的内部契约（不要改，改了会破坏 DSH 兼容与自管理）**：Cordis 插件名 `dsh-market`、
HTTP 路由前缀 `/dsh-market/*`、落盘目录 `.dsh-market/`、client bundle id `dshmarket`。

**仍残留的官方耦合（仅传输 fallback/代码注释，非用户可见行为）**：
- `src/regions.ts` 的 `CATALOG_PACKAGE = 'dsh-plugin-catalog'`、`src/changelog.ts` 的
  `UPDATES_PACKAGE = 'dsh-plugin-updates'` —— 仅当走"国内区 npm 包目录/更新"通道时才用到；
  用 `DSHM_REGISTRY_URL`（URL 通道）时不会触发。若你也发布了自己的目录/更新 npm 包可自行替换。
- 若干条描述设计来源的**代码注释**仍提到 awesome-dsh-plugin/dshmarket.com，仅为历史说明。
- `package.json` 的 `name` 保留 `dshmarket`（自管理/自更新的键），`repository/homepage/description`
  已改为品牌占位。若你要发布为独立包名，属于深度重命名，需同步改 Cordis name 与路由前缀，先确认。

## 常见坑

- **清单 JSON 格式/字段错了** → 市场直接解析失败，页面上报"目录获取失败"，用校验脚本先查。
- **`npm` 是私有 scoped 包** → 若 registry 需要认证，市场 spawn 的 pnpm 会读本机的 npm 凭据
  （`~/.npmrc` / `.npmrc`）。确保跑 `dsh web` 的用户环境里能 `pnpm view` 到你那个包。
- **插件装完要刷新/重启** → 多数刷新页面即可；改动了 bundle 层或需构建的按提示重启。
