---
name: lark-docx2md
description: 读取飞书 Wiki 文档或电子表格（`https://*.feishu.cn/wiki/...`、`https://*.feishu.cn/sheets/...`）内容。当需要读取、导入、归档、分析或处理飞书 wiki 或 sheets 链接的内容时使用。
metadata:
  pattern: tool-wrapper
  version: "1.0.0"
---

# lark-docx2md

将飞书文档或电子表格 URL 转换为本地 Markdown 文件。

## 适用范围

- 适用链接类型：`https://*.feishu.cn/{wiki,docx,docs,sheets}/...`（含 `?sheet=xxx`）。
- 适用任务类型：读取、导入、归档、分析、抽取飞书文档内容，并提供给后续实现或生成任务使用。
- `wiki/docx/docs`：支持整篇读取与按标题/章节定向读取。
- `sheets`：默认按整表读取，不做标题筛选。
- 不适用于：非飞书链接、纯本地文件解析、需要直接写回飞书文档的场景。

## 工作流程

### 第一步：识别链接类型（必须先做）

- 若 URL 含 `/sheets/`：判定为电子表格。
- 若 URL 含 `/wiki/`、`/docx/`、`/docs/`：判定为文档。

### 第二步：按类型分支处理

#### A. 电子表格（`/sheets/`）

电子表格不做标题识别，直接下载整表：

```bash
npx -y lark-docx2md@latest dl --agent local --url "<url>"
```

#### B. 文档（`/wiki/`、`/docx/`、`/docs/`）

1. 先从用户请求中识别 `title`：

    1. 显式关键词「标题/章节/小节/部分/节选/只要/其中的」+ 名词短语。
    2. 成对引号 `""` `''` `“”` `‘’` `「」` `《》` 包裹的短文本。
    3. 介词结构：`X 中的 Y`、`X 里的 Y`、`X 那一段`、`关于 X 的内容`。
    4. 多级路径：`A 下/中/里的 B`、`A > B`、`A／B`、`A → B` → 取为有序路径 `[A, B, ...]`。

   **抽到的标题文本：去首尾空白与包裹引号；保留原文大小写、标点、空格、中英文；不翻译/改写/补全。**

2. 如果成功识别到 `title`，则需要进一步获取 `<blockId>`：

```bash
npx -y lark-docx2md@latest get-titles --agent local --url "<url>"
```

根据 `get-titles` 输出的所有标题信息，匹配 `title` 获取对应的 `<blockId>`。若没有明确的匹配项或存在多个匹配项，则必须让用户参与决策。

3. 根据识别结果查询：

**有 `<blockId>`：**

```bash
npx -y lark-docx2md@latest dl --agent local --filter-title-block-id "<blockId>" --url "<url>"
```

**无 `<blockId>`：**

```bash
npx -y lark-docx2md@latest dl --agent local --url "<url>"
```

### 读取结果

从 `dl` 的 stdout 解析 Markdown 绝对路径并读取该文件；同时**必须**读取其中引用的所有图片（含画板内图片，路径形如 `static/xxx.png`）。

## 重要事项

- `dl` 必须带 `--agent local`；`get-titles` 必须带 `--agent local`。
