# 启用评论区（giscus）配置

市场的插件讨论区由 [giscus](https://giscus.app) 驱动（同一插件在 dshmarket.com / 目录站 / 本市场共用一条讨论）。要启用，只需填 `src/brand.ts` 里 `BRAND.giscus` 的一对真实 ID：

```ts
giscus: {
  repo: 'qudayan92/dsh-market',   // 你的讨论仓库（已填）
  repoId: 'REPO_ID_HERE',         // ← 需替换成真值
  category: 'Plugins',            // 讨论分类名（默认）
  categoryId: 'CATEGORY_ID_HERE', // ← 需替换成真值
}
```

## 怎么拿到 `repoId` / `categoryId`

1. 打开 <https://giscus.app>。
2. **Repository** 填 `qudayan92/dsh-market`（或你想放讨论的仓库）。
3. **Discussion category** 选一个（或用默认 `Announcements`）。
4. 页面底部 **Enable giscus** 会给出 `data-repo-id`、`data-category-id` 等几个字段——分别就是 `repoId`（`data-repo-id`）与 `categoryId`（`data-category-id`）。
5. 把这两个值填回 `src/brand.ts` 的 `giscus.repoId` / `giscus.categoryId`。

## 注意事项

- 需要你的仓库已安装并配置 giscus 应用（在 Settings→Discussions 启用 Discussions 后，giscus 会以 App 身份发表评论）。
- **填错或仍为占位**：评论组件会加载失败，但**不会崩**——市场其它功能照常。README 也写明这一点。
- `category` 名必须与 giscus 里选的分类名一致；`category` 不参与 ID 匹配，但建议保持一致以免误导。

## 刷新生效

改完 `src/brand.ts` 后重新构建客户端并刷新市场页：

```sh
npm run build:client   # 重新打包 client/client.js
```

（本市场是 DSH 插件，源码改动需随新版本发布后生效。）
