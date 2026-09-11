const tabs = [...document.querySelectorAll('.tab')];
const previewTitle = document.querySelector('[data-preview-title]');
const previewLabel = document.querySelector('[data-preview-label]');
const previewBody = document.querySelector('[data-preview-body]');

const views = {
  'Обзор': ['Обзор матча', 'PREVIEW', '<div class="empty">Сводка матча будет подключена к данным позже.</div>'],
  'Статистика': ['Статистика матча', 'PREVIEW', '<div class="empty">Статистика — следующий живой слой после API-подключения.</div>'],
  'События': ['События матча', 'PREVIEW', '<div class="empty">Таймлайн событий будет показан здесь.</div>'],
  'Составы': ['Составы команд', 'PREVIEW', '<div class="empty">Стартовые составы и скамейка будут показаны здесь.</div>'],
  'Форма': ['Последняя форма', '5 МАТЧЕЙ', document.querySelector('[data-form-template]').innerHTML],
  'Очные': ['Очные встречи', 'ПОСЛЕДНИЕ МАТЧИ', '<div class="empty">H2H сейчас переносится на Sportmonks.</div>'],
  'Таблица': ['Таблица', 'СЕЗОН', '<div class="empty">Турнирная таблица будет подключена после H2H.</div>'],
};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    const [title, label, body] = views[tab.textContent.trim()] || views['Форма'];
    previewTitle.textContent = title;
    previewLabel.textContent = label;
    previewBody.innerHTML = body;
  });
});
