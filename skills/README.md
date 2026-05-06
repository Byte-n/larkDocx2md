# lark-docx2md 技能说明

以 Markdown 格式读取飞书链接（`https://xxx.feishu.cn/wiki/xxx` 格式）的内容 

## 环境变量配置

```shell
export LARK_DOCX2MD_APP_ID="cli_xxx"
export LARK_DOCX2MD_APP_SECRET="xxx" 
```

- `APIFOX_ACCESS_TOKEN` 飞书自建应用的 key
- `APIFOX_PROJECT_MAP` 飞书自建应用的 密钥



## 使用方式

- 直接使用：

例如： ‘根据 https://xxx.feishu.cn/wiki/xxx 文档实现 xxx’ ，AI 就会自动调用此技能。

- 集成到 提升词 / 规范 / Skill 中：

```md
# 搜索表单生成规范

此规范用于生成符合项目规范的搜索表单

## 前置要求（CRITICAL）

1. **上下文中必须包含「需求文档」，若缺少则立即停止，并要求用户补充**
2. **必须先通过 lark-docx2md 技能读取「需求文档」内容并获取表单字段**
3. **...其他要求**

> 「文档」/ 「飞书文档」都等价视为「需求文档」

**缺少「需求文档」时，必须使用 AskUserQuestion 工具主动询问用户**

---

... 生成规范

```


