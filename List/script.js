document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  const menuData = {
    主食: [
      ['青椒肉丝', '青椒 · 猪里脊 · 家常酱汁', '¥18'],
      ['香菇肉酱拌面', '手擀面 · 香菇肉酱 · 小青菜', '¥16'],
      ['酸辣粉', '红薯粉 · 花生 · 酸豆角', '¥12'],
      ['鸡腿饭', '卤香鸡腿 · 米饭 · 时蔬', '¥22'],
      ['鲜肉蒸饺', '手工现包 · 8只', '¥15'],
      ['蛋炒饭', '土鸡蛋 · 火腿 · 葱花', '¥13']
    ],
    小吃: [
      ['蒸饺', '鲜肉馅 · 8只', '¥12'],
      ['拌云吞', '鲜肉云吞 · 红油 · 葱花', '¥14'],
      ['炸云吞', '酥脆云吞 · 甜辣酱', '¥14'],
      ['卤蛋', '五香卤蛋 · 1只', '¥3'],
      ['小笼包', '鲜肉小笼 · 8只', '¥16'],
      ['炸春卷', '时蔬春卷 · 4只', '¥10']
    ],
    饮品: [
      ['冰豆浆', '现磨豆浆 · 甜度可选', '¥6'],
      ['酸梅汤', '乌梅 · 山楂 · 桂花', '¥8'],
      ['柠檬茶', '鲜柠檬 · 红茶 · 冰饮', '¥9'],
      ['椰奶冻', '椰香奶冻 · 椰蓉', '¥10'],
      ['热茶', '当日茶饮 · 一壶', '¥12']
    ]
  };
  const menuImageSets = [
    ['dish-stirfry.jpg', 'dish-noodles.jpg', 'dish-rice.jpg', 'dish-egg.jpg', 'dish-jiaozi.jpg', 'dish-noodles.jpg'],
    ['dish-jiaozi.jpg', 'dish-dumpling.jpg', 'dish-dumpling.jpg', 'dish-egg.jpg', 'dish-jiaozi.jpg', 'dish-dumpling.jpg'],
    ['dish-noodles.jpg', 'dish-soup.jpg', 'dish-noodles.jpg', 'dish-soup.jpg', 'dish-rice.jpg']
  ];
  const menuCategories = Object.keys(menuData);
  const homeDishes = [
    ['鸡腿饭', '卤香鸡腿 · 米饭 · 时蔬', '¥22', 'dish-rice.jpg'],
    ['鲜肉蒸饺', '手工现包 · 8只', '¥15', 'dish-jiaozi.jpg'],
    ['五香卤蛋', '五香卤香 · 1只', '¥3', 'dish-egg.jpg']
  ];
  document.querySelectorAll('.dish-card').forEach((card, index) => {
    const dish = homeDishes[index];
    if (!dish) return;
    card.querySelector('.dish-photo').style.backgroundImage = `url('${dish[3]}')`;
    card.querySelector('.dish-info').innerHTML = `<div><h3>${dish[0]}</h3><p>${dish[1]}</p></div><strong>${dish[2]}</strong>`;
  });
  const menuSection = document.querySelector('.menu-section');
  if (menuSection) {
    menuSection.querySelector('.section-kicker').textContent = '沙县家常味';
    menuSection.querySelector('h2').innerHTML = '一碗热汤，<br>一口就是家。';
    menuSection.querySelector('.menu-footer p').textContent = '现点现做，蒸饺出笼、面汤滚烫。每一份都是街坊熟悉的家常味。';
  }
  const brandSubline = document.querySelector('.brand-text small');
  const eyebrow = document.querySelector('.eyebrow');
  const heroTitle = document.querySelector('.hero-copy h1');
  const heroLede = document.querySelector('.hero-lede');
  const imageCaption = document.querySelector('.image-caption span');
  if (brandSubline) brandSubline.textContent = '沙县小吃 · 呈贡';
  if (eyebrow) eyebrow.textContent = 'KUNMING · EVERYDAY';
  if (heroTitle) heroTitle.innerHTML = '小吃不小，<br><em>一碗就是家的味道。</em>';
  if (heroLede) heroLede.textContent = '从一碗拌面、一笼蒸饺，到一枚五香卤蛋，热气腾腾的家常味，陪你认真吃好每一天。';
  if (imageCaption) imageCaption.textContent = '今日热灶 · 11:40';
  const menuDrawer = document.querySelector('#menuDrawer');
  const backdrop = document.querySelector('#drawerBackdrop');
  const menuItems = document.querySelector('#menuItems');
  const menuHeaders = document.querySelectorAll('.menu-table thead th');
  if (menuHeaders.length === 3) {
    menuHeaders[0].textContent = '图片';
    menuHeaders[1].textContent = '菜品 / 说明';
    menuHeaders[2].textContent = '价格';
  }
  const renderMenu = (category = '主食') => {
    const categoryIndex = Math.max(0, menuCategories.indexOf(category));
    const images = menuImageSets[categoryIndex] || [];
    menuItems.innerHTML = menuData[category].map(([name, desc, price], index) => `<tr><td><img class="menu-row-image" src="${images[index] || 'dish-rice.jpg'}" alt="${name}" loading="lazy"></td><td><strong class="menu-item-name">${name}</strong><span class="menu-item-desc">${desc}</span></td><td>${price}</td></tr>`).join('');
    document.querySelectorAll('.menu-tab').forEach((tab) => {
      const active = tab.dataset.category === category;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
  };
  const closeMenu = () => { menuDrawer.classList.remove('is-open'); backdrop.classList.remove('is-open'); menuDrawer.setAttribute('aria-hidden', 'true'); };
  const openMenu = () => { renderMenu(); menuDrawer.classList.add('is-open'); backdrop.classList.add('is-open'); menuDrawer.setAttribute('aria-hidden', 'false'); };
  document.querySelectorAll('a[href="#menu"], [data-menu-open]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); openMenu(); }));
  document.querySelector('.drawer-close')?.addEventListener('click', closeMenu);
  backdrop?.addEventListener('click', closeMenu);
  document.querySelectorAll('.menu-tab').forEach((tab) => tab.addEventListener('click', () => renderMenu(tab.dataset.category)));
  document.querySelector('[data-menu-close]')?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
  const visitPhone = document.querySelector('.visit-details div:last-child strong');
  const phoneLink = document.querySelector('.visit-copy a[href^="tel:"]');
  if (visitPhone) visitPhone.textContent = '1008611';
  if (phoneLink) { phoneLink.href = 'tel:1008611'; }
  document.querySelectorAll('[data-scroll]').forEach((button) => {
    button.addEventListener('click', () => document.querySelector(button.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' }));
  });
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav-links');
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('is-open', !open);
  });
  const date = document.querySelector('#dateInput');
  const today = new Date();
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  date.min = iso;
  date.value = iso;
  document.querySelector('#bookingForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const message = document.querySelector('#bookingMessage');
    const guests = document.querySelector('#guestsInput').value;
    const time = document.querySelector('#timeInput').value;
    message.textContent = `正在为您查询 ${time} · ${guests} 的座位，请稍候。`;
  });
});
