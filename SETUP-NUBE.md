# Desplegar el Entrenador en la nube (para no depender de tu PC)

Esta guía te deja la app accesible desde cualquier red (datos móviles, otro wifi, etc), sin depender de que tu PC esté prendido. El código ya soporta esto (`storage.js` cambia automáticamente a modo "nube" si detecta `GITHUB_REPO_URL`) — lo que falta son cuentas y configuración que solo tú puedes crear.

**Dato importante antes de empezar**: esto va a subir tu vault (notas de entrenamiento, plan, perfil) a un repositorio de GitHub. Asegúrate de que el repo quede **privado** — te lo recuerdo en el paso 1.

## Cómo funciona (resumen)

- El servidor corre en la nube (Render) en vez de en tu PC.
- Cuando guardas una sesión o check-in, el servidor las escribe en un **repo de git** y hace commit + push (en vez de escribir directo a disco).
- En tu PC, el plugin **Obsidian Git** hace `pull` automático cada cierto tiempo — así las notas nuevas aparecen solas en tu vault, sin que tengas que hacer nada.
- Como el servidor queda expuesto a internet, ahora sí pide un **PIN** para usarlo (antes no hacía falta porque solo tu wifi local podía alcanzarlo).

## 1. Convertir el vault en un repo de git privado

En tu PC, abre una terminal en la carpeta del vault:

```
cd "C:\Users\rsotomayor\OneDrive - Axo\Documentos\Obsidian Vault\Entrenamiento"
git init
git add .
git commit -m "Vault inicial"
```

Luego crea un repositorio nuevo en [github.com](https://github.com/new):
- Nombre: el que quieras (ej. `entrenamiento-vault`)
- **Visibilidad: Private** (obligatorio — ahí vive tu plan, tus notas, tus datos de sueño)
- No agregues README/licencia (ya tienes contenido local)

GitHub te va a mostrar comandos para conectar tu repo local — algo como:

```
git remote add origin https://github.com/TU-USUARIO/entrenamiento-vault.git
git branch -M main
git push -u origin main
```

## 2. Crear un Personal Access Token (PAT)

1. En GitHub: Settings → Developer settings → **Fine-grained tokens** → Generate new token.
2. Dale acceso de **solo ese repo**, permisos de **Contents: Read and write**.
3. Copia el token generado — lo vas a necesitar en el paso 4 (no lo vas a volver a ver después).

## 3. Instalar y configurar el plugin "Obsidian Git"

1. En Obsidian: Settings → Community plugins → Browse → busca **"Obsidian Git"** → Install → Enable.
2. En sus ajustes, activa:
   - **Auto pull** cada 5-10 minutos (para traer las notas nuevas que escriba el servidor en la nube).
   - Opcional: "Auto commit + push" si además quieres que tus ediciones manuales en Obsidian se suban solas.

## 4. Desplegar el servidor en Render

1. Sube la carpeta `entrenador-app` (este código) a **otro** repo de GitHub (puede ser público o privado, no tiene datos sensibles — solo código). Es más simple mantenerlo separado del repo del vault.
2. Crea cuenta en [render.com](https://render.com) (gratis, login con GitHub).
3. New → Web Service → conecta el repo de `entrenador-app`.
   - Build command: `npm install` (no instala nada, pero no molesta dejarlo)
   - Start command: `npm start`
4. En la sección **Environment**, agrega estas variables:

| Variable | Valor |
|---|---|
| `GITHUB_REPO_URL` | `https://github.com/TU-USUARIO/entrenamiento-vault.git` |
| `GITHUB_TOKEN` | el token del paso 2 |
| `GITHUB_BRANCH` | `main` |
| `SESIONES_PATH` | `Sesiones` |
| `CHECKINS_PATH` | `Checkins` |
| `APP_PIN` | un PIN que tú inventes (ej. `4 a 6 dígitos`) |
| `GIT_AUTHOR_NAME` | tu nombre (para los commits automáticos) |
| `GIT_AUTHOR_EMAIL` | tu email |

5. Deploy. Render te da una URL pública tipo `https://entrenador-app.onrender.com`.

## 5. Usarla desde el celular

1. Entra a la URL de Render en vez de la IP local.
2. La primera vez te va a pedir el **PIN** — el mismo que pusiste en `APP_PIN`. Se guarda en el celular, no lo vuelve a pedir salvo que borres datos del navegador.
3. Agrega la URL a la pantalla de inicio para que se sienta como una app.

## Notas

- **El PC ya no necesita estar prendido** para cargar sesiones — el servidor vive en Render.
- El plan de entrenador-app en Render es gratis pero "duerme" tras un rato sin uso — la primera carga del día puede tardar ~30 segundos en despertar, es normal.
- Si algún día quieres cortar el acceso: borra el Web Service en Render y revoca el token de GitHub.
- Tu uso local con `iniciar.bat` (en casa, misma wifi) sigue funcionando exactamente igual que antes — no toqué esa parte.
