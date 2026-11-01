const root = document.documentElement;
const rail = document.querySelector('#ark-rail');
const menuButton = document.querySelector('.ark-menu-button');
const railButtons = [...document.querySelectorAll('.ark-rail-item[data-target]')];
const sections = [...document.querySelectorAll('[data-section]')];
const revealNodes = [...document.querySelectorAll('[data-reveal]')];
const themeButtons = [...document.querySelectorAll('[data-theme]')];
const depthButtons = [...document.querySelectorAll('[data-depth]')];
const tabs = [...document.querySelectorAll('[role="tab"]')];
const copyNodes = [...document.querySelectorAll('[data-copy]')];

const themeProfiles = {
  ark: {
    documentTitle: 'Nightline Deployment Index', brand: 'TERRA INDEX', brandCode: 'OPERATION / 07', status: 'SHIFT ACTIVE',
    nav1: 'Operation', nav2: 'Dossiers', nav3: 'Archive', kicker: 'DEPLOYMENT CONTROL / NIGHTLINE', title: 'OPERATION', titleAccent: '/ NIGHTLINE',
    lede: 'Review three active zones, compare the selected deployment, and commit the next route without duplicating status across the stage.',
    primaryAction: 'Review deployment', secondaryAction: 'Open dossier', readoutTitle: 'ZONE // C-07', readoutState: 'READY',
    metric1Label: 'Teams', metric1Value: '03', metric2Label: 'Routes', metric2Value: '02', metric3Label: 'Window', metric3Value: '08:40',
    meta1: 'SHIFT / 20:40', meta2: 'ZONE / C-07', meta3: 'FICTIONAL SAMPLE',
  },
  endfield: {
    documentTitle: 'Frontier Logistics Console', brand: 'ORBITAL', brandCode: 'FIELD LAB / 07', status: 'RELAY ONLINE',
    nav1: 'Overview', nav2: 'Modules', nav3: 'Archive', kicker: 'FIELD OPERATIONS / SIGNAL ARCHIVE', title: 'FRONTIER', titleAccent: '/ SIGNAL',
    lede: 'Coordinate a field route, inspect the selected logistics window, and keep verified operating state attached to the task that owns it.',
    primaryAction: 'Open modules', secondaryAction: 'Read archive', readoutTitle: 'RELAY // 07', readoutState: 'ACTIVE',
    metric1Label: 'Signal', metric1Value: '98.42%', metric2Label: 'Drift', metric2Value: '+0.018', metric3Label: 'Window', metric3Value: '04:26',
    meta1: '49° 16′ 40.12″ N', meta2: 'NODE / OFL-07', meta3: 'FICTIONAL SAMPLE',
  },
  exa: {
    documentTitle: 'Pilgrimage Wind Archive', brand: 'WIND ATLAS', brandCode: 'JOURNEY / 03', status: 'RECORD ALIGNED',
    nav1: 'Journey', nav2: 'Subjects', nav3: 'Notices', kicker: 'PILGRIMAGE RECORD / THIRD HORIZON', title: 'WIND', titleAccent: '/ ARCHIVE',
    lede: 'Follow one selected journey through its weather window, subject notes, and chronology while the orbital instrument stays subordinate to the record.',
    primaryAction: 'Continue journey', secondaryAction: 'Read field notes', readoutTitle: 'HORIZON // 03', readoutState: 'ALIGNED',
    metric1Label: 'Records', metric1Value: '12', metric2Label: 'Weather', metric2Value: 'CALM', metric3Label: 'Departure', metric3Value: '05:20',
    meta1: 'DAY / 47', meta2: 'ROUTE / ASTR-03', meta3: 'FICTIONAL SAMPLE',
  },
  popucom: {
    documentTitle: 'Prism Plaza Party Room', brand: 'PRISM PLAZA', brandCode: 'PARTY ROOM / 04', status: '2 OF 4 READY',
    nav1: 'Party', nav2: 'Challenges', nav3: 'Rewards', kicker: 'CO-OP LOBBY / COLOR ROUTE', title: 'READY', titleAccent: '/ TOGETHER',
    lede: 'Check teammate readiness, choose one color-linked challenge, and start together from a playful lobby with one unmistakable next action.',
    primaryAction: 'Ready up', secondaryAction: 'Choose challenge', readoutTitle: 'PARTY // 04', readoutState: '2 READY',
    metric1Label: 'Players', metric1Value: '02 / 04', metric2Label: 'Route', metric2Value: 'PRISM', metric3Label: 'Stars', metric3Value: '08',
    meta1: 'ROOM / P-204', meta2: 'MODE / CO-OP', meta3: 'FICTIONAL SAMPLE',
  },
  corporate: {
    documentTitle: 'Worlds in Progress', brand: 'STUDIO INDEX', brandCode: 'PROJECTS / 05', status: 'PORTFOLIO OPEN',
    nav1: 'Projects', nav2: 'Studio', nav3: 'Careers', kicker: 'INDEPENDENT WORLDS / SELECTED WORK', title: 'WORLDS', titleAccent: '/ IN PROGRESS',
    lede: 'Browse one selected project, understand the studio principle behind it, and move directly to current disciplines without decorative telemetry.',
    primaryAction: 'View project', secondaryAction: 'Explore roles', readoutTitle: 'PROJECT // 05', readoutState: 'FEATURED',
    metric1Label: 'Discipline', metric1Value: 'WORLD', metric2Label: 'Format', metric2Value: 'INTERACTIVE', metric3Label: 'Status', metric3Value: 'ACTIVE',
    meta1: 'PROJECT INDEX / 05', meta2: 'STUDIO / ORIGINAL', meta3: 'FICTIONAL SAMPLE',
  },
};

revealNodes
  .filter((node) => node.closest('#overview'))
  .forEach((node) => { node.dataset.visible = 'true'; });

function setMenu(open) {
  rail.dataset.open = String(open);
  menuButton?.setAttribute('aria-expanded', String(open));
}

menuButton?.addEventListener('click', () => {
  setMenu(rail.dataset.open !== 'true');
});

railButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.target);
    target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setMenu(false);
  });
});

const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;

  railButtons.forEach((button) => {
    const active = button.dataset.target === visible.target.dataset.section;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}, { threshold: [0.25, 0.55, 0.75] });

sections.forEach((section) => sectionObserver.observe(section));

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.dataset.visible = 'true';
    observer.unobserve(entry.target);
  });
}, { threshold: 0.12 });

revealNodes
  .filter((node) => node.dataset.visible !== 'true')
  .forEach((node) => revealObserver.observe(node));

function revealInViewport() {
  revealNodes.forEach((node) => {
    if (node.dataset.visible === 'true') return;
    const rect = node.getBoundingClientRect();
    if (rect.top < innerHeight * 0.94 && rect.bottom > 0) node.dataset.visible = 'true';
  });
}

addEventListener('scroll', revealInViewport, { passive: true });
addEventListener('resize', revealInViewport, { passive: true });
requestAnimationFrame(() => requestAnimationFrame(revealInViewport));

function setTheme(theme) {
  const profile = themeProfiles[theme] || themeProfiles.endfield;
  root.dataset.arkTheme = theme;
  document.title = profile.documentTitle;
  copyNodes.forEach((node) => {
    const value = profile[node.dataset.copy];
    if (value) node.textContent = value;
  });
  themeButtons.forEach((button) => {
    const selected = button.dataset.theme === theme;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

themeButtons.forEach((button) => button.addEventListener('click', () => setTheme(button.dataset.theme)));

function setDepth(depth) {
  root.dataset.arkDepth = depth;
  depthButtons.forEach((button) => {
    const selected = button.dataset.depth === depth;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

depthButtons.forEach((button) => button.addEventListener('click', () => setDepth(button.dataset.depth)));
const params = new URLSearchParams(location.search);
const requestedTheme = params.get('theme');
const requestedDepth = params.get('depth');
setTheme(themeProfiles[requestedTheme] ? requestedTheme : (root.dataset.arkTheme || 'endfield'));
setDepth(['minimal', 'moderate', 'complex', 'maximal'].includes(requestedDepth) ? requestedDepth : (root.dataset.arkDepth || 'complex'));

function selectTab(tab) {
  tabs.forEach((candidate) => {
    const selected = candidate === tab;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    document.getElementById(candidate.getAttribute('aria-controls')).hidden = !selected;
  });
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    tabs[next].focus();
    selectTab(tabs[next]);
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenu(false);
});
