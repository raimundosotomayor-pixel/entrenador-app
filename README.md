# Entrenador — app de formulario local

Reemplaza la carga manual en Obsidian (Templater/frontmatter) por un
formulario simple, pensado para usar desde el celular justo después de
entrenar. Al guardar, escribe la misma nota markdown que ya usa el
dashboard de Dataview/Tracker (`Dashboard/Progreso.md`), así que ese
dashboard sigue funcionando exactamente igual — solo cambia cómo cargas
los datos.

No requiere internet ni cuentas externas: corre un servidor pequeño en tu
propio PC (donde vive el vault), y tu celular se conecta a él por wifi
local.

## 1. Instalar Node.js (una sola vez)

Este PC no tiene Node instalado. Es el mismo runtime que ya usamos para el
bot de WhatsApp, así que instalarlo ahora te sirve para ambos.

1. Ve a [nodejs.org](https://nodejs.org) y descarga el instalador **LTS**
   para Windows.
2. Ejecútalo, deja las opciones por defecto (incluye la casilla "Add to
   PATH", no la desmarques).
3. Reinicia la terminal/PowerShell después de instalar.

## 2. Arrancar el servidor

Doble click en **`iniciar.bat`** dentro de esta carpeta.

- La primera vez, Windows Defender Firewall puede preguntar si permitir
  acceso a Node.js en redes privadas — click en **Permitir acceso**
  (si no lo permites, el celular no va a poder conectarse).
- Debería quedar una ventana abierta mostrando:
  `Entrenador app en http://localhost:8787`
  Déjala abierta mientras uses la app (minimizarla está bien, cerrarla no).

## 3. Conectarte desde el celular

1. Con el PC y el celular en la **misma red wifi**, en el PC abre una
   terminal y corre:
   ```
   ipconfig
   ```
   Busca la línea **"Dirección IPv4"** de tu adaptador de red (wifi),
   algo como `192.168.1.23`.
2. En el celular, abre el navegador y entra a:
   ```
   http://192.168.1.23:8787
   ```
   (reemplaza por la IP real de tu PC).
3. Opcional: agrega esa dirección a la pantalla de inicio del celular
   (en Chrome/Safari: compartir → "Agregar a pantalla de inicio") para
   que se sienta como una app.

**Nota**: la IP local puede cambiar si tu router se reinicia. Si un día
la app no carga, repite el paso 1 para confirmar la IP actual.

## 4. Uso diario

1. Abrir la app — arriba muestra qué toca hoy según el plan (`Plan/Plan
   Actual.md`) y, si corresponde, un aviso de fatiga sostenida.
2. Completar el formulario después de entrenar y tocar **Guardar
   sesión**.
3. Pestaña **Historial** para ver las últimas sesiones sin tener que
   abrir Obsidian.
4. Para gráficos más completos (tendencias, etc.), el dashboard de
   Obsidian (`Dashboard/Progreso.md`) sigue disponible y se actualiza
   solo — la app y Obsidian Git comparten exactamente las mismas notas.

## Dejarlo corriendo siempre (opcional, más adelante)

Por ahora hay que abrir `iniciar.bat` manualmente cada vez. Si quieres que
arranque solo al prender el PC, se puede agregar una tarea al Programador
de tareas de Windows — avísame cuando quieras montarlo y lo dejamos listo.

## Si algo falla

- **La app no carga en el celular**: revisa que el PC y el celular estén
  en la misma wifi, que la ventana de `iniciar.bat` siga abierta, y que
  el firewall haya permitido el acceso (paso 2).
- **"No se pudo conectar al servidor" al guardar**: el servidor se cerró
  o cambió de IP — revisa la ventana de `iniciar.bat` y la IP con
  `ipconfig`.
- **La nota no aparece en Obsidian**: abre el vault y espera a que
  Obsidian reindexe (o `Ctrl+P` → "Reload app without saving"), igual que
  pasó con las notas creadas por fuera de la app.
