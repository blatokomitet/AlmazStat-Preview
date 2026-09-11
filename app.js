const tabs = [...document.querySelectorAll('.tab')];
const section = document.querySelector('main.app > section:last-of-type');
const bottomItems = [...document.querySelectorAll('.nav')];
const back = document.querySelector('.back');

const views = {
  'Обзор': `<div class="section-title"><h2>Обзор матча</h2><span class="label">MATCH CENTRE</span></div><div class="formbox"><div class="matches"><div class="match"><span>Счёт</span><b>Sevilla 1:0 Valencia</b></div><div class="match"><span>Статус</span><b>Full Time</b></div><div class="match"><span>Сигнал</span><b>Данные актуальны</b></div></div></div>`,
  'Статистика': `<div class="section-title"><h2>Статистика</h2><span class="label">MATCH</span></div><div class="formbox"><div class="matches"><div class="match"><span>Владение</span><b>56% : 44%</b></div><div class="match"><span>Удары</span><b>14 : 8</b></div><div class="match"><span>В створ</span><b>5 : 2</b></div><div class="match"><span>Угловые</span><b>6 : 3</b></div></div></div>`,
  'События': `<div class="section-title"><h2>События</h2><span class="label">TIMELINE</span></div><div class="formbox"><div class="matches"><div class="match"><span>⚽ 67' Sevilla</span><b>1:0</b></div><div class="match"><span>🟨 54' Valencia</span><b>Card</b></div><div class="match"><span>↔ 46' Sevilla</span><b>Sub</b></div></div></div>`,
  'Составы': `<div class="section-title"><h2>Составы</h2><span class="label">LINEUPS</span></div><div class="formbox"><div class="teamform"><div class="formhead"><strong>Sevilla</strong><span class="label">4-2-3-1</span></div><div class="matches"><div class="match"><span>Стартовый состав</span><b>11</b></div><div class="match"><span>Скамейка</span><b>9</b></div></div></div><div class="teamform"><div class="formhead"><strong>Valencia</strong><span class="label">4-4-2</span></div><div class="matches"><div class="match"><span>Стартовый состав</span><b>11</b></div><div class="match"><span>Скамейка</span><b>9</b></div></div></div></div>`,
  'Форма': `<div class="section-title"><h2>Последняя форма</h2><span class="label">5 МАТЧЕЙ</span></div><div class="formbox"><div class="teamform"><div class="formhead"><strong>Sevilla</strong><div class="sequence"><span class="badge w">W</span><span class="badge d">D</span><span class="badge l">L</span><span class="badge w">W</span><span class="badge w">W</span></div></div><div class="matches"><div class="match"><span>vs Getafe</span><b>2:0</b></div><div class="match"><span>vs Girona</span><b>1:1</b></div></div></div><div class="teamform"><div class="formhead"><strong>Valencia</strong><div class="sequence"><span class="badge l">L</span><span class="badge w">W</span><span class="badge d">D</span><span class="badge w">W</span><span class="badge l">L</span></div></div><div class="matches"><div class="match"><span>vs Barcelona</span><b>0:5</b></div><div class="match"><span>vs Athletic Club</span><b>2:1</b></div></div></div></div>`,
  'Очные': `<div class="section-title"><h2>Очные встречи</h2><span class="label">H2H</span></div><div class="formbox"><div class="matches"><div class="match"><span>Valencia — Sevilla</span><b>1:2</b></div><div class="match"><span>Sevilla — Valencia</span><b>0:0</b></div><div class="match"><span>Valencia — Sevilla</span><b>2:1</b></div></div></div>`,
  'Таблица': `<div class="section-title"><h2>Таблица</h2><span class="label">LA LIGA</span></div><div class="formbox"><div class="matches"><div class="match"><span>6 · Sevilla</span><b>10 pts</b></div><div class="match"><span>12 · Valencia</span><b>7 pts</b></div></div></div>`
};

function render(name, tab) {
  tabs.forEach(btn => btn.classList.toggle('active', btn === tab));
  section.innerHTML = (views[name] || views['Обзор']) + '<div class="preview-note">Interactive GitHub preview · demo data</div>';
}

tabs.forEach(tab => tab.addEventListener('click', () => render(tab.textContent.trim(), tab)));

bottomItems.forEach(item => {
  item.style.cursor = 'pointer';
  item.addEventListener('click', () => {
    bottomItems.forEach(el => el.classList.remove('active'));
    item.classList.add('active');
    const name = item.textContent.trim();
    section.innerHTML = `<div class="section-title"><h2>${name}</h2><span class="label">PREVIEW</span></div><div class="formbox"><div class="matches"><div class="match"><span>Раздел работает</span><b>${name}</b></div></div></div><div class="preview-note">GitHub Pages demo · без backend API</div>`;
  });
});

if (back) {
  back.style.cursor = 'pointer';
  back.addEventListener('click', () => {
    section.innerHTML = `<div class="section-title"><h2>Матчи</h2><span class="label">PREVIEW</span></div><div class="formbox"><div class="matches"><div class="match"><span>Sevilla — Valencia</span><b>1:0 FT</b></div><div class="match"><span>Union Berlin — Schalke 04</span><b>0:2 FT</b></div></div></div>`;
  });
}
