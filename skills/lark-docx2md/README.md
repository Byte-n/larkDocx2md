# lark-docx2md

将飞书文档或电子表格链接转换为本地 Markdown 内容，供 AI 读取、分析与落地实现。

## 环境变量

```bash
export LARK_DOCX2MD_APP_ID="cli_xxx"
export LARK_DOCX2MD_APP_SECRET="xxx"
# 可选：限制未指定标题过滤时的最大 Markdown 输出行数
export LARK_DOCX2MD_MAX_OUTPUT_LINES="800"
```

- `LARK_DOCX2MD_APP_ID`：飞书自建应用 App ID（或 Key）
- `LARK_DOCX2MD_APP_SECRET`：飞书自建应用密钥
- `LARK_DOCX2MD_MAX_OUTPUT_LINES`：可选，正整数。未指定标题过滤时限制允许输出的最大 Markdown 行数，超过限制会报错并提示先获取标题、再补充标题过滤参数重试。

### 2. 应用权限与可见范围

- 飞书应用需具备访问目标文档/表格的权限。
- 目标文档需要对该应用可见（常见做法：把应用加入可访问范围，或将文档授权给应用）。

## 使用方式

例如提示词：‘分析 https://*.feishu.cn/wiki/* 文档中的订单管理章节的需求’
