const showcaseRoot = document.querySelector('.family-showcase');
const depthButtons = [...document.querySelectorAll('[data-set-depth]')];
const navButtons = [...document.querySelectorAll('[data-view]')];
const actionButtons = [...document.querySelectorAll('[data-demo-action]')];
const liveStatus = document.querySelector('[data-live-status]');
const allowedDepths = ['minimal', 'moderate', 'complex', 'maximal'];

function setDepth(depth) {
  const next = allowedDepths.includes(depth) ? depth : 'complex';
  showcaseRoot.dataset.depth = next;
  depthButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.setDepth === next)));
  const url = new URL(location.href);
  url.searchParams.set('depth', next);
  history.replaceState({}, '', url);
  if (liveStatus) liveStatus.textContent = `Application depth: ${next}. Content and accessible names remain unchanged.`;
}

function selectView(button) {
  navButtons.forEach((candidate) => {
    if (candidate === button) candidate.setAttribute('aria-current', 'page');
    else candidate.removeAttribute('aria-current');
  });
  if (liveStatus) liveStatus.textContent = `Selected view: ${button.textContent.trim()}.`;
}

depthButtons.forEach((button) => button.addEventListener('click', () => setDepth(button.dataset.setDepth)));
navButtons.forEach((button) => button.addEventListener('click', () => selectView(button)));
actionButtons.forEach((button) => button.addEventListener('click', () => {
  if (liveStatus) liveStatus.textContent = button.dataset.demoAction;
}));

const requestedDepth = new URLSearchParams(location.search).get('depth');
setDepth(requestedDepth || showcaseRoot.dataset.depth || 'complex');
