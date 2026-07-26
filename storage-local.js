// Backend de almacenamiento: disco local (uso en el PC, mismo wifi que el celular).
const fs = require('fs');
const path = require('path');

const VAULT_SESIONES = process.env.VAULT_SESIONES ||
  'C:\\Users\\rsotomayor\\OneDrive - Axo\\Documentos\\Obsidian Vault\\Entrenamiento\\Sesiones';
const VAULT_CHECKINS = process.env.VAULT_CHECKINS ||
  'C:\\Users\\rsotomayor\\OneDrive - Axo\\Documentos\\Obsidian Vault\\Entrenamiento\\Checkins';
const VAULT_PLAN = process.env.VAULT_PLAN ||
  'C:\\Users\\rsotomayor\\OneDrive - Axo\\Documentos\\Obsidian Vault\\Entrenamiento\\Plan\\plan-app.json';

async function listSesiones() {
  if (!fs.existsSync(VAULT_SESIONES)) return [];
  return fs.readdirSync(VAULT_SESIONES)
    .filter((f) => f.endsWith('.md'))
    .map((filename) => ({ filename, content: fs.readFileSync(path.join(VAULT_SESIONES, filename), 'utf8') }));
}

async function writeSesion(filename, content) {
  fs.mkdirSync(VAULT_SESIONES, { recursive: true });
  fs.writeFileSync(path.join(VAULT_SESIONES, filename), content, 'utf8');
}

async function readCheckin(filename) {
  const filePath = path.join(VAULT_CHECKINS, filename);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

async function writeCheckin(filename, content) {
  fs.mkdirSync(VAULT_CHECKINS, { recursive: true });
  fs.writeFileSync(path.join(VAULT_CHECKINS, filename), content, 'utf8');
}

async function listCheckins() {
  if (!fs.existsSync(VAULT_CHECKINS)) return [];
  return fs.readdirSync(VAULT_CHECKINS)
    .filter((f) => f.endsWith('.md'))
    .map((filename) => ({ filename, content: fs.readFileSync(path.join(VAULT_CHECKINS, filename), 'utf8') }));
}

async function readPlan() {
  return fs.existsSync(VAULT_PLAN) ? fs.readFileSync(VAULT_PLAN, 'utf8') : null;
}

module.exports = { listSesiones, writeSesion, readCheckin, writeCheckin, listCheckins, readPlan };
