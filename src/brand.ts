/**
 * 品牌与外部引用配置 —— 把 dsh-market fork 成"你自己的市场"唯一要改的地方。
 *
 * 这套 fork 已经跑通（typecheck/build/全量单测/目录校验全绿）。下面这些值目前是
 * 自洽的默认值：目录已指向 qudayan92/dsh-plugin-market-catalog（真实托管），
 * 市场显示名与仓库/反馈名已从 Acme 占位改为 qudayan92，仅 giscus 的 repoId/categoryId
 * 需你从 giscus 应用填入（填错或占位只会让评论区不加载，不会崩）。换品牌时改这里即可，源码别动。
 *
 * 默认值会被 `dsh web` 进程的环境变量覆盖时以环境变量为准：
 *   DSHM_REGISTRY_URL   -> 覆盖 defaultCatalogUrl
 *   DSHM_UPDATES_ORIGIN -> 覆盖 defaultUpdatesUrl
 *   DSHM_NPM_MIRROR     -> 覆盖 npm 下载源
 *
 * 内部契约（刻意保留，不要改）：
 *   - Cordis 插件名 `dsh-market`（src/client/index.ts 与 src/index.ts 的 export const name）
 *   - HTTP 路由前缀 `/dsh-market/*`
 *   - 落盘目录 `.dsh-market/`（profile 下）
 *   - client bundle id `dshmarket`（tsdown.config.ts + scripts/preflight.mjs 断言）
 * 若确定要连这些一起改（深度重命名、发布为独立包名），见 private-catalog/README.md。
 */

/** 市场在设置页 / 设置卡片 / 导航里显示的名字。 */
const displayNameZh = '精选插件市场'
const displayNameEn = 'Curated Plugin Market'

/** 你的托管地址：plugins.json 与 updates.json 放在同一处（或各自换值）。
 * 已托管到 GitHub 仓库 qudayan92/dsh-plugin-market-catalog（raw URL，无需开 Pages）。
 * 之后更新目录请改 private-catalog/*.json 并推送到该仓库。 */
const catalogBaseUrl = 'https://raw.githubusercontent.com/qudayan92/dsh-plugin-market-catalog/main'

/** 你的 fork 仓库与收录入口。 */
const repoUrl = 'https://github.com/qudayan92/dsh-market'
const submitUrl = 'https://github.com/qudayan92/dsh-market/issues/new'

export const BRAND = Object.freeze({
  displayNameZh,
  displayNameEn,

  /** 页头"回仓库"链接。 */
  repoUrl,
  repoTitle: `${displayNameEn} · GitHub`,

  /** "申请收录插件"入口。 */
  submitUrl,

  /** 默认插件目录（plugins.json）。DSHM_REGISTRY_URL 优先级更高。 */
  defaultCatalogUrl: `${catalogBaseUrl}/plugins.json`,

  /** 默认更新源（updates.json）。DSHM_UPDATES_ORIGIN 优先级更高。 */
  defaultUpdatesUrl: `${catalogBaseUrl}/updates.json`,

  /**
   * 插件讨论区（giscus）。要启用评论区：在你的讨论仓库上创建 giscus 应用，把 repo /
   * repoId / category / categoryId 换成本实例真实值。占位值会让评论加载失败，但不会崩。
   * 即使不启用，也请保证这一组值对你自洽（评论组件读它）。
   * repoId / categoryId 是 giscus 应用生成的 ID，需用 giscus 应用页面获取后填入。
   */
  giscus: {
    repo: 'qudayan92/dsh-market',
    repoId: 'REPO_ID_HERE',
    category: 'Plugins',
    categoryId: 'CATEGORY_ID_HERE',
  },

  /** 收录失效时提示"去哪反馈"的主名。 */
  feedbackHost: 'qudayan92-dsh-market',
})
