'use strict';

const { AgentConnector, Daemon } = require('./index');

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const allPositional = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[a.slice(2)] = args[i + 1];
        i++;
      } else {
        flags[a.slice(2)] = true;
      }
    } else {
      allPositional.push(a);
    }
  }

  const cmd = allPositional[0] || 'status';
  const positional = allPositional.slice(1);

  return { cmd, flags, positional };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConnector(flags) {
  const opts = {};
  if (flags.config) opts.configDir = flags.config;
  return new AgentConnector(opts);
}

function print(msg) { process.stdout.write(msg + '\n'); }

function table(rows, headers) {
  if (rows.length === 0) return;
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] || '').length))
  );
  print(headers.map((h, i) => h.padEnd(widths[i])).join('  '));
  print(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    print(row.map((c, i) => String(c || '').padEnd(widths[i])).join('  '));
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdUp(connector, flags) {
  if (flags.foreground) {
    // Run in foreground (used by daemonize child) — skip PID check
    // because the parent already wrote our PID to the file.
    const daemon = connector.createDaemon();
    await daemon.start();
  } else {
    const pid = connector.getDaemonPid();
    if (pid) {
      print(`守护进程已在运行 (PID ${pid})`);
      return;
    }
    // Daemonize
    const foregroundArgs = [process.argv[1], 'up', '--foreground'];
    if (flags.config) foregroundArgs.push('--config', flags.config);
    connector.startDaemon(foregroundArgs);
  }
}

async function cmdDown(connector) {
  const stopped = connector.stopDaemon();
  if (stopped) {
    print('守护进程已停止');
  } else {
    print('守护进程未运行');
  }
}

async function cmdStatus(connector) {
  const pid = connector.getDaemonPid();
  if (!pid) {
    print('守护进程未运行');
  } else {
    print(`守护进程运行中 (PID ${pid})`);
  }

  const agents = connector.listAgents();
  if (agents.length === 0) {
    print('\n未配置智能体。运行：agn create <名称> --type <类型>');
    return;
  }

  const status = connector.getDaemonStatus();
  const rows = agents.map((a) => {
    const s = status[a.name] || {};
    const state = s.state || (pid ? 'stopped' : '-');
    const restarts = s.restarts || 0;
    return [a.name, a.type, state, a.network || '(本地)', restarts > 0 ? `${restarts}` : ''];
  });
  print('');
  table(rows, ['名称', '类型', '状态', '网络', '重启次数']);
}

async function cmdCreate(connector, flags, positional) {
  const name = positional[0];
  if (!name) { print('Usage: agn create <name> [--type <type>] [--install]'); return; }
  const type = flags.type || 'openclaw';
  const role = flags.role || 'worker';

  try {
    connector.addAgent({ name, type, role, path: flags.path || process.cwd() });

    // Signal daemon to pick up the new agent
    try { connector.sendDaemonCommand('reload'); } catch {}

    // Newly created agents are local-only until connected to a workspace.
    // Without a workspace connection they will not appear in the Workspace Dashboard.
    const created = connector.config.getAgent(name);
    if (created && !created.network) {
      print(`已创建本地智能体：${name}（类型：${type}）`);
      print('');
      print('此智能体仅在本地运行，暂不会出现在工作空间仪表盘中。');
      print('');
      print('要将其连接到工作空间，请运行：');
      print(`  agn connect ${name} <workspace-token>`);
    } else {
      print(`智能体 '${name}' 已创建（类型：${type}）`);
    }

    if (!connector.isInstalled(type)) {
      if (!flags.install) {
        print(`运行时 '${type}' 未安装。运行：agn install ${type}`);
        return;
      }

      print(`正在安装 ${type}...`);
      try {
        await connector.install(type);
        print(`${type} 已安装`);
      } catch (e) {
        print(`警告：安装失败：${e.message}`);
      }
    }
  } catch (e) {
    print(`错误：${e.message}`);
    process.exitCode = 1;
  }
}

async function cmdRemove(connector, _flags, positional) {
  const name = positional[0];
  if (!name) { print('用法：agn remove <名称>'); return; }
  connector.removeAgent(name);
  try { connector.sendDaemonCommand('reload'); } catch {}
  print(`智能体 '${name}' 已移除`);
}

async function cmdStart(connector, _flags, positional) {
  const name = positional[0];
  if (!name) { print('用法：agn start <名称>'); return; }
  connector.sendDaemonCommand(`restart:${name}`);
  print(`已发送启动命令：'${name}'`);
}

async function cmdStop(connector, _flags, positional) {
  const name = positional[0];
  if (!name) { print('用法：agn stop <名称>'); return; }
  connector.sendDaemonCommand(`stop:${name}`);
  print(`已发送停止命令：'${name}'`);
}

async function cmdInstall(connector, _flags, positional) {
  const type = positional[0];
  if (!type) { print('用法：agn install <类型>'); return; }

  if (connector.isInstalled(type)) {
    print(`${type} 已安装`);
    return;
  }

  print(`正在安装 ${type}...`);
  try {
    const result = await connector.install(type);
    print(`${type} 安装成功`);
    if (result.output) print(result.output);
  } catch (e) {
    print(`错误：${e.message}`);
    process.exitCode = 1;
  }
}

async function cmdUninstall(connector, _flags, positional) {
  const type = positional[0];
  if (!type) { print('用法：agn uninstall <类型>'); return; }

  print(`正在卸载 ${type}...`);
  try {
    const result = await connector.uninstall(type);
    print(`${type} 已卸载`);
    if (result.output) print(result.output);
  } catch (e) {
    print(`错误：${e.message}`);
    process.exitCode = 1;
  }
}

async function cmdSearch(connector, flags, positional) {
  const query = positional[0] || '';
  let catalog;
  try {
    catalog = await connector.getCatalog();
  } catch {
    catalog = connector.registry.getCatalogSync().map((e) => {
      const info = connector.installer.getInstallInfo(e.name);
      return { ...e, installed: info.installed, managed: info.managed, location: info.location };
    });
  }

  if (query) {
    const q = query.toLowerCase();
    catalog = catalog.filter((e) =>
      e.name.includes(q) || (e.label || '').toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q) ||
      (e.tags || []).some((t) => t.includes(q))
    );
  }

  if (catalog.length === 0) {
    print(query ? `未找到匹配 '${query}' 的智能体` : '目录中暂无智能体');
    return;
  }

  const rows = catalog.map((e) => [
    e.name,
    e.label || e.name,
    e.installed ? '已安装' : '',
    (e.description || '').slice(0, 50),
  ]);
  table(rows, ['名称', '标签', '状态', '描述']);
}

async function cmdList(connector) {
  const agents = connector.listAgents();
  if (agents.length === 0) {
    print('未配置智能体');
    return;
  }
  const rows = agents.map((a) => [
    a.name, a.type, a.role, a.network || '(本地)',
  ]);
  table(rows, ['名称', '类型', '角色', '网络']);
}

async function cmdRuntimes(connector) {
  let catalog;
  try {
    catalog = await connector.getCatalog();
  } catch {
    catalog = connector.registry.getCatalogSync().map((e) => {
      const info = connector.installer.getInstallInfo(e.name);
      return { ...e, installed: info.installed, managed: info.managed, location: info.location };
    });
  }

  const installed = catalog.filter((e) => e.installed);
  if (installed.length === 0) {
    print('未安装智能体运行时');
    return;
  }

  const rows = installed.map((e) => {
    const binary = connector.installer.which(e.name) || '-';
    return [e.name, e.label || e.name, binary];
  });
  table(rows, ['名称', '标签', '路径']);
}

async function cmdConnect(connector, flags, positional) {
  const name = positional[0];
  // Token resolution order: positional arg / --token flag, then env vars.
  // OPENAGENTS_WORKSPACE_TOKEN is preferred; OA_WORKSPACE_TOKEN is supported
  // for compatibility with the existing mcp-server env var.
  const token = positional[1]
    || flags.token
    || process.env.OPENAGENTS_WORKSPACE_TOKEN
    || process.env.OA_WORKSPACE_TOKEN;

  if (!name) {
    print('Usage: agn connect <agent-name> <token>');
    process.exitCode = 1;
    return;
  }

  if (!token) {
    // No token supplied and none in the environment. Never prompt — keep
    // CI / non-interactive environments from hanging. Print a helpful error
    // explaining why the agent stays invisible and how to fix it.
    print('需要工作空间 Token。');
    print('纯本地智能体在连接前不会出现在工作空间仪表盘中。');
    print('请运行：');
    print(`  agn connect ${name} <workspace-token>`);
    process.exitCode = 1;
    return;
  }

  print(`正在解析工作空间 Token...`);
  try {
    const info = await connector.resolveToken(token);
    const slug = info.slug || info.workspace_id;
    const wsName = info.name || slug;

    // Save network
    connector.config.addNetwork({
      id: info.workspace_id,
      slug,
      name: wsName,
      endpoint: info.endpoint || connector.workspace.endpoint,
      token,
    });

    // Connect agent
    connector.connectWorkspace(name, slug);
    print(`'${name}' 已连接到工作空间 '${wsName}'`);

    // Signal daemon reload
    const pid = connector.getDaemonPid();
    if (pid) {
      connector.sendDaemonCommand(`restart:${name}`);
      print('已通知守护进程');
    }
  } catch (e) {
    print(`错误：${e.message}`);
    process.exitCode = 1;
  }
}

async function cmdDisconnect(connector, _flags, positional) {
  const name = positional[0];
  if (!name) { print('用法：agn disconnect <智能体名称>'); return; }
  connector.disconnectWorkspace(name);
  print(`'${name}' 已断开工作空间连接`);

  const pid = connector.getDaemonPid();
  if (pid) {
    connector.sendDaemonCommand(`restart:${name}`);
  }
}

async function cmdLogs(connector, flags, positional) {
  const agent = positional[0] || flags.agent;
  const lines = parseInt(flags.lines || flags.n || '50', 10);
  const logLines = connector.getLogs(agent, lines);
  for (const line of logLines) {
    if (line) print(line);
  }
}

async function cmdAutostart(connector, flags) {
  const autostart = require('./autostart');
  if (flags.disable) {
    autostart.disable();
    print('自动启动已禁用。');
  } else {
    const result = autostart.enable(connector._config ? connector._config.configDir : require('path').join(require('os').homedir(), '.openagents'));
    print(`自动启动已启用。${result.path ? ` 配置：${result.path}` : ''}`);
  }
}

async function cmdWorkspace(connector, flags, positional) {
  const sub = positional[0] || 'list';
  const subArgs = positional.slice(1);

  switch (sub) {
    case 'create': {
      const name = subArgs[0] || flags.name || '我的工作空间';
      print(`正在创建工作空间 '${name}'...`);
      try {
        const result = await connector.createWorkspace({ name });
        print(`工作空间已创建：${result.name}`);
        print(`  Slug:  ${result.slug}`);
        print(`  Token: ${result.token}`);
        print(`  URL:   ${result.url}`);
      } catch (e) {
        print(`错误：${e.message}`);
        process.exitCode = 1;
      }
      break;
    }

    case 'join': {
      const token = subArgs[0] || flags.token;
      if (!token) { print('用法：agn workspace join <Token>'); return; }
      try {
        const info = await connector.resolveToken(token);
        connector.config.addNetwork({
          id: info.workspace_id,
          slug: info.slug || info.workspace_id,
          name: info.name || info.slug,
          endpoint: info.endpoint || connector.workspace.endpoint,
          token,
        });
        print(`已加入工作空间 '${info.name || info.slug}'`);
      } catch (e) {
        print(`错误：${e.message}`);
        process.exitCode = 1;
      }
      break;
    }

    case 'list':
    default: {
      const workspaces = connector.listWorkspaces();
      if (workspaces.length === 0) {
        print('未配置工作空间');
        return;
      }
      const rows = workspaces.map((w) => [w.slug, w.name, w.endpoint || '-']);
      table(rows, ['SLUG', '名称', '端点']);
      break;
    }
  }
}

async function cmdEnv(connector, flags, positional) {
  const type = positional[0];
  if (!type) { print('用法：agn env <类型> [--set KEY=VALUE]'); return; }

  const setVal = flags.set;
  if (setVal) {
    const eq = setVal.indexOf('=');
    if (eq < 1) { print('用法：--set KEY=VALUE'); return; }
    const key = setVal.slice(0, eq);
    const val = setVal.slice(eq + 1);
    connector.saveAgentEnv(type, { [key]: val });
    try { connector.sendDaemonCommand('reload'); } catch {}
    print(`已保存 ${type} 的 ${key}`);
    return;
  }

  // Show current env
  const env = connector.getAgentEnv(type);
  const fields = connector.getEnvFields(type);

  if (fields.length > 0) {
    for (const field of fields) {
      const val = env[field.name];
      const display = field.password && val ? '***' : (val || '(未设置)');
      print(`  ${field.name}: ${display}  ${field.required ? '(必填)' : ''}`);
    }
  } else {
    const entries = Object.entries(env);
    if (entries.length === 0) {
      print(`${type} 未配置环境变量`);
    } else {
      for (const [k, v] of entries) {
        print(`  ${k}: ${v}`);
      }
    }
  }
}

async function cmdToolMode(connector, _flags, positional) {
  const first = positional[0];
  const second = positional[1];

  // agn tool-mode --all <mode>
  if (first === '--all') {
    const targetMode = second;
    if (!targetMode || (targetMode !== 'mcp' && targetMode !== 'skills')) {
      print("用法：agn tool-mode --all <mcp|skills>");
      process.exitCode = 1;
      return;
    }
    const agents = connector.config.getAgents();
    if (agents.length === 0) { print('未配置智能体'); return; }
    for (const a of agents) {
      connector.config.updateAgent(a.name, { tool_mode: targetMode });
      print(`  ${a.name}: ${a.tool_mode || 'skills'} → ${targetMode}`);
    }
    try { connector.sendDaemonCommand('reload'); } catch {}
    print(`\n已将 ${agents.length} 个智能体设置为 '${targetMode}' 模式。`);
    return;
  }

  if (!first) {
    // Show tool mode for all agents
    const agents = connector.config.getAgents();
    if (agents.length === 0) {
      print('未配置智能体');
      return;
    }
    for (const a of agents) {
      print(`  ${a.name}: ${a.tool_mode || 'skills'}`);
    }
    print('\n用法：agn tool-mode <智能体|--all> <mcp|skills>');
    return;
  }

  if (!second) {
    // Show tool mode for specific agent
    const agent = connector.config.getAgent(first);
    if (!agent) { print(`智能体 '${first}' 未找到`); process.exitCode = 1; return; }
    print(`${first}: ${agent.tool_mode || 'skills'}`);
    print('\n用法：agn tool-mode <智能体|--all> <mcp|skills>');
    return;
  }

  if (second !== 'mcp' && second !== 'skills') {
    print(`无效模式：${second}。必须是 'mcp' 或 'skills'。`);
    process.exitCode = 1;
    return;
  }

  connector.config.updateAgent(first, { tool_mode: second });
  try { connector.sendDaemonCommand('reload'); } catch {}
  print(`已将 ${first} 的工具模式设置为 '${second}'`);
  if (second === 'skills') {
    print('智能体将使用 SKILL.md（Bash + curl）代替 MCP 服务器来使用工作空间工具。');
  } else {
    print('智能体将使用 MCP 服务器来使用工作空间工具（默认）。');
  }
}

async function cmdSkills(connector, _flags, positional) {
  const { SKILL_CATALOG, getSkillDefaults } = require('./skill-catalog');
  const toggleable = SKILL_CATALOG.filter(s => s.toggleable);
  const first = positional[0];
  const second = positional[1];
  const third = positional[2];

  // agn skills → list skills for all agents
  if (!first) {
    const agents = connector.config.getAgents();
    if (agents.length === 0) { print('未配置智能体'); return; }
    for (const a of agents) {
      const defaults = getSkillDefaults();
      const skills = a.skills || {};
      const parts = toggleable.map(s => {
        const enabled = skills[s.id] !== undefined ? skills[s.id] : defaults[s.id];
        return `${enabled ? '+' : '-'}${s.id}`;
      });
      print(`  ${a.name}: ${parts.join(' ')}`);
    }
    print('\n用法：agn skills <智能体> [enable|disable <技能>]');
    print('可用技能：' + toggleable.map(s => s.id).join(', '));
    return;
  }

  // agn skills catalog → show full catalog
  if (first === 'catalog') {
    print('技能中心 — 可用技能：\n');
    for (const s of SKILL_CATALOG) {
      const tag = s.toggleable ? (s.defaultEnabled ? '[开]' : '[关]') : '[始终]';
      print(`  ${s.id.padEnd(16)} ${tag.padEnd(10)} ${s.name}`);
      print(`  ${''.padEnd(16)} ${''.padEnd(10)} ${s.description}`);
      print('');
    }
    return;
  }

  const agent = connector.config.getAgent(first);
  if (!agent) { print(`智能体 '${first}' 未找到`); process.exitCode = 1; return; }

  // agn skills <agent> → show agent's skills
  if (!second) {
    const defaults = getSkillDefaults();
    const skills = agent.skills || {};
    print(`${first} 的技能：\n`);
    for (const s of toggleable) {
      const enabled = skills[s.id] !== undefined ? skills[s.id] : defaults[s.id];
      const marker = enabled ? '  ✓' : '  ✗';
      print(`${marker} ${s.id.padEnd(14)} ${s.name} — ${s.description}`);
    }
    print('\n用法：agn skills <智能体> enable|disable <技能>');
    return;
  }

  // agn skills <agent> enable|disable <skill>
  if (second !== 'enable' && second !== 'disable') {
    print(`未知操作：${second}。请使用 'enable' 或 'disable'。`);
    process.exitCode = 1;
    return;
  }
  if (!third) {
    print(`用法：agn skills ${first} ${second} <技能>`);
    print('可用技能：' + toggleable.map(s => s.id).join(', '));
    process.exitCode = 1;
    return;
  }

  const skillDef = toggleable.find(s => s.id === third);
  if (!skillDef) {
    print(`未知技能：${third}`);
    print('可用技能：' + toggleable.map(s => s.id).join(', '));
    process.exitCode = 1;
    return;
  }

  const current = agent.skills || {};
  const updated = { ...current, [third]: second === 'enable' };
  connector.config.updateAgent(first, { skills: updated });
  try { connector.sendDaemonCommand('reload'); } catch {}
  const verb = second === 'enable' ? '已启用' : '已禁用';
  print(`${verb} ${first} 的 '${skillDef.name}'`);
}

async function cmdTestLLM(connector, _flags, positional) {
  const type = positional[0];
  if (!type) { print('用法：agn test-llm <类型>'); return; }

  const env = connector.getAgentEnv(type);
  const resolved = connector.resolveAgentEnv(type, env);
  const effective = { ...env, ...resolved };

  print(`正在测试 ${type} 的 LLM 连接...`);
  const result = await connector.testLLM(effective);
  if (result.success) {
    print(`成功！模型：${result.model}，响应：${result.response}`);
  } else {
    print(`失败：${result.error}`);
    process.exitCode = 1;
  }
}

async function cmdVersion() {
  const pkg = require('../package.json');
  print(`${pkg.name} v${pkg.version}`);
}

async function cmdUpdate() {
  const { checkForUpdate, runUpdate, currentVersion } = require('./update-check');
  const info = await checkForUpdate();
  if (!info) {
    print('无法连接 npm registry，请检查网络。');
    process.exitCode = 1;
    return;
  }
  if (!info.isNewer) {
    print(`已是最新版本（${currentVersion()}）。`);
    return;
  }
  print(`正在更新 ${info.current} → ${info.latest}...`);
  const ok = runUpdate();
  if (!ok) {
    print('更新失败。');
    process.exitCode = 1;
    return;
  }
  print(`已更新到 ${info.latest}。`);
}

async function cmdHelp() {
  print(`用法: agn <命令> [选项]

命令：
  up [--foreground]           启动守护进程（默认后台运行）
  down                        停止守护进程
  status                      显示智能体状态
  list                        列出已配置的智能体
  create <名称> [--type T]    创建新智能体
  remove <名称>               移除智能体
  start <名称>                启动单个智能体
  stop <名称>                 停止单个智能体
  install <类型>              安装智能体运行时
  uninstall <类型>            卸载智能体运行时
  search [关键词]             浏览智能体目录
  runtimes                    列出已安装的运行时
  connect <智能体> <Token>    连接智能体到工作空间
  disconnect <智能体>         断开智能体与工作空间的连接
  env <类型> [--set K=V]      查看/设置智能体类型的环境变量
  skills [智能体] [操作]      管理智能体技能（启用/禁用）
  tool-mode [智能体] [模式]   查看/设置工具模式（mcp 或 skills）
  autostart [--disable]       启用/禁用登录时自动启动
  test-llm <类型>             测试 LLM 连接
  logs [智能体] [--lines N]   查看守护进程日志
  workspace create [名称]     创建新工作空间
  workspace join <Token>      使用 Token 加入工作空间
  workspace list              列出已配置的工作空间
  mcp-server                  启动 MCP 服务器（stdio）提供工作空间工具
  update                      升级启动器到最新 npm 版本
  version                     显示版本
  help                        显示此帮助

选项：
  --config <目录>             配置目录（默认：~/.openagents）
  --install                   创建时安装运行时
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { cmd, flags, positional } = parseArgs(process.argv);

  if (cmd === 'help' || flags.help) { await cmdHelp(); return; }
  if (cmd === 'version' || flags.version) { await cmdVersion(); return; }

  // Check for a newer launcher version and offer to install it. Skip for:
  //   - mcp-server: JSON-RPC subprocess spawned by Claude Code
  //   - up --foreground: the backgrounded daemon child
  //   - tui / auto-TUI: interactive UI manages its own rendering
  //   - update: already updating; avoid recursion
  const skipUpdateCheck =
    cmd === 'mcp-server' ||
    (cmd === 'up' && flags.foreground) ||
    cmd === 'tui' ||
    cmd === 'update' ||
    flags['no-update-check'] ||
    process.env.OPENAGENTS_SKIP_UPDATE_CHECK === '1' ||
    (cmd === 'status' && process.argv.length <= 2 && process.stdin.isTTY);
  if (!skipUpdateCheck) {
    try {
      const { notifyAndMaybeUpdate } = require('./update-check');
      await notifyAndMaybeUpdate();
    } catch {}
  }

  const connector = getConnector(flags);

  // Launch TUI if command is 'tui' or no command with interactive terminal
  if (cmd === 'tui' || (cmd === 'status' && process.argv.length <= 2 && process.stdin.isTTY)) {
    try {
      const { run } = require('./tui');
      run();
      return;
    } catch (e) {
      // Fall through to text-based status if blessed not available
      if (e.code !== 'MODULE_NOT_FOUND') {
        print(`TUI 错误：${e.message}`);
        process.exitCode = 1;
        return;
      }
    }
  }

  const commands = {
    tui: () => { const { run } = require('./tui'); run(); },
    up: () => cmdUp(connector, flags),
    down: () => cmdDown(connector),
    status: () => cmdStatus(connector),
    list: () => cmdList(connector),
    create: () => cmdCreate(connector, flags, positional),
    remove: () => cmdRemove(connector, flags, positional),
    start: () => cmdStart(connector, flags, positional),
    stop: () => cmdStop(connector, flags, positional),
    install: () => cmdInstall(connector, flags, positional),
    uninstall: () => cmdUninstall(connector, flags, positional),
    search: () => cmdSearch(connector, flags, positional),
    runtimes: () => cmdRuntimes(connector),
    connect: () => cmdConnect(connector, flags, positional),
    disconnect: () => cmdDisconnect(connector, flags, positional),
    logs: () => cmdLogs(connector, flags, positional),
    autostart: () => cmdAutostart(connector, flags),
    workspace: () => cmdWorkspace(connector, flags, positional),
    env: () => cmdEnv(connector, flags, positional),
    skills: () => cmdSkills(connector, flags, positional),
    'tool-mode': () => cmdToolMode(connector, flags, positional),
    'test-llm': () => cmdTestLLM(connector, flags, positional),
    update: () => cmdUpdate(),
    'mcp-server': () => {
      const { runMcpServer } = require('./mcp-server');
      const workspaceId = flags['workspace-id'] || process.env.OPENAGENTS_WORKSPACE_ID;
      const channelName = flags['channel-name'] || process.env.OPENAGENTS_CHANNEL_NAME || 'general';
      const agentName = flags['agent-name'] || process.env.OPENAGENTS_AGENT_NAME || 'agent';
      const endpoint = flags.endpoint || process.env.OPENAGENTS_ENDPOINT || 'https://workspace-endpoint.openagents.org';
      const token = process.env.OA_WORKSPACE_TOKEN || '';
      if (!workspaceId || !token) {
        print('错误：必须设置 --workspace-id 和 OA_WORKSPACE_TOKEN 环境变量');
        process.exitCode = 1;
        return;
      }
      const disabledModules = new Set();
      if (flags['disable-files']) disabledModules.add('files');
      if (flags['disable-browser']) disabledModules.add('browser');
      runMcpServer({ workspaceId, channelName, agentName, endpoint, token, disabledModules });
    },
  };

  const handler = commands[cmd];
  if (!handler) {
    print(`未知命令：${cmd}`);
    print('运行：agn help');
    process.exitCode = 1;
    return;
  }

  try {
    await handler();
  } catch (e) {
    print(`错误：${e.message}`);
    process.exitCode = 1;
  }
}

main();
