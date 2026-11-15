// ========================================================
// 1. WEB AUDIO SYNTHESIZER
// ========================================================

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, type = 'sine', duration = 0.06, vol = 0.2) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

const playHoverSound = () => playTone(600, 'triangle', 0.05, 0.15);
const playClickSound = () => {
  playTone(520, 'sine', 0.12, 0.25);
  setTimeout(() => playTone(880, 'sine', 0.15, 0.2), 40);
};

// ========================================================
// 2. MAIN INTERACTIVE CONTROLLER
// (all text now comes from translations.js)
// ========================================================

document.addEventListener('DOMContentLoaded', () => {
  const T = window.TRANSLATIONS;
  const $ = id => document.getElementById(id);

  const modal = $('element-modal');
  const closeBtn = $('modal-close');
  const modalCard = $('modal-card');
  const modalFacts = $('modal-facts');

  const searchInput = $('element-search');
  const noResultsNotice = $('search-no-results');
  const scrollArrow = $('scroll-arrow');
  const langOpts = document.querySelectorAll('.lang-opt');
  const toggleBtns = document.querySelectorAll('.toggle-btn');

  const elements = document.querySelectorAll('td:not(.empty):not(.spacer)');
  let searchMode = 'name';
  let currentCell = null;

  // ---------- Language state ----------
  let lang = 'en';
  try { lang = localStorage.getItem('ptable-lang') === 'ar' ? 'ar' : 'en'; } catch (e) {}

  const ui = key => T.ui[lang][key];
  const ltr = s => `\u2066${s}\u2069`; // keeps numbers/units in correct order inside Arabic text

  // Normalise Arabic so search ignores diacritics and spelling variants
  const normAr = s => s
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');

  // Remember each cell's symbol and original English name
  elements.forEach(cell => {
    cell.dataset.sym = cell.querySelector('strong')?.textContent.trim() || '';
    cell.dataset.en = cell.querySelector('.name')?.textContent.trim() || '';
  });

  const nameOf = (cell, l = lang) => {
    if (l === 'ar' && cell.dataset.en) return T.names[cell.dataset.sym] || cell.dataset.en;
    return cell.dataset.en;
  };

  const getCatKey = cell =>
    Object.keys(T.categories).find(k => cell.classList.contains(k)) || 'transition';

  // ---------- Apply language to the whole page ----------
  function applyLanguage() {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = ui('pageTitle');

    // Static text: <span data-i18n="name">
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const text = ui(el.dataset.i18n);
      if (text) el.textContent = text;
    });

    // Navigation links
    document.querySelectorAll('[data-i18n-nav]').forEach(el => {
      const text = ui(el.dataset.i18nNav);
      if (text) el.textContent = text;
    });

    // Table names
    elements.forEach(cell => {
      const nameEl = cell.querySelector('.name');
      if (nameEl && cell.dataset.en) nameEl.textContent = nameOf(cell);
    });

    // Search placeholder, language button, scroll hint
    if (searchInput) searchInput.placeholder = searchMode === 'symbol' ? ui('searchSymbol') : ui('searchName');
    langOpts.forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    document.documentElement.style.setProperty('--more-text', `"${ui('more')}"`);

    // Refresh the popup if it is open
    if (currentCell && modal.classList.contains('active')) fillModal(currentCell);

    runSearchFilter();

    // Notify the trends IIFE that the language changed
    document.dispatchEvent(new Event('langchange'));
  }

  // ---------- Modal content ----------
  function fillModal(cell) {
    const num = cell.querySelector('.num')?.textContent.trim() || '';
    const sym = cell.dataset.sym;
    const catKey = getCatKey(cell);
    const cat = T.categories[catKey];
    const catName = cat[lang].name;

    $('modal-num').textContent = `${ui('atomicNumber')}: ${lang === 'ar' ? ltr(num) : num}`;
    $('modal-symbol').textContent = sym;
    $('modal-name').textContent = nameOf(cell);
    $('modal-category').textContent = catName;
    $('modal-cat-desc').textContent = cat[lang].def;

    const L = x => (lang === 'ar' ? ltr(x) : x);
    const spec = T.specs[sym];
    if (spec) {
      $('modal-reactivity').textContent = spec.react[lang];
      $('modal-density').textContent = `${L(spec.dens.v)} ${spec.dens[lang]}`;
      $('modal-thermal').textContent = spec.note
        ? spec.note[lang]
        : `${ui('melts')}: ${L(spec.mp + ' °C')} • ${ui('boils')}: ${L(spec.bp + ' °C')}`;
    } else {
      const fb = T.fallback[catKey] || T.fallback.default;
      $('modal-reactivity').textContent = fb.react[lang];
      $('modal-density').textContent = fb.dens[lang];
      $('modal-thermal').textContent = fb.therm[lang];
    }

    const facts = T.facts[sym]
      ? T.facts[sym][lang]
      : T.fallbackFacts[lang](lang === 'en' ? catName.toUpperCase() : catName);
    modalFacts.innerHTML = '';
    facts.forEach(f => {
      const li = document.createElement('li');
      li.textContent = f;
      modalFacts.appendChild(li);
    });
  }

  // ---------- Scroll HUD indicator ----------
  function updateScrollHUD(matchedElements, query) {
    if (!scrollArrow) return;

    if (query === '') {
      scrollArrow.classList.remove('visible');
      return;
    }

    if (matchedElements.length === 1) {
      matchedElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      scrollArrow.classList.remove('visible');
    } else if (matchedElements.length > 1) {
      const isAnyMatchBelow = matchedElements.some(el => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > (window.innerHeight - 40);
      });
      scrollArrow.classList.toggle('visible', isAnyMatchBelow);
    } else {
      scrollArrow.classList.remove('visible');
    }
  }

  // ---------- Live search (matches English AND Arabic names) ----------
  function runSearchFilter() {
    if (!searchInput) return;
    const query = searchInput.value.toLowerCase().trim();
    const queryAr = normAr(query);
    const matchedElements = [];

    elements.forEach(cell => {
      if (query === '') {
        cell.classList.remove('dimmed');
        return;
      }

      let isMatch;
      if (searchMode === 'symbol') {
        isMatch = cell.dataset.sym.toLowerCase().startsWith(query);
      } else {
        const en = cell.dataset.en.toLowerCase();
        const ar = cell.dataset.en ? normAr(T.names[cell.dataset.sym] || '') : '';
        isMatch = en.includes(query) || (ar !== '' && ar.includes(queryAr));
      }

      cell.classList.toggle('dimmed', !isMatch);
      if (isMatch) matchedElements.push(cell);
    });

    if (noResultsNotice) {
      noResultsNotice.classList.toggle('visible', query !== '' && matchedElements.length === 0);
    }

    updateScrollHUD(matchedElements, query);
  }

  // ---------- Search mode buttons ----------
  toggleBtns.forEach(btn => {
    btn.addEventListener('mouseenter', playHoverSound);
    btn.addEventListener('click', () => {
      playClickSound();
      toggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      searchMode = btn.getAttribute('data-mode') || 'name';
      if (searchInput) {
        searchInput.placeholder = searchMode === 'symbol' ? ui('searchSymbol') : ui('searchName');
        runSearchFilter();
        searchInput.focus();
      }
    });
  });

  if (searchInput) searchInput.addEventListener('input', runSearchFilter);

  // ---------- Language toggle (EN | عربي) ----------
  langOpts.forEach(btn => {
    btn.addEventListener('mouseenter', playHoverSound);
    btn.addEventListener('click', () => {
      if (btn.dataset.lang === lang) return;
      playClickSound();
      lang = btn.dataset.lang;
      try { localStorage.setItem('ptable-lang', lang); } catch (e) {}
      applyLanguage();
    });
  });

  // ---------- Scroll monitor ----------
  window.addEventListener('scroll', () => {
    if (!searchInput) return;
    const query = searchInput.value.toLowerCase().trim();
    if (query !== '') {
      const matched = Array.from(elements).filter(el => !el.classList.contains('dimmed'));
      updateScrollHUD(matched, query);
    }
  });

  // ---------- Modal popup ----------
  elements.forEach(cell => {
    cell.addEventListener('mouseenter', playHoverSound);

    cell.addEventListener('click', () => {
      if (window.isCompareMode || window.isEConfigMode) return; // intercepted by special modes
      playClickSound();
      currentCell = cell;
      fillModal(cell);

      // Sync neon accent colours
      const cellBorderColor = window.getComputedStyle(cell).borderColor;
      modalCard.style.borderColor = cellBorderColor;
      modalCard.style.boxShadow = `0 0 28px ${cellBorderColor}, inset 0 0 15px rgba(255,255,255,0.04)`;
      $('modal-category').style.color = cellBorderColor;

      document.querySelectorAll('.draw-path').forEach(p => {
        p.style.stroke = cellBorderColor;
        p.style.filter = `drop-shadow(0 0 4px ${cellBorderColor})`;
      });
      document.querySelectorAll('.draw-arrow').forEach(a => {
        a.style.fill = cellBorderColor;
        a.style.filter = `drop-shadow(0 0 4px ${cellBorderColor})`;
      });
      document.querySelectorAll('.modal-body li').forEach(li => {
        li.style.setProperty('--bullet-color', cellBorderColor);
      });

      modal.classList.add('active');
    });
  });

  // ---------- Modal dismissal ----------
  const closeModal = () => modal.classList.remove('active');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ---------- Start ----------
  applyLanguage();
});
// ========================================================
// TRENDS VIEW: recolour the table by a property chosen by the student
// Columns: symbol, electronegativity (Pauling), atomic radius (pm, empirical),
//          1st ionization energy (kJ/mol), melting point (°C), reactivity level (1-5)
// "-" = no reliable data. Reactivity is an approximate qualitative level.
// ========================================================
(function () {
  const RAW = `
H 2.20 25 1312 -259 3
He - - 2372 -272 1
Li 0.98 145 520 181 4
Be 1.57 105 900 1287 2
B 2.04 85 801 2076 2
C 2.55 70 1086 3550 2
N 3.04 65 1402 -210 2
O 3.44 60 1314 -219 4
F 3.98 50 1681 -220 5
Ne - - 2081 -249 1
Na 0.93 180 496 98 4
Mg 1.31 150 738 650 3
Al 1.61 125 578 660 3
Si 1.90 110 787 1414 2
P 2.19 100 1012 44 3
S 2.58 100 1000 115 3
Cl 3.16 100 1251 -102 4
Ar - - 1521 -189 1
K 0.82 220 419 63 5
Ca 1.00 180 590 842 3
Sc 1.36 160 633 1541 4
Ti 1.54 140 659 1668 3
V 1.63 135 651 1910 3
Cr 1.66 140 653 1907 3
Mn 1.55 140 717 1246 3
Fe 1.83 140 763 1538 3
Co 1.88 135 760 1495 2
Ni 1.91 135 737 1455 2
Cu 1.90 135 745 1085 2
Zn 1.65 135 906 420 3
Ga 1.81 130 579 30 3
Ge 2.01 125 762 938 2
As 2.18 115 947 817 2
Se 2.55 115 941 221 2
Br 2.96 115 1140 -7 3
Kr 3.00 - 1351 -157 1
Rb 0.82 235 403 39 5
Sr 0.95 200 549 777 4
Y 1.22 180 600 1526 4
Zr 1.33 155 640 1855 3
Nb 1.60 145 652 2477 2
Mo 2.16 145 684 2623 2
Tc 1.90 135 702 2157 2
Ru 2.20 130 710 2334 1
Rh 2.28 135 720 1964 1
Pd 2.20 140 804 1555 1
Ag 1.93 160 731 962 1
Cd 1.69 155 868 321 3
In 1.78 155 558 157 3
Sn 1.96 145 709 232 2
Sb 2.05 145 834 631 2
Te 2.10 140 869 450 2
I 2.66 140 1008 114 2
Xe 2.60 - 1170 -112 1
Cs 0.79 260 376 28 5
Ba 0.89 215 503 727 4
La 1.10 195 538 920 4
Ce 1.12 185 534 798 4
Pr 1.13 185 527 931 4
Nd 1.14 185 533 1021 4
Pm 1.13 185 540 1042 4
Sm 1.17 185 545 1074 4
Eu 1.20 185 547 822 4
Gd 1.20 180 593 1313 4
Tb 1.20 175 566 1356 4
Dy 1.22 175 573 1412 4
Ho 1.23 175 581 1474 4
Er 1.24 175 589 1529 4
Tm 1.25 175 597 1545 4
Yb 1.10 175 603 824 4
Lu 1.27 175 524 1663 4
Hf 1.30 155 659 2233 3
Ta 1.50 145 761 3017 2
W 2.36 135 770 3422 2
Re 1.90 135 760 3186 2
Os 2.20 130 840 3033 2
Ir 2.20 135 880 2446 1
Pt 2.28 135 870 1768 1
Au 2.54 135 890 1064 1
Hg 2.00 150 1007 -39 2
Tl 1.62 190 589 304 3
Pb 1.87 180 716 327 2
Bi 2.02 160 703 271 2
Po 2.00 190 812 254 3
At 2.20 - 899 - 2
Rn 2.20 - 1037 -71 1
Fr 0.70 - 393 - 5
Ra 0.90 215 509 700 4
Ac 1.10 195 499 1050 4
Th 1.30 180 587 1750 3
Pa 1.50 180 568 1572 3
U 1.38 175 598 1135 3
Np 1.36 175 605 644 3
Pu 1.28 175 585 640 3
Am 1.13 175 578 1176 4
Cm 1.28 - 581 1345 4
Bk 1.30 - 601 986 4
Cf 1.30 - 608 900 4
Es 1.30 - 619 860 4
Fm 1.30 - 627 - 4
Md 1.30 - 635 - 4
No 1.30 - 642 - 4
Lr - - 479 - -
`;

  const num = v => (v === '-' ? null : parseFloat(v));
  const DATA = {};
  RAW.trim().split('\n').forEach(line => {
    const [s, en, rad, ie, mp, react] = line.trim().split(/\s+/);
    DATA[s] = { en: num(en), rad: num(rad), ie: num(ie), mp: num(mp), react: num(react) };
  });
  window.ELEMENT_DATA = DATA; // expose for the Compare feature

  const TRENDS = {
    en:    { fmt: v => v.toFixed(2), unit: '' },
    rad:   { fmt: v => String(v),    unit: ' pm' },
    ie:    { fmt: v => String(v),    unit: ' kJ/mol' },
    mp:    { fmt: v => String(v),    unit: ' °C' },
    react: { fmt: v => String(v),    unit: '', discrete: true }
  };

  // bright-violet → pink → amber  (all three stops visible on the dark theme)
  const STOPS = [[139, 92, 246], [219, 39, 119], [245, 158, 11]];
  const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  function rgb(t) {
    t = Math.max(0, Math.min(1, t));
    const c = t < 0.5 ? mix(STOPS[0], STOPS[1], t * 2) : mix(STOPS[1], STOPS[2], (t - 0.5) * 2);
    return c;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const legend = document.getElementById('trend-legend');
    const trendBtns = document.querySelectorAll('.trend-btn');
    if (!trendBtns.length) return;

    const cells = document.querySelectorAll('td:not(.empty):not(.spacer)');
    cells.forEach(cell => {
      cell.dataset.sym2 = cell.querySelector('strong')?.textContent.trim() || '';
      cell.dataset.massOrig = cell.querySelector('.mass')?.textContent || '';
    });

    const uiText = key => {
      const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
      return window.TRANSLATIONS.ui[lang][key] || '';
    };

    function renderLegend(key) {
      if (key === 'none') { legend.classList.remove('visible'); legend.innerHTML = ''; return; }
      const cfg = TRENDS[key];
      const vals = Object.values(DATA).map(d => d[key]).filter(v => v !== null);
      const min = Math.min(...vals), max = Math.max(...vals);
      const stops = [0, 0.5, 1].map(t => `rgb(${rgb(t).join(',')})`).join(',');
      const lo = cfg.discrete ? uiText('lvl1') : `${cfg.fmt(min)}${cfg.unit}`;
      const hi = cfg.discrete ? uiText('lvl5') : `${cfg.fmt(max)}${cfg.unit}`;
      legend.innerHTML =
        `<span class="lg-end">${lo}</span>` +
        `<span class="lg-bar" style="background:linear-gradient(to right,${stops})"></span>` +
        `<span class="lg-end">${hi}</span>` +
        `<span class="lg-nodata"><i></i>${uiText('lgNoData')}</span>` +
        `<span class="lg-note">${uiText('note_' + key)}</span>`;
      legend.classList.add('visible');
    }

    function apply(key) {
      const on = key !== 'none';
      document.body.classList.toggle('trend-on', on);
      let min = 0, max = 1;
      if (on) {
        const vals = Object.values(DATA).map(d => d[key]).filter(v => v !== null);
        min = Math.min(...vals); max = Math.max(...vals);
      }
      cells.forEach(cell => {
        const sym = cell.dataset.sym2;
        const massEl = cell.querySelector('.mass');
        cell.style.background = '';
        cell.classList.remove('no-data');
        if (massEl) massEl.textContent = cell.dataset.massOrig;
        if (!on) return;

        const isPlaceholder = sym === '*' || sym === '**';
        if (isPlaceholder) return;

        const d = DATA[sym];
        const v = d ? d[key] : null;
        if (v === null || v === undefined) {
          cell.classList.add('no-data');
          if (massEl) massEl.textContent = '—';
          return;
        }
        const t = TRENDS[key].discrete ? (v - 1) / 4 : (v - min) / (max - min);
        cell.style.background = `rgba(${rgb(t).join(',')},0.78)`;
        if (massEl) massEl.textContent = TRENDS[key].fmt(v);
      });
      renderLegend(key);
    }

    // ── Trend button click handlers ──────────────────────────
    trendBtns.forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        if (typeof playHoverSound === 'function') playHoverSound();
      });
      btn.addEventListener('click', () => {
        if (typeof playClickSound === 'function') playClickSound();
        trendBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        apply(btn.dataset.trend || 'none');
      });
    });

    // Re-render legend text when language switches
    document.addEventListener('langchange', () => {
      const active = document.querySelector('.trend-btn.active');
      renderLegend(active ? active.dataset.trend : 'none');
    });
  });
})();

// ========================================================
// 3. ELEMENT COMPARE
// ========================================================
(function () {
  const MAX = 4;

  const CAT_COLORS = {
    'alkali':            '#ff3366',
    'alkaline':          '#ff9933',
    'transition':        '#00d4ff',
    'post-transition':   '#22c55e',
    'metalloid':         '#a855f7',
    'reactive-nonmetal': '#3b82f6',
    'noble-gas':         '#ec4899',
    'lanthanoid':        '#eab308',
    'actinoid':          '#d946ef'
  };

  // Properties pulled from ELEMENT_DATA (trends dataset)
  const PROPS = [
    { key: 'en',    tkLabel: 'cmpEN',    unit: '',        higher: true,  neutral: false },
    { key: 'rad',   tkLabel: 'cmpRad',   unit: ' pm',     higher: false, neutral: false },
    { key: 'ie',    tkLabel: 'cmpIE',    unit: ' kJ/mol', higher: true,  neutral: false },
    { key: 'mp',    tkLabel: 'cmpMP',    unit: ' °C',     higher: false, neutral: true  },
    { key: 'react', tkLabel: 'cmpReact', unit: '/5',      higher: true,  neutral: false },
  ];

  document.addEventListener('DOMContentLoaded', () => {
    const T  = window.TRANSLATIONS;
    const $  = id => document.getElementById(id);
    const ui = key => {
      const l = document.documentElement.lang === 'ar' ? 'ar' : 'en';
      return (T.ui[l] && T.ui[l][key]) ? T.ui[l][key] : key;
    };

    const modeBtn  = $('compare-mode-btn');
    const hintBar  = $('compare-hint');
    const hintText = $('compare-hint-text');
    const openBtn  = $('compare-open-btn');
    const clearBtn = $('compare-clear-btn');
    const overlay  = $('compare-modal');
    const closeBtn = $('compare-close');
    const grid     = $('compare-grid');

    if (!modeBtn) return;

    const allCells = document.querySelectorAll('td:not(.empty):not(.spacer)');
    let selection  = [];
    let isActive   = false;

    // ── Activate / deactivate ───────────────────────────────
    function activate() {
      isActive = true;
      window.isCompareMode = true;
      document.body.classList.add('compare-mode');
      modeBtn.classList.add('active');
      hintBar.classList.add('visible');
      refreshHint();
    }

    function deactivate() {
      isActive = false;
      window.isCompareMode = false;
      document.body.classList.remove('compare-mode');
      modeBtn.classList.remove('active');
      hintBar.classList.remove('visible');
      clearAll();
    }

    modeBtn.addEventListener('mouseenter', () => {
      if (typeof playHoverSound === 'function') playHoverSound();
    });
    modeBtn.addEventListener('click', () => {
      if (typeof playClickSound === 'function') playClickSound();
      isActive ? deactivate() : activate();
    });

    // ── Cell selection (bubble phase, runs after the modal handler returns early) ──
    allCells.forEach(cell => {
      cell.addEventListener('click', () => {
        if (!isActive) return;
        if (typeof playClickSound === 'function') playClickSound();

        if (cell.classList.contains('compare-selected')) {
          deselect(cell);
        } else if (selection.length < MAX) {
          doSelect(cell);
        } else {
          // Shake to signal max reached
          hintText.classList.add('cmp-shake');
          setTimeout(() => hintText.classList.remove('cmp-shake'), 400);
        }
      });
    });

    function doSelect(cell) {
      selection.push(cell);
      cell.classList.add('compare-selected');
      cell.dataset.cmpIdx = selection.length;
      refreshHint();
    }

    function deselect(cell) {
      cell.classList.remove('compare-selected');
      delete cell.dataset.cmpIdx;
      selection = selection.filter(c => c !== cell);
      // Re-index remaining selections
      selection.forEach((c, i) => { c.dataset.cmpIdx = i + 1; });
      refreshHint();
    }

    function clearAll() {
      selection.forEach(c => {
        c.classList.remove('compare-selected');
        delete c.dataset.cmpIdx;
      });
      selection = [];
      refreshHint();
    }

    function refreshHint() {
      const n = selection.length;
      hintText.textContent = ui('compareHint');
      openBtn.textContent  = `${ui('compareOpen')} (${n})`;
      openBtn.disabled     = n < 2;
    }

    clearBtn.addEventListener('click', clearAll);
    openBtn.addEventListener('click', showComparison);

    // ── Build comparison panel ──────────────────────────────
    function getColData(cell) {
      const l       = document.documentElement.lang === 'ar' ? 'ar' : 'en';
      const sym     = cell.dataset.sym || cell.querySelector('strong')?.textContent.trim() || '';
      const num     = cell.querySelector('.num')?.textContent.trim() || '';
      const mass    = cell.dataset.massOrig || cell.querySelector('.mass')?.textContent.trim() || '—';
      const catKey  = Object.keys(T.categories).find(k => cell.classList.contains(k)) || 'transition';
      const catName = T.categories[catKey]?.[l]?.name || catKey;
      const name    = l === 'ar' ? (T.names[sym] || cell.dataset.en) : cell.dataset.en;
      const color   = CAT_COLORS[catKey] || '#00d4ff';
      const trend   = window.ELEMENT_DATA?.[sym] || {};
      return { sym, num, mass, catKey, catName, name, color, trend };
    }

    function showComparison() {
      if (typeof playClickSound === 'function') playClickSound();
      const cols = selection.map(getColData);
      const n    = cols.length;

      let html = `<div class="cmp-grid" style="--cmp-cols:${n}">`;

      // ── Element header cards ────────────────────────────
      html += `<div class="cmp-corner"></div>`;
      cols.forEach(c => {
        html += `
          <div class="cmp-el-card" style="--el-color:${c.color}">
            <div class="cmp-el-num">#${c.num}</div>
            <div class="cmp-el-symbol" style="color:${c.color};text-shadow:0 0 16px ${c.color}80">${c.sym}</div>
            <div class="cmp-el-name">${c.name}</div>
            <div class="cmp-el-cat" style="color:${c.color}">${c.catName}</div>
          </div>`;
      });

      // ── Atomic Mass row (from cell data) ────────────────
      const massVals = cols.map(c => ({ raw: parseFloat(c.mass) || null, disp: c.mass }));
      html += buildRow(ui('cmpMass'), ' u', massVals, true);

      // ── Trend property rows ─────────────────────────────
      PROPS.forEach(p => {
        const vals = cols.map(c => {
          const v = c.trend[p.key];
          const valid = v !== null && v !== undefined;
          return { raw: valid ? v : null, disp: valid ? String(v) : '—' };
        });
        html += buildRow(ui(p.tkLabel), p.unit, vals, p.neutral, p.higher);
      });

      html += `</div>`;
      grid.innerHTML = html;
      overlay.classList.add('active');
    }

    function buildRow(label, unit, vals, neutral, higher) {
      const nums  = vals.map(v => v.raw).filter(v => v !== null && !isNaN(v));
      const best  = (!neutral && nums.length > 1) ? (higher ? Math.max(...nums) : Math.min(...nums)) : null;
      const worst = (!neutral && nums.length > 1) ? (higher ? Math.min(...nums) : Math.max(...nums)) : null;

      let html = `<div class="cmp-label-cell">`;
      html += `<span class="cmp-prop-label">${label}</span>`;
      if (unit) html += `<span class="cmp-unit">${unit}</span>`;
      html += `</div>`;

      vals.forEach(v => {
        let cls = 'cmp-val-cell';
        if (!neutral && v.raw !== null && nums.length > 1) {
          if (v.raw === best)  cls += ' cmp-best';
          if (v.raw === worst) cls += ' cmp-worst';
        }
        if (v.raw === null) cls += ' cmp-na';
        html += `<div class="${cls}">${v.raw !== null ? v.disp : '—'}</div>`;
      });

      return html;
    }

    // ── Close modal ─────────────────────────────────────────
    const closeModal = () => overlay.classList.remove('active');
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) closeModal();
    });
  });
})();

// ========================================================
// ELECTRON CONFIGURATION & BOHR SHELL VISUALIZER
// ========================================================
(function () {
  // Canonical Electron Configurations & Shell Counts for all 118 elements
  // shells: [K, L, M, N, O, P, Q]
  const CONFIGS = {
    H:  { notation: '1s¹', shells: [1], valence: 1 },
    He: { notation: '1s²', shells: [2], valence: 2 },
    Li: { notation: '[He] 2s¹', shells: [2, 1], valence: 1 },
    Be: { notation: '[He] 2s²', shells: [2, 2], valence: 2 },
    B:  { notation: '[He] 2s² 2p¹', shells: [2, 3], valence: 3 },
    C:  { notation: '[He] 2s² 2p²', shells: [2, 4], valence: 4 },
    N:  { notation: '[He] 2s² 2p³', shells: [2, 5], valence: 5 },
    O:  { notation: '[He] 2s² 2p⁴', shells: [2, 6], valence: 6 },
    F:  { notation: '[He] 2s² 2p⁵', shells: [2, 7], valence: 7 },
    Ne: { notation: '[He] 2s² 2p⁶', shells: [2, 8], valence: 8 },
    Na: { notation: '[Ne] 3s¹', shells: [2, 8, 1], valence: 1 },
    Mg: { notation: '[Ne] 3s²', shells: [2, 8, 2], valence: 2 },
    Al: { notation: '[Ne] 3s² 3p¹', shells: [2, 8, 3], valence: 3 },
    Si: { notation: '[Ne] 3s² 3p²', shells: [2, 8, 4], valence: 4 },
    P:  { notation: '[Ne] 3s² 3p³', shells: [2, 8, 5], valence: 5 },
    S:  { notation: '[Ne] 3s² 3p⁴', shells: [2, 8, 6], valence: 6 },
    Cl: { notation: '[Ne] 3s² 3p⁵', shells: [2, 8, 7], valence: 7 },
    Ar: { notation: '[Ne] 3s² 3p⁶', shells: [2, 8, 8], valence: 8 },
    K:  { notation: '[Ar] 4s¹', shells: [2, 8, 8, 1], valence: 1 },
    Ca: { notation: '[Ar] 4s²', shells: [2, 8, 8, 2], valence: 2 },
    Sc: { notation: '[Ar] 3d¹ 4s²', shells: [2, 8, 9, 2], valence: 2 },
    Ti: { notation: '[Ar] 3d² 4s²', shells: [2, 8, 10, 2], valence: 2 },
    V:  { notation: '[Ar] 3d³ 4s²', shells: [2, 8, 11, 2], valence: 2 },
    Cr: { notation: '[Ar] 3d⁵ 4s¹', shells: [2, 8, 13, 1], valence: 1 },
    Mn: { notation: '[Ar] 3d⁵ 4s²', shells: [2, 8, 13, 2], valence: 2 },
    Fe: { notation: '[Ar] 3d⁶ 4s²', shells: [2, 8, 14, 2], valence: 2 },
    Co: { notation: '[Ar] 3d⁷ 4s²', shells: [2, 8, 15, 2], valence: 2 },
    Ni: { notation: '[Ar] 3d⁸ 4s²', shells: [2, 8, 16, 2], valence: 2 },
    Cu: { notation: '[Ar] 3d¹⁰ 4s¹', shells: [2, 8, 18, 1], valence: 1 },
    Zn: { notation: '[Ar] 3d¹⁰ 4s²', shells: [2, 8, 18, 2], valence: 2 },
    Ga: { notation: '[Ar] 3d¹⁰ 4s² 4p¹', shells: [2, 8, 18, 3], valence: 3 },
    Ge: { notation: '[Ar] 3d¹⁰ 4s² 4p²', shells: [2, 8, 18, 4], valence: 4 },
    As: { notation: '[Ar] 3d¹⁰ 4s² 4p³', shells: [2, 8, 18, 5], valence: 5 },
    Se: { notation: '[Ar] 3d¹⁰ 4s² 4p⁴', shells: [2, 8, 18, 6], valence: 6 },
    Br: { notation: '[Ar] 3d¹⁰ 4s² 4p⁵', shells: [2, 8, 18, 7], valence: 7 },
    Kr: { notation: '[Ar] 3d¹⁰ 4s² 4p⁶', shells: [2, 8, 18, 8], valence: 8 },
    Rb: { notation: '[Kr] 5s¹', shells: [2, 8, 18, 8, 1], valence: 1 },
    Sr: { notation: '[Kr] 5s²', shells: [2, 8, 18, 8, 2], valence: 2 },
    Y:  { notation: '[Kr] 4d¹ 5s²', shells: [2, 8, 18, 9, 2], valence: 2 },
    Zr: { notation: '[Kr] 4d² 5s²', shells: [2, 8, 18, 10, 2], valence: 2 },
    Nb: { notation: '[Kr] 4d⁴ 5s¹', shells: [2, 8, 18, 12, 1], valence: 1 },
    Mo: { notation: '[Kr] 4d⁵ 5s¹', shells: [2, 8, 18, 13, 1], valence: 1 },
    Tc: { notation: '[Kr] 4d⁵ 5s²', shells: [2, 8, 18, 13, 2], valence: 2 },
    Ru: { notation: '[Kr] 4d⁷ 5s¹', shells: [2, 8, 18, 15, 1], valence: 1 },
    Rh: { notation: '[Kr] 4d⁸ 5s¹', shells: [2, 8, 18, 16, 1], valence: 1 },
    Pd: { notation: '[Kr] 4d¹⁰', shells: [2, 8, 18, 18], valence: 18 },
    Ag: { notation: '[Kr] 4d¹⁰ 5s¹', shells: [2, 8, 18, 18, 1], valence: 1 },
    Cd: { notation: '[Kr] 4d¹⁰ 5s²', shells: [2, 8, 18, 18, 2], valence: 2 },
    In: { notation: '[Kr] 4d¹⁰ 5s² 5p¹', shells: [2, 8, 18, 18, 3], valence: 3 },
    Sn: { notation: '[Kr] 4d¹⁰ 5s² 5p²', shells: [2, 8, 18, 18, 4], valence: 4 },
    Sb: { notation: '[Kr] 4d¹⁰ 5s² 5p³', shells: [2, 8, 18, 18, 5], valence: 5 },
    Te: { notation: '[Kr] 4d¹⁰ 5s² 5p⁴', shells: [2, 8, 18, 18, 6], valence: 6 },
    I:  { notation: '[Kr] 4d¹⁰ 5s² 5p⁵', shells: [2, 8, 18, 18, 7], valence: 7 },
    Xe: { notation: '[Kr] 4d¹⁰ 5s² 5p⁶', shells: [2, 8, 18, 18, 8], valence: 8 },
    Cs: { notation: '[Xe] 6s¹', shells: [2, 8, 18, 18, 8, 1], valence: 1 },
    Ba: { notation: '[Xe] 6s²', shells: [2, 8, 18, 18, 8, 2], valence: 2 },
    La: { notation: '[Xe] 5d¹ 6s²', shells: [2, 8, 18, 18, 9, 2], valence: 2 },
    Ce: { notation: '[Xe] 4f¹ 5d¹ 6s²', shells: [2, 8, 18, 19, 9, 2], valence: 2 },
    Pr: { notation: '[Xe] 4f³ 6s²', shells: [2, 8, 18, 21, 8, 2], valence: 2 },
    Nd: { notation: '[Xe] 4f⁴ 6s²', shells: [2, 8, 18, 22, 8, 2], valence: 2 },
    Pm: { notation: '[Xe] 4f⁵ 6s²', shells: [2, 8, 18, 23, 8, 2], valence: 2 },
    Sm: { notation: '[Xe] 4f⁶ 6s²', shells: [2, 8, 18, 24, 8, 2], valence: 2 },
    Eu: { notation: '[Xe] 4f⁷ 6s²', shells: [2, 8, 18, 25, 8, 2], valence: 2 },
    Gd: { notation: '[Xe] 4f⁷ 5d¹ 6s²', shells: [2, 8, 18, 25, 9, 2], valence: 2 },
    Tb: { notation: '[Xe] 4f⁹ 6s²', shells: [2, 8, 18, 27, 8, 2], valence: 2 },
    Dy: { notation: '[Xe] 4f¹⁰ 6s²', shells: [2, 8, 18, 28, 8, 2], valence: 2 },
    Ho: { notation: '[Xe] 4f¹¹ 6s²', shells: [2, 8, 18, 29, 8, 2], valence: 2 },
    Er: { notation: '[Xe] 4f¹² 6s²', shells: [2, 8, 18, 30, 8, 2], valence: 2 },
    Tm: { notation: '[Xe] 4f¹³ 6s²', shells: [2, 8, 18, 31, 8, 2], valence: 2 },
    Yb: { notation: '[Xe] 4f¹⁴ 6s²', shells: [2, 8, 18, 32, 8, 2], valence: 2 },
    Lu: { notation: '[Xe] 4f¹⁴ 5d¹ 6s²', shells: [2, 8, 18, 32, 9, 2], valence: 2 },
    Hf: { notation: '[Xe] 4f¹⁴ 5d² 6s²', shells: [2, 8, 18, 32, 10, 2], valence: 2 },
    Ta: { notation: '[Xe] 4f¹⁴ 5d³ 6s²', shells: [2, 8, 18, 32, 11, 2], valence: 2 },
    W:  { notation: '[Xe] 4f¹⁴ 5d⁴ 6s²', shells: [2, 8, 18, 32, 12, 2], valence: 2 },
    Re: { notation: '[Xe] 4f¹⁴ 5d⁵ 6s²', shells: [2, 8, 18, 32, 13, 2], valence: 2 },
    Os: { notation: '[Xe] 4f¹⁴ 5d⁶ 6s²', shells: [2, 8, 18, 32, 14, 2], valence: 2 },
    Ir: { notation: '[Xe] 4f¹⁴ 5d⁷ 6s²', shells: [2, 8, 18, 32, 15, 2], valence: 2 },
    Pt: { notation: '[Xe] 4f¹⁴ 5d⁹ 6s¹', shells: [2, 8, 18, 32, 17, 1], valence: 1 },
    Au: { notation: '[Xe] 4f¹⁴ 5d¹⁰ 6s¹', shells: [2, 8, 18, 32, 18, 1], valence: 1 },
    Hg: { notation: '[Xe] 4f¹⁴ 5d¹⁰ 6s²', shells: [2, 8, 18, 32, 18, 2], valence: 2 },
    Tl: { notation: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p¹', shells: [2, 8, 18, 32, 18, 3], valence: 3 },
    Pb: { notation: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²', shells: [2, 8, 18, 32, 18, 4], valence: 4 },
    Bi: { notation: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p³', shells: [2, 8, 18, 32, 18, 5], valence: 5 },
    Po: { notation: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁴', shells: [2, 8, 18, 32, 18, 6], valence: 6 },
    At: { notation: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁵', shells: [2, 8, 18, 32, 18, 7], valence: 7 },
    Rn: { notation: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁶', shells: [2, 8, 18, 32, 18, 8], valence: 8 },
    Fr: { notation: '[Rn] 7s¹', shells: [2, 8, 18, 32, 18, 8, 1], valence: 1 },
    Ra: { notation: '[Rn] 7s²', shells: [2, 8, 18, 32, 18, 8, 2], valence: 2 },
    Ac: { notation: '[Rn] 6d¹ 7s²', shells: [2, 8, 18, 32, 18, 9, 2], valence: 2 },
    Th: { notation: '[Rn] 6d² 7s²', shells: [2, 8, 18, 32, 18, 10, 2], valence: 2 },
    Pa: { notation: '[Rn] 5f² 6d¹ 7s²', shells: [2, 8, 18, 32, 20, 9, 2], valence: 2 },
    U:  { notation: '[Rn] 5f³ 6d¹ 7s²', shells: [2, 8, 18, 32, 21, 9, 2], valence: 2 },
    Np: { notation: '[Rn] 5f⁴ 6d¹ 7s²', shells: [2, 8, 18, 32, 22, 9, 2], valence: 2 },
    Pu: { notation: '[Rn] 5f⁶ 7s²', shells: [2, 8, 18, 32, 24, 8, 2], valence: 2 },
    Am: { notation: '[Rn] 5f⁷ 7s²', shells: [2, 8, 18, 32, 25, 8, 2], valence: 2 },
    Cm: { notation: '[Rn] 5f⁷ 6d¹ 7s²', shells: [2, 8, 18, 32, 25, 9, 2], valence: 2 },
    Bk: { notation: '[Rn] 5f⁹ 7s²', shells: [2, 8, 18, 32, 27, 8, 2], valence: 2 },
    Cf: { notation: '[Rn] 5f¹⁰ 7s²', shells: [2, 8, 18, 32, 28, 8, 2], valence: 2 },
    Es: { notation: '[Rn] 5f¹¹ 7s²', shells: [2, 8, 18, 32, 29, 8, 2], valence: 2 },
    Fm: { notation: '[Rn] 5f¹² 7s²', shells: [2, 8, 18, 32, 30, 8, 2], valence: 2 },
    Md: { notation: '[Rn] 5f¹³ 7s²', shells: [2, 8, 18, 32, 31, 8, 2], valence: 2 },
    No: { notation: '[Rn] 5f¹⁴ 7s²', shells: [2, 8, 18, 32, 32, 8, 2], valence: 2 },
    Lr: { notation: '[Rn] 5f¹⁴ 7s² 7p¹', shells: [2, 8, 18, 32, 32, 8, 3], valence: 3 },
    Rf: { notation: '[Rn] 5f¹⁴ 6d² 7s²', shells: [2, 8, 18, 32, 32, 10, 2], valence: 2 },
    Db: { notation: '[Rn] 5f¹⁴ 6d³ 7s²', shells: [2, 8, 18, 32, 32, 11, 2], valence: 2 },
    Sg: { notation: '[Rn] 5f¹⁴ 6d⁴ 7s²', shells: [2, 8, 18, 32, 32, 12, 2], valence: 2 },
    Bh: { notation: '[Rn] 5f¹⁴ 6d⁵ 7s²', shells: [2, 8, 18, 32, 32, 13, 2], valence: 2 },
    Hs: { notation: '[Rn] 5f¹⁴ 6d⁶ 7s²', shells: [2, 8, 18, 32, 32, 14, 2], valence: 2 },
    Mt: { notation: '[Rn] 5f¹⁴ 6d⁷ 7s²', shells: [2, 8, 18, 32, 32, 15, 2], valence: 2 },
    Ds: { notation: '[Rn] 5f¹⁴ 6d⁸ 7s²', shells: [2, 8, 18, 32, 32, 16, 2], valence: 2 },
    Rg: { notation: '[Rn] 5f¹⁴ 6d⁹ 7s²', shells: [2, 8, 18, 32, 32, 17, 2], valence: 2 },
    Cn: { notation: '[Rn] 5f¹⁴ 6d¹⁰ 7s²', shells: [2, 8, 18, 32, 32, 18, 2], valence: 2 },
    Nh: { notation: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p¹', shells: [2, 8, 18, 32, 32, 18, 3], valence: 3 },
    Fl: { notation: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p²', shells: [2, 8, 18, 32, 32, 18, 4], valence: 4 },
    Mc: { notation: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p³', shells: [2, 8, 18, 32, 32, 18, 5], valence: 5 },
    Lv: { notation: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁴', shells: [2, 8, 18, 32, 32, 18, 6], valence: 6 },
    Ts: { notation: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁵', shells: [2, 8, 18, 32, 32, 18, 7], valence: 7 },
    Og: { notation: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁶', shells: [2, 8, 18, 32, 32, 18, 8], valence: 8 }
  };

  const SHELL_LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

  document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const modeBtn  = $('econfig-mode-btn');
    const hintBar  = $('econfig-hint');
    const exitBtn  = $('econfig-exit-btn');
    const modal    = $('econfig-modal');
    const closeBtn = $('econfig-modal-close');
    const canvas   = $('bohr-canvas');
    if (!modeBtn || !canvas) return;

    const ctx = canvas.getContext('2d');
    const allCells = document.querySelectorAll('td:not(.empty):not(.spacer)');
    let isEConfig = false;
    let animId = null;
    let currentShells = [1];
    let angleOffset = 0;

    function activate() {
      isEConfig = true;
      window.isEConfigMode = true;
      document.body.classList.add('econfig-mode');
      modeBtn.classList.add('active');
      hintBar.classList.add('visible');
    }

    function deactivate() {
      isEConfig = false;
      window.isEConfigMode = false;
      document.body.classList.remove('econfig-mode');
      modeBtn.classList.remove('active');
      hintBar.classList.remove('visible');
    }

    modeBtn.addEventListener('click', () => {
      if (typeof playClickSound === 'function') playClickSound();
      isEConfig ? deactivate() : activate();
    });

    if (exitBtn) {
      exitBtn.addEventListener('click', deactivate);
    }

    // Element clicks in e-config mode
    allCells.forEach(cell => {
      cell.addEventListener('click', () => {
        if (!isEConfig) return;
        if (typeof playClickSound === 'function') playClickSound();

        const sym = cell.dataset.sym;
        const num = cell.querySelector('.num')?.textContent.trim() || '';
        const name = (document.documentElement.lang === 'ar' && window.TRANSLATIONS?.names?.[sym])
          ? window.TRANSLATIONS.names[sym]
          : (cell.dataset.en || sym);

        openEConfig(sym, num, name, cell);
      });
    });

    function openEConfig(sym, num, name, cell) {
      const data = CONFIGS[sym] || { notation: 'N/A', shells: [1], valence: 1 };
      currentShells = data.shells;

      $('econfig-sym').textContent = sym;
      $('econfig-num').textContent = num;
      $('econfig-name').textContent = name;
      $('econfig-notation').textContent = data.notation;
      $('econfig-valence').textContent = data.valence;

      // Category badge
      const catKey = Array.from(cell.classList).find(c => window.TRANSLATIONS?.categories?.[c]);
      const l = document.documentElement.lang === 'ar' ? 'ar' : 'en';
      $('econfig-cat').textContent = catKey ? (window.TRANSLATIONS.categories[catKey]?.[l]?.name || catKey) : '';

      // Shell pills
      const wrap = $('econfig-shells-breakdown');
      wrap.innerHTML = '';
      data.shells.forEach((count, idx) => {
        const pill = document.createElement('div');
        pill.className = 'shell-pill';
        pill.innerHTML = `<strong>${SHELL_LETTERS[idx]}</strong> (${idx + 1}): ${count} e⁻`;
        wrap.appendChild(pill);
      });

      modal.classList.add('active');
      startAnimation();
    }

    function drawBohr() {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);

      angleOffset += 0.02;

      // Draw Nucleus
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#a855f7';
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw Shell Orbits & Orbiting Electrons
      const maxRadius = Math.min(cx, cy) - 20;
      const step = (maxRadius - 32) / Math.max(1, currentShells.length);

      currentShells.forEach((eCount, idx) => {
        const r = 32 + (idx + 1) * step;

        // Orbit ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Electrons along this orbit
        const dir = idx % 2 === 0 ? 1 : -1;
        for (let i = 0; i < eCount; i++) {
          const theta = (Math.PI * 2 / eCount) * i + (angleOffset * dir * (1.2 / (idx + 1)));
          const ex = cx + r * Math.cos(theta);
          const ey = cy + r * Math.sin(theta);

          ctx.beginPath();
          ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = idx === currentShells.length - 1 ? '#fbbf24' : '#00d4ff'; // valence yellow, inner cyan
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      animId = requestAnimationFrame(drawBohr);
    }

    function startAnimation() {
      if (animId) cancelAnimationFrame(animId);
      animId = requestAnimationFrame(drawBohr);
    }

    function stopAnimation() {
      if (animId) cancelAnimationFrame(animId);
      animId = null;
    }

    // Modal Close
    const closeEConfig = () => {
      modal.classList.remove('active');
      stopAnimation();
    };
    closeBtn.addEventListener('click', closeEConfig);
    modal.addEventListener('click', e => { if (e.target === modal) closeEConfig(); });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.classList.contains('active')) closeEConfig();
    });
  });
})();
