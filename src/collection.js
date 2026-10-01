/**
 * The catalogue. Edit this list to add, remove or change watches.
 *
 *  name      Display name (shown in italic serif)
 *  ref       Short reference code
 *  notes     One line about the piece
 *  specs     Up to three short facts
 *  price     Price string, or null to show "Price on request"
 *  image     Path to a photo in /public (e.g. '/watches/meridian.jpg'), or null for the engraved placeholder.
 *            Use 'model' to show a live render of the 3D watch.
 *  url       Product / checkout link (Shopify, etc.)
 */
export const COLLECTION = [
  {
    name: 'The Meridian',
    ref: 'WM·01',
    notes: 'The dress watch. Fluted bezel, day and date, steel bracelet.',
    specs: ['Day & date', 'Fluted bezel', 'Steel bracelet'],
    price: null,
    image: 'model',
    url: '#',
  },
  { name: 'Reference 002', ref: 'WM·02', notes: 'Details forthcoming.', specs: [], price: null, image: null, url: '#' },
  { name: 'Reference 003', ref: 'WM·03', notes: 'Details forthcoming.', specs: [], price: null, image: null, url: '#' },
  { name: 'Reference 004', ref: 'WM·04', notes: 'Details forthcoming.', specs: [], price: null, image: null, url: '#' },
  { name: 'Reference 005', ref: 'WM·05', notes: 'Details forthcoming.', specs: [], price: null, image: null, url: '#' },
  { name: 'Reference 006', ref: 'WM·06', notes: 'Details forthcoming.', specs: [], price: null, image: null, url: '#' },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/* Engraved placeholder: a line-drawn watch, so empty slots still feel intentional. */
function engraving(seed) {
  const r = 46 + (seed % 3) * 3;
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    const r1 = r - (i % 5 === 0 ? 7 : 3.5);
    return `<line x1="${(100 + Math.sin(a) * r1).toFixed(2)}" y1="${(130 - Math.cos(a) * r1).toFixed(2)}" x2="${(100 + Math.sin(a) * (r - 1)).toFixed(2)}" y2="${(130 - Math.cos(a) * (r - 1)).toFixed(2)}" />`;
  }).join('');
  const hatch = Array.from({ length: 14 }, (_, i) => `<line x1="${86 + i * 2}" y1="12" x2="${86 + i * 2}" y2="${130 - r - 6}" />`).join('');
  const hatch2 = Array.from({ length: 14 }, (_, i) => `<line x1="${86 + i * 2}" y1="${130 + r + 6}" x2="${86 + i * 2}" y2="248" />`).join('');
  return `
  <svg class="engraving" viewBox="0 0 200 260" aria-hidden="true">
    <g class="engraving__strap">${hatch}${hatch2}
      <rect x="84" y="10" width="32" height="${120 - r - 4}" rx="3" />
      <rect x="84" y="${140 + r - 6}" width="32" height="${110 - r}" rx="3" />
    </g>
    <circle cx="100" cy="130" r="${r + 7}" class="engraving__case" />
    <circle cx="100" cy="130" r="${r + 2}" />
    <rect x="${100 + r + 6}" y="125" width="7" height="10" rx="1.5" />
    <g class="engraving__ticks">${ticks}</g>
    <line x1="100" y1="130" x2="${100 + Math.sin(-0.9) * r * 0.5}" y2="${130 - Math.cos(-0.9) * r * 0.5}" class="engraving__hand" />
    <line x1="100" y1="130" x2="${100 + Math.sin(1.05) * r * 0.78}" y2="${130 - Math.cos(1.05) * r * 0.78}" class="engraving__hand" />
    <circle cx="100" cy="130" r="2" />
  </svg>`;
}

export function renderCollection(list) {
  const el = document.querySelector('[data-catalogue]');
  if (!el) return;
  el.innerHTML = COLLECTION.map((w, i) => {
    const media =
      w.image === 'model'
        ? `<div class="plate__img plate__img--model" data-model-shot></div>`
        : w.image
        ? `<img class="plate__img" src="${w.image}" alt="${w.name}" loading="lazy" />`
        : `<div class="plate__img plate__img--placeholder">${engraving(i)}<span class="plate__soon">Photograph forthcoming</span></div>`;
    const specs = w.specs.length ? `<ul class="plate__specs">${w.specs.map((s) => `<li>${s}</li>`).join('')}</ul>` : '';
    return `
    <li class="plate">
      <a class="plate__link" href="${w.url}">
        <div class="plate__frame">
          <span class="plate__corner plate__corner--tl"></span><span class="plate__corner plate__corner--tr"></span>
          <span class="plate__corner plate__corner--bl"></span><span class="plate__corner plate__corner--br"></span>
          ${media}
        </div>
        <div class="plate__caption">
          <p class="plate__no">Plate ${ROMAN[i] ?? i + 1}<span>${w.ref}</span></p>
          <h3 class="plate__name">${w.name}</h3>
          <p class="plate__notes">${w.notes}</p>
          ${specs}
          <p class="plate__price"><span>${w.price ?? 'Price on request'}</span><span class="plate__cta">Enquire</span></p>
        </div>
      </a>
    </li>`;
  }).join('');
}
