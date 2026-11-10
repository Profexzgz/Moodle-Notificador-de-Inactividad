// content.js - Gestión de Asunto personalizable, auto-envío e inyección CCO

function sendLog(text, logType = 'normal') {
  chrome.runtime.sendMessage({ action: 'LOG', text, logType });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function comprobarEstadoActivo() {
  return new Promise(resolve => {
    chrome.storage.local.get(['isRunning'], (data) => {
      resolve(data.isRunning !== false);
    });
  });
}

// Función robusta para rellenar el campo Asunto en Moodle
async function rellenarAsunto(asuntoTexto, nombreCurso) {
  let asuntoFinal = asuntoTexto || 'Falta de actividad por un periodo superior a 10 días';
  if (nombreCurso) {
    asuntoFinal = asuntoFinal.replace(/\[NombreDelMódulo\]/gi, nombreCurso);
  }

  // Intentar localizar el input de Asunto con reintentos
  for (let i = 0; i < 5; i++) {
    const asuntoInput = document.getElementById('local-mail-message-form-subject') || 
                        document.querySelector('input[placeholder="Asunto"]') ||
                        document.querySelector('input[name*="subject"]');

    if (asuntoInput) {
      asuntoInput.focus();
      asuntoInput.value = asuntoFinal;
      
      // Disparar todos los eventos de interacción para que Moodle/Svelte valide el valor
      asuntoInput.dispatchEvent(new Event('input', { bubbles: true }));
      asuntoInput.dispatchEvent(new Event('change', { bubbles: true }));
      asuntoInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      asuntoInput.dispatchEvent(new Event('blur', { bubbles: true }));

      asuntoInput.classList.remove('is-invalid');
      sendLog('Asunto rellenado correctamente.', 'success');
      return true;
    }
    await sleep(500);
  }

  sendLog('No se pudo localizar el campo Asunto.', 'error');
  return false;
}

// -------------------------------------------------------------
// FASE 1: Extracción en private-reports/docentes.php
// -------------------------------------------------------------
function ejecutarFaseInformes() {
  chrome.storage.local.get(['workflowConfig', 'isRunning'], (data) => {
    if (!data.isRunning) return;

    sendLog('Iniciando extracción en la página de informes...', 'normal');
    const config = data.workflowConfig;

    const courseSelectEl = document.querySelector('select[name="id_curso"], select[id*="curso"], select');
    if (courseSelectEl) {
      const courses = Array.from(courseSelectEl.options)
        .filter(opt => opt.value && opt.value !== '0')
        .map(opt => ({ id: opt.value, name: opt.textContent.trim() }));

      if (courses.length > 0) {
        chrome.storage.local.set({ savedCourses: courses });
      }
    }

    if (!config) {
      sendLog('Sin configuración activa.', 'warn');
      return;
    }

    const tables = document.querySelectorAll('table');
    if (tables.length === 0) {
      if (courseSelectEl && config.courseId) {
        sendLog(`Seleccionando curso ID ${config.courseId} en informes...`, 'normal');
        courseSelectEl.value = config.courseId;
        courseSelectEl.dispatchEvent(new Event('change', { bubbles: true }));

        const btnBuscar = document.querySelector('input[type="submit"][value*="Buscar"]') ||
                          document.querySelector('button[type="submit"]') ||
                          document.querySelector('form input[type="submit"]');

        if (btnBuscar) btnBuscar.click();
        else if (courseSelectEl.form) courseSelectEl.form.submit();
      }
      return;
    }

    let alumnosExtraidos = [];
    const soloNunca = config.access === 'never';
    const esSieteDiez = config.days === '7';

    tables.forEach(table => {
      let heading = table.previousElementSibling;
      while (heading && !['H1', 'H2', 'H3', 'H4'].includes(heading.tagName)) {
        heading = heading.previousElementSibling;
      }

      const tituloSeccion = heading ? heading.textContent.toLowerCase() : '';

      let esTablaObjetivo = false;
      if (soloNunca && tituloSeccion.includes('nunca')) {
        esTablaObjetivo = true;
      } else if (!soloNunca) {
        if (esSieteDiez && tituloSeccion.includes('7 y 10')) {
          esTablaObjetivo = true;
        } else if (!esSieteDiez && tituloSeccion.includes('más de 10 días')) {
          esTablaObjetivo = true;
        }
      }

      if (!esTablaObjetivo) return;

      const rows = table.querySelectorAll('tbody tr, tr');
      rows.forEach(row => {
        if (row.querySelector('th')) return;

        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return;

        const nameLink = row.querySelector('a[href*="mensaje"], a[href*="user/"], td:first-child a, td:nth-child(1)');
        const emailPlatform = cells[1] ? cells[1].textContent.trim() : '';
        const emailLink = row.querySelector('a[href^="mailto:"]');

        let nombre = nameLink ? nameLink.textContent.replace('(mensaje)', '').trim() : '';
        let email = emailLink ? emailLink.textContent.replace('mailto:', '').trim() : emailPlatform;

        if (nombre) {
          alumnosExtraidos.push({ nombre, email });
        }
      });
    });

    if (alumnosExtraidos.length > 0) {
      sendLog(`Fase 1 completada: ${alumnosExtraidos.length} alumnos extraídos correctamente.`, 'success');
      chrome.storage.local.set({ 
        extractedStudents: alumnosExtraidos, 
        step: 'FASE1_COMPLETE' 
      }, () => {
        sendLog('Navegando al gestor de correo...', 'normal');
        window.location.href = 'https://www.fpvirtualaragon.es/local/mail/view.php?action=compose';
      });
    } else {
      sendLog('No se hallaron alumnos en la sección seleccionada.', 'warn');
      chrome.storage.local.set({ isRunning: false });
    }
  });
}

// -------------------------------------------------------------
// FASE 2: Selección de curso, reemplazo de texto e inyección CCO
// -------------------------------------------------------------
async function ejecutarFaseCorreo() {
  const estadoActivo = await comprobarEstadoActivo();
  if (!estadoActivo) return;

  sendLog('Iniciando Fase 2: Relleno de datos...', 'normal');

  const btnRedactar = document.querySelector('button.btn-primary') || document.querySelector('a[href*="action=compose"]');
  const asuntoInputTest = document.getElementById('local-mail-message-form-subject') || 
                          document.querySelector('input[placeholder="Asunto"]');

  if (!asuntoInputTest && btnRedactar && btnRedactar.textContent.includes('Redactar')) {
    btnRedactar.click();
    await sleep(1500);
    return ejecutarFaseCorreo();
  }

  chrome.storage.local.get(['workflowConfig', 'extractedStudents'], async (data) => {
    const { workflowConfig, extractedStudents } = data;
    const nombreCurso = workflowConfig ? workflowConfig.courseName : '';

    // 1. Seleccionar el curso en el desplegable de Svelte
    if (nombreCurso) {
      const courseComboBtn = document.querySelector('.local-mail-combo-box-button') ||
                             document.querySelector('button.dropdown-toggle');
      if (courseComboBtn) {
        courseComboBtn.click();
        await sleep(500);

        const items = document.querySelectorAll('.local-mail-select-course-item, .dropdown-item');
        let cursoEncontrado = false;
        items.forEach(item => {
          if (item.textContent.toLowerCase().includes(nombreCurso.toLowerCase())) {
            item.click();
            cursoEncontrado = true;
          }
        });
        if (cursoEncontrado) {
          sendLog(`Curso "${nombreCurso}" seleccionado en el correo.`, 'success');
        }
        await sleep(400);
      }
    }

    // 2. Rellenar Asunto (Ejecución reforzada)
    if (workflowConfig) {
      await rellenarAsunto(workflowConfig.subjectTemplate, nombreCurso);
    }

    // 3. Rellenar Cuerpo en TinyMCE
    let mensaje = workflowConfig ? workflowConfig.messageTemplate : '';
    if (mensaje && nombreCurso) {
      mensaje = mensaje.replace(/\[NombreDelMódulo\]/gi, nombreCurso);
    }

    const iframeEditor = document.getElementById('local-mail-compose-editor-15684_ifr') || 
                         document.querySelector('iframe.tox-edit-area__iframe');

    if (iframeEditor && iframeEditor.contentDocument && iframeEditor.contentDocument.body) {
      iframeEditor.contentDocument.body.innerHTML = mensaje.replace(/\n/g, '<br>');
      sendLog('Cuerpo del mensaje rellenado.', 'success');
    }

    // 4. Inyectar destinatarios por NOMBRE Y APELLIDOS en CCO
    if (!extractedStudents || extractedStudents.length === 0) {
      sendLog('No hay destinatarios guardados.', 'warn');
      chrome.storage.local.set({ isRunning: false });
      return;
    }

    const destInput = document.querySelector('input[placeholder="Añadir destinatarios"]') ||
                      document.querySelector('.local-mail-combo-box-input');

    if (destInput) {
      sendLog(`Añadiendo ${extractedStudents.length} destinatarios a CCO por nombre...`, 'normal');
      
      for (const alumno of extractedStudents) {
        const activo = await comprobarEstadoActivo();
        if (!activo) {
          sendLog('Proceso detenido por el usuario.', 'warn');
          return;
        }

        const nombreAlumno = alumno.nombre;
        if (!nombreAlumno) continue;

        destInput.focus();
        destInput.value = nombreAlumno;
        destInput.dispatchEvent(new Event('input', { bubbles: true }));

        await sleep(1000);

        let btnCco = null;
        const resultRows = document.querySelectorAll('div, li, button');
        
        for (const el of resultRows) {
          if ((el.tagName === 'BUTTON' || el.tagName === 'DIV') && 
              el.textContent.trim() === 'Cco' && 
              el.offsetParent !== null) {
            btnCco = el;
            break;
          }
        }

        if (btnCco) {
          btnCco.click();
          sendLog(`Añadido a CCO: ${nombreAlumno}`, 'success');
          await sleep(500);
        } else {
          sendLog(`No se pudo pulsar CCO para: ${nombreAlumno}`, 'warn');
        }
      }

      // Cerrar la lista desplegable de Svelte
      destInput.value = '';
      destInput.dispatchEvent(new Event('input', { bubbles: true }));
      destInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      destInput.blur();
      
      const openMenus = document.querySelectorAll('.dropdown-menu.show, .local-mail-combo-box-dropdown');
      openMenus.forEach(menu => menu.classList.remove('show'));
      destInput.classList.remove('is-invalid');

      // Recomprobar Asunto por si se limpió durante la adición de destinatarios
      if (workflowConfig) {
        await rellenarAsunto(workflowConfig.subjectTemplate, nombreCurso);
      }

      sendLog('Proceso de inyección en CCO finalizado.', 'success');

      // 5. AUTO-ENVÍO SI LA OPCIÓN "Enviar sin revisar" ESTÁ ACTIVA
      if (workflowConfig && workflowConfig.autoSend) {
        await sleep(1000);
        const btnEnviarForm = document.querySelector('.local-mail-action-send') ||
                              document.querySelector('button.btn-primary[type="submit"]') ||
                              Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Enviar');

        if (btnEnviarForm) {
          sendLog('Opción "Enviar sin revisar" activa: Pulsando botón Enviar...', 'warn');
          btnEnviarForm.click();
        } else {
          sendLog('No se pudo localizar el botón Enviar del formulario.', 'error');
        }
      }

      chrome.storage.local.set({ isRunning: false });
    }
  });
}

// -------------------------------------------------------------
// Enrutador
// -------------------------------------------------------------
const currentUrl = window.location.href;

chrome.storage.local.get(['isRunning'], (data) => {
  if (data.isRunning) {
    if (currentUrl.includes('/private-reports/docentes.php')) {
      setTimeout(ejecutarFaseInformes, 1000);
    } else if (currentUrl.includes('/local/mail/')) {
      setTimeout(ejecutarFaseCorreo, 1500);
    }
  }
});

// Escuchador de mensajes de depuración
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_PAGE_HTML') {
    sendResponse({ html: document.documentElement.outerHTML });
  }
  if (request.action === 'GET_DOM_SELECTORS') {
    const elements = Array.from(document.querySelectorAll('input, button, select, textarea, iframe'))
      .map(el => {
        const id = el.id ? `id="${el.id}"` : '';
        const name = el.name ? `name="${el.name}"` : '';
        const cls = el.className ? `class="${el.className}"` : '';
        const ph = el.placeholder ? `placeholder="${el.placeholder}"` : '';
        return `<${el.tagName.toLowerCase()} ${id} ${name} ${cls} ${ph}>`.replace(/\s+/g, ' ');
      }).join('\n');
    sendResponse({ info: elements });
  }
  return true;
});