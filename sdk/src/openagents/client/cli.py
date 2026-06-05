#!/usr/bin/env python3
"""
OpenAgents CLI — orchestrator module.

This is the main CLI entry point. Commands are organized into domain modules:
- cli_helpers.py  — shared utility functions (logging, workspace, studio, ports)
- cli_network.py  — network start/init/list/interact/publish
- cli_agent.py    — agent start/list, agents start/list (bulk)
- cli_identity.py — certs generate/verify, agentid commands
- cli_packages.py — install/search/update/runtimes
- cli_shared.py   — shared state (app, console, constants)

Daemon/launcher commands (up/down/status/start/stop/create/connect/autostart)
were removed; use the Node-based ``agn`` CLI from the
``@openagents-org/agent-launcher`` npm package instead.
"""

import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Optional

import typer
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich import box

# -- Shared state (re-export for backward compatibility) ----------------------
from openagents.client.cli_shared import app, console, show_banner

VERBOSE_MODE = False  # mutable global, updated by verbose_callback

# -- Helpers (re-export the two names that other modules import) --------------
from openagents.client.cli_helpers import (  # noqa: F401
    configure_workspace_logging,
    get_default_workspace_path,
    initialize_workspace,
    setup_logging,
    studio_command,
)

# -- Import command modules (registration happens at import time) -------------
import openagents.client.cli_network   # noqa: F401  — network_app
import openagents.client.cli_agent     # noqa: F401  — agent_app, agents_app
import openagents.client.cli_identity  # noqa: F401  — certs_app, agentid_app
import openagents.client.cli_packages  # noqa: F401  — install/search/update/runtimes


# =============================================================================
# Root-level commands (studio, version, examples, init)
# =============================================================================

@app.command("studio", rich_help_panel="SDK")
def studio(
    host: str = typer.Option("localhost", "--host", "-h", help="网络主机地址"),
    port: int = typer.Option(8700, "--port", "-p", help="网络端口"),
    studio_port: int = typer.Option(8050, "--studio-port", help="Studio 前端端口"),
    workspace: Optional[str] = typer.Option(None, "--workspace", "-w", help="工作空间目录路径"),
    no_browser: bool = typer.Option(False, "--no-browser", help="不自动打开浏览器"),
    standalone: bool = typer.Option(True, "--standalone", "-s", help="仅启动前端（保持向后兼容）"),
):
    """启动 OpenAgents Studio - 美观的 Web 界面

    默认仅在 8050 端口启动 Studio 前端。
    可连接到正在运行的网络（例如 localhost:8700）。
    """
    console.print(Panel.fit(
        "[bold blue]OpenAgents Studio[/bold blue]\n"
        "AI 智能体协作的美观 Web 界面",
        border_style="blue"
    ))

    args = SimpleNamespace(
        host=host,
        port=port,
        studio_port=studio_port,
        workspace=workspace,
        no_browser=no_browser,
        standalone=standalone,
    )
    studio_command(args)


@app.command("version", rich_help_panel="Client")
def version():
    """显示版本信息"""
    try:
        from openagents import __version__
        console.print(Panel.fit(
            f"[bold blue]OpenAgents[/bold blue] [green]v{__version__}[/green]\n"
            "开放协作的 AI 智能体网络",
            border_style="blue"
        ))
    except ImportError:
        console.print("[yellow]无法获取版本信息[/yellow]")


@app.command("examples", rich_help_panel="SDK")
def show_examples():
    """显示使用示例"""
    examples_text = """
[bold blue]常用示例：[/bold blue]

[bold green]1. 快速开始 - 启动网络：[/bold green]
   [code]openagents network start[/code]
   打开 http://localhost:8700/studio/

[bold green]2. 仅启动 Studio 前端：[/bold green]
   [code]openagents studio[/code]
   连接到现有网络

[bold green]3. 从配置文件启动网络：[/bold green]
   [code]openagents network start path/to/network.yaml[/code]

[bold green]4. 启动智能体：[/bold green]
   [code]openagents agent start path/to/agent.yaml[/code]

[bold green]5. 初始化新工作空间：[/bold green]
   [code]openagents init my_workspace[/code]

[bold cyan]更多信息，请访问：[/bold cyan]
   [link]https://github.com/openagents-org/openagents[/link]
"""
    console.print(Panel(
        examples_text,
        title="[bold blue]OpenAgents 示例[/bold blue]",
        border_style="blue",
        expand=False
    ))


@app.command("init", rich_help_panel="SDK")
def init_workspace_cmd(
    path: Optional[str] = typer.Argument(None, help="工作空间目录路径"),
    force: bool = typer.Option(False, "--force", "-f", help="覆盖现有工作空间"),
):
    """初始化新的 OpenAgents 工作空间"""
    workspace_path = Path(path) if path else get_default_workspace_path()

    if workspace_path.exists() and not force:
        if workspace_path.is_dir() and any(workspace_path.iterdir()):
            console.print(f"[red]目录已存在且不为空：{workspace_path}[/red]")
            console.print("[yellow]使用 --force 覆盖现有内容[/yellow]")
            raise typer.Exit(1)

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("正在创建工作空间...", total=None)
        try:
            config_path = initialize_workspace(workspace_path)
            progress.update(task, description="[green]工作空间创建成功！")
            console.print(Panel.fit(
                f"[bold green]工作空间初始化完成！[/bold green]\n\n"
                f"位置：[code]{workspace_path}[/code]\n"
                f"配置：[code]{config_path}[/code]\n\n"
                f"[bold cyan]下一步：[/bold cyan]\n"
                f"1. [code]cd {workspace_path}[/code]\n"
                f"2. [code]openagents studio[/code]",
                border_style="green"
            ))
        except Exception as e:
            progress.update(task, description=f"[red]创建工作空间失败：{e}[/red]")
            console.print(f"[red]错误：{e}[/red]")
            raise typer.Exit(1)


@app.command("list", rich_help_panel="Client")
def list_agents_cmd():
    """列出本地已安装的智能体及其设置状态"""
    _show_agent_scan()


# =============================================================================
# Callbacks
# =============================================================================

def version_callback(value: bool):
    if value:
        version()
        raise typer.Exit()


def verbose_callback(value: bool):
    global VERBOSE_MODE
    VERBOSE_MODE = value
    return value


@app.callback()
def main(
    ctx: typer.Context,
    version_flag: Optional[bool] = typer.Option(
        None, "--version", callback=version_callback, is_eager=True,
        help="显示版本并退出"
    ),
    verbose: bool = typer.Option(
        False, "--verbose", "-v", callback=verbose_callback,
        help="启用详细输出"
    ),
    log_level: str = typer.Option(
        "INFO", "--log-level",
        help="设置日志级别"
    ),
    no_banner: bool = typer.Option(
        False, "--no-banner",
        help="不显示启动横幅"
    ),
):
    """
    [bold blue]OpenAgents[/bold blue] - 开放协作的 AI 智能体网络

    轻松创建和管理分布式 AI 智能体网络。
    """
    setup_logging(log_level, verbose)

    # Show banner for studio command
    if not no_banner and len(sys.argv) > 1 and sys.argv[1] == 'studio':
        show_banner()


def _show_agent_scan():
    """Scan machine for agents and show readiness status."""
    from openagents.client.plugin_registry import registry

    console.print("\n[bold blue]OpenAgents[/bold blue] — 正在扫描智能体...\n")

    scan = registry.scan_agents()

    table = Table(box=box.SIMPLE)
    table.add_column("智能体", style="cyan")
    table.add_column("状态")
    table.add_column("备注", style="dim")

    installed_count = 0
    for agent in scan:
        if agent["installed"]:
            installed_count += 1
            if agent["ready"]:
                status = "[green]就绪[/green]"
            else:
                status = "[yellow]需要配置[/yellow]"
            notes = agent["message"]
            if agent["path"] and agent["ready"]:
                notes = agent["path"]
        else:
            status = "[dim]未安装[/dim]"
            notes = agent["install_command"]
        table.add_row(agent["label"], status, notes)

    console.print(table)

    if installed_count == 0:
        console.print("安装智能体：[bold]openagents install claude[/bold]")
    console.print(
        "\n[dim]要将智能体作为工作空间守护进程运行，请安装 Node CLI：\n"
        "  npm install -g @openagents-org/agent-launcher\n"
        "然后使用 [bold]agn up[/bold] / [bold]agn down[/bold]。[dim]\n"
    )


def cli_main():
    """Entry point for the CLI"""
    try:
        app()
    except KeyboardInterrupt:
        console.print("\n[yellow]再见！[/yellow]")
        sys.exit(0)
    except Exception as e:
        console.print(f"[red]未知错误：{e}[/red]")
        sys.exit(1)


if __name__ == "__main__":
    cli_main()
