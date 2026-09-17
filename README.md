# Feishu Style Editor

为 Obsidian 增加飞书风格的文档编辑能力，同时保留完整的 Obsidian Markdown 语法。

## 功能

- **斜杠命令**：在行首或空格后键入 `/` 弹出块菜单，可插入或转换标题、列表、任务、引用、标注、代码块、公式、表格、分割线，并支持按关键字过滤。
  - `↑` `↓` 移动选择，`Enter` 确认，`Esc` 关闭并撤销已输入的 `/`。
  - 行中间（如 URL、`and/or`）的 `/` 不会被拦截，仍是普通字符。
- **悬浮工具栏**：选中文本后弹出工具栏，可加粗、斜体、删除线、行内代码、高亮、链接。
- **行前 `+` 手柄**：光标所在行左侧显示 `+`，点击即可插入或转换块。
  - 空行直接写入块标记；有内容的行就地转换（如 `正文` → `# 正文`）；行内选中文本会随块一起移动。

上述功能均可在插件设置中分别开关。

![块菜单](screenshot-block-menu.png)

## 使用

1. 在 Markdown 编辑视图（实时预览或源码模式）中，把光标放到行首或空格后，键入 `/`。
2. 用方向键或鼠标在菜单中移动，`Enter` 确认、`Esc` 关闭。
3. 将光标移到任意行，点击行前 `+` 手柄插入或转换块。
4. 选中一段文本，使用悬浮工具栏快速排版。

## 开发

```bash
pnpm install
pnpm run dev         # 开发模式（监听）
pnpm run build       # 构建 production
pnpm run lint        # ESLint
pnpm run deploy:test # 部署到 Test/ vault
pnpm run verify:live # 对运行中的 Obsidian 做端到端验证
```

### 真机验证

`verify-live.sh` 通过 Obsidian CLI 与 Chrome DevTools Protocol 驱动真实运行的应用，覆盖斜杠菜单、过滤与执行、转义撤销、方向键选择、悬浮工具栏、`+` 手柄与设置持久化：

```bash
pnpm run build && pnpm run deploy:test
# 让 Test vault 处于前台后
pnpm run verify:live
```

脚本会把按键事件派发到目标编辑器自身的 DOM，而不是走操作系统键盘队列，避免与正在使用该窗口的人抢占输入。

## License

MIT
