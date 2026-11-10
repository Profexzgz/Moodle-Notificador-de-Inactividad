document.addEventListener('DOMContentLoaded', async () => {
  const courseSelect = document.getElementById('courseSelect');
  const btnStart = document.getElementById('btnStart');

  // Cargar cursos guardados previamente desde la página de informes
  chrome.storage.local.get(['savedCourses', 'selectedCourse'], (data) => {
    if (data.savedCourses && data.savedCourses.length > 0) {
      data.savedCourses.forEach(course => {
        const option = document.createElement('option');
        option.value = course.id;
        option.textContent = course.name;
        courseSelect.appendChild(option);
      });
      if (data.selectedCourse) {
        courseSelect.value = data.selectedCourse;
      }
    }
  });

  btnStart.addEventListener('click', () => {
    const config = {
      courseId: courseSelect.value,
      courseName: courseSelect.options[courseSelect.selectedIndex].text,
      days: document.getElementById('daysSelect').value,
      access: document.getElementById('accessSelect').value,
      messageTemplate: document.getElementById('messageText').value
    };

    // Guardar estado de la tarea y comunicarlo al background
    chrome.storage.local.set({ workflowConfig: config, step: 'START' }, () => {
      chrome.runtime.sendMessage({ action: 'START_WORKFLOW' });
    });
  });
});