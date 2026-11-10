# ✉️ FP Virtual - Notificador de Inactividad

Extensión para Google Chrome (Manifest V3) diseñada para automatizar la detección de estudiantes con inactividad en los cursos de **FP Virtual Aragón** (`fpvirtualaragon.es`) y agilizar el envío masivo de correos de advertencia/seguimiento mediante el sistema interno de mensajería Moodle (`local/mail`).

---

## 🚀 Características Principales

* **Filtro Avanzado de Inactividad:**
  * Estudiantes que **nunca han accedido** al curso.
  * Estudiantes sin acceso **más de 10 días**.
  * Estudiantes sin acceso **entre 7 y 10 días**.
* **Extracción Automatizada de Datos (Fase 1):** Lee y procesa las tablas de informes docentes (`private-reports/docentes.php`) filtrando exactamente por la sección deseada.
* **Inyección Inteligente en Moodle / Svelte (Fase 2):**
  * Selección automática del curso correspondiente en el desplegable de redacción.
  * Búsqueda asíncrona de estudiantes por **Nombre y Apellidos** e inyección directa en el campo **CCO (BCC)** para preservar la privacidad entre alumnos.
  * Cierre automático de menús flotantes al finalizar el proceso.
* **Plantilla de Mensaje y Asunto Dinámicos:** Reemplazo automático del marcador `[NombreDelMódulo]` por el nombre real del curso en tiempo de ejecución.
* **Modo "Enviar sin revisar":** Opción configurable en el panel para realizar la pulsación automática del botón *Enviar* al finalizar la inyección de destinatarios.
* **Control de Proceso y Canceling:** Botón de parada rápida (**⏹️ Detener proceso**) para pausar inmediatamente la ejecución en segundo plano en cualquier momento.
* **Herramientas de Depuración Incorporadas:**
  * Visor de logs en tiempo real.
  * Botones de descarga de logs (`.txt`), volcado del HTML de la página activa y exportación de selectores DOM.

---

## 🛠️ Estructura del Proyecto

```text
├── manifest.json       # Configuración Manifest V3 de la extensión
├── sidepanel.html      # Interfaz gráfica del panel lateral (SidePanel API)
├── sidepanel.js        # Lógica de interfaz, eventos y comunicación
├── content.js          # Content script (Extracción en informes e inyección en correo)
├── background.js       # Service worker de background (Navegación y flujo)
└── icon.png            # Icono de la extensión