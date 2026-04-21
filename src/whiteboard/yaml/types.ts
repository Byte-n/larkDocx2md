// ─── YAML Output Types ──────────────────────────────────────────────────────

/** YAML 节点的通用结构 */
export interface YamlNode {
  id?: string;
  type?: string;
  /** 节点文本内容 */
  text?: string;
  /** 形状类型（composite_shape 专用） */
  shape?: string;

  // ─── Image ───
  /** 图片 token（后处理阶段替换为最终 URL） */
  token?: string;

  // ─── Connector ───
  from?: string;
  to?: string;
  connector_shape?: string;
  label?: string;
  start_arrow?: string;
  end_arrow?: string;

  // ─── Group / Section ───
  title?: string;
  children?: YamlNode[];

  // ─── Table ───
  rows?: number;
  cols?: number;
  cells?: YamlTableCell[];

  // ─── Mind Map ───
  mind_map?: YamlMindMapNode;

  // ─── Sticky Note ───
  /** sticky_note 专用：背景色 */
  color?: string;

  // ─── 通用：额外属性 ───
  [key: string]: unknown;
}

export interface YamlTableCell {
  row: number;
  col: number;
  text?: string;
  row_span?: number;
  col_span?: number;
  children?: YamlNode[];
}

export interface YamlMindMapNode {
  id?: string;
  text?: string;
  children?: YamlMindMapNode[];
}

/** whiteboardNodesToYaml 的返回值 */
export interface YamlWhiteboardResult {
  /** 序列化后的 YAML 字符串 */
  yaml: string;
  /** 画板中所有图片 token（需后处理替换） */
  imageTokens: string[];
}
