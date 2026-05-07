---
name: release-version
description: Release a new version of this project following the standard release workflow (git check, changelog sync, version bump, commit, build). Use when the user asks to release a version, publish a new version, bump version, 发版, 发布版本, or cut a release.
---

# Release Version Workflow

严格按序执行，每步执行完简短反馈；需用户决策的节点（提交改动、确认版本号、同名分支复用）必须等待确认。

## 版本号规则

任何版本段（major/minor/patch）的十进制字符串含字符 `4` 即跳过。例：
- `0.3.3 → 0.3.5`、`0.3.9 → 0.5.0`、`0.13 → 0.15`、`0.39 → 0.50`、`3 → 5`

等级判定：`feat`/新 API → minor；`fix`/文档/测试 → patch；破坏性变更 → major。

## 流程

**1. 检查工作区**：`git status --porcelain`。有改动则建议 commit 命令（`feat`/`fix`/`docs`/`test`/`chore` + 中文简短描述）并询问是否提交。

**2. 汇总变更**：
```bash
git describe --tags --abbrev=0
git log <last-tag>..HEAD --oneline --no-decorate
```
按 Features / Changed / Fixed / Removed 分组，面向用户可见行为。

**3. 确定新版本号**：按上述规则计算，与用户确认。

**4. 切版本分支**：`git checkout -b release/v<版本>`。同名分支存在先确认；用 `git branch --show-current` 验证。

**5. 更新 CHANGELOG.md**：在 `# Changelog` 下方插入新段落，风格对齐已有版本：
```markdown
## <版本>

### Features
- **要点**：...
```
无该类变更则省略小节；中文描述；不写时间戳。

**6. 评估 README.md**：从本次 Features/Changed 中提取面向用户可见的功能点与新特性，对照 README.md 现有内容判断是否需要更新（如新增功能介绍、用法示例、配置项、CLI 参数、兼容性说明等）。
- 需更新：列出具体改动点并与用户确认后再修改。
- 无需更新（仅内部重构/测试/文档微调）：简短说明理由后跳过。

**7. 更新 package.json**：仅改 `"version"` 字段。

**8. 提交**：
```bash
git add CHANGELOG.md package.json README.md
git commit -m "release: <版本>"
```
（若 README.md 未改动则从 `git add` 中省略。）

**9. 构建**：`pnpm run build`。失败立即停止。

**10. 输出发布命令**（不自动执行）：
```bash
git push -u origin release/v<版本>
```
