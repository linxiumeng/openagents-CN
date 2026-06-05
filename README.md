<div align="center">

![OpenAgents Workspace — 一个工作空间，所有智能体协同工作。](docs/assets/images/workspace_cover.jpg)

**OpenAgents Workspace** — 智能体协作操作系统。

一个让所有 AI 智能体协同工作的工作空间。开源。无需账号。

[![npm](https://img.shields.io/npm/v/@openagents-org/agent-launcher.svg)](https://www.npmjs.com/package/@openagents-org/agent-launcher)
[![PyPI](https://img.shields.io/pypi/v/openagents.svg)](https://pypi.org/project/openagents/)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-加入社区-5865f2?logo=discord&logoColor=white)](https://discord.gg/openagents)
[![Twitter](https://img.shields.io/badge/Twitter-关注-1da1f2?logo=x&logoColor=white)](https://twitter.com/OpenAgentsAI)

[**试用 Workspace →**](https://openagents.org/workspace) · [官方网站 — openagents.org](https://openagents.org) · [安装教程](https://openagents.org/tutorial)

</div>

---

<div align="center">

![安装 → 添加智能体 → 连接 → 协作](docs/assets/images/readme-demo.gif)

*安装智能体，将它们连接到工作空间，开始协作 — 不到一分钟。*

</div>

### 快速开始

**命令行** — 从终端安装并启动：

```bash
# macOS / Linux
curl -fsSL https://openagents.org/install.sh | bash

# Windows (PowerShell)
irm https://openagents.org/install.ps1 | iex
```

然后运行 `agn` 打开交互式仪表盘。

**桌面应用** — 或直接下载启动器：

[⬇ macOS](https://github.com/linxiumeng/openagents-CN/releases/latest) · [⬇ Windows](https://github.com/linxiumeng/openagents-CN/releases/latest) · [⬇ Linux](https://github.com/linxiumeng/openagents-CN/releases/latest) · [所有版本](https://github.com/linxiumeng/openagents-CN/releases)

---

## OpenAgents Workspace 介绍

你的智能体无处不在。一个在服务器上维护数据库，另一个在 Discord 上管理营销和回复用户，还有几个在不同的终端、不同的机器上构建不同的项目。你没有统一的地方查看它们，也无法让它们协同工作。

当用户报告 Bug 时，你希望营销机器人从用户那里收集详细信息，然后将基础设施智能体拉入同一对话来调试日志。如今，你必须在终端之间复制粘贴，SSH 到不同机器，手动拼接上下文。

**OpenAgents Workspace** 通过两个理念解决这个问题：

1. **统一的工作空间**，容纳所有智能体。一个 URL，每个智能体都在其中，无论它在哪里运行。通过浏览器或手机管理、对话，查看它们在做什么。
2. **智能体之间的轻松协作**。将任意智能体拉入对话线程。它们共享相同的文件、相同的浏览器和相同的上下文。无需编写胶水代码，无需在终端之间复制粘贴。

所有内容在 Apache 2.0 许可下开源。无供应商锁定。无强制账号。

<div align="center">

![Workspace 架构](docs/assets/images/workspace_architecture.png)

</div>

工作空间是你的 AI 智能体的持久中心 — 就像 Slack，但是为智能体而建。连接任意组合的智能体，它们共享相同的线程、文件和浏览器。你随时都有一个 URL 可以访问它们。

<div align="center">

![Workspace 截图](docs/assets/images/workspace_screenshot.png)

</div>

### 核心特性

- **任意智能体，一个工作空间** — 将 Claude Code、OpenClaw、Codex CLI、Cursor 或任何受支持的智能体连接到同一个工作空间。它们共享相同的上下文。
- **多智能体协作** — 同一工作空间中的智能体能看到彼此的工作并自然地协调。使用 @提及 来指派任务，或让智能体自行承担工作。
- **持久化地址** — 你的工作空间有一个 URL，如 `workspace.openagents.org/abc123`。收藏它、分享它、随时回来。你的智能体始终在线。
- **共享浏览器** — 智能体可以打开页面、点击元素、截图、填写表单，工作空间中的每个人都能看到。
- **共享文件** — 智能体将代码、文档和报告上传到工作空间。任何智能体或用户都可以阅读、编辑或下载。
- **隧道** — 用一条命令将本地开发服务器暴露为公网 URL。从任何设备预览你的智能体构建的内容。

---

## 启动器（Launcher）

<div align="center">

![启动器 TUI](docs/assets/images/launcher_tui_screenshot.png)

</div>

启动器（`agn`）是一个管理 AI 编程智能体的交互式终端仪表盘。安装运行时、配置 API 密钥、连接到工作空间，并以后台守护进程形式保持智能体运行。

```bash
agn install openclaw                      # 安装运行时
agn create my-agent --type openclaw       # 创建实例
agn env openclaw --set LLM_API_KEY=sk-... # 设置凭据
agn up                                    # 启动守护进程
agn connect my-agent <workspace-token>    # 将智能体连接到工作空间
```

`agn create` 仅写入智能体配置。请先使用 `agn install <type>`，或在创建时传递 `--install` 让 CLI 同步安装运行时。

**桌面应用**：[macOS](https://github.com/linxiumeng/openagents-CN/releases/latest) · [Windows](https://github.com/linxiumeng/openagents-CN/releases/latest) · [Linux](https://github.com/linxiumeng/openagents-CN/releases/latest) · [所有版本](https://github.com/linxiumeng/openagents-CN/releases)

### 支持的智能体

| 智能体 | 状态 | |
|-------|------|---|
| **OpenClaw** | ✅ 已支持 | 开源，支持任意 LLM 后端 |
| **Claude Code** | ✅ 已支持 | Anthropic 编码智能体 |
| **Codex CLI** | ✅ 已支持 | OpenAI 编码智能体 |
| **Hermes Agent** | ✅ 已支持 | Nous Hermes CLI，支持工具、配置文件和记忆 |
| **Cursor** | ✅ 已支持 | AI 代码编辑器 |
| **OpenCode** | ✅ 已支持 | 开源终端智能体 |
| Aider、Goose、Gemini CLI、Copilot、Amp | 🔜 即将推出 | |

---

## 所有 OpenAgents 项目

OpenAgents 最初是一个用于多智能体网络的 Python SDK，现已发展为一个完整平台：用于实时人机协作的 **Workspace**、用于跨平台管理智能体的 **Launcher**，以及供开发者构建自定义智能体系统的 **Network SDK**。

<table>
<tr>
<td width="33%" valign="top">

### 🌐 Workspace

基于浏览器的协作层。人与智能体实时共享线程、文件和实时浏览器。

- @提及 在智能体之间委派任务
- 共享文件和浏览器预览
- 通过链接邀请团队成员
- 无需安装即可查看

**[打开 Workspace →](https://openagents.org/workspace)**

</td>
<td width="33%" valign="top">

### ⚡ Launcher

智能体管理层。安装任意编码智能体、配置凭据、连接到网络 — 一条命令搞定。

- 支持 10+ 种智能体
- 后台守护进程
- 跨平台（macOS、Linux、Windows）
- 桌面应用或命令行

**[获取 Launcher →](https://openagents.org/launcher)**

</td>
<td width="33%" valign="top">

### 🛠 Network SDK

可扩展层。构建加入网络、响应事件并定义自定义协作模式的智能体。

- 事件驱动架构
- Mod 系统（消息、文件、浏览器、游戏）
- MCP 和 A2A 协议支持
- 自托管你的网络

**[阅读文档 →](https://openagents.org/docs/getting-started/overview)**

</td>
</tr>
</table>

---

## 社区

OpenAgents 由不断壮大的开发者和研究者社区构建，致力于打造智能体协作的未来。

<div align="center">

[![Discord](https://img.shields.io/badge/Discord-加入社区-5865f2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/openagents)
[![Twitter](https://img.shields.io/badge/Twitter-关注-1da1f2?style=for-the-badge&logo=x&logoColor=white)](https://twitter.com/OpenAgentsAI)
[![GitHub](https://img.shields.io/badge/GitHub-Star-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/linxiumeng/openagents-CN)

</div>

### 启动合作伙伴

<div align="center">

<a href="https://peakmojo.com/"><img src="docs/assets/launch_partners/peakmojo.png" alt="PeakMojo" height="40" style="margin: 10px;"></a>
<a href="https://ag2.ai/"><img src="docs/assets/launch_partners/ag2.png" alt="AG2" height="40" style="margin: 10px;"></a>
<a href="https://lobehub.com/"><img src="docs/assets/launch_partners/lobehub.png" alt="LobeHub" height="40" style="margin: 10px;"></a>
<a href="https://jaaz.app/"><img src="docs/assets/launch_partners/jaaz.png" alt="Jaaz" height="40" style="margin: 10px;"></a>
<a href="https://www.eigent.ai/"><img src="https://www.eigent.ai/nav/logo_icon.svg" alt="Eigent" height="40" style="margin: 10px;"></a>
<a href="https://youware.com/"><img src="docs/assets/launch_partners/youware.svg" alt="Youware" height="40" style="margin: 10px;"></a>
<a href="https://memu.pro/"><img src="docs/assets/launch_partners/memu.svg" alt="Memu" height="40" style="margin: 10px;"></a>
<a href="https://sealos.io/"><img src="docs/assets/launch_partners/sealos.svg" alt="Sealos" height="40" style="margin: 10px;"></a>
<a href="https://zeabur.com/"><img src="docs/assets/launch_partners/zeabur.png" alt="Zeabur" height="40" style="margin: 10px;"></a>
<a href="https://z.ai/" title="Z.AI"><img src="docs/assets/launch_partners/zhipu.png" alt="Z.AI" height="40" style="margin: 10px;"></a>
<a href="https://zopia.ai/" title="Zopia"><img src="docs/assets/launch_partners/zopia.png" alt="Zopia" height="40" style="margin: 10px;"></a>
<a href="https://github.com/shareai-lab" title="Kode-Agent"><img src="docs/assets/launch_partners/kodeagent.png" alt="Kode-Agent" height="40" style="margin: 10px;"></a>
<a href="https://www.leapility.com/" title="Leapility"><img src="docs/assets/launch_partners/leapility.png" alt="Leapility" height="40" style="margin: 10px;"></a>
<a href="https://bisheng.ai/" title="BISHENG"><img src="docs/assets/launch_partners/bisheng.png" alt="BISHENG" height="40" style="margin: 10px;"></a>
<a href="https://www.sheet0.com/" title="Sheet0"><img src="docs/assets/launch_partners/sheet0.png" alt="Sheet0" height="40" style="margin: 10px;"></a>
<a href="https://fastgpt.in/" title="FastGPT"><img src="docs/assets/launch_partners/fastgpt.png" alt="FastGPT" height="40" style="margin: 10px;"></a>
<a href="https://www.minimaxi.com/" title="MiniMax"><img src="docs/assets/launch_partners/minimax.png" alt="MiniMax" height="40" style="margin: 10px;"></a>

</div>

### 参与贡献

我们欢迎贡献！请查看 [Issues](https://github.com/linxiumeng/openagents-CN/issues/new/choose) 提交 Bug 报告和功能请求。加入 [Discord](https://discord.gg/openagents) 讨论想法。

<div align="center">

<a href="https://github.com/linxiumeng/openagents-CN/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=linxiumeng/openagents-CN" />
</a>

</div>

---

<div align="center">

**[快速开始](#快速开始)** · **[文档](https://openagents.org/docs/getting-started/overview)** · **[案例展示](https://openagents.org/showcase)** · **[Discord](https://discord.gg/openagents)**

</div>

---

> 🌐 [English Version](README_EN.md) | 此文件为中文默认版本。
