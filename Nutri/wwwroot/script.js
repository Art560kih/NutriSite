const byId = id => document.getElementById(id);
const value = id => byId(id).value;
const metrics = ['calories', 'protein', 'fat', 'carbs'];
const categories = ['Все', 'Мои продукты', 'Крупы', 'Мясо', 'Молочное', 'Овощи', 'Фрукты', 'Орехи', 'Напитки'];
const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
let products = [];
let diary = null;
let profile = null;
let selectedCategory = 'Все';
let gender = 'male';
let notificationTimer;
let diaryRequest = 0;

async function api(path, method = 'GET', data) {
  const options = { method, cache: 'no-store' };
  if (data !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(data);
  }

  const response = await fetch('/api/' + path, options);
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    if (response.status === 401 && profile) lockSite();
    throw new Error(problem.message || ({
      400: 'Проверьте заполнение полей',
      401: 'Войдите в аккаунт'
    })[response.status] || 'Не удалось выполнить запрос');
  }

  return response.headers.get('Content-Type')?.includes('application/json') ? response.json() : undefined;
}

function openPage(pageName) {
  document.querySelectorAll('.section').forEach(section =>
    section.classList.toggle('visible', section.id === 'section-' + pageName));
  document.querySelectorAll('.menu-button[data-page]').forEach(button =>
    button.classList.toggle('active', button.dataset.page === pageName));
  window.scrollTo(0, 0);
}

function showNotification(text) {
  const box = byId('notification');
  box.textContent = text;
  box.classList.add('show');
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => box.classList.remove('show'), 3000);
}

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function formatMetric(key, number) {
  return numberFormat.format(number ?? 0) + (key === 'calories' ? '' : ' г');
}

function renderMetricBoxes(selector, keys, actual, goal) {
  document.querySelectorAll(selector).forEach((box, index) => {
    const key = keys[index];
    const amount = actual?.[key] ?? 0;
    const target = goal?.[key] ?? 0;
    box.querySelector('.value').replaceChildren(formatMetric(key, amount), ' ',
      element('span', 'small-text', 'из ' + formatMetric(key, target)));
    box.querySelector('.progress-line-fill').style.width = (target > 0 ? Math.min(100, amount / target * 100) : 0) + '%';
  });
}

function renderDiary() {
  for (const id of ['mealListHome', 'mealListDiary']) {
    const list = byId(id);
    list.replaceChildren();
    for (const meal of diary?.meals ?? []) {
      const row = element('div', 'meal-item');
      const details = document.createElement('div');
      details.append(element('div', 'meal-name', meal.name + ' (100 г)'),
        element('div', 'meal-info', formatMetric('calories', meal.calories) + ' ккал, Б ' +
          formatMetric('protein', meal.protein) + ', Ж ' + formatMetric('fat', meal.fat) + ', У ' + formatMetric('carbs', meal.carbs)));
      row.append(element('div', 'meal-letter', meal.name.charAt(0)), details,
        element('div', 'meal-time', new Date(meal.eatenAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })));
      list.append(row);
    }
    if (!list.childElementCount) {
      list.append(element('div', 'empty-message', diary ?
        'Сегодня ещё нет записей. Добавьте продукт на странице «Продукты».' : 'Рацион загружается…'));
    }
  }

  metrics.forEach(key => byId('diaryTotal' + key[0].toUpperCase() + key.slice(1)).textContent =
    formatMetric(key, diary?.totals[key]));
  const goal = profile?.goal;
  renderMetricBoxes('#section-home .left .numbers-row .number-box', metrics, diary?.totals, goal);
  byId('goalStatus').textContent = goal ? 'Суточная норма' : 'Не задано';
  document.querySelectorAll('#section-home .right .number-box .value').forEach((node, index) =>
    node.textContent = formatMetric(metrics[index], goal?.[metrics[index]]));
  metrics.forEach(key => byId('result' + key[0].toUpperCase() + key.slice(1)).textContent =
    goal ? formatMetric(key, goal[key]) : '—');

  const week = diary?.week ?? [];
  const chart = byId('weekChart');
  chart.replaceChildren();
  const max = Math.max(0, ...week.map(day => day.totals.calories));
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' });
  for (const day of week) {
    const column = element('div', 'chart-column');
    const bar = element('div', 'chart-bar');
    bar.style.height = (max ? Math.round(day.totals.calories / max * 140) : 0) + 'px';
    column.append(element('div', 'chart-value', numberFormat.format(day.totals.calories)), bar,
      element('div', 'chart-label', weekday.format(new Date(day.date))));
    chart.append(column);
  }
  const averages = Object.fromEntries(metrics.slice(1).map(key => [
    key, week.length ? week.reduce((sum, day) => sum + day.totals[key], 0) / week.length : 0
  ]));
  renderMetricBoxes('#section-stats .number-box', metrics.slice(1), averages, goal);
}

async function loadDiary() {
  const request = ++diaryRequest;
  const result = await api('diary?timeZone=' + encodeURIComponent(timezone));
  if (request !== diaryRequest) return;
  diary = result;
  renderDiary();
}

function selectCategory(category) {
  selectedCategory = category;
  renderProducts();
}

function renderProducts() {
  const buttons = byId('categoryButtons');
  buttons.replaceChildren();
  for (const category of categories) {
    const button = element('button', category === selectedCategory ? 'selected' : '', category);
    button.addEventListener('click', () => selectCategory(category));
    buttons.append(button);
  }

  const grid = byId('productGrid');
  grid.replaceChildren();
  const query = value('productSearch').trim().toLocaleLowerCase('ru');
  for (const product of products) {
    if (selectedCategory !== 'Все' && product.category !== selectedCategory) continue;
    if (!product.name.toLocaleLowerCase('ru').includes(query)) continue;

    const card = element('div', 'product-card');
    const top = element('div', 'product-top');
    const title = document.createElement('div');
    title.append(element('div', 'product-name', product.name),
      element('div', 'product-category', product.category + ' · на 100 г'));
    top.append(element('div', 'product-letter', product.name.charAt(0)), title);

    const nutrients = element('div', 'product-macros');
    const labels = ['ккал', 'белки', 'жиры', 'углев.'];
    metrics.forEach((key, index) => {
      const cell = document.createElement('div');
      cell.append(element('b', '', numberFormat.format(product[key])), labels[index]);
      nutrients.append(cell);
    });
    const button = element('button', 'btn btn-outline btn-small', '+ Добавить в рацион');
    button.addEventListener('click', () => addToDiary(product, button));
    card.append(top, nutrients, button);
    grid.append(card);
  }
  if (!grid.childElementCount) grid.append(element('div', 'empty-message', 'Продукты не найдены.'));
}

async function addToDiary(product, button) {
  const account = profile;
  button.disabled = true;
  try {
    await api('meals', 'POST', { productId: product.id });
    if (profile !== account) return;
    showNotification('Добавлено в рацион: ' + product.name);
    await loadDiary();
  } catch (error) {
    showNotification(error.message);
  } finally {
    button.disabled = false;
  }
}

async function addOwnProduct() {
  const name = value('ownName').trim();
  if (!name || value('ownCalories') === '') {
    showNotification('Укажите название и калории');
    return;
  }

  const account = profile;
  const button = document.querySelector('#section-products .btn-green');
  button.disabled = true;
  try {
    const product = await api('products', 'POST', {
      name, calories: Number(value('ownCalories')), protein: Number(value('ownProtein')),
      fat: Number(value('ownFat')), carbs: Number(value('ownCarbs'))
    });
    if (profile !== account) return;
    products.push(product);
    for (const id of ['ownName', 'ownCalories', 'ownProtein', 'ownFat', 'ownCarbs', 'productSearch']) byId(id).value = '';
    selectCategory('Мои продукты');
    showNotification('Продукт сохранён');
  } catch (error) {
    showNotification(error.message);
  } finally {
    button.disabled = false;
  }
}

async function saveGoal() {
  const account = profile;
  const button = document.querySelector('#section-calc .btn-green');
  button.disabled = true;
  try {
    const goal = await api('goal', 'PUT', {
      gender, age: Number(value('inputAge')), height: Number(value('inputHeight')),
      weight: Number(value('inputWeight')), activity: Number(value('inputActivity')),
      adjustment: Number(value('inputGoal'))
    });
    if (profile !== account) return;
    account.goal = goal;
    renderDiary();
    showNotification('Цель сохранена');
  } catch (error) {
    showNotification(error.message);
  } finally {
    button.disabled = false;
  }
}

function showAuthScreen(which) {
  byId('authRegister').style.display = which === 'register' ? 'flex' : 'none';
  byId('authLogin').style.display = which === 'login' ? 'flex' : 'none';
  byId('regError').textContent = '';
  byId('loginError').textContent = '';
}

function lockSite() {
  profile = null;
  products = [];
  diary = null;
  diaryRequest++;
  selectedCategory = 'Все';
  document.body.classList.add('auth-locked');
  showAuthScreen('login');
}

function renderProfile() {
  byId('topUserName').textContent = profile.name;
  byId('welcomeHeading').textContent = 'Добро пожаловать, ' + profile.name + '!';
  byId('profileName').value = profile.name;
  byId('profileEmail').value = profile.email;
  byId('profilePassword').value = '';
  byId('profilePasswordRow').hidden = true;
  for (const button of document.querySelectorAll('[data-preference]')) {
    const enabled = profile[button.dataset.preference];
    button.setAttribute('aria-checked', enabled);
    button.classList.toggle('on', enabled);
  }
}

async function enterSite(account) {
  profile = account;
  products = [];
  diary = null;
  byId('productSearch').value = '';
  renderProfile();
  renderProducts();
  renderDiary();
  document.body.classList.remove('auth-locked');
  openPage('home');
  await Promise.all([
    api('products').then(result => {
      if (profile !== account) return;
      products = result;
      renderProducts();
    }),
    loadDiary()
  ]).catch(error => showNotification(error.message));
}

async function registerUser() {
  const error = byId('regError');
  const password = value('regPassword');
  if (password.length < 8 || password !== value('regPasswordRepeat')) {
    error.textContent = password.length < 8 ? 'Пароль должен содержать минимум 8 символов' : 'Пароли не совпадают';
    return;
  }

  const button = byId('authRegister').querySelector('button');
  if (button.disabled) return;
  button.disabled = true;
  try {
    const email = value('regEmail').trim();
    await api('account/register', 'POST', { name: value('regName').trim(), email, password });
    for (const id of ['regName', 'regEmail', 'regPassword', 'regPasswordRepeat']) byId(id).value = '';
    showAuthScreen('login');
    byId('loginEmail').value = email;
    byId('loginPassword').focus();
    showNotification('Аккаунт создан. Войдите с новым паролем');
  } catch (failure) {
    error.textContent = failure.message;
  } finally {
    button.disabled = false;
  }
}

async function loginUser() {
  const button = byId('authLogin').querySelector('button');
  if (button.disabled) return;
  button.disabled = true;
  try {
    const account = await api('account/login', 'POST', { email: value('loginEmail').trim(), password: value('loginPassword') });
    byId('loginPassword').value = '';
    await enterSite(account);
  } catch (error) {
    byId('loginError').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  try {
    await api('account/logout', 'POST');
    lockSite();
  } catch (error) {
    showNotification(error.message);
  }
}

async function saveProfile() {
  const account = profile;
  const button = document.querySelector('#section-settings .btn-green');
  button.disabled = true;
  try {
    const updated = await api('account', 'PUT', {
      name: value('profileName').trim(), email: value('profileEmail').trim(),
      currentPassword: value('profilePassword') || null
    });
    if (profile !== account) return;
    profile.name = updated.name;
    profile.email = updated.email;
    renderProfile();
    showNotification('Профиль сохранён');
  } catch (error) {
    showNotification(error.message);
  } finally {
    button.disabled = false;
  }
}

const preferenceButtons = [...document.querySelectorAll('[data-preference]')];
for (const button of preferenceButtons) {
  button.addEventListener('click', async () => {
    const account = profile;
    const changes = Object.fromEntries(preferenceButtons.map(item => [
      item.dataset.preference, item === button ? !profile[item.dataset.preference] : profile[item.dataset.preference]
    ]));
    preferenceButtons.forEach(item => item.disabled = true);
    try {
      const updated = await api('account/preferences', 'PUT', changes);
      if (profile !== account) return;
      for (const item of preferenceButtons) {
        const key = item.dataset.preference;
        profile[key] = updated[key];
        item.setAttribute('aria-checked', updated[key]);
        item.classList.toggle('on', updated[key]);
      }
    } catch (error) {
      showNotification(error.message);
    } finally {
      preferenceButtons.forEach(item => item.disabled = false);
    }
  });
}

byId('profileEmail').addEventListener('input', () => {
  byId('profilePasswordRow').hidden = value('profileEmail').trim().toLowerCase() === profile.email;
});
byId('productSearch').addEventListener('input', () => {
  selectedCategory = 'Все';
  openPage('products');
  renderProducts();
});
for (const [id, option] of [['genderMale', 'male'], ['genderFemale', 'female']]) {
  byId(id).addEventListener('click', () => {
    gender = option;
    byId('genderMale').classList.toggle('selected', gender === 'male');
    byId('genderFemale').classList.toggle('selected', gender === 'female');
  });
}
for (const [id, submit] of [['authRegister', registerUser], ['authLogin', loginUser]]) {
  byId(id).addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') submit();
  });
}

api('account').then(enterSite).catch(error => {
  if (error.message !== 'Войдите в аккаунт') showNotification(error.message);
});
window.addEventListener('focus', () => {
  if (profile) loadDiary().catch(error => showNotification(error.message));
});
