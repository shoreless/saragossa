#!/usr/bin/env node
/**
 * saragossa CLI
 *
 * Usage:
 *   saragossa init        — scaffold a new island (or fill gaps in an existing one)
 *   saragossa keygen      — generate an Ed25519 keypair for this island
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const cmd = process.argv[2];

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`
saragossa — foundation infrastructure for Saragossa islands

Commands:
  init      Scaffold directory structure, hooks, and starter files
  keygen    Generate an Ed25519 keypair for this island

Run from your island's root directory.
`);
  process.exit(0);
}

if (cmd === 'init') {
  runInit();
} else if (cmd === 'keygen') {
  runKeygen();
} else {
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

function runInit() {
  const cwd = process.cwd();
  console.log('\nInitialising Saragossa foundation...\n');

  const hooksDir = path.join(cwd, 'hooks');
  const templateHooksDir = path.join(TEMPLATES_DIR, '..', 'hooks');

  const items = [
    // Correspondence directories
    { type: 'dir',  dest: 'correspondence/outbox' },
    { type: 'dir',  dest: 'correspondence/inbox' },
    { type: 'dir',  dest: 'correspondence/sent' },
    { type: 'dir',  dest: 'correspondence/read' },
    // Tasks directory
    { type: 'dir',  dest: 'tasks' },
    // Well-known for manifest
    { type: 'dir',  dest: '.well-known' },
    // Starter files from templates
    { type: 'file', src: 'HANDOFF.md',             dest: 'HANDOFF.md' },
    { type: 'file', src: 'CULTURE.md',              dest: 'CULTURE.md' },
    { type: 'file', src: 'island.json',             dest: '.well-known/island.json' },
    { type: 'file', src: 'saragossa.config.json',   dest: 'saragossa.config.json' },
    // Hooks
    { type: 'hook', src: 'sync-tasks.js',           dest: 'hooks/sync-tasks.js' },
    { type: 'hook', src: 'context-nudge.js',        dest: 'hooks/context-nudge.js' },
    { type: 'hook', src: 'session-reorient.sh',     dest: 'hooks/session-reorient.sh' },
  ];

  for (const item of items) {
    const destPath = path.join(cwd, item.dest);

    if (item.type === 'dir') {
      if (fs.existsSync(destPath)) {
        print('—', item.dest, 'skipped (already exists)');
      } else {
        fs.mkdirSync(destPath, { recursive: true });
        print('✓', item.dest, 'created');
      }
      continue;
    }

    if (item.type === 'file' || item.type === 'hook') {
      if (fs.existsSync(destPath)) {
        print('—', item.dest, 'skipped (already exists)');
      } else {
        const srcPath = item.type === 'hook'
          ? path.join(__dirname, '..', 'hooks', item.src)
          : path.join(TEMPLATES_DIR, item.src);
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        if (item.src?.endsWith('.sh') || item.src?.endsWith('.js')) {
          fs.chmodSync(destPath, '755');
        }
        print('✓', item.dest, 'created');
      }
    }
  }

  console.log(`
Done.

Next steps:
  1. Edit saragossa.config.json — add your agent cwd patterns and names
  2. Edit .well-known/island.json — fill in your island name, agents, and endpoints
  3. Write your agents' identity files (CLAUDE.md or QWEN.md) if you haven't already
  4. Add CULTURE.md team norms if you have more than one agent
  5. Run \`saragossa keygen\` to generate your island's keypair
  6. Wire the hooks in ~/.claude/settings.json (see README)
`);
}

function runKeygen() {
  const cwd = process.cwd();
  const keypairDir = path.join(cwd, 'keypair');

  if (fs.existsSync(keypairDir)) {
    const files = fs.readdirSync(keypairDir);
    if (files.length > 0) {
      console.error('\nKeypair directory already exists and is not empty.');
      console.error('To regenerate, remove keypair/ manually first.');
      process.exit(1);
    }
  }

  fs.mkdirSync(keypairDir, { recursive: true });

  try {
    execSync(`openssl genpkey -algorithm Ed25519 -out "${keypairDir}/private.pem"`, { stdio: 'pipe' });
    execSync(`openssl pkey -in "${keypairDir}/private.pem" -pubout -out "${keypairDir}/public.pem"`, { stdio: 'pipe' });
    fs.chmodSync(path.join(keypairDir, 'private.pem'), '600');

    const pubKey = fs.readFileSync(path.join(keypairDir, 'public.pem'), 'utf8').trim();
    console.log('\nKeypair generated:\n');
    console.log('  keypair/private.pem  (chmod 600 — never commit this)');
    console.log('  keypair/public.pem\n');
    console.log('Add to .well-known/island.json:\n');
    console.log('  "publicKey": ' + JSON.stringify(
      Buffer.from(pubKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''), 'base64').toString('base64')
    ));
    console.log('\nAdd keypair/ to .gitignore to keep the private key off GitHub.\n');
  } catch (e) {
    console.error('keygen failed — is openssl installed?');
    console.error(e.message);
    process.exit(1);
  }
}

function print(symbol, dest, note) {
  const padded = dest.padEnd(38);
  console.log(`  ${symbol} ${padded} ${note}`);
}
