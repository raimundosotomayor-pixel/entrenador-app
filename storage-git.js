// Backend de almacenamiento: repo de git (uso en la nube — Render, etc).
// Usa el binario `git` directamente via child_process, sin dependencias npm.
// El mismo repo debe estar conectado al vault de Obsidian via el plugin
// "Obsidian Git" (auto-pull) para que las notas aparezcan solas en el vault.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const CLONE_DIR = path.join(__dirname, 'repo-clone');
const SESIONES_REL = process.env.SESIONES_PATH || 'Sesiones';
const CHECKINS_REL = process.env.CHECKINS_PATH || 'Checkins';

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: cwd || CLONE_DIR, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

function remoteUrl() {
  const { GITHUB_TOKEN, GITHUB_REPO_URL } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO_URL) {
    throw new Error('Faltan GITHUB_TOKEN o GITHUB_REPO_URL en el entorno');
  }
  return GITHUB_REPO_URL.replace('https://', `https://${GITHUB_TOKEN}@`);
}

let cloned = null;
async function ensureCloned() {
  if (cloned) return cloned;
  cloned = (async () => {
    if (!fs.existsSync(path.join(CLONE_DIR, '.git'))) {
      const branch = process.env.GITHUB_BRANCH || 'main';
      await git(['clone', '--branch', branch, remoteUrl(), CLONE_DIR], __dirname);
      await git(['config', 'user.email', process.env.GIT_AUTHOR_EMAIL || 'entrenador-app@local']);
      await git(['config', 'user.name', process.env.GIT_AUTHOR_NAME || 'Entrenador App']);
    }
  })();
  return cloned;
}

async function pull() {
  await ensureCloned();
  await git(['pull']);
}

async function commitAndPush(relFilePath, message) {
  await git(['add', relFilePath]);
  try {
    await git(['commit', '-m', message]);
  } catch (err) {
    if (!/nothing to commit/i.test(err.message)) throw err;
  }
  await git(['push']);
}

async function listMdFiles(relDir) {
  await pull();
  const full = path.join(CLONE_DIR, relDir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter((f) => f.endsWith('.md'))
    .map((filename) => ({ filename, content: fs.readFileSync(path.join(full, filename), 'utf8') }));
}

async function writeFile(relDir, filename, content, message) {
  await pull();
  const full = path.join(CLONE_DIR, relDir);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, filename), content, 'utf8');
  await commitAndPush(path.join(relDir, filename), message);
}

async function listSesiones() {
  return listMdFiles(SESIONES_REL);
}

async function writeSesion(filename, content) {
  return writeFile(SESIONES_REL, filename, content, `Sesión ${filename}`);
}

async function readCheckin(filename) {
  await pull();
  const full = path.join(CLONE_DIR, CHECKINS_REL, filename);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

async function writeCheckin(filename, content) {
  return writeFile(CHECKINS_REL, filename, content, `Check-in ${filename}`);
}

module.exports = { listSesiones, writeSesion, readCheckin, writeCheckin };
