#!/usr/bin/env node
/**
 * PostToolUse Hook — sync-tasks.js
 *
 * Fires after every tool call across all agents.
 * Derives agent from cwd, summarizes the tool call,
 * writes to tasks/{agent}.json for dashboards to read.
 *
 * Configuration: saragossa.config.json at island root
 *   {
 *     "tasksDir": "/absolute/path/to/tasks",
 *     "agents": {
 *       "/Sites/drift": "porter",
 *       "/Sites/robinson": "robinson"
 *     }
 *   }
 *
 * Silent fail contract: if it throws, Claude doesn't notice.
 * If it blocks, Claude doesn't wait.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function loadConfig(cwd) {
  let dir = cwd || process.cwd();
  while (true) {
    const configPath = path.join(dir, 'saragossa.config.json');
    if (fs.existsSync(configPath)) {
      try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return {};
}

function deriveAgent(cwd, agentMap) {
  if (!cwd || !agentMap) return null;
  for (const [pattern, name] of Object.entries(agentMap)) {
    if (cwd.includes(pattern)) return name;
  }
  return null;
}

function summarize(tool_name, tool_input) {
  const inp = tool_input || {};
  switch (tool_name) {
    case 'Bash':      return (inp.command || '').slice(0, 120);
    case 'Read':      return inp.file_path || '';
    case 'Edit':
    case 'Write':     return inp.file_path || '';
    case 'Grep':      return `/${inp.pattern || ''}/ in ${inp.path || '.'}`;
    case 'Glob':      return inp.pattern || '';
    case 'WebFetch':  return inp.url || '';
    case 'WebSearch': return inp.query || '';
    case 'TodoWrite': {
      const active = (inp.todos || []).find(t => t.status === 'in_progress');
      return active ? active.activeForm : 'updating tasks';
    }
    case 'Agent':     return inp.description || '';
    default:          return '';
  }
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return { tasks: [], lastActivity: null }; }
}

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const { tool_name, tool_input } = payload;
    const cwd = payload.cwd || '';

    const config = loadConfig(cwd);
    const tasksDir = config.tasksDir || path.join(cwd, 'tasks');
    const agent = deriveAgent(cwd, config.agents);
    if (!agent) return;

    fs.mkdirSync(tasksDir, { recursive: true });
    const stateFile = path.join(tasksDir, `${agent}.json`);
    const state = readState(stateFile);

    state.lastActivity = {
      tool: tool_name,
      summary: summarize(tool_name, tool_input),
      timestamp: new Date().toISOString(),
    };

    if (tool_name === 'TodoWrite' && tool_input?.todos) {
      state.tasks = tool_input.todos.map(t => ({
        content: t.content || '',
        status: t.status || 'pending',
        activeForm: t.activeForm || '',
        updated: new Date().toISOString(),
      }));
    }

    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
  } catch {
    // Silent fail — never block Claude
  }
});
