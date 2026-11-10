document.addEventListener('DOMContentLoaded', () => {
  const courseSelect = document.getElementById('courseSelect');
  const accessSelect = document.getElementById('accessSelect');
  const daysSelect = document.getElementById('daysSelect');
  const subjectText = document.getElementById('subjectText');
  const autoSendCheck = document.getElementById('autoSendCheck');
  const btnStart = document.getElementById('btnStart');
  const debugBox = document.getElementById('debugBox');
  const btnDownloadHTML = document.getElementById('btnDownloadHTML');
  const btnCopyDOM = document.getElementById('btnCopyDOM');
  const btnDownloadLogs = document.getElementById('btnDownloadLogs');

  let isRunning = false;

  function addLog(text, type = 'normal') {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const line = document.createElement('div');
    line.className = 'log-line';
    
    if (type === 'success') line.classList.add('log-success');
    if (type === 'warn') line.classList.add('log-warn');
    if (type === 'error') line.classList.add('log-error');

    line.textContent = `[${timeStr}] ${text}`;
    debugBox.appendChild(line);
    debugBox.scrollTop = debugBox.scrollHeight;
  }

  function setButtonState(running) {
    isRunning = running;
    if (running) {
      btnStart.textContent = '⏹️ Detener proceso';
      btnStart.classList.add('btn-stop');
    } else {
      btnStart.textContent = 'Enviar correo';
      btnStart.classList.remove('btn-stop');
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'LOG') {
      addLog(msg.text, msg.logType || 'normal');
      if (msg.text.includes('finalizado') || msg.text.includes('cancelado') || msg.logType === 'error') {
        setButtonState(false);
      }
    }
  });

  accessSelect.addEventListener('change', () => {
    if (accessSelect.value === 'never') {
      daysSelect.disabled = true;
      addLog('Modo: Nunca han accedido', 'warn');
    } else {
      daysSelect.disabled = false;
      addLog('Modo: Sin acceder al curso');
    }
  });

  // Cargar cursos guardados dinámicamente desde chrome.storage.local
  chrome.storage.local.get(['savedCourses'], (data) => {
    courseSelect.innerHTML = '';
    if (data.savedCourses && data.savedCourses.length > 0) {
      data.savedCourses.forEach(course => {
        const option = document.createElement('option');
        option.value = course.id;
        option.textContent = course.name;
        courseSelect.appendChild(option);
      });
      addLog(`Cursos cargados (${data.savedCourses.length}): Cursos individuales listos.`, 'success');
    } else {
      const opt = document.createElement('option');
      opt.value = "";
      opt.textContent = "Navega a informes para detectar cursos...";
      courseSelect.appendChild(opt);
      addLog('No hay cursos guardados. Ve a private-reports/docentes.php', 'warn');
    }
  });

  btnStart.addEventListener('click', () => {
    if (isRunning) {
      addLog('Cancelando proceso...', 'warn');
      chrome.storage.local.set({ isRunning: false, step: 'STOPPED' }, () => {
        setButtonState(false);
      });
      return;
    }

    if (!courseSelect.value) {
      addLog('Error: Selecciona un curso válido.', 'error');
      return;
    }

    const config = {
      courseId: courseSelect.value,
      courseName: courseSelect.options[courseSelect.selectedIndex].text,
      access: accessSelect.value,
      days: daysSelect.disabled ? 'never' : daysSelect.value,
      messageTemplate: document.getElementById('messageText').value,
      subjectTemplate: subjectText.value,
      autoSend: autoSendCheck.checked
    };

    setButtonState(true);
    addLog(`Iniciando flujo para: ${config.courseName} (Auto-envío: ${config.autoSend ? 'SÍ' : 'NO'})`, 'normal');

    chrome.storage.local.set({ workflowConfig: config, step: 'START', isRunning: true }, () => {
      chrome.runtime.sendMessage({ action: 'START_WORKFLOW' });
    });
  });

  // --- BOTONES DE DEBUGGING ---
  btnDownloadHTML.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_HTML' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.html) return;
      const blob = new Blob([response.html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `moodle_page_debug.html`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  btnCopyDOM.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { action: 'GET_DOM_SELECTORS' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.info) return;
      navigator.clipboard.writeText(response.info);
    });
  });

  btnDownloadLogs.addEventListener('click', () => {
    const logs = Array.from(debugBox.querySelectorAll('.log-line')).map(l => l.textContent).join('\n');
    if (!logs) return;
    const blob = new Blob([logs], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug_logs_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });
});