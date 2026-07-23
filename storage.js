// Selecciona el backend de almacenamiento según el entorno:
// - Si hay GITHUB_REPO_URL configurado (deploy en la nube), usa git.
// - Si no, usa disco local (uso en el PC de casa).
module.exports = process.env.GITHUB_REPO_URL ? require('./storage-git') : require('./storage-local');
