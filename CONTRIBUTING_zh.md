# 为 OpenAgents 贡献

感谢你有兴趣为 OpenAgents 做贡献！本文档提供了帮助你高效贡献的指南和说明。

## 目录
- [行为准则](#行为准则)
- [快速开始](#快速开始)
- [如何贡献](#如何贡献)
  - [报告 Bug](#报告-bug)
  - [建议功能](#建议功能)
  - [提交 Pull Request](#提交-pull-request)
- [开发工作流](#开发工作流)
- [编码规范](#编码规范)
- [测试](#测试)
- [文档](#文档)
- [社区](#社区)

## 行为准则

参与本项目即表示你同意遵守我们的[行为准则](CODE_OF_CONDUCT.md)。请在贡献前阅读。

## 快速开始

1. **Fork 仓库**：在 GitHub 上 fork 本项目。
2. **克隆到本地**：
   ```bash
   git clone https://github.com/YOUR-USERNAME/openagents.git
   cd openagents
   ```
3. **搭建开发环境**：
   ```bash
   # 安装依赖
   pip install -e ".[dev]"
   ```
4. **创建分支**：
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 如何贡献

### 报告 Bug

如果你发现了 Bug，请在我们的 GitHub 仓库创建 Issue 进行报告。提交 Bug 报告时请包含：

- 清晰、描述性的标题
- 复现步骤
- 预期行为
- 实际行为
- 相关日志或截图
- 你的环境（操作系统、Python 版本等）

### 建议功能

我们欢迎功能建议！要建议新功能：

1. 检查该功能是否已被建议或实现。
2. 创建一个新 Issue 描述该功能及其优势。
3. 如有"feature request"标签，请使用该标签。

### 提交 Pull Request

1. 将你的 fork 更新到主仓库的最新代码。
2. 为你的修改创建新分支。
3. 进行修改，遵循编码规范。
4. 根据需要添加或更新测试。
5. 必要时更新文档。
6. 提交 Pull Request，附上清晰的修改描述。

## 开发工作流

1. **提交信息**：编写清晰、简洁的提交信息，说明所做的修改。
2. **分支命名**：使用描述性的分支名称（如 `feature/add-new-agent`、`fix/memory-leak`）。
3. **PR 聚焦**：每个 PR 应只解决一个问题。

## 编码规范

- Python 代码遵循 PEP 8 风格指南。
- 使用有意义的变量和函数名。
- 为所有函数、类和模块编写文档字符串（docstring）。
- 保持函数小而专注于单一任务。
- 对复杂代码段添加注释。

## 测试

- 为所有新功能和 Bug 修复编写测试。
- 确保所有测试在提交 PR 之前通过。
- 争取良好的测试覆盖率。

运行测试：
```bash
pytest
```

## 文档

- 为任何功能变更更新文档。
- 详细记录新功能。
- 在文档中使用清晰、简洁的语言。

## 社区

- 加入我们的[社区讨论](https://github.com/YOUR-USERNAME/openagents/discussions)提问和分享想法。
- 帮助回答其他贡献者的问题。
- 在所有交流中保持尊重和有建设性。

感谢你为 OpenAgents 做贡献！
