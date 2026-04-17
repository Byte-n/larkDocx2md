---
name: lark-docx2md
description: 读取飞书 Wiki 文档（`https://*.feishu.cn/wiki/...`）内容。当需要读取、导入、归档、分析或处理 `https://*.feishu.cn/wiki/` 链接的内容时使用。
---

# lark-docx2md

将飞书文档 URL 转换为带在线图片链接的 Markdown 内容，直接输出到标准流，供后续 AI 处理。

## 必要输入

- 飞书文档 URL，格式为 `https://*.feishu.cn/wiki/...`

## 工作流程

1. 验证 URL 包含 `/wiki/`。
2. **必须**严格按以下命令调用，`--agent` 参数不可省略：

```bash
npx -y lark-docx2md@latest download --agent "<wiki_url>"
```

> **注意**：缺少 `--agent` 会导致输出格式不适合 AI 处理，务必保留该参数。

3. 捕获标准输出，即包含在线图片 URL 的完整 Markdown 内容。

## 异常处理

- 如果 URL 格式无效，要求提供有效的 `https://*.feishu.cn/wiki/` 链接。
- 如果输出为空，报告所使用的命令并附上 stderr 关键信息。

## 响应风格

- 保持简洁、以执行为导向。
- 转换成功时附上准确的文件路径。
- 当用户输入不完整时，明确指出所做的假设。
