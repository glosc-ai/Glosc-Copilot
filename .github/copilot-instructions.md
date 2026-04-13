---
applyTo: "**"
---

- 代码规范在 `/CodeStyle.md` 文件中有详细说明，请遵守其中的规范。
- 项目使用 [tauri 2.0](https://tauri.app/) ｜ [AI Elements Vue](https://www.ai-elements-vue.com/overview/introduction) ｜ [AI SDK](https://ai-sdk.dev/) 进行开发，请在修改时先阅读相关文档:
    - [相关API](https://tauri.app/zh-cn/reference/javascript/api/)
    - [官方插件](https://tauri.app/zh-cn/plugin/)
    - [AI Elements Vue 组件库](https://www.ai-elements-vue.com/components/chatbot/attachments)
    - [AI SDK 文档](https://ai-sdk.dev/docs/introduction)
- 尽量使用 TypeScript 来实现功能, 只有在确实无法实现 TypeScript 的情况下才使用 Rust.
- 每次修改完成后都需要运行 `yarn tauri build` 来检查是否有编译错误。
- 前端使用 [shadcn-vue](https://shadcn-vue.com/docs/components) 组件库，在编写前端时优先使用该组件库提供的组件来实现功能, 只有在确实无法实现的情况下才编写自定义组件.
- 在编写代码时, 请尽量添加中文注释来解释代码的功能和实现思路, 以便其他开发者能够更好地理解代码.
- 尽量用简洁的代码实现功能, 避免过于复杂的实现, 以提高代码的可读性和可维护性.
- 必要时, 在 `/docs` 目录下添加相关文档记录功能的实现细节和使用方法, 以便后续的查阅和使用.
- UI 风格使用简约现代紧凑的设计风格, 以提高用户体验和视觉效果,尽量避免冗余的介绍和过于复杂的设计, 以保持界面的清晰和易用性.
