# lark-docx2md

将飞书文档或电子表格链接转换为本地 Markdown 内容，供 AI 读取、分析与落地实现。

## 能力范围

- 支持链接：
  - `https://*.feishu.cn/wiki/...`
  - `https://*.feishu.cn/docx/...`
  - `https://*.feishu.cn/docs/...`
  - `https://*.feishu.cn/sheets/...`（可带 `?sheet=xxx`）
- 支持整篇下载，也支持按“标题/章节”精准下载（`wiki/docx/docs`）。
- 下载后可读取 Markdown 及其引用图片（含 `static/*.png` 等资源）。

## 前置条件

### 1. 环境变量

```bash
export LARK_DOCX2MD_APP_ID="cli_xxx"
export LARK_DOCX2MD_APP_SECRET="xxx"
```

- `LARK_DOCX2MD_APP_ID`：飞书自建应用 App ID（或 Key）
- `LARK_DOCX2MD_APP_SECRET`：飞书自建应用密钥

### 2. 应用权限与可见范围

- 飞书应用需具备访问目标文档/表格的权限。
- 目标文档需要对该应用可见（常见做法：把应用加入可访问范围，或将文档授权给应用）。

## 使用方式

当用户输入包含飞书链接的需求时，技能会按以下流程自动执行。

### 场景 A：`/sheets/` 链接或未指定标题

直接下载整份内容：

```bash
npx -y lark-docx2md@latest dl --agent local --url "<url>"
```

### 场景 B：`wiki/docx/docs` 且指定了标题

1. 获取标题列表：

```bash
npx -y lark-docx2md@latest get-titles --agent local --url "<url>"
```

2. 匹配目标标题，拿到 `blockId`。
3. 按标题块下载：

```bash
npx -y lark-docx2md@latest dl --agent local --filter-title-block-id "<blockId>" --url "<url>"
```

## 标题识别规则（给调用方）

以下表达会被识别为“只取某章节”：

- 显式关键词：`标题/章节/小节/部分/节选/只要/其中的 ...`
- 引号包裹：`"xxx"`、`“xxx”`、`《xxx》` 等
- 介词结构：`X 中的 Y`、`关于 X 的内容`
- 多级路径：`A > B`、`A/ B`、`A → B`

以下情况会回退为整篇下载：

- 用户明确说“完整/全部/整篇”
- 无法稳定抽取到明确标题

## 最小示例

- 整篇读取：
  - `根据 https://xxx.feishu.cn/wiki/abc123 输出实现方案`
- 指定章节读取：
  - `基于 https://xxx.feishu.cn/docx/abc123 里“接口定义”这一节生成 TypeScript 类型`
- 读取表格：
  - `分析 https://xxx.feishu.cn/sheets/abc123?sheet=xxx 并生成数据字典`

## 常见问题

- 报权限/401/403：
  - 检查 `LARK_DOCX2MD_APP_ID`、`LARK_DOCX2MD_APP_SECRET` 是否正确。
  - 检查飞书应用是否有文档访问权限，文档是否对应用可见。
- 指定标题没命中：
  - 先执行 `get-titles` 查看可用标题，再按准确文案重试。
- 命令可执行但无内容：
  - 确认链接可在当前账号/应用上下文访问，且不是失效分享链接。

## 备注

- `dl` 与 `get-titles` 均需带 `--agent local`。
- 本技能重点是“读取并结构化飞书内容”，不负责业务语义正确性校验。
