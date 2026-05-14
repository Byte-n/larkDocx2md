---
name: lark-docx2md
description: 读取飞书 Wiki 文档或电子表格（`https://*.feishu.cn/wiki/...`、`https://*.feishu.cn/sheets/...`）内容。当需要读取、导入、归档、分析或处理飞书 wiki 或 sheets 链接的内容时使用。
---

# lark-docx2md

将飞书文档或电子表格 URL 转换为本地 Markdown 文件。

## 输入

- **URL**（必填）：`https://*.feishu.cn/{wiki,docx,docs,sheets}/...`，可带 `?sheet=xxx`。
- **标题**（可选，仅 `wiki/docx/docs` 适用；`sheets` 跳过）：用户想要的某一章节。按以下规则识别，命中即视为指定：
  1. 显式关键词「标题/章节/小节/部分/节选/只要/其中的」+ 名词短语。
  2. 成对引号 `""` `''` `“”` `‘’` `「」` `《》` 包裹的短文本。
  3. 介词结构：`X 中的 Y`、`X 里的 Y`、`X 那一段`、`关于 X 的内容`。
  4. 多级路径：`A 下/中/里的 B`、`A > B`、`A／B`、`A → B` → 取为有序路径 `[A, B, ...]`。
  5. 用户要求「完整/全部/整篇」或无法稳定抽取 → **不指定**。

  抽到的标题文本：去首尾空白与包裹引号；保留原文大小写、标点、空格、中英文；不翻译/改写/补全。

## 工作流程

### sheets 或未指定标题

URL 含 `/sheets/`，或 docx/wiki 下未识别出标题，直接：

```bash
npx -y lark-docx2md@latest dl --agent local "<url>"
```

### docx/wiki 且指定标题（三步）

1. 取标题表：

   ```bash
   npx -y lark-docx2md@latest get-titles --agent local "<url>"
   ```

2. 匹配标题并获取 `blockId`：
   - 单标题：找 `text === <title>`。唯一直接用；多候选用上下文（父节点关键词）消歧。
   - 同父级同名兄弟：按同父节点下 children 的出现顺序列出全部候选，附上下文提示回问用户选择。
   - 无候选：报告并展示可用标题。

3. 用 `blockId` 下载：

   ```bash
   npx -y lark-docx2md@latest dl --agent local --filter-title-block-id "<blockId>" "<url>"
   ```

### 读取结果

从 `dl` 的 stdout 解析 Markdown 绝对路径并读取该文件；同时**必须**读取其中引用的所有图片（含画板内图片，路径形如 `static/xxx.png`）。

## 约束

- `dl` 必须带 `--agent local`；`get-titles` 必须带 `--agent`。
