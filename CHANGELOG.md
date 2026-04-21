# Changelog

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
