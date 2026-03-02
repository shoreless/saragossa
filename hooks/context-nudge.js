#!/usr/bin/env node
/**
 * Stop Hook — context-nudge.js
 *
 * Fires every time an agent tries to stop. Reads the session transcript,
 * calculates token usage as a percentage of the context window.
 * If context is at or above the threshold and the agent hasn't been nudged
 * yet this session, blocks the stop (exit code 2) and tells the agent
 * to save working state.
 *
 * Configuration: saragossa.config.json at island root
 *   {
 *     "contextThreshold": 75,      // percentage (default: 75)
 *     "contextWindow": 200000      // tokens (default: 200000)
 *   }
 *
 * Tracks nudge state in tasks/.context-state/{session_id}.nudged
 * so it only fires once per session.
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

function readContextPct(transcriptPath, contextWindow) {
  try {
    const stat = fs.statSync(transcriptPath);
    const size = stat.size;
    const chunkSize = Math.min(100_000, size);
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(chunkSize);
    fs.readSync(fd, buf, 0, chunkSize, Math.max(0, size - chunkSize));
    fs.closeSync(fd);

    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.type === 'assistant') {
          const usage = obj.message?.usage;
          if (usage) {
            const total = (usage.cache_read_input_tokens || 0) + (usage.input_tokens || 0);
            return (total / contextWindow) * 100;
          }
        }
      } catch { continue; }
    }
  } catch {}
  return null;
}

async function main() {
  const input = await new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
  });

  if (!input) process.exit(0);
  if (input.stop_hook_active) process.exit(0); // Loop prevention

  const { session_id: sessionId, transcript_path: transcriptPath, cwd } = input;
  if (!sessionId || !transcriptPath) process.exit(0);

  const config = loadConfig(cwd);
  const threshold = config.contextThreshold ?? 75;
  const contextWindow = config.contextWindow ?? 200_000;

  const stateDir = path.join(cwd || '.', 'tasks', '.context-state');
  const nudgeFile = path.join(stateDir, `${sessionId}.nudged`);

  if (fs.existsSync(nudgeFile)) process.exit(0); // Already nudged this session

  const pct = readContextPct(transcriptPath, contextWindow);
  if (pct === null || pct < threshold) process.exit(0);

  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(nudgeFile, JSON.stringify({
      session_id: sessionId,
      context_pct: Math.round(pct),
      nudged_at: new Date().toISOString(),
    }));
  } catch {
    process.exit(0); // Can't write state — don't risk infinite loop
  }

  process.stderr.write([
    `Context is at ${Math.round(pct)}%. Before you stop, save your working state:`,
    '',
    '1. Write a HANDOFF.md with: what you were doing, what\'s unfinished, key decisions made, and one insight for the next session',
    '2. Update your memory files if anything important was learned this session',
    '3. If you have a pocket notebook, `remember` the most important thing from this session',
    '',
    'Then you can stop. This nudge only fires once per session.',
  ].join('\n'));
  process.exit(2);
}

main();
