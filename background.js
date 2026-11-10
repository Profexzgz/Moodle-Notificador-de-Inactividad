chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_WORKFLOW') {
    chrome.tabs.create({ url: 'https://www.fpvirtualaragon.es/private-reports/docentes.php' });
  }

  if (request.action === 'OPEN_MAIL_DRAFT') {
    // Abrir directamente la vista de composición/redacción de mensaje
    chrome.tabs.create({ url: 'https://www.fpvirtualaragon.es/local/mail/view.php?action=compose' });
  }
});