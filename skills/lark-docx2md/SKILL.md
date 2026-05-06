---
name: lark-docx2md
description: 读取飞书 Wiki 文档或电子表格（`https://*.feishu.cn/wiki/...`、`https://*.feishu.cn/sheets/...`）内容。当需要读取、导入、归档、分析或处理飞书 wiki 或 sheets 链接的内容时使用。
---

# lark-docx2md

将飞书文档或电子表格 URL 转换为本地 Markdown 文件，命令标准输出包含文件绝对路径的提示词。

## 必要输入

- 飞书文档 URL，格式为 `https://*.feishu.cn/wiki/...` 或 `https://*.feishu.cn/sheets/...`（可带 `?sheet=xxx` 参数）

## 工作流程

1. 验证 URL 包含 `/wiki/` 或 `/sheets/`。
2. **必须**严格按以下命令调用，`--agent local` 参数不可省略：

```bash
npx -y lark-docx2md@latest dl --agent local "<wiki_url>"
```

> **注意**：缺少 `--agent local` 会导致输出格式不适合 AI 处理，必须保留该参数。

3. 捕获标准输出，从提示词中解析出 Markdown 文件的绝对路径。
4. 读取该绝对路径对应的 Markdown 文件，获得文档完整内容。

## 关联图片读取要求

- Markdown 文件中的图片以本地相对路径引用（如 `static/xxx.png`），画板内的图片同样如此。
- 读取 Markdown 后，**必须**一并读取其中引用的所有图片文件内容，以确保对文档的理解包含图片信息。

## 异常处理

- 如果 URL 格式无效，要求提供有效的 `https://*.feishu.cn/wiki/` 或 `https://*.feishu.cn/sheets/` 链接。
- 如果输出为空，报告所使用的命令并附上 stderr 关键信息。

## 响应风格

- 保持简洁、以执行为导向。
- 转换成功时附上准确的文件路径。
- 当用户输入不完整时，明确指出所做的假设。
