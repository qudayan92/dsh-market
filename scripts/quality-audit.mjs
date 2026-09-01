#!/usr/bin/env node
/**
 * Catalog quality audit — the EDITORIAL lens that validate-registry.mjs (the
 * hard merge gate, E1–E12) deliberately does not render.
 *
 * The gate answers "does this catalog violate its own schema?"; this script
 * answers "is this catalog GOOD?" It never fails the build — it writes a
 * human-readable report and prints a digest, so a maintainer can see coverage
 * gaps, fragmentation, dead weight, and what to curate next.
 *
 * Everything is derived locally from data/registry-snapshot.json, the same
 * artifact the merge gate reads, so no network is used and no publication is
 * touched.
 *
 * Usage: node scripts/quality-audit.mjs [--out <file>]
 */

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SNAPSHOT = fileURLToPath(new URL('../data/registry-snapshot.json', import.meta.url))
const DEFAULT_OUT = fileURLToPath(new URL('../QUALITY-AUDIT.md', import.meta.url))

const argOut = process.argv.indexOf('--out')
const OUT = argOut === -1 ? DEFAULT_OUT : fileURLToPath(new URL(process.argv[argOut + 1], import.meta.url))

const md = (out) => {
  out.lines.push(out.line)
  out.line = ''
}
const cell = (v) => {
  const s = String(v)
  return s.includes('|') ? `"${s.replaceAll('"', '""')}"` : s
}
// A tiny table writer so the report stays dependency-free.
const table = (out, headers, rows) => {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length)))
  out.lines.push('| ' + headers.map((h, i) => h.padEnd(widths[i])).join(' | ') + ' |')
  out.lines.push('| ' + widths.map((w) => '-'.repeat(w)).join(' | ') + ' |')
  for (const r of rows) {
    out.lines.push('| ' + r.map((v, i) => String(v).padEnd(widths[i])).join(' | ') + ' |')
  }
}

function main() {
  const raw = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
  const plugins = raw.plugins
  const categoryMeta = raw.categories || {}
  const categoryIds = Object.keys(categoryMeta)
  const updated = raw.updated
  const ref = new Date(updated + 'T00:00:00Z').getTime()

  const out = { lines: [], line: '' }
  const line = (s) => (out.line += s + (out.line ? '\n' : '')) // not used; see md()
  const blank = () => out.line && md(out)

  const title = (s) => md(out) || out.lines.push(`## ${s}`) || blank()

  out.lines.push(`# 插件目录质量盘点`)
  out.lines.push('')
  out.lines.push(`- 数据源：\`data/registry-snapshot.json\`（上游精选目录 \`${raw.source}\`）`)
  out.lines.push(`- 快照更新：\`${updated}\`　|　插件数：**${plugins.length}**　|　分类数：**${categoryIds.length}**`)
  out.lines.push(`- 说明：本报告是**视角化质量盘点**（可读性/覆盖/碎片/死重），不替代 \`scripts/validate-registry.mjs\` 的硬校验（schema 完备性）。`)
  out.lines.push('')

  // ---- 1. 概览与安装方式分布 ----
  title('1. 概览：安装方式分布')
  const buckets = { npm: 0, tarball: 0, subpath: 0, gitroot: 0 }
  for (const p of plugins) {
    if (p.npm) buckets.npm++
    else if (p.tarball) buckets.tarball++
    else if (/\/tree\//.test(p.url)) buckets.subpath++
    else buckets.gitroot++
  }
  table(out, ['安装方式', '数量', '占比', '说明'], [
    ['npm 包', buckets.npm, pct(buckets.npm, plugins.length), '最快：registry tarball，几秒装完'],
    ['GitHub Release tarball', buckets.tarball, pct(buckets.tarball, plugins.length), '预构建，无本地构建脚本'],
    ['monorepo 子包 (subpath)', buckets.subpath, pct(buckets.subpath, plugins.length), '需 pnpm ≥9 子目录支持'],
    ['GitHub 整仓源码', buckets.gitroot, pct(buckets.gitroot, plugins.length), '最慢：源码下载 + 可能本地构建'],
  ])
  blank()
  out.lines.push(`> **注意**：git-only（整仓 + 子包，${buckets.subpath + buckets.gitroot} 条 / ${pct(buckets.subpath + buckets.gitroot, plugins.length)}）依赖到你 GitHub 的网络，且可能带构建脚本。这是安装体验的重要风险面，也是"质量分"里该给更低权重的一条。`)
  blank()

  // ---- 2. 分类分布与空分类 ----
  title('2. 分类分布与空分类')
  const catCount = {}
  for (const p of plugins) catCount[p.category] = (catCount[p.category] || 0) + 1
  const catRows = categoryIds
    .map((id) => ({
      id,
      zh: categoryMeta[id]?.zh ?? '',
      en: categoryMeta[id]?.en ?? '',
      n: catCount[id] || 0,
    }))
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))
  table(out, ['分类', '中文名', '插件数', '缺口信号'], catRows.map(({ id, zh, n }) => [
    id, zh, n, n < 10 ? '⚠ 近乎空白' : n < 60 ? '偏少' : '正常',
  ]))
  blank()
  const thin = catRows.filter((c) => c.n < 10)
  if (thin.length) {
    out.lines.push(`**待策展的空分类**（<10 条）：${thin.map((c) => `\`${c.id}\`(${c.n})`).join('、')}`)
    blank()
  }
  out.lines.push(`> **结论**：头部 \`${catRows.slice(0, 3).map((c) => `${c.id}(${c.n})`).join(' / ')}\` 已近饱和，用户会被淹没；尾部空分类是内容策展的明确缺口。`)
  blank()

  // ---- 3. 信号覆盖度（排序可信度） ----
  title('3. 信号覆盖度：排序/推荐的数据诚实性')
  const hasStars = plugins.filter((p) => typeof p.stars === 'number' && p.stars !== null).length
  const hasDownloads = plugins.filter((p) => typeof p.downloads === 'number' && p.downloads !== null).length
  const stars0 = plugins.filter((p) => p.stars === 0).length
  table(out, ['信号', '有值', '缺失', '结论'], [
    ['stars', `${hasStars} (${pct(hasStars, plugins.length)})`, `${plugins.length - hasStars}`, stars0 ? `含 ${stars0} 条明确为 0` : ''],
    ['最近30天下载量', `${hasDownloads} (${pct(hasDownloads, plugins.length)})`, plugins.length - hasDownloads, hasDownloads < plugins.length ? '缺失=无 npm 包，排序须避开"当作 0"' : ''],
  ])
  blank()
  out.lines.push(`> **风险**：downloads 缺失（${plugins.length - hasDownloads} 条）是"无 npm 包"而非"没人用"，排序/推荐不能把它当 0 处理。`)
  blank()

  // ---- 4. 同名碎片化（用户可发现性） ----
  title('4. 同名碎片化：显示名撞车')
  const byName = new Map()
  for (const p of plugins) {
    if (!byName.has(p.name)) byName.set(p.name, [])
    byName.get(p.name).push(p.owner)
  }
  const collisions = [...byName.entries()].filter(([, o]) => o.length > 1).sort((a, b) => b[1].length - a[1].length)
  table(out, ['显示名', '作者数', '作者'], collisions.slice(0, 15).map(([name, owners]) => [
    name, owners.length, owners.slice(0, 3).join(', ') + (owners.length > 3 ? ` +${owners.length - 3}` : ''),
  ]))
  blank()
  out.lines.push(`同名分组共 **${collisions.length}** 组；最严重：\`${collisions[0]?.[0]}\`（${collisions[0]?.[1].length} 作者）、\`${collisions[1]?.[0]}\`（${collisions[1]?.[1].length} 作者）。`)
  blank()

  // ---- 5. 弃用/替换 ----
  title('5. 弃用与替换')
  const deprecated = plugins.filter((p) => p.deprecated)
  if (deprecated.length === 0) {
    out.lines.push('目录中暂无 `deprecated` 标记条目。')
  } else {
    table(out, ['名称', '作者', '建议替换'], deprecated.map((p) => [p.name, p.owner, p.replacement ?? '—']))
  }
  blank()

  // ---- 6. 时效性 ----
  title('6. 时效性：发布时间分布')
  const bucketsAge = { '≤30天': 0, '31–90天': 0, '91–180天': 0, '181–365天': 0, '>1年': 0 }
  for (const p of plugins) {
    const d = new Date(p.added + 'T00:00:00Z').getTime()
    const days = Math.max(0, (ref - d) / 86_400_000)
    if (days <= 30) bucketsAge['≤30天']++
    else if (days <= 90) bucketsAge['31–90天']++
    else if (days <= 180) bucketsAge['91–180天']++
    else if (days <= 365) bucketsAge['181–365天']++
    else bucketsAge['>1年']++
  }
  table(out, ['距快照(2026-08-28)', '数量', '占比'], Object.entries(bucketsAge).map(([k, v]) => [k, v, pct(v, plugins.length)]))
  blank()

  // ---- 7. 撑门面：头部内容 ----
  title('7. 撑门面：头部内容')
  const byDownloads = plugins.filter((p) => typeof p.downloads === 'number').sort((a, b) => b.downloads - a.downloads).slice(0, 10)
  table(out, ['下载量', 'Star', '名称', '作者', '分类'], byDownloads.map((p) => [p.downloads ?? 0, p.stars ?? '—', p.name, p.owner, p.category]))
  blank()
  const byStars = plugins.filter((p) => typeof p.stars === 'number').sort((a, b) => b.stars - a.stars).slice(0, 10)
  table(out, ['Star', '下载量', '名称', '作者', '分类'], byStars.map((p) => [p.stars ?? 0, p.downloads ?? '—', p.name, p.owner, p.category]))
  blank()

  // ---- 8. 描述质量 ----
  title('8. 描述质量')
  let unlocalized = 0, short = 0, untranslated = 0
  for (const p of plugins) {
    const en = p.description?.en ?? ''
    const zh = p.description?.zh ?? ''
    if (en && zh && en === zh) untranslated++
    if (en.length < 20 || zh.length < 20) short++
    if (!en || !zh) unlocalized++
  }
  table(out, ['缺陷', '数量', '占比'], [
    ['缺 en 或 zh', unlocalized, pct(unlocalized, plugins.length)],
    ['en==zh（占位未译）', untranslated, pct(untranslated, plugins.length)],
    ['en 或 zh 过短(<20字)', short, pct(short, plugins.length)],
  ])
  blank()

  // ---- 9. 待修复优先级 ----
  title('9. 待修复优先级（可执行清单）')
  const fix = []
  const seen = new Set()
  const add = (p, reason) => {
    const k = p.owner + '/' + p.name + '|' + reason
    if (seen.has(k)) return
    seen.add(k)
    fix.push({ name: p.name, owner: p.owner, cat: p.category, reason, stars: p.stars ?? '—', downloads: p.downloads ?? '—' })
  }
  for (const p of plugins) {
    if (p.deprecated) add(p, '已弃用')
    if (p.npm === null && !p.tarball && /\/tree\//.test(p.url)) add(p, '子包未发布 npm/tarball')
    if ((typeof p.stars === 'number' && p.stars === 0) && p.downloads === null) add(p, '0 star 且无下载（疑似无人用）')
    if ((p.description?.en ?? '') === (p.description?.zh ?? '') && p.description?.en) add(p, 'en==zh 未译')
  }
  table(out, ['名称', '作者', '分类', '问题', 'star', '下载'], fix.slice(0, 30).map((r) => [r.name, r.owner, r.cat, r.reason, r.stars, r.downloads]))
  blank()
  out.lines.push('待修复条目合计：**' + fix.length + '**（去重后，按规则累计）。此清单不是要你修每一条——git-only + 0star 与 en==zh 是批量化信号，真正该动手的是把它们合并成策展动作。')
  blank()

  // ---- 总结 ----
  title('10. 一句话结论')
  out.lines.push(`目录规模健康（${plugins.length} 条 / ${categoryIds.length} 分类）、格式 gate 通过，但质量短板集中在三处：**安装体验风险面**（${pct(buckets.subpath + buckets.gitroot, plugins.length)} 只能从 GitHub 装）、**同名碎片化**（${collisions.length} 组撞车）、**数据信号缺口**（${pct(plugins.length - hasDownloads, plugins.length)} 条无下载量，${pct(plugins.length - hasStars, plugins.length)} 条无 star）。`)
  out.lines.push('')

  fs.writeFileSync(OUT, out.lines.join('\n'))

  // Console digest (short)
  console.log('quality-audit: ' + SNAPSHOT.replace(/\\/g, '/').replace(/.*\/plugins\//, ''))
  console.log(`  规模: ${plugins.length} 插件 / ${categoryIds.length} 分类 / 更新 ${updated}`)
  console.log(`  安装方式: npm ${buckets.npm} | release ${buckets.tarball} | subpath ${buckets.subpath} | gitroot ${buckets.gitroot}`)
  console.log(`  空分类(<10): ${thin.map((c) => c.id + '(' + c.n + ')').join(' ') || 'none'}`)
  console.log(`  信号: stars 缺失 ${plugins.length - hasStars} | downloads 缺失 ${plugins.length - hasDownloads}`)
  console.log(`  同名碎片: ${collisions.length} 组 | 弃用 ${deprecated.length} | 待修复 ${fix.length}`)
  console.log(`  报告: ${OUT}`)
}

function pct(n, total) {
  return total === 0 ? '0%' : ((n * 100) / total).toFixed(1) + '%'
}

main()
