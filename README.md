# Feishu Style Editor

为 Obsidian 增加飞书风格的文档编辑能力，同时保留完整的 Obsidian Markdown 语法。

## 功能

- **斜杠命令**：在正文中键入 `/` 弹出块菜单，可快速插入标题、列表、任务、引用、代码块、标注、表格等，并支持按关键字过滤。
- **行前 `+` 编辑框**：光标所在行左侧会显示一个 `+` 号，点击即可插入或转换块。
- **悬浮工具栏**：选中文本后弹出悬浮工具栏，可加粗、斜体、删除线、行内代码、高亮与链接。

以上功能均可在插件设置中分别开关。

## 使用

1. 在 Markdown 编辑视图（实时预览或源码模式）中直接键入 `/`。
2. 用方向键或鼠标在菜单中移动，`Enter` 确认、`Esc` 关闭。
3. 将光标移到任意行，点击行前 `+` 号插入块。
4. 选中一段文本，使用悬浮工具栏快速排版。

## 开发

```bash
pnpm install
pnpm run dev         # 开发模式（监听）
pnpm run build       # 构建 production
pnpm run lint        # ESLint
pnpm run deploy:test # 一键部署到 Test/ vault
```

## License

MIT
