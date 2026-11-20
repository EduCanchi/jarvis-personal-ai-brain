# Manual de usuario — Personal AI Brain

Guía práctica para usar el sistema sin conocimientos técnicos.

---

## 1. Abrir la aplicación

1. Abre **Personal AI Brain** desde `~/Applications` o el Launchpad.
2. Se abrirá tu navegador en `http://127.0.0.1:4317`.
   Si la app ya estaba arrancada, solo abre la pestaña.
3. Para cerrarla: `bash scripts/stop.sh` en el proyecto (o cerrar la sesión del Mac).

La primera vez necesitas la clave de NVIDIA (ver punto 2).

---

## 2. Configurar la clave de NVIDIA

1. Entra en **Configuración**.
2. En *Clave de NVIDIA Build*, pega tu clave (empieza por `nvapi-`).
3. Pulsa **Guardar clave**. Se almacena en el Llavero de macOS.
4. Pulsa **Probar conexión real**: deben salir tres filas en verde
   (principal, visión, embeddings).

Si no tienes clave: crea una cuenta gratuita en NVIDIA Build y genera una clave con acceso a
los modelos del catálogo.

---

## 3. Añadir documentos

1. Ve a **Biblioteca**.
2. Arrastra archivos sobre la zona punteada o pulsa **Subir archivos**.
3. Formatos: PDF, Word (.docx), Excel (.xlsx), TXT, Markdown, CSV, JSON, HTML e imágenes
   (PNG, JPG, WEBP, GIF).
4. Verás el estado de cada documento: *pendiente → procesando → procesado*.
   Si hay un problema, aparecerá en rojo y podrás abrir *Detalles* para leer el error.

Consejos:

- Un mismo archivo no se duplica: se detecta por su huella digital (SHA-256).
- Los documentos escaneados (sin texto) se interpretan con el modelo de visión.
- Si un documento es privado, ábrelo y pulsa **Solo procesamiento local** antes de reprocesarlo.

---

## 4. Explorar el cerebro visual

- **Zoom**: rueda del ratón o pellizco. **Mover**: arrastrar el fondo.
- **Mover un nodo**: arrastrarlo.
- **Colores**: cada tipo de entidad tiene su color (persona, organización, proyecto…).
- **Filtros**: botones de tipo y buscador arriba.
- **Detalles**: pulsa un nodo para abrir el panel lateral con:
  - descripción,
  - documentos de origen (se abren en una pestaña),
  - relaciones con su evidencia textual y confianza,
  - acciones: confirmar/quitar relación, crear relación, fusionar duplicados, eliminar.
- **Exportar**: botón *Exportar grafo* descarga un JSON.

Regla de oro: una relación con línea discontinua y color ámbar está **pendiente**. Confírmala solo
si la evidencia la respalda.

---

## 5. Preguntar al cerebro (Chat)

1. Ve a **Chat IA**.
2. Escribe tu pregunta en español y pulsa Enter.
3. La respuesta llega con citas `[1]`, `[2]`… y una lista de **fuentes** clicables.
4. Si el sistema no encuentra evidencia, lo dirá y etiquetará cualquier conocimiento general como
   *no documentado*.
5. *Ver razonamiento del modelo* muestra el proceso interno (opcional, se puede desactivar).

Ejemplos útiles:

- "Resume el acta de la última reunión."
- "¿Qué proyectos mencionan a Marta Ruiz?"
- "Compara lo que dicen los dos documentos sobre el presupuesto."
- "¿Qué decisiones se tomaron en enero?"

Las conversaciones se guardan y aparecen a la izquierda.

---

## 6. Corregir la memoria

En **Memoria**:

- **Nodos**: busca o filtra, pulsa una tarjeta y edita nombre, tipo o descripción.
- **Pendientes**: relaciones ambiguas. *Confirmar* las valida; *Descartar* las elimina.
- **Recuerdos**: lo que tú has creado manualmente.
- **Nuevo concepto**: crea una entidad propia (por ejemplo, un proyecto que aún no está en ningún
  documento).
- **Fusionar duplicados**: consolida nodos con el mismo nombre.

---

## 7. Conexiones

- **Carpetas locales**: escribe una ruta (por ejemplo `/Users/usuario/Documentos/Proyectos`) y pulsa
  *Conectar carpeta*. Luego *Sincronizar* para importar los archivos nuevos.
  Nunca se modifican ni se borran tus archivos.
- **Google Drive / Gmail / Calendar / Notion**: no están disponibles todavía; requieren
  autorización OAuth. Aparecen marcados como *No configurado*.

---

## 8. Privacidad

- Todo se guarda en `~/Library/Application Support/PersonalAIBrain`.
- La app solo escucha en tu propio Mac (`127.0.0.1`).
- **El texto e imágenes que se analizan se envían a NVIDIA Build.** Si no quieres eso:
  - desactiva *Permitir procesamiento remoto* en Configuración (solo búsqueda por texto), o
  - marca documentos concretos como *Solo procesamiento local*.

---

## 9. Copias de seguridad

1. **Configuración → Respaldos → Crear respaldo**.
2. Para restaurar: pulsa *Restaurar* en el respaldo deseado y confirma.
   Antes de restaurar se crea automáticamente un respaldo de seguridad.

También desde Terminal:

```bash
bash scripts/backup.sh
bash scripts/restore.sh "<ruta>" --confirmar
```

---

## 10. Problemas frecuentes

| Síntoma | Solución |
| --- | --- |
| "Falta la API key" | Configuración → pega la clave → Guardar. |
| "Límite de uso de NVIDIA Build alcanzado" | Espera unos minutos; la app reintenta sola. |
| Documento en error "No se pudo extraer contenido" | Puede ser un PDF escaneado sin texto o un archivo dañado. Prueba a reprocesarlo. |
| El grafo está vacío | Procesa documentos; los nodos se crean al terminar la extracción. |
| La app no abre | `bash scripts/start.sh` y revisa `~/Library/Logs/PersonalAIBrain.log`. |
| Puerto ocupado | `bash scripts/stop.sh` y vuelve a abrir. |

---

## 11. Atajos

- **Enter** envía el mensaje; **Shift+Enter** hace un salto de línea.
- En el chat, las sugerencias iniciales rellenan la pregunta para que la edites.
- En el grafo, el minimapa permite saltar a zonas lejanas.
