/**
 * Interactive TUI dashboard for OpenAgents — `openagents` or `openagents tui`
 *
 * Mirrors the Python Textual TUI (cli_tui.py) with blessed.
 */

'use strict';

const blessed = require('blessed');
const { AgentConnector } = require('./index');
const { loadAgentRows, connectAvailable } = require('./agent-rows');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { getExtraBinDirs } = require('./paths');

const IS_WINDOWS = process.platform === 'win32';

// ── Color palette ───────────────────────────────────────────────────────────

const COLORS = {
  primary: 'blue',
  accent: 'cyan',
  surface: 'black',
  headerBg: 'blue',
  headerFg: 'white',
  footerBg: 'blue',
  footerFg: 'white',
  panelBorder: 'cyan',
  logBorder: 'blue',
  colHeaderBg: 'grey',
  colHeaderFg: 'black',
  selected: { bg: 'blue', fg: 'white' },
  stateRunning: 'green',
  stateStopped: 'gray',
  stateError: 'red',
  stateStarting: 'yellow',
};

const STATE_DISPLAY = {
  online:        { sym: '\u25CF', color: COLORS.stateRunning, label: '已连接' },
  running:       { sym: '\u25CF', color: COLORS.stateRunning, label: '已连接' },
  idle:          { sym: '\u25CB', color: COLORS.stateStarting, label: '就绪' },
  starting:      { sym: '\u25D0', color: COLORS.stateStarting, label: '启动中' },
  reconnecting:  { sym: '\u25D0', color: COLORS.stateStarting, label: '重连中' },
  stopped:       { sym: '\u25CB', color: COLORS.stateStopped, label: '已停止' },
  'not configured': { sym: '\u25CB', color: COLORS.stateStopped, label: '未配置' },
  error:         { sym: '\u2717', color: COLORS.stateError, label: '错误' },
};

function stateMarkup(state, hasWorkspace) {
  const d = STATE_DISPLAY[state] || { sym: '?', color: 'white', label: state };
  let label = d.label;
  // For running/connected agents, clarify workspace status
  if ((state === 'running' || state === 'online') && !hasWorkspace) {
    label = '运行中';
  }
  return `{${d.color}-fg}${d.sym} ${label}{/${d.color}-fg}`;
}

// ── Data helpers ────────────────────────────────────────────────────────────

function getConnector() {
  const configDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.openagents');
  return new AgentConnector({ configDir });
}

  function describeHealth(health) {
    if (!health) return '';
    if (!health.ready) return health.message || '未配置';
    const parts = ['就绪'];
    if (health.auth_mode === 'api_key') parts.push('API 密钥');
    else if (health.auth_mode === 'cli_login') parts.push('CLI 登录');
    if (health.execution_mode && health.execution_mode !== 'unavailable') {
      parts.push(health.execution_mode);
    }
    return parts.join(' | ');
  }

function loadCatalog(connector) {
  const entries = connector.registry.getCatalogSync();
  return entries.map(e => {
    let installed = false;
    try { installed = !!connector.installer.getInstallInfo(e.name).installed; } catch {}
    return {
      name: e.name,
      label: e.label || e.name,
      description: e.description || '',
      installed,
      envConfig: e.env_config || [],
      checkReady: e.check_ready || null,
      loginCommand: (e.check_ready && e.check_ready.login_command) || null,
    };
  });
}

function generateAgentName(type) {
  const adj = ['swift', 'bright', 'calm', 'keen', 'bold'];
  const noun = ['wolf', 'hawk', 'fox', 'bear', 'lynx'];
  const a = adj[Math.floor(Math.random() * adj.length)];
  const n = noun[Math.floor(Math.random() * noun.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${type}-${a}-${n}-${num}`;
}

// ── Main TUI ────────────────────────────────────────────────────────────────

function createTUI() {
  const screen = blessed.screen({
    smartCSR: true,
    mouse: true,
    title: 'OpenAgents',
    fullUnicode: true,
    tags: true,
  });

  // Full-screen background to ensure dark bg on all terminal themes
  const bgFill = blessed.box({
    top: 0, left: 0, width: '100%', height: '100%',
    style: { bg: 'black' },
  });
  screen.append(bgFill);
  const connector = getConnector();
  let pkg;
  try { pkg = require('../package.json'); } catch { pkg = { version: '?' }; }

  let agentRows = [];
  let currentView = 'main';

  // ── Header ──
  const header = blessed.box({
    top: 0, left: 0, width: '100%', height: 1,
    tags: true,
    style: { bg: COLORS.headerBg, fg: COLORS.headerFg, bold: true },
  });

  // ── Title ──
  const titleBox = blessed.box({
    top: 1, left: 0, width: '100%', height: 1,
    tags: true,
    content: `  {bold}OpenAgents{/bold} {gray-fg}v${pkg.version}{/gray-fg}`,
    style: { fg: 'white', bg: 'black' },
  });

  // ── Agent Panel (bordered) ──
  const agentPanel = blessed.box({
    top: 2, left: 0, width: '100%', height: '60%-1',
    border: { type: 'line' },
    label: ' {bold}智能体{/bold} ',
    tags: true,
    style: { bg: 'black', border: { fg: COLORS.panelBorder }, label: { fg: COLORS.accent } },
  });

  // ── Column Headers ──
  const colHeaders = blessed.box({
    parent: agentPanel,
    top: 0, left: 0, width: '100%-2', height: 1,
    tags: true,
    style: { bg: COLORS.colHeaderBg, fg: COLORS.colHeaderFg },
    content: `  ${'NAME'.padEnd(22)} ${'TYPE'.padEnd(14)} ${'STATUS'.padEnd(18)} WORKSPACE`,
  });

  // ── Agent List ──
  const agentList = blessed.list({
    parent: agentPanel,
    top: 1, left: 0, width: '100%-2', height: '100%-3',
    keys: false, vi: false, mouse: true,
    tags: true,
    style: {
      bg: 'black',
      selected: { bg: COLORS.selected.bg, fg: COLORS.selected.fg, bold: true },
      item: { fg: 'white', bg: 'black' },
    },
  });

  // ── Log Panel (bordered) ──
  const logPanel = blessed.box({
    top: '60%+1', left: 0, width: '100%', height: '40%-2',
    border: { type: 'line' },
    label: ' {bold}活动日志{/bold} ',
    tags: true,
    style: { bg: 'black', border: { fg: COLORS.logBorder }, label: { fg: COLORS.primary } },
  });

  const logContent = blessed.log({
    parent: logPanel,
    top: 0, left: 0, width: '100%-2', height: '100%-2',
    scrollable: true, scrollOnInput: true,
    tags: true,
    style: { fg: 'white', bg: 'black' },
  });

  // ── Footer (clickable buttons) ──
  const footerBar = blessed.box({
    bottom: 0, left: 0, width: '100%', height: 1,
    tags: true,
    style: { bg: COLORS.footerBg, fg: COLORS.footerFg },
  });
  let footerButtons = [];

  screen.append(header);
  screen.append(titleBox);
  screen.append(agentPanel);
  screen.append(logPanel);
  screen.append(footerBar);

  // ── Log helper ──
  function log(msg) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    logContent.log(`{gray-fg}${ts}{/gray-fg}  ${msg}`);
    screen.render();
  }

  // ── Footer rendering (context-aware, clickable) ──
  function updateFooter() {
    const agent = selectedAgent();
    const items = [];

    items.push({ key: 'i', label: '安装', actionName: 'Install' });
    items.push({ key: 'n', label: '新建', actionName: 'New' });

    if (agent && agent.configured) {
      const isRunning = ['running', 'online', 'starting', 'reconnecting'].includes(agent.state);
      const isStopped = ['stopped', 'error'].includes(agent.state);

      if (isStopped) items.push({ key: 's', label: '启动', actionName: 'Start' });
      if (isRunning) items.push({ key: 'x', label: '停止', actionName: 'Stop' });

      const envFields = connector.registry.getEnvFields(agent.type);
      if (envFields && envFields.length > 0) items.push({ key: 'e', label: '配置', actionName: 'Configure' });

      if (connectAvailable(agent)) items.push({ key: 'c', label: '连接', actionName: 'Connect' });
      if (agent.workspace) items.push({ key: 'd', label: '断开', actionName: 'Disconnect' });
      if (agent.workspace) items.push({ key: 'w', label: '工作空间', actionName: 'Workspace' });

      items.push({ key: 'Del', label: '移除', actionName: 'Remove' });
    }

    items.push({ key: 'u', label: '守护进程', actionName: 'Daemon' });
    items.push({ key: 'r', label: '刷新', actionName: 'Refresh' });
    items.push({ key: 'q', label: '退出', actionName: 'Quit' });

    // Remove old buttons
    for (const btn of footerButtons) { footerBar.remove(btn); btn.destroy(); }
    footerButtons = [];

    let left = 1;
    for (const item of items) {
      const text = `${item.key} ${item.label}`;
      const btn = blessed.box({
        parent: footerBar,
        left, top: 0, height: 1,
        width: text.length + 2,
        tags: true,
        mouse: true,
        clickable: true,
        content: `{cyan-fg}${item.key}{/cyan-fg} ${item.label}`,
        style: { bg: COLORS.footerBg, fg: COLORS.footerFg, hover: { bg: 'cyan', fg: 'black' } },
      });
      const action = item.actionName ? footerActions[item.actionName] : null;
      if (action) {
        btn.on('click', () => action());
      }
      footerButtons.push(btn);
      left += text.length + 2;
    }

    screen.render();
  }

  // ── Agent table refresh ──
  function refreshAgentTable() {
    const savedIdx = Math.floor((agentList.selected || 0) / 2);
    try { agentRows = loadAgentRows(connector); } catch { agentRows = []; }

    if (agentRows.length === 0) {
      agentList.setItems(['  {gray-fg}未配置智能体。按 {bold}i{/bold} 安装，按 {bold}n{/bold} 创建。{/gray-fg}']);
    } else {
      // Two rows per agent: main row + detail row (path + config status)
      const items = [];
      for (const r of agentRows) {
        const state = stateMarkup(r.state, !!r.workspace);
        // Local-only agents (no workspace) show a dimmed "(local)" marker.
        const ws = r.workspace || `{gray-fg}${r.workspaceLabel}{/gray-fg}`;
        items.push(`  ${r.name.padEnd(22)} ${r.type.padEnd(14)} ${state.padEnd(30)} ${ws}`);
        // Detail row: working dir + config warning
        const details = [];
        details.push(r.path || process.env.HOME || '~');
        if (r.health) details.push(`{cyan-fg}${describeHealth(r.health)}{/cyan-fg}`);
        if (r.notReadyMsg) details.push(`{yellow-fg}⚠ ${r.notReadyMsg}{/yellow-fg}`);
        items.push(`  {gray-fg}  ${details.join('  |  ')}{/gray-fg}`);
      }
      agentList.setItems(items);
    }

    // Restore cursor position (2 rows per agent)
    if (agentRows.length > 0) {
      agentList.select(Math.min(savedIdx * 2, (agentRows.length - 1) * 2));
    }

    updateHeader();
    updateFooter();
    screen.render();
  }

  function updateHeader() {
    const pid = connector.getDaemonPid();
    const dot = pid ? `{green-fg}\u25CF{/green-fg}` : `{gray-fg}\u25CB{/gray-fg}`;
    const state = pid ? '守护进程运行中' : '守护进程空闲';
    const count = agentRows.length;

    // Show installed runtimes
    let installed = [];
    try {
      const catalog = loadCatalog(connector);
      installed = catalog.filter(e => e.installed).map(e => e.name);
    } catch {}
    const installedStr = installed.length
      ? `  {gray-fg}|{/gray-fg}  {green-fg}${installed.join(', ')}{/green-fg} 已安装`
      : '';

    header.setContent(
      `  ${dot} ${state}  {gray-fg}|{/gray-fg}  ${count} 个智能体已配置${installedStr}`
    );
  }

  // Helper: get currently selected agent (2 rows per agent)
  function selectedAgent() {
    return agentRows[Math.floor((agentList.selected || 0) / 2)];
  }

  // Override up/down to skip detail rows (move by 2)
  agentList.key(['down', 'j'], () => {
    const idx = agentList.selected || 0;
    const next = idx + 2;
    if (next < agentList.items.length) {
      agentList.select(next);
      screen.render();
    }
  });
  agentList.key(['up', 'k'], () => {
    const idx = agentList.selected || 0;
    const prev = idx - 2;
    if (prev >= 0) {
      agentList.select(prev);
      screen.render();
    }
  });
  agentList.on('select item', () => updateFooter());

  // ── Enter key → Context menu ──
  agentList.key('enter', () => {
    if (currentView !== 'main') return;
    const agent = selectedAgent();
    if (!agent || !agent.configured) return;
    showAgentActionMenu(agent);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Agent Action Menu (context menu on Enter)
  // ────────────────────────────────────────────────────────────────────────

  function showAgentActionMenu(agent) {
    const actions = [];
    const isRunning = ['running', 'online', 'starting', 'reconnecting'].includes(agent.state);
    const isStopped = ['stopped', 'error'].includes(agent.state);

    const envFields = connector.registry.getEnvFields(agent.type);
    if (envFields && envFields.length > 0) actions.push({ label: '配置', key: 'configure' });

    const catalog = connector.registry.getCatalogSync();
    const entry = catalog.find(e => e.name === agent.type);
    if (entry && entry.check_ready && entry.check_ready.login_command) {
      actions.push({ label: '登录', key: 'login' });
    }

    if (isStopped) actions.push({ label: '启动', key: 'start' });
    if (isRunning) actions.push({ label: '停止', key: 'stop' });
    if (agent.workspace) actions.push({ label: '打开工作空间', key: 'open_workspace' });
    if (connectAvailable(agent)) actions.push({ label: '连接到工作空间', key: 'connect' });
    if (agent.workspace) actions.push({ label: '断开工作空间', key: 'disconnect' });
    actions.push({ label: '移除', key: 'remove' });

    if (actions.length === 0) return;

    const listHeight = Math.min(actions.length + 2, 14);
    const dialog = blessed.box({
      top: 'center', left: 'center',
      width: 40, height: listHeight + 2,
      border: { type: 'line' },
      tags: true,
      label: ` {bold}${agent.name}{/bold} `,
      style: { border: { fg: COLORS.accent }, bg: COLORS.surface },
    });

    const actionList = blessed.list({
      parent: dialog,
      top: 0, left: 1, width: '100%-4', height: listHeight,
      keys: true, vi: true, mouse: true,
      tags: true,
      style: {
        selected: { bg: COLORS.selected.bg, fg: COLORS.selected.fg, bold: true },
        item: { fg: 'white' },
      },
      items: actions.map(a => `  ${a.label}`),
    });

    screen.append(dialog);
    actionList.focus();
    screen.render();

    const close = () => {
      screen.remove(dialog);
      dialog.destroy();
      agentList.focus();
      screen.render();
    };

    actionList.on('select', (_item, idx) => {
      const action = actions[idx];
      close();
      if (!action) return;
      switch (action.key) {
        case 'configure': showConfigureScreen(agent); break;
        case 'login': doLogin(agent); break;
        case 'start': doStart(agent.name); break;
        case 'stop': doStop(agent.name); break;
        case 'open_workspace': doOpenWorkspace(agent); break;
        case 'connect': showConnectWorkspaceScreen(agent.name); break;
        case 'disconnect': doDisconnect(agent.name); break;
        case 'remove': doRemove(agent.name); break;
      }
    });

    actionList.key('escape', close);
    dialog.key('escape', close);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Install Screen
  // ────────────────────────────────────────────────────────────────────────

  function showInstallScreen() {
    currentView = 'install';
    let catalog;
    try { catalog = loadCatalog(connector); } catch (e) { log(`{red-fg}Error:{/red-fg} ${e.message}`); return; }

    const box = blessed.box({ top: 0, left: 0, width: '100%', height: '100%', style: { bg: COLORS.surface } });

    blessed.box({
      parent: box, top: 0, left: 0, width: '100%', height: 1,
      tags: true,
      style: { bg: COLORS.headerBg, fg: COLORS.headerFg, bold: true },
      content: '  {bold}安装智能体运行时{/bold}  {gray-fg}\u2014  Enter 安装，Esc 返回{/gray-fg}',
    });

    blessed.box({
      parent: box, top: 1, left: 0, width: '100%', height: 1,
      tags: true,
      style: { bg: COLORS.colHeaderBg, fg: COLORS.colHeaderFg },
      content: `  ${'智能体'.padEnd(25)} ${'状态'.padEnd(18)} 描述`,
    });

    const list = blessed.list({
      parent: box, top: 2, left: 0, width: '100%', height: '50%-1',
      keys: true, vi: true, mouse: true,
      tags: true,
      style: {
        selected: { bg: COLORS.selected.bg, fg: COLORS.selected.fg, bold: true },
        item: { fg: 'white' },
      },
    });

    // Install log panel — shows full streaming output
    const logPanel = blessed.box({
      parent: box, top: '50%+1', left: 0, width: '100%', height: '50%-2',
      border: { type: 'line' },
      label: ' {bold}Install Log{/bold} ',
      tags: true,
      style: { border: { fg: COLORS.panelBorder }, label: { fg: COLORS.accent } },
    });

    const installLog = blessed.log({
      parent: logPanel,
      top: 0, left: 0, width: '100%-2', height: '100%-2',
      scrollable: true, scrollOnInput: true,
      tags: true,
      padding: { left: 1 },
      style: { fg: 'grey' },
    });

    blessed.box({
      parent: box, bottom: 0, left: 0, width: '100%', height: 1,
      tags: true,
      style: { bg: COLORS.footerBg, fg: COLORS.footerFg },
      content: ' {cyan-fg}Enter{/cyan-fg} 安装/更新  {cyan-fg}Esc{/cyan-fg} 返回',
    });

    function renderList() {
      list.setItems(catalog.map(e => {
        const st = e.installed
          ? `{green-fg}\u25CF 已安装{/green-fg}`
          : `{yellow-fg}\u25CB 可用{/yellow-fg}`;
        const desc = e.description ? e.description.substring(0, 40) : '';
        return `  ${e.label.padEnd(25)} ${st.padEnd(30)} {gray-fg}${desc}{/gray-fg}`;
      }));
    }
    renderList();
    list.focus();

    let installing = false;

    list.on('select', (_item, idx) => {
      if (installing) return;
      const entry = catalog[idx];
      if (!entry) return;
      const verb = entry.installed ? 'Update' : 'Install';

      showConfirmDialog(`${verb} ${entry.label}?`, (yes) => {
        if (yes) {
          installing = true;
          doInstall(entry, logPanel, installLog, list, catalog, renderList, () => { installing = false; });
        }
        list.focus();
        screen.render();
      });
    });

    list.key('escape', () => {
      screen.remove(box);
      box.destroy();
      currentView = 'main';
      agentList.focus();
      refreshAgentTable();
    });

    screen.append(box);
    list.focus();
    screen.render();
  }

  function doInstall(entry, logPanel, installLog, list, catalog, renderList, onDone) {
    logPanel.setLabel(` {bold}Installing ${entry.name}...{/bold} `);
    installLog.setContent('');
    installLog.log(`{cyan-fg}>>> Installing ${entry.name}...{/cyan-fg}`);
    screen.render();
    log(`Installing {cyan-fg}${entry.name}{/cyan-fg}...`);

    connector.installer.installStreaming(entry.name, (chunk) => {
      const lines = chunk.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const clean = line.trim().substring(0, 120);
        installLog.log(clean);
        screen.render();
      }
    }).then(() => {
      installLog.log('');
      installLog.log(`{green-fg}\u2713 ${entry.name} 安装成功！{/green-fg}`);
      installLog.log('');
      installLog.log(`{cyan-fg}按 c 创建 ${entry.name} 智能体，按 Esc 返回。{/cyan-fg}`);
      logPanel.setLabel(` {bold}{green-fg}安装完成{/green-fg}{/bold} `);
      log(`{green-fg}\u2713{/green-fg} ${entry.name} 已安装`);
      const idx = catalog.findIndex(c => c.name === entry.name);
      if (idx >= 0) catalog[idx].installed = true;
      renderList();
      onDone();
      list.focus();
      screen.render();

      // Listen for 'c' to create agent from just-installed type
      const onCreateKey = (ch) => {
        if (ch === 'c') {
          screen.unkey(['c', 'escape'], onCreateKey);
          // Go back to main and start agent creation flow
          list.emit('keypress', null, { name: 'escape' });
          setTimeout(() => {
            showStartAgentScreen(entry.name, (result) => {
              try {
                connector.addAgent({ name: result.name, type: result.type, path: result.path });
                log(`{green-fg}\u2713{/green-fg} Created agent {cyan-fg}${result.name}{/cyan-fg} (${result.type})`);
                const pid = connector.getDaemonPid();
                if (!pid) {
                  connector.startDaemon();
                  log('{green-fg}\u2713{/green-fg} Daemon starting...');
                } else {
                  signalDaemonReload();
                }
              } catch (e) {
                log(`{red-fg}\u2717{/red-fg} ${e.message}`);
              }
              setTimeout(refreshAgentTable, 3000);
            });
          }, 200);
        } else {
          screen.unkey(['c', 'escape'], onCreateKey);
        }
      };
      screen.key(['c', 'escape'], onCreateKey);
    }).catch((e) => {
      installLog.log('');
      installLog.log(`{red-fg}\u2717 失败：${e.message}{/red-fg}`);
      logPanel.setLabel(` {bold}{red-fg}安装失败{/red-fg}{/bold} `);
      log(`{red-fg}\u2717 安装失败：{/red-fg} ${e.message}`);
      onDone();
      list.focus();
      screen.render();
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Select Agent Type Screen
  // ────────────────────────────────────────────────────────────────────────

  function showSelectAgentTypeScreen(callback) {
    const catalog = loadCatalog(connector);
    const installed = catalog.filter(e => e.installed);

    if (installed.length === 0) {
      log('{yellow-fg}No agent runtimes installed. Press i to install one first.{/yellow-fg}');
      return;
    }

    const dialogHeight = Math.min(installed.length + 4, 16);
    const dialog = blessed.box({
      top: 'center', left: 'center',
      width: 50, height: dialogHeight,
      border: { type: 'line' },
      tags: true,
      label: ' {bold}选择智能体类型{/bold} ',
      style: { border: { fg: COLORS.accent }, bg: COLORS.surface },
    });

    const typeList = blessed.list({
      parent: dialog,
      top: 1, left: 1, width: '100%-4', height: dialogHeight - 4,
      keys: true, vi: true, mouse: true,
      tags: true,
      style: {
        selected: { bg: COLORS.selected.bg, fg: COLORS.selected.fg, bold: true },
        item: { fg: 'white' },
      },
      items: installed.map(e => `  {green-fg}\u2713{/green-fg} ${e.label} {gray-fg}(${e.name}){/gray-fg}`),
    });

    blessed.box({
      parent: dialog,
      bottom: 0, left: 0, width: '100%-2', height: 1,
      tags: true,
      content: ' {gray-fg}Enter 选择，Esc 取消{/gray-fg}',
    });

    screen.append(dialog);
    typeList.focus();
    screen.render();

    const close = () => {
      screen.remove(dialog);
      dialog.destroy();
      agentList.focus();
      screen.render();
    };

    typeList.on('select', (_item, idx) => {
      const selected = installed[idx];
      close();
      if (selected) callback(selected.name);
    });

    typeList.key('escape', close);
    dialog.key('escape', close);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Start Agent Screen (name + working dir)
  // ────────────────────────────────────────────────────────────────────────

  function showStartAgentScreen(agentType, callback) {
    const defaultName = generateAgentName(agentType);
    const defaultPath = process.cwd();

    const dialog = blessed.box({
      top: 'center', left: 'center',
      width: 60, height: 15,
      border: { type: 'line' },
      tags: true,
      label: ` {bold}启动 ${agentType} 智能体{/bold} `,
      style: { border: { fg: COLORS.accent }, bg: COLORS.surface },
    });

    blessed.text({ parent: dialog, top: 1, left: 2, tags: true, content: `{bold}智能体名称：{/bold} {gray-fg}（默认：${defaultName}）{/gray-fg}` });
    const nameInput = blessed.textbox({
      parent: dialog, top: 2, left: 2, width: 50, height: 3,
      border: { type: 'line' }, inputOnFocus: true,
      style: { fg: 'white', bg: COLORS.surface, focus: { border: { fg: COLORS.accent } }, border: { fg: 'grey' } },
    });

    blessed.text({ parent: dialog, top: 5, left: 2, tags: true, content: `{bold}工作目录：{/bold} {gray-fg}（默认：${defaultPath}）{/gray-fg}` });
    const pathInput = blessed.textbox({
      parent: dialog, top: 6, left: 2, width: 50, height: 3,
      border: { type: 'line' }, inputOnFocus: true,
      value: defaultPath,
      style: { fg: 'white', bg: COLORS.surface, focus: { border: { fg: COLORS.accent } }, border: { fg: 'grey' } },
    });

    blessed.text({
      parent: dialog, top: 10, left: 2,
      tags: true,
      content: '{gray-fg}Enter 确认，Escape 取消{/gray-fg}',
    });

    const msg = blessed.text({ parent: dialog, top: 11, left: 2, tags: true, content: '' });

    screen.append(dialog);
    nameInput.focus();
    screen.render();

    // Override _listener on textboxes to intercept Tab before it's inserted
    const origNameListener = nameInput._listener.bind(nameInput);
    nameInput._listener = function(ch, key) {
      if (key.name === 'tab') { nameInput._done(null, nameInput.value); pathInput.focus(); return; }
      return origNameListener(ch, key);
    };
    const origPathListener = pathInput._listener.bind(pathInput);
    pathInput._listener = function(ch, key) {
      if (key.name === 'tab') { pathInput._done(null, pathInput.value); nameInput.focus(); return; }
      return origPathListener(ch, key);
    };

    const close = () => {
      screen.remove(dialog);
      dialog.destroy();
      agentList.focus();
      screen.render();
    };

    nameInput.key('enter', () => pathInput.focus());
    pathInput.key('enter', () => {
      const name = nameInput.getValue().trim() || defaultName;
      const agentPath = pathInput.getValue().trim() || defaultPath;
      close();
      callback({ name, type: agentType, path: agentPath });
    });

    dialog.key('escape', close);
    nameInput.key('escape', close);
    pathInput.key('escape', close);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Configure Agent Screen (env vars + LLM test)
  // ────────────────────────────────────────────────────────────────────────

  function showConfigureScreen(agent) {
    currentView = 'configure';
    const envFields = connector.registry.getEnvFields(agent.type);
    if (!envFields || envFields.length === 0) {
      log('{gray-fg}No configuration required for this agent type.{/gray-fg}');
      return;
    }

    const saved = connector.getAgentEnv(agent.type);

    const box = blessed.box({ top: 0, left: 0, width: '100%', height: '100%', style: { bg: COLORS.surface } });

    blessed.box({
      parent: box, top: 0, left: 0, width: '100%', height: 1,
      tags: true,
      style: { bg: COLORS.headerBg, fg: COLORS.headerFg, bold: true },
      content: `  {bold}配置 ${agent.type}{/bold}  {gray-fg}\u2014  保存到 ~/.openagents/env/{/gray-fg}`,
    });

    const inputs = [];
    let yPos = 2;

    for (const field of envFields) {
      const current = saved[field.name] || field.default || '';
      const req = field.required ? ' {red-fg}*{/red-fg}' : '';
      const placeholder = field.placeholder || `Enter ${field.name}...`;

      blessed.text({
        parent: box, top: yPos, left: 2,
        tags: true,
        content: `{bold}${field.description || field.name}{/bold}${req}`,
      });
      yPos++;

      const input = blessed.textbox({
        parent: box, top: yPos, left: 2, width: '80%', height: 3,
        border: { type: 'line' }, inputOnFocus: true,
        value: current,
        censor: field.password || false,
        style: { fg: 'white', bg: COLORS.surface, focus: { border: { fg: COLORS.accent } }, border: { fg: 'grey' } },
      });
      input._fieldName = field.name;
      inputs.push(input);
      yPos += 3;
    }

    // Buttons row
    const btnSave = blessed.button({
      parent: box, top: yPos + 1, left: 2,
      width: 12, height: 3,
      border: { type: 'line' },
      tags: true,
      content: '  {bold}Save{/bold}',
      style: { bg: COLORS.primary, fg: 'white', border: { fg: COLORS.accent }, focus: { bg: 'blue' } },
      mouse: true, keys: true,
    });

    const btnTest = blessed.button({
      parent: box, top: yPos + 1, left: 16,
      width: 12, height: 3,
      border: { type: 'line' },
      tags: true,
      content: '  {bold}Test{/bold}',
      style: { fg: 'white', border: { fg: 'grey' }, focus: { bg: 'blue' } },
      mouse: true, keys: true,
    });

    const testResult = blessed.text({
      parent: box, top: yPos + 4, left: 2,
      tags: true,
      content: '',
    });

    blessed.box({
      parent: box, bottom: 0, left: 0, width: '100%', height: 1,
      tags: true,
      style: { bg: COLORS.footerBg, fg: COLORS.footerFg },
      content: ' {cyan-fg}Tab{/cyan-fg} 下一个  {cyan-fg}Ctrl+U{/cyan-fg} 清空  {cyan-fg}Ctrl+S{/cyan-fg} 保存  {cyan-fg}Ctrl+T{/cyan-fg} 测试  {cyan-fg}Esc{/cyan-fg} 返回',
    });

    screen.append(box);
    if (inputs.length > 0) inputs[0].focus();
    screen.render();

    // Enter moves to next field, last field triggers save
    for (let i = 0; i < inputs.length; i++) {
      inputs[i].key('enter', () => {
        if (i < inputs.length - 1) {
          inputs[i + 1].focus();
        } else {
          doSave();
        }
      });
    }

    // Override _listener on textboxes to intercept Tab and Escape
    for (let i = 0; i < inputs.length; i++) {
      const orig = inputs[i]._listener.bind(inputs[i]);
      const idx = i;
      inputs[i]._listener = function(ch, key) {
        if (key.name === 'tab' && inputs.length > 1) {
          inputs[idx]._done(null, inputs[idx].value);
          inputs[(idx + 1) % inputs.length].focus();
          return;
        }
        if (key.name === 'escape') {
          inputs[idx]._done(null, inputs[idx].value);
          closeConfig();
          return;
        }
        // Ctrl+U to clear field
        if (key.ctrl && key.name === 'u') {
          inputs[idx].value = '';
          inputs[idx].setValue('');
          screen.render();
          return;
        }
        // Ctrl+S to save, Ctrl+T to test
        if (key.ctrl && key.name === 's') { inputs[idx]._done(null, inputs[idx].value); doSave(); return; }
        if (key.ctrl && key.name === 't') { inputs[idx]._done(null, inputs[idx].value); doTest(); return; }
        return orig(ch, key);
      };
    }

    function gatherEnv() {
      const env = {};
      for (const input of inputs) {
        const val = input.getValue().trim();
        if (val) env[input._fieldName] = val;
      }
      return env;
    }

    function doSave() {
      const env = gatherEnv();
      connector.saveAgentEnv(agent.type, env);
      signalDaemonReload();
      log(`{green-fg}\u2713{/green-fg} Configuration saved for ${agent.type}`);
      closeConfig();
    }

    function doTest() {
      const env = gatherEnv();
      const resolved = connector.resolveAgentEnv(agent.type, env);
      const effective = { ...env, ...resolved };

      if (!effective.LLM_API_KEY && !effective.OPENAI_API_KEY && !effective.ANTHROPIC_API_KEY) {
        testResult.setContent('{red-fg}No API key entered{/red-fg}');
        screen.render();
        return;
      }

      testResult.setContent('{gray-fg}Testing...{/gray-fg}');
      screen.render();

      connector.testLLM(effective).then(result => {
        if (result.success) {
          testResult.setContent(`{green-fg}\u2713 OK{/green-fg} \u2014 model: ${result.model}, response: ${(result.response || '').substring(0, 50)}`);
        } else {
          testResult.setContent(`{red-fg}\u2717 ${result.error || 'Unknown error'}{/red-fg}`);
        }
        screen.render();
      }).catch(err => {
        testResult.setContent(`{red-fg}\u2717 ${err.message}{/red-fg}`);
        screen.render();
      });
    }

    function closeConfig() {
      screen.remove(box);
      box.destroy();
      currentView = 'main';
      agentList.focus();
      refreshAgentTable();
    }

    btnSave.on('press', doSave);
    btnTest.on('press', doTest);

    box.key('escape', closeConfig);
    box.key('C-s', doSave);
    box.key('C-t', doTest);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Connect Workspace Screen
  // ────────────────────────────────────────────────────────────────────────

  function showConnectWorkspaceScreen(agentName) {
    currentView = 'connect';
    const config = connector.config.load();
    const networks = config.networks || [];

    const box = blessed.box({ top: 0, left: 0, width: '100%', height: '100%', style: { bg: COLORS.surface } });

    blessed.box({
      parent: box, top: 0, left: 0, width: '100%', height: 1,
      tags: true,
      style: { bg: COLORS.headerBg, fg: COLORS.headerFg, bold: true },
      content: `  {bold}将 '${agentName}' 连接到工作空间{/bold}  {gray-fg}\u2014  选择工作空间并按 Enter{/gray-fg}`,
    });

    blessed.box({
      parent: box, top: 1, left: 0, width: '100%', height: 1,
      tags: true,
      style: { bg: COLORS.colHeaderBg, fg: COLORS.colHeaderFg },
      content: `  ${'工作空间'.padEnd(30)} URL`,
    });

    const rowActions = [];
    const items = [];

    for (const net of networks) {
      const name = net.name || net.slug || net.id;
      const slug = net.slug || net.id;
      const isLocal = (net.endpoint || '').includes('localhost') || (net.endpoint || '').includes('127.0.0.1');
      const url = isLocal ? `${net.endpoint}/${slug}` : `https://workspace.openagents.org/${slug}`;
      items.push(`  ${name.padEnd(30)} {gray-fg}${url}{/gray-fg}`);
      rowActions.push(`existing:${slug}`);
    }

    items.push(`  {bold}{green-fg}\u271A 创建新工作空间{/green-fg}{/bold}`);
    rowActions.push('__create__');
    items.push(`  {bold}{yellow-fg}\u{1F511} 使用 Token 加入{/yellow-fg}{/bold}`);
    rowActions.push('__token__');

    const list = blessed.list({
      parent: box, top: 2, left: 0, width: '100%', height: '100%-4',
      keys: true, vi: true, mouse: true,
      tags: true,
      style: {
        selected: { bg: COLORS.selected.bg, fg: COLORS.selected.fg, bold: true },
        item: { fg: 'white' },
      },
      items,
    });

    blessed.box({
      parent: box, bottom: 0, left: 0, width: '100%', height: 1,
      tags: true,
      style: { bg: COLORS.footerBg, fg: COLORS.footerFg },
      content: ' {cyan-fg}Enter{/cyan-fg} 选择  {cyan-fg}Esc{/cyan-fg} 返回',
    });

    screen.append(box);
    list.focus();
    screen.render();

    const closeScreen = () => {
      screen.remove(box);
      box.destroy();
      currentView = 'main';
      agentList.focus();
      refreshAgentTable();
    };

    list.on('select', (_item, idx) => {
      const action = rowActions[idx];
      closeScreen();

      if (action && action.startsWith('existing:')) {
        const slug = action.split(':')[1];
        try {
          connector.connectWorkspace(agentName, slug);
          signalDaemonReload();
          log(`{green-fg}\u2713{/green-fg} Connected {cyan-fg}${agentName}{/cyan-fg} \u2192 ${slug}`);
        } catch (e) {
          log(`{red-fg}\u2717 ${e.message}{/red-fg}`);
        }
        refreshAgentTable();
      } else if (action === '__create__') {
        showTextInputDialog('Workspace name', `${agentName}'s workspace`, (name) => {
          if (!name) return;
          doCreateWorkspace(agentName, name);
        });
      } else if (action === '__token__') {
        showTextInputDialog('Paste workspace token', '', (token) => {
          if (!token) return;
          doJoinToken(agentName, token);
        });
      }
    });

    list.key('escape', closeScreen);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Shared dialogs
  // ────────────────────────────────────────────────────────────────────────

  function showConfirmDialog(message, callback) {
    const dialog = blessed.box({
      top: 'center', left: 'center',
      width: 50, height: 5,
      border: { type: 'line' },
      tags: true,
      style: { border: { fg: COLORS.accent }, bg: COLORS.surface },
      content: `\n  ${message}\n  {gray-fg}y = 是, n = 否{/gray-fg}`,
    });
    screen.append(dialog);
    screen.render();

    const onKey = (ch) => {
      screen.unkey(['y', 'n', 'escape'], onKey);
      dialog.destroy();
      screen.render();
      callback(ch === 'y');
    };
    screen.key(['y', 'n', 'escape'], onKey);
  }

  function showTextInputDialog(title, defaultValue, callback) {
    const dialog = blessed.box({
      top: 'center', left: 'center',
      width: 60, height: 8,
      border: { type: 'line' },
      tags: true,
      label: ` {bold}${title}{/bold} `,
      style: { border: { fg: COLORS.accent }, bg: COLORS.surface },
    });

    const input = blessed.textbox({
      parent: dialog,
      top: 1, left: 2, width: '100%-6', height: 3,
      border: { type: 'line' }, inputOnFocus: true,
      value: defaultValue || '',
      style: { fg: 'white', bg: COLORS.surface, focus: { border: { fg: COLORS.accent } }, border: { fg: 'grey' } },
    });

    blessed.text({
      parent: dialog, top: 4, left: 2,
      tags: true,
      content: '{gray-fg}Enter 确认，Escape 取消{/gray-fg}',
    });

    screen.append(dialog);
    input.focus();
    screen.render();

    const close = () => {
      screen.remove(dialog);
      dialog.destroy();
      agentList.focus();
      screen.render();
    };

    input.key('enter', () => {
      const val = input.getValue().trim();
      close();
      callback(val || null);
    });

    input.key('escape', () => {
      close();
      callback(null);
    });

    dialog.key('escape', () => {
      close();
      callback(null);
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Actions
  // ────────────────────────────────────────────────────────────────────────

  function signalDaemonReload() {
    try { connector.sendDaemonCommand('reload'); } catch {}
  }

  function doStart(agentName) {
    log(`正在启动 {cyan-fg}${agentName}{/cyan-fg}...`);
    const pid = connector.getDaemonPid();
    if (!pid) {
      try {
        connector.startDaemon();
        log(`{green-fg}\u2713{/green-fg} 启动守护进程（将启动 {cyan-fg}${agentName}{/cyan-fg})`);
      } catch (e) {
        log(`{red-fg}\u2717 启动守护进程失败：{/red-fg} ${e.message}`);
        return;
      }
    } else {
      try {
        connector.sendDaemonCommand(`restart:${agentName}`);
        log(`{green-fg}\u2713{/green-fg} 通过守护进程重启 {cyan-fg}${agentName}{/cyan-fg}`);
      } catch (e) {
        log(`{red-fg}\u2717 失败：{/red-fg} ${e.message}`);
        return;
      }
    }
    setTimeout(refreshAgentTable, 3000);
  }

  function doStop(agentName) {
    log(`正在停止 {cyan-fg}${agentName}{/cyan-fg}...`);
    try {
      connector.sendDaemonCommand(`stop:${agentName}`);
      log(`{green-fg}\u2713{/green-fg} 已停止 {cyan-fg}${agentName}{/cyan-fg}`);
    } catch (e) {
      log(`{red-fg}\u2717{/red-fg} ${e.message}`);
    }
    setTimeout(refreshAgentTable, 1000);
  }

  function doRemove(agentName) {
    showConfirmDialog(`移除 ${agentName}？`, (yes) => {
      if (!yes) return;
      // Disconnect first if connected
      const agent = agentRows.find(a => a.name === agentName);
      if (agent && agent.workspace) {
        try {
          connector.disconnectWorkspace(agentName);
          signalDaemonReload();
          log(`已断开 {cyan-fg}${agentName}{/cyan-fg}`);
        } catch {}
      }
      // Stop if daemon running
      const pid = connector.getDaemonPid();
      if (pid) {
        try { connector.sendDaemonCommand(`stop:${agentName}`); } catch {}
      }
      // Remove from config
      try {
        connector.removeAgent(agentName);
        signalDaemonReload();
        log(`{green-fg}\u2713{/green-fg} 已移除 {cyan-fg}${agentName}{/cyan-fg}`);
      } catch (e) {
        log(`{red-fg}\u2717{/red-fg} ${e.message}`);
      }
      refreshAgentTable();
    });
  }

  function doDisconnect(agentName) {
    try {
      connector.disconnectWorkspace(agentName);
      signalDaemonReload();
      log(`{green-fg}\u2713{/green-fg} 已断开 {cyan-fg}${agentName}{/cyan-fg}`);
    } catch (e) {
      log(`{red-fg}\u2717{/red-fg} ${e.message}`);
    }
    refreshAgentTable();
  }

  function doOpenWorkspace(agent) {
    const config = connector.config.load();
    const networks = config.networks || [];
    const net = networks.find(n => n.slug === agent.network || n.id === agent.network);
    if (!net) {
      log('{yellow-fg}未找到工作空间配置{/yellow-fg}');
      return;
    }
    const slug = net.slug || net.id;
    const isLocal = (net.endpoint || '').includes('localhost') || (net.endpoint || '').includes('127.0.0.1');
    let url;
    if (isLocal) {
      url = `${net.endpoint}/${slug}`;
    } else {
      url = `https://workspace.openagents.org/${slug}`;
    }
    if (net.token) url += `?token=${net.token}`;

    // Try opening in browser
    let opened = false;
    try {
      const { exec } = require('child_process');
      const cmd = IS_WINDOWS ? `start "${url}"` :
                  process.platform === 'darwin' ? `open "${url}"` :
                  `xdg-open "${url}"`;
      exec(cmd);
      opened = true;
    } catch {}

    // Show URL in a dialog — full width, auto-height for long URLs
    const innerW = screen.width - 4;
    const urlLines = Math.ceil(url.length / innerW);
    const dialog = blessed.box({
      top: 'center', left: 0,
      width: '100%', height: 4 + urlLines + 2,
      border: { type: 'line' },
      tags: true,
      label: ' {bold}工作空间 URL{/bold} ',
      style: { border: { fg: COLORS.accent }, bg: COLORS.surface },
      content: `\n {bold}${url}{/bold}\n\n {gray-fg}${opened ? '已在浏览器中打开。' : '请复制上方 URL。'} 按 Esc 关闭。{/gray-fg}`,
    });

    screen.append(dialog);
    screen.render();

    const close = () => {
      screen.remove(dialog);
      dialog.destroy();
      agentList.focus();
      screen.render();
    };
    screen.key(['escape', 'enter'], function handler() {
      screen.unkey(['escape', 'enter'], handler);
      close();
    });

    if (opened) log(`{green-fg}\u2713{/green-fg} 已在浏览器中打开工作空间`);
  }

  function doLogin(agent) {
    const catalog = connector.registry.getCatalogSync();
    const entry = catalog.find(e => e.name === agent.type);
    if (!entry || !entry.check_ready || !entry.check_ready.login_command) {
      log('{yellow-fg}此智能体类型没有登录命令{/yellow-fg}');
      return;
    }
    const cmd = entry.check_ready.login_command;
    log(`运行 {bold}${cmd}{/bold}...`);

    // Suspend TUI and run login command interactively
    screen.exec(cmd, {}, (err, ok) => {
      if (err) {
        log(`{red-fg}\u2717 登录错误：{/red-fg} ${err.message}`);
      } else {
        log(`{green-fg}\u2713{/green-fg} 登录完成`);
      }
      refreshAgentTable();
    });
  }

  function doCreateWorkspace(agentName, wsName) {
    log(`正在创建工作空间 {bold}${wsName}{/bold}...`);
    connector.createWorkspace({ agentName, name: wsName }).then(result => {
      const slug = result.slug || result.workspaceId;
      // Save to config
      connector.config.addNetwork({
        id: result.workspaceId,
        slug,
        name: wsName,
        endpoint: connector.workspace.endpoint,
        token: result.token,
      });
      connector.connectWorkspace(agentName, slug);
      signalDaemonReload();
      log(`{green-fg}\u2713{/green-fg} 已创建并连接 \u2192 ${result.url || slug}`);
      refreshAgentTable();
    }).catch(e => {
      log(`{red-fg}\u2717 创建失败：{/red-fg} ${e.message}`);
    });
  }

  function doJoinToken(agentName, token) {
    log('正在使用 Token 加入工作空间...');
    connector.resolveToken(token).then(info => {
      const slug = info.slug || info.workspace_id;
      connector.config.addNetwork({
        id: info.workspace_id,
        slug,
        name: info.name || slug,
        endpoint: connector.workspace.endpoint,
        token,
      });
      connector.connectWorkspace(agentName, slug);
      signalDaemonReload();
      log(`{green-fg}\u2713{/green-fg} 已加入并连接 {cyan-fg}${agentName}{/cyan-fg} \u2192 ${slug}`);
      refreshAgentTable();
    }).catch(e => {
      log(`{red-fg}\u2717 加入失败：{/red-fg} ${e.message}`);
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Key bindings
  // ────────────────────────────────────────────────────────────────────────

  // ── Action handlers (shared by keys and clickable footer) ──
  const footerActions = {
    Install() { if (currentView === 'main') showInstallScreen(); },
    New() {
      if (currentView !== 'main') return;
      showSelectAgentTypeScreen((type) => {
        showStartAgentScreen(type, (result) => {
          try {
            connector.addAgent({ name: result.name, type: result.type, path: result.path });
            log(`{green-fg}\u2713{/green-fg} Created agent {cyan-fg}${result.name}{/cyan-fg} (${result.type})`);
            const pid = connector.getDaemonPid();
            if (!pid) {
              connector.startDaemon();
              log('{green-fg}\u2713{/green-fg} Daemon starting...');
            } else {
              signalDaemonReload();
            }
          } catch (e) {
            log(`{red-fg}\u2717{/red-fg} ${e.message}`);
          }
          setTimeout(refreshAgentTable, 3000);
        });
      });
    },
    Start() {
      if (currentView !== 'main' || !selectedAgent()) return;
      const a = selectedAgent();
      if (a.configured) doStart(a.name);
    },
    Stop() {
      if (currentView !== 'main' || !selectedAgent()) return;
      const a = selectedAgent();
      if (a.configured) doStop(a.name);
    },
    Configure() {
      if (currentView !== 'main' || !selectedAgent()) return;
      const a = selectedAgent();
      if (a.configured) showConfigureScreen(a);
    },
    Connect() {
      if (currentView !== 'main' || !selectedAgent()) return;
      const a = selectedAgent();
      if (connectAvailable(a)) showConnectWorkspaceScreen(a.name);
    },
    Disconnect() {
      if (currentView !== 'main' || !selectedAgent()) return;
      const a = selectedAgent();
      if (a.configured && a.workspace) doDisconnect(a.name);
    },
    Workspace() {
      if (currentView !== 'main' || !selectedAgent()) return;
      const a = selectedAgent();
      if (a.configured && a.workspace) doOpenWorkspace(a);
    },
    Remove() {
      if (currentView !== 'main' || !selectedAgent()) return;
      const a = selectedAgent();
      if (a.configured) doRemove(a.name);
    },
    Daemon() {
      if (currentView !== 'main') return;
      const pid = connector.getDaemonPid();
      if (pid) {
        showConfirmDialog('停止守护进程？这将断开所有智能体的连接。', (yes) => {
          if (!yes) { log('{gray-fg}已取消{/gray-fg}'); return; }
          try {
            connector.stopDaemon();
            log('{green-fg}\u2713{/green-fg} 守护进程已停止');
          } catch (e) {
            log(`{red-fg}\u2717{/red-fg} ${e.message}`);
          }
          setTimeout(refreshAgentTable, 1000);
        });
      } else {
        try {
          connector.startDaemon();
          log('{green-fg}\u2713{/green-fg} 守护进程启动中...');
        } catch (e) {
          log(`{red-fg}\u2717{/red-fg} ${e.message}`);
        }
        setTimeout(refreshAgentTable, 3000);
      }
    },
    Refresh() {
      if (currentView === 'main') {
        refreshAgentTable();
        log('{green-fg}\u2713{/green-fg} 已刷新');
      }
    },
    Quit() { if (currentView === 'main') process.exit(0); },
  };

  // Bind keyboard shortcuts
  screen.key('q', footerActions.Quit);
  screen.key('C-c', () => process.exit(0));
  screen.key('i', footerActions.Install);
  screen.key('n', footerActions.New);
  screen.key('r', footerActions.Refresh);
  screen.key('s', footerActions.Start);
  screen.key('x', footerActions.Stop);
  screen.key('u', footerActions.Daemon);
  screen.key('c', footerActions.Connect);
  screen.key('d', footerActions.Disconnect);
  screen.key('w', footerActions.Workspace);
  screen.key('e', footerActions.Configure);
  screen.key('delete', footerActions.Remove);

  // ── Init ──
  agentList.focus();
  refreshAgentTable();
  log('欢迎使用 {bold}OpenAgents{/bold}。按 {cyan-fg}i{/cyan-fg} 安装智能体，按 {cyan-fg}n{/cyan-fg} 创建智能体。');

  // Show installed runtimes that don't have any agent instances yet
  try {
    const catalog = loadCatalog(connector);
    const installed = catalog.filter(e => e.installed).map(e => e.name);
    const configuredTypes = new Set(agentRows.map(r => r.type));
    const unused = installed.filter(t => !configuredTypes.has(t));
    if (unused.length > 0) {
      log(`{green-fg}\u2713{/green-fg} 已安装：{bold}${unused.join(', ')}{/bold} — 按 {cyan-fg}n{/cyan-fg} 创建智能体`);
    }
    if (installed.length === 0) {
      log('{yellow-fg}!{/yellow-fg} 未安装智能体运行时。按 {cyan-fg}i{/cyan-fg} 安装一个。');
    }
  } catch {}

  setInterval(refreshAgentTable, 5000);
  screen.render();
}

function run() { createTUI(); }
module.exports = { run, loadAgentRows, connectAvailable };
