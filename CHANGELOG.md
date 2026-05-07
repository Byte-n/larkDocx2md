# Changelog

## 0.5.1

### Changed

- **`filterTitle` 无匹配时列出可用标题**：当 `--filter-title` / `ConvertOptions.filterTitle` 未在文档中找到对应标题时，错误信息附带文档中所有可用标题清单，便于快速定位与排错

## 0.5.0

### Features

- **按标题过滤文档内容**：新增 `--filter-title` CLI 参数与 `ConvertOptions.filterTitle` 选项，仅输出指定标题所在章节的内容

### Fixed

- **filterTitle 入参容错**：对 `filterTitle` 应用 `trim()`，避免空白字符导致匹配失败

## 0.3.2

### Changed

- **Agent local 提示词优化**：`--agent local` 模式的 stdout 输出改为 Markdown 格式命令式语句，文件路径使用行内代码标记，说明文字加粗强调

## 0.3.1

### Features

- **电子表格指定子表**：支持 `?sheet=<sheetId>` 查询参数，如 `https://*.feishu.cn/sheets/xxx?sheet=MJ9I17`，仅处理指定的单个工作表

### Changed

- **URL 解析增强**：`parseWikiUrl` 新增解析 `?sheet=` 查询参数，返回 `sheetId`
- **Serializer 上下文扩展**：新增 `SerializeOptions` 接口与 `SerializeContext.sourceType` 字段，序列化器可感知文档来源类型
- **移除 `showTitle` 字段**：`sheetResolved` 节点不再使用 `showTitle`，改为根据 `ctx.sourceType === 'sheet'` 和子表数量判断是否输出标题

## 0.3.0

### Features

- **电子表格（Sheet）支持**：新增独立电子表格链接（`https://*.feishu.cn/sheets/*`）和文档内嵌电子表格块的解析与渲染，自动读取所有工作表并输出为 Markdown 表格
- **Agent local 模式**：`--agent` 参数新增 `local` 值（`--agent local`），图片/画板/Markdown 均落盘，stdout 输出引导 AI 读取的提示词，适配本地 Agent 场景
- **CLI `dl` 别名**：`download` 命令新增 `dl` 短别名

### Changed

- **电子表格解析重构**：新增 `src/sheet/index.ts` 模块，提供 `cellToMd`、`expandMerges`、`trimTrailingEmpty`、`columnIndexToLetter` 等工具函数；Transformer 按文档来源（`docx` / `sheet`）区分处理逻辑
- **URL 解析扩展**：`parseWikiUrl` 支持 `sheets` 类型链接
- **Client API 扩展**：新增 `getSpreadsheetInfo`、`listSheets`、`getSheetMeta`、`readSheetValues` 方法
- **AST 节点扩展**：新增 `sheet`、`sheetResolved` 块级节点类型
- **Agent 类型变更**：`ConvertOptions.agent` 类型由 `boolean` 扩展为 `boolean | 'local'`

## 0.2.0

### Features

- **画板（Whiteboard）支持**：完整支持飞书画板内容渲染，提供 4 种输出格式（`base64`、`inline-svg`、`svg`、`yaml`），详见 [WHITEBOARD.md](./WHITEBOARD.md)
- **Converter 公共 API**：新增 `src/converter.ts`，导出 `convert()` 函数，支持作为库编程调用
- **CLI 画板参数**：新增 `--wb-format`、`--wb-bg`、`--wb-image-mode` 选项
- **环境变量支持**：所有 CLI 参数均支持环境变量配置（如 `LARK_DOCX2MD_APP_ID`、`LARK_DOCX2MD_WB_FORMAT` 等）
- **Agent 模式联动**：`--agent` 开启时自动强制 `image-mode=online`、`wb-format=yaml`，适配 AI 场景

### Changed

- **架构重构**：将单文件解析器 `parser.ts` 重构为 Parser → Transformer → Serializer 三阶段 AST 管线，支持灵活扩展
- **类型统一**：API 类型定义从 `client.ts` 抽取至独立 `types.ts`
- **npm 入口**：`package.json` main 由 `./dist/cli.js` 改为 `./dist/converter.js`

### Removed

- 删除旧 `src/parser.ts`，由 AST 管线完全替代
