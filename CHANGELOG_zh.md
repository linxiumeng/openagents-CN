# 更新日志

OpenAgents 项目的所有重要变更将记录在此文件中。

## [未发布]

### 新增
- 在 Launcher 中实现工作空间删除功能（UI 和 IPC），支持删除本地配置和执行远程软删除。
- 为 `WorkspaceClient` 添加 `deleteWorkspace` 方法以处理后端软删除 API。
- 在 `AgentManager` 的 `loadCore` 中添加回退逻辑，开发时优先使用本地源 `agent-connector`，防止依赖缓存问题。

### 变更

### 修复
- 通过 Network ID 启动智能体时将使用发现服务器查找网络详情
