const params = new URLSearchParams(location.search);
const allowedScenes = ['cover', 'families', 'depth', 'responsive'];
const allowedFormats = ['landscape', 'portrait'];

const scene = allowedScenes.includes(params.get('scene')) ? params.get('scene') : 'cover';
const format = allowedFormats.includes(params.get('format')) ? params.get('format') : 'landscape';

document.body.dataset.scene = scene;
document.body.dataset.format = format;
document.title = `Ark UI Promo / ${scene} / ${format}`;
document.fonts.ready.then(() => {
  document.body.dataset.ready = 'true';
});
