import './styles.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { WatchStage, pose } from './watch.js';
import { renderCollection } from './collection.js';

gsap.registerPlugin(ScrollTrigger, SplitText);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

history.scrollRestoration = 'manual';
scrollTo(0, 0);

/* ── Smooth scroll ─────────────────────────────────────────── */
const lenis = new Lenis({ lerp: reduced ? 1 : 0.085, smoothWheel: !reduced, wheelMultiplier: 0.9 });
lenis.stop();
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

$$('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2 && id !== '#') return;
    e.preventDefault();
    lenis.scrollTo(id === '#top' || id === '#' ? 0 : id, { duration: 2.2, easing: (t) => 1 - Math.pow(1 - t, 4) });
  }),
);

/* ── Small details ─────────────────────────────────────────── */
$('[data-year]').textContent = new Date().getFullYear();
const clock = $('[data-clock]');
const tickClock = () => {
  const d = new Date();
  clock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
tickClock();
setInterval(tickClock, 10_000);

$('[data-letter-form]').addEventListener('submit', (e) => {
  e.preventDefault();
  e.currentTarget.classList.add('is-sent');
});

renderCollection();

// loader dial ticks
$('.loader__ticks').innerHTML = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 60) * Math.PI * 2, r1 = i % 5 ? 54 : 52, r2 = 57;
  return `<line x1="${60 + Math.sin(a) * r1}" y1="${60 - Math.cos(a) * r1}" x2="${60 + Math.sin(a) * r2}" y2="${60 - Math.cos(a) * r2}"/>`;
}).join('');

/* ── 3D stage ──────────────────────────────────────────────── */
const stage = new WatchStage($('.stage__canvas'), $('.stage__labels'));
gsap.ticker.add((time) => stage.render(time));
if (import.meta.env.DEV) Object.assign(window, { __stage: stage, __pose: pose, __gsap: gsap });

const counter = $('[data-count]');
const loaderProgress = { v: 0 };
const setProgress = (p) =>
  gsap.to(loaderProgress, {
    v: p, duration: 0.6, ease: 'power2.out', overwrite: true,
    onUpdate: () => {
      counter.textContent = Math.round(loaderProgress.v * 100);
      $('.loader__progress').style.strokeDashoffset = 100 - loaderProgress.v * 100;
      $('.loader__hand').style.transform = `rotate(${loaderProgress.v * 360}deg)`;
    },
  });

Promise.all([stage.load(setProgress), document.fonts.ready])
  .then(() => {
    setProgress(1);
    const shot = $('[data-model-shot]');
    if (shot) {
      const url = stage.snapshot();
      if (url) shot.innerHTML = `<img src="${url}" alt="The Meridian" />`;
    }
    return new Promise((r) => setTimeout(r, 700));
  })
  .catch((err) => {
    console.error(err);
    document.body.classList.add('no-webgl');
  })
  .finally(intro);

/* ── Intro ─────────────────────────────────────────────────── */
function intro() {
  buildScroll();
  const tl = gsap.timeline({ onComplete: () => lenis.start() });
  tl.to('.loader__inner', { opacity: 0, y: -16, duration: 0.6, ease: 'power2.in' })
    .to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, '-=0.1')
    .add(() => document.body.classList.remove('is-loading'), '<0.3')
    .from(pose, { rotY: -2.6, rotX: 0.9, scale: 0.7, duration: 2.4, ease: 'expo.out' }, '<0.15')
    .from('.stage__glow', { opacity: 0, scale: 0.6, duration: 2, ease: 'power2.out' }, '<')
    .from('.masthead > *', { opacity: 0, y: -14, duration: 1, stagger: 0.1, ease: 'power3.out' }, '<0.4')
    .from('.chapter--hero .kicker', { opacity: 0, y: 12, duration: 0.9, ease: 'power3.out' }, '<0.1')
    .from('.hero__title [data-reveal] .line-inner', { yPercent: 110, duration: 1.3, stagger: 0.12, ease: 'expo.out' }, '<0.1')
    .from('.hero__lede, .hero__meta', { opacity: 0, y: 18, duration: 1, stagger: 0.12, ease: 'power3.out' }, '<0.5')
    .from('.scrollcue, .rail', { opacity: 0, duration: 1 }, '<0.3');
}

/* Wraps each hero title word so it can rise out of a mask. */
$$('.hero__title [data-reveal]').forEach((el) => {
  el.innerHTML = `<span class="line-inner">${el.innerHTML}</span>`;
});

/* ── Scroll choreography ──────────────────────────────────── */
function buildScroll() {
  const vh = (n) => n; // timeline is measured in viewport-heights of scroll

  // The story is 840vh tall (see CSS), so it scrolls through 740vh. Timeline units = vh scrolled.
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: { trigger: '.story', start: 'top top', end: 'bottom bottom', scrub: 1.1 },
  });

  // Frontispiece → I. The Face: one full turn, then settle face-on to the right
  tl.to(pose, { rotY: Math.PI * 2, rotX: 0, rotZ: 0, x: 0.38, y: -0.02, scale: 1.45, duration: vh(110) }, 0)
    .to('.hero__copy', { opacity: 0, yPercent: -18, duration: vh(55), ease: 'power1.in' }, 0)
    .to('.scrollcue', { opacity: 0, duration: vh(20) }, 0)
    // time passes on the dial
    .to(pose, { hours: 12, duration: vh(150), ease: 'power1.inOut' }, vh(90))

  // → II. Anatomy: turn to a three-quarter profile and come apart
    .to(pose, { rotY: Math.PI * 2 - 0.95, rotX: 0.22, rotZ: -0.06, x: 0.16, y: 0.04, scale: 0.86, duration: vh(110) }, vh(220))
    .to(pose, { explode: 1, duration: vh(140), ease: 'power1.inOut' }, vh(230))
    .to(pose, { labels: 1, duration: vh(35), ease: 'none' }, vh(340))
    .to(pose, { rotY: Math.PI * 2 - 1.2, duration: vh(130), ease: 'none' }, vh(330))
    .to(pose, { labels: 0, duration: vh(30), ease: 'none' }, vh(465))

  // → III. The Bracelet: turn to a side profile so the full bracelet loop shows, parts drift half-way home
    .to(pose, { rotY: Math.PI * 2.5 + 0.35, rotX: 0.12, rotZ: 0.04, x: -0.2, y: 0.0, scale: 1.05, duration: vh(130) }, vh(470))
    .to(pose, { explode: 0.32, duration: vh(130) }, vh(470))

  // → IV. Assembly: two turns as the pieces snap together, finishing face-on
    .to(pose, { explode: 0, duration: vh(110), ease: 'power3.inOut' }, vh(610))
    .to(pose, { rotY: Math.PI * 6, rotX: 0.08, rotZ: 0, x: 0, y: 0.36, scale: 0.92, duration: vh(130), ease: 'power3.inOut' }, vh(600))
    .set({}, {}, vh(740));

  // the warm glow follows the watch across the page
  gsap.ticker.add(() => {
    const x = stage.portrait ? 0 : pose.x * 50;
    gsap.set('.stage__glow', { xPercent: -50 + x * 2, yPercent: -50 - pose.y * 100 });
  });

  // leaving the story: the watch rises away and the catalogue paper slides up
  gsap.timeline({
    scrollTrigger: { trigger: '.catalogue', start: 'top bottom', end: 'top 15%', scrub: 1 },
  })
    .to(pose, { y: 0.9, scale: 0.8, rotX: -0.5, ease: 'power1.in' }, 0)
    .to(pose, { opacity: 0, ease: 'power1.in' }, 0.3)
    .to('.stage', { opacity: 0, ease: 'power1.in' }, 0.3);

  // chapter copy: masked line reveals on the way in, a soft fade on the way out
  $$('.chapter:not(.chapter--hero)').forEach((sec) => {
    const copy = $('.chapter__copy', sec);
    const h2 = $('h2', copy);
    const split = SplitText.create(h2, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
    const rest = $$('.chapter__num, .chapter__body, .specs > div, .btn', copy);
    const t = gsap.timeline({
      scrollTrigger: { trigger: sec, start: 'top 75%', end: 'bottom 35%', scrub: 0.8 },
    });
    t.from(split.lines, { yPercent: 110, duration: 0.3, stagger: 0.06, ease: 'power3.out' }, 0)
      .from(rest, { opacity: 0, y: 24, duration: 0.25, stagger: 0.05, ease: 'power2.out' }, 0.08)
      .to({}, { duration: 1 })
      .to(copy.children, { opacity: 0, y: -40, duration: 0.3, stagger: 0.03, ease: 'power2.in' });
  });

  // catalogue + house reveals
  $$('.catalogue__title, .house__quote p').forEach((el) => {
    const split = SplitText.create(el, { type: 'lines', mask: 'lines' });
    gsap.from(split.lines, {
      yPercent: 110, duration: 1.2, stagger: 0.1, ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });
  gsap.from('.catalogue__intro, .catalogue .ornament', {
    opacity: 0, y: 20, duration: 1, stagger: 0.12, ease: 'power3.out',
    scrollTrigger: { trigger: '.catalogue__intro', start: 'top 88%' },
  });
  ScrollTrigger.batch('.plate', {
    start: 'top 88%',
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.2, stagger: 0.12, ease: 'expo.out', overwrite: true }),
  });
  gsap.from('.assurances li', {
    opacity: 0, y: 30, duration: 1, stagger: 0.15, ease: 'power3.out',
    scrollTrigger: { trigger: '.assurances', start: 'top 85%' },
  });

  // plates tilt toward the cursor
  if (!reduced) {
    $$('.plate__frame').forEach((f) => {
      const rx = gsap.quickTo(f, 'rotationX', { duration: 0.6, ease: 'power3.out' });
      const ry = gsap.quickTo(f, 'rotationY', { duration: 0.6, ease: 'power3.out' });
      f.addEventListener('pointermove', (e) => {
        const b = f.getBoundingClientRect();
        ry(((e.clientX - b.left) / b.width - 0.5) * 8);
        rx(-((e.clientY - b.top) / b.height - 0.5) * 8);
      });
      f.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
  }

  // chapter rail
  const railNum = $('[data-rail-num]'), railName = $('[data-rail-name]');
  $$('[data-chapter]').forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec, start: 'top 50%', end: 'bottom 50%',
      onToggle: (st) => {
        if (!st.isActive) return;
        railNum.textContent = sec.dataset.num || '·';
        railName.textContent = sec.dataset.chapter;
      },
    });
  });
  gsap.to('.rail__fill', { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.story', start: 'top top', end: 'bottom bottom', scrub: true } });
  gsap.to('.rail', { opacity: 0, scrollTrigger: { trigger: '.catalogue', start: 'top 80%', end: 'top 40%', scrub: true } });

  // masthead switches to ink on the paper sections
  ScrollTrigger.create({
    trigger: '.catalogue', start: 'top 60px', end: 'bottom 60px',
    toggleClass: { targets: '.masthead', className: 'is-ink' },
  });

  // cursor parallax on DOM layers
  if (!reduced) {
    const px = gsap.quickTo('[data-parallax]', 'x', { duration: 1.2, ease: 'power3.out' });
    const py = gsap.quickTo('[data-parallax]', 'y', { duration: 1.2, ease: 'power3.out' });
    const gx = gsap.quickTo('.stage__glow', 'x', { duration: 1.6, ease: 'power3.out' });
    const gy = gsap.quickTo('.stage__glow', 'y', { duration: 1.6, ease: 'power3.out' });
    addEventListener('pointermove', (e) => {
      const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
      px(nx * -14); py(ny * -10); gx(nx * 60); gy(ny * 40);
    }, { passive: true });
  }

  ScrollTrigger.refresh();
}
