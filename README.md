# larkDocx2md

[![NPM version](https://img.shields.io/npm/v/lark-docx2md.svg?style=flat)](https://npmjs.org/package/lark-docx2md)

将飞书文档转换为 Markdown 文件的命令行工具。

> 支持的飞书文档链接格式：https://*.feishu.cn/wiki/*

## 使用

> 命令所需权限见下 ‘飞书自创应用需要的权限’

```bash
npx -y lark-docx2md@latest download https://xxx.feishu.cn/wiki/xxx --app-id cli_xxx --app-secret xxxx
```

或先设置环境变量（命令行参数可省略）：

```bash
export LARK_DOCX2MD_APP_ID=<APP_ID>
export LARK_DOCX2MD_APP_SECRET=<APP_SECRET>
npx -y lark-docx2md@latest download <url>
```

| 参数                       | 说明                                        | 环境变量                         | 默认值                   |
|--------------------------|-------------------------------------------|------------------------------|-----------------------|
| `<url>`                  | 飞书文档链接（`https://*.feishu.cn/wiki/*`）      | —                            | —                     |
| `--app-id <id>`          | 飞书应用 App ID                               | `LARK_DOCX2MD_APP_ID`        | —                     |
| `--app-secret <secret>`  | 飞书应用 App Secret                           | `LARK_DOCX2MD_APP_SECRET`    | —                     |
| `-o, --output <dir>`     | 输出目录                                      | `LARK_DOCX2MD_OUTPUT`        | `./larkDocx2mdOutput` |
| `--agent`                | Agent 模式：日志 ERROR，Markdown 输出到 stdout     | `LARK_DOCX2MD_AGENT=true`    | `false`               |
| `--image-mode <mode>`    | 图片处理模式：`local`（下载到本地）或 `online`（24h 临时链接） | `LARK_DOCX2MD_IMAGE_MODE`    | `local`               |
| `--wb-format <format>`   | 画板输出格式：`base64`、`inline-svg`、`svg`、`yaml` | `LARK_DOCX2MD_WB_FORMAT`     | `svg`                 |
| `--wb-bg <style>`        | 画板 SVG 背景：`none`、`dot` 或颜色值如 `#fff`       | `LARK_DOCX2MD_WB_BG`         | `none`                |
| `--wb-image-mode <mode>` | 画板图片模式：`online`、`base64` 或 `local`        | `LARK_DOCX2MD_WB_IMAGE_MODE` | `local`               |

> **参数联动规则**
>
> - `--agent` 开启时：`--image-mode` 强制为 `online`，`--wb-image-mode` 强制为 `online`，`--wb-format` 默认为 `yaml`（仅允许
    `inline-svg` / `yaml`）。
> - `--wb-format yaml` 时：`--wb-image-mode` 强制为 `online`。


**`--agent` 开启时，飞书文档转换后的内容会直接通过标准流输出**

## 功能

- 支持飞书 Wiki 文档下载
- 转换 20+ 种块类型
- 输出标准 Markdown 文件
- 支持飞书画板，输出格式：`base64`（data URI 内嵌）、`inline-svg`（SVG 标签内嵌）、`svg`（独立文件）、`yaml`（AI
  友好结构化数据）。详见 [画板支持说明](./WHITEBOARD.md)

### 支持的内容块类型

| 块类型                 | 说明      | Markdown 输出                |
|---------------------|---------|----------------------------|
| Page                | 页面      | `# 标题` + 子块                |
| Text                | 文本段落    | 纯文本                        |
| Heading1 ~ Heading9 | 1-9 级标题 | `## ~ #########`           |
| Bullet              | 无序列表    | `- 内容`（支持嵌套）               |
| Ordered             | 有序列表    | `1. 内容`（自动计算序号）            |
| Code                | 代码块     | ` ```lang ``` `（支持 67 种语言） |
| Quote               | 引用      | `> 内容`                     |
| Equation            | 公式      | `$$ 公式 $$`                 |
| Todo                | 待办事项    | `- [x]` / `- [ ]`          |
| Callout             | 高亮块     | `>[!TIP]` + 子块             |
| Divider             | 分割线     | `---`                      |
| Image               | 图片      | `![图片](url)`               |
| Table / TableCell   | 表格      | `<table>` HTML（支持合并单元格）    |
| QuoteContainer      | 引用容器    | `> 子块内容`                   |
| Grid / GridColumn   | 分栏布局    | 展平为子块内容                    |

### 支持的行内样式

| 样式   | Markdown 输出 |
|------|-------------|
| 加粗   | `**文本**`    |
| 斜体   | `_文本_`      |
| 删除线  | `~~文本~~`    |
| 下划线  | `<u>文本</u>` |
| 行内代码 | `` `代码` ``  |
| 链接   | `[文本](url)` |
| 行内公式 | `$公式$`      |
| @用户  | 用户 ID       |
| @文档  | `[标题](url)` |

> 未支持的块类型（如文件附件、视频、内嵌表格等）会被静默忽略。

## 开发

```bash
# 直接运行（无需构建）
pnpm dev download --app-id <APP_ID> --app-secret <APP_SECRET> <url>

# 或使用环境变量
LARK_DOCX2MD_APP_ID=<APP_ID> LARK_DOCX2MD_APP_SECRET=<APP_SECRET> pnpm dev download <url>

# 构建为 JS
pnpm build
```

## 飞书自创应用需要的权限

使用飞书开发平台的权限管理-批量导入/导出权限 导入下面的配置即可。

```json
{
  "scopes": {
    "tenant": [
      "base:app:read",
      "bitable:app",
      "bitable:app:readonly",
      "board:whiteboard:node:read",
      "contact:user.employee_id:readonly",
      "docs:document.media:download",
      "docx:document",
      "docx:document:readonly",
      "wiki:node:read",
      "wiki:wiki",
      "wiki:wiki:readonly"
    ],
    "user": []
  }
}
```

## License

ISC

## 🙏 致谢

本项目开发过程中获得了 [LINUX DO](https://linux.do/latest) 社区佬友的帮助，本产品会在社区发布，感谢社区的支持。
