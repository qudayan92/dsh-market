#!/usr/bin/env node
/**
 * Curation export — pulls the precise entry-level data the upstream PR plan
 * needs out of data/registry-snapshot.json. The quality audit tells you the
 * SHAPE of the problem; this tool gives you the NAMES.
 *
 * Three workstreams, one markdown file:
 *   WS-1  empty categories (identity / agi) — reclassification candidates
 *   WS-2  display-name collisions — every group, with owners and repos
 *   WS-3  monorepo subpath entries not published to npm and with no release
 *         tarball — the slowest, most fragile installs to upstream
 *
 * Output: data/curation-export.md (referenced by UPSTREAM-CURATION-PLAN.md).
 */

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const SNAPSHOT = fileURLToPath(new URL('../data/registry-snapshot.json', import.meta.url))
const OUT = fileURLToPath(new URL('../data/curation-export.md', import.meta.url))

const raw = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
const plugins = raw.plugins
const meta = raw.categories || {}

const L = []
const push = (s) => L.push(s)
const table = (headers, rows) => {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)))
  push('| ' + headers.map((h, i) => h.padEnd(w[i])).join(' | ') + ' |')
  push('| ' + w.map((x) => '-'.repeat(x)).join(' | ') + ' |')
  for (const r of rows) push('| ' + r.map((v, i) => String(v).padEnd(w[i])).join(' | ') + ' |')
}

// WS-1: keep only HIGH-PRECISION candidates. A plugin is a candidate only when
// its NAME itself carries the category's hall of a distinctive keyword — a
// description-only hit is too noisy (auth/planning/architecture occur all over).
// These are still "review before you believe", but the list stays small enough
// that per-entry judgement is realistic.
const IDENTITY_NAME_KEYS = ['weixin', 'feishu', 'lark', 'telegram', 'whatsapp', 'discord', 'slack', 'identity', 'sso', 'oauth', 'wechat', 'contact', '微信', '飞书', '企微', '钉钉', 'qq']
const AGI_NAME_KEYS = ['agi', 'multi-agent', 'multiagent', 'orchestr', 'moe', 'agent-frame', 'agent-framework', '智能体', '多智能体', '架构']

const nameMatch = (p, keys) => {
  const n = (p.name || '').toLowerCase()
  return keys.filter((k) => n.includes(k))
}

const idCand = plugins
  .filter((p) => p.category !== 'identity')
  .map((p) => ({ p, why: nameMatch(p, IDENTITY_NAME_KEYS) }))
  .filter((x) => x.why.length > 0)
const agiCand = plugins
  .filter((p) => p.category !== 'agi')
  .map((p) => ({ p, why: nameMatch(p, AGI_NAME_KEYS) }))
  .filter((x) => x.why.length > 0)

// WS-2
const byName = new Map()
for (const p of plugins) {
  if (!byName.has(p.name)) byName.set(p.name, [])
  byName.get(p.name).push(p)
}
const collisions = [...byName.entries()].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length)

// WS-3
const subpathUnpub = plugins.filter((p) => !p.npm && !p.tarball && /\/tree\//.test(p.url))

push('# 目录策展导出（精确条目清单）')
push('')
push(`数据源 \`data/registry-snapshot.json\`（更新 ${raw.updated}，共 ${plugins.length} 条）。本文件只列**需要上游动作的具体条目**，供 \`UPSTREAM-CURATION-PLAN.md\` 引用。`)
push('')

// ---- WS-1 ----
push('## WS-1 · 空分类补内容：重归类候选')
push('')
push(`### 身份与通信 / identity（当前 ${plugins.filter((p) => p.category === 'identity').length} 条）`)
push('')
push('按"微信/飞书/lark/telegram/auth/sso/身份"等关键词命中的**其它分类**插件候选，把它们移入 `identity` 可填充空分类（每条需人工确认，因为关键词可能误伤）：')
push('')
table(['名称', '作者', '现分类', '命中关键词'], idCand.slice(0, 25).map(({ p, why }) => [p.name, p.owner, p.category, why]))
if (idCand.length > 25) push(`… 另 ${idCand.length - 25} 条候选见下（共 ${idCand.length} 条）。`)
push('')
push(`### AGI 架构探索 / agi（当前 ${plugins.filter((p) => p.category === 'agi').length} 条）`)
push('')
push('候选（multi-agent / orchestration / 架构 / 自主等关键词命中）：')
push('')
table(['名称', '作者', '现分类', '命中关键词'], agiCand.slice(0, 25).map(({ p, why }) => [p.name, p.owner, p.category, why]))
if (agiCand.length > 25) push(`… 另 ${agiCand.length - 25} 条候选（共 ${agiCand.length} 条）。`)
push('')

// ---- WS-2 ----
push('## WS-2 · 同名碎片化：全部撞车分组')
push('')
push(`共 **${collisions.length}** 组。以下按作者数降序。`)
push('')
table(['显示名', '作者数', '作者/仓库'], collisions.map(([name, v]) => [
  name,
  v.length,
  v.map((q) => `${q.owner}(${q.url.replace('https://github.com/', '').split('/tree/')[0]})`).slice(0, 3).join(', ') + (v.length > 3 ? ` +${v.length - 3}` : ''),
]))
push('')

// ---- WS-3 ----
push(`## WS-3 · 子包未发布 npm/tarball（全部 ${subpathUnpub.length} 条）`)
push('')
push('这些条目指向 monorepo 子目录，但既没发 npm 也没给 Release tarball——安装只能走 git 源码 + `#path:`，是最慢/最脆的一批。上游动作：催作者发布，或给 `tarball` 指向预构建归档；若二者都做不到且不常用，考虑降级展示。')
push('')
push('暴露源列表（可用于向作者/上游提出修改）：')
push('')
table(['子包路径(仓库#子目录)', '名称', 'star', '说明'], subpathUnpub.map((p) => [
  p.url.replace('https://github.com/', '').replace('/tree/', '#'),
  p.name,
  p.stars ?? '—',
  p.npm ? '' : '无npm',
]))
push('')

fs.writeFileSync(OUT, L.join('\n'))
console.log('curation-export: ' + OUT)
console.log(`  WS-1 identity 候选 ${idCand.length} | agi 候选 ${agiCand.length}`)
console.log(`  WS-2 同名分组 ${collisions.length}`)
console.log(`  WS-3 子包未发布 ${subpathUnpub.length}`)
