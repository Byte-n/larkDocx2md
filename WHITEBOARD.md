# 画板支持说明

本工具支持将飞书画板（Whiteboard）转换为四种输出格式：

| 格式 | 嵌入方式 | 说明 |
|------|---------|------|
| `base64` | 内嵌 | 将 SVG 转为 base64 data URI，以图片形式嵌入 Markdown |
| `inline-svg` | 内嵌 | 将 SVG 标签直接写入 Markdown |
| `svg` | 独立文件 | 将 SVG 保存到 `static/` 目录，Markdown 中使用相对路径引用（默认） |
| `yaml` | 内嵌 | 生成 AI 友好的结构化 YAML 代码块 |

通过 `--wb-format` 参数选择输出格式（默认 `svg`）。

## 支持的画板节点类型

| 节点类型 | 说明 |
|---------|------|
| `composite_shape` | 组合图形（矩形、圆角矩形、椭圆、菱形、三角形、五边形、六边形、八边形、星形、平行四边形等 20+ 种子形状） |
| `connector` | 连接线（直线、折线、曲线；支持起止箭头样式） |
| `table` | 表格（支持行列合并、单元格文本渲染） |
| `mind_map` | 思维导图（支持多级节点、多种节点形状） |
| `text_shape` | 文本框 |
| `image` | 图片 |
| `group` | 分组容器 |
| `sticky_note` | 便签 |
| `section` | 区域框（带可选标题） |
| `paint` | 画笔/涂鸦（marker、highlight） |
| `svg` | 内嵌 SVG 节点 |

## 支持的图形子类型（composite_shape）

以下为 `composite_shape` 节点支持的 `type` 值：

- `rect` / `predefined_process` / `condition_shape` / `condition_shape2`
- `round_rect` / `flow_chart_round_rect` / `data_flow_round_rect` / `mind_node_round_rect`
- `round_rect2` / `flow_chart_round_rect2` / `mind_node_full_round_rect`
- `ellipse` / `data_flow_ellipse` / `state_start` / `state_end`
- `diamond` / `flow_chart_diamond`
- `triangle`
- `right_triangle`
- `hexagon` / `flow_chart_hexagon`
- `pentagon`
- `octagon`
- `star` / `star2` / `star3` / `star4`
- `parallelogram` / `flow_chart_parallelogram`

未识别的形状类型会使用圆角矩形作为 fallback。

## 画板图片模式（--wb-image-mode）

| 模式 | 说明 |
|------|------|
| `base64` | 将图片转为 base64 内嵌到 SVG 中 |
| `online` | 使用飞书 24h 临时在线链接 |
| `local` | 下载图片到本地输出目录（默认） |
