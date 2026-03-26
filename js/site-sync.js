(async function(){
  async function getData(){
    try {
      const res = await fetch('/api/site-data');
      if(!res.ok) throw new Error('api failed');
      return await res.json();
    } catch(e){
      try {
        const rel = location.pathname.includes('/apartments/') ? '../data/site-data.json' : 'data/site-data.json';
        const res = await fetch(rel);
        return await res.json();
      } catch(_e) {
        return null;
      }
    }
  }

  function fmt(priceTND, priceEUR){
    return `${priceTND} TND (~${priceEUR}€)`;
  }

  let __eurPerTndCache = null;
  async function getLiveEurRateFromTnd(fallbackRate){
    if (__eurPerTndCache) return __eurPerTndCache;
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/TND');
      if (!res.ok) throw new Error('rate fetch failed');
      const data = await res.json();
      const rate = Number(data?.rates?.EUR || 0);
      if (!rate) throw new Error('invalid EUR rate');
      __eurPerTndCache = rate;
      return rate;
    } catch (e) {
      return fallbackRate || null;
    }
  }

  function formatTotalWithCurrencies(totalTND, eurPerTnd){
    if (!eurPerTnd) return `${totalTND} TND`;
    const totalEUR = Math.round(totalTND * eurPerTnd);
    return `${totalTND} TND (~${totalEUR} €)`;
  }

  function buildDatePriceMap(datePrices){
    const map = new Map();
    (datePrices || []).forEach(p => {
      if (p && p.date) map.set(p.date, Number(p.price || 0));
    });
    return map;
  }

  const SEASONAL_PRICING_RULES = {
    highMonths: new Set([7, 8]),
    midMonths: new Set([4, 5, 6, 9]),
    multipliers: {
      high: 1.4,
      mid: 1.2,
      low: 1
    }
  };

  function getSeasonTier(dateValue){
    const date = typeof dateValue === 'string' ? parseDateLocal(dateValue) : dateValue;
    const month = date.getMonth() + 1;
    if (SEASONAL_PRICING_RULES.highMonths.has(month)) return 'high';
    if (SEASONAL_PRICING_RULES.midMonths.has(month)) return 'mid';
    return 'low';
  }

  function getSeasonalNightlyPrice(basePrice, dateValue){
    const safeBasePrice = Number(basePrice || 0);
    if (!safeBasePrice) return 0;
    const tier = getSeasonTier(dateValue);
    const multiplier = SEASONAL_PRICING_RULES.multipliers[tier] || 1;
    return Math.round(safeBasePrice * multiplier);
  }

  function buildEffectiveDatePrices(apt, startDateStr, endDateStr){
    const basePrice = Number(apt?.priceTND || 0);
    const manualMap = buildDatePriceMap(apt?.datePrices || []);
    const mergedMap = new Map();

    const start = parseDateLocal(startDateStr);
    const end = parseDateLocal(endDateStr);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = formatDateLocal(d);
      mergedMap.set(ds, getSeasonalNightlyPrice(basePrice, d));
    }

    manualMap.forEach((price, date) => {
      mergedMap.set(date, Number(price || 0));
    });

    return Array.from(mergedMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, price]) => ({ date, price }));
  }

  function parseDateLocal(s){
    const [y,m,d] = String(s).split('-').map(Number);
    return new Date(y, (m||1)-1, d||1);
  }

  function formatDateLocal(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function nightsBetween(startStr, endStr){
    const a = parseDateLocal(startStr);
    const b = parseDateLocal(endStr);
    return Math.max(0, Math.round((b - a) / 86400000));
  }

  function normalizeImage(u){
    if (!u) return u;
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/uploads/')) return window.location.origin + u;
    return window.location.origin + '/' + String(u).replace(/^\/+/, '');
  }

  function expandBlockedDates(blocks){
    const out = [];
    (blocks || []).forEach(b => {
      if (!b.start || !b.end) return;
      const start = new Date(b.start + 'T00:00:00');
      const end = new Date(b.end + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        out.push(formatDateLocal(d));
      }
    });
    return [...new Set(out)];
  }

  function initDatePickers(slug, blockedDates){ return; }

  const data = await getData();
  try { if (typeof switchLang === 'function') switchLang(localStorage.getItem('cosynest-lang') || document.documentElement.lang || 'fr'); } catch(e) {}
  if(!data || !data.apartments) return;


  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'", '&#39;');
  }


  function normalizeReviewSections(){
    document.querySelectorAll('[data-guest-feedback]').forEach(section => {
      section.style.maxWidth = '820px';
      section.style.marginLeft = '0';
      section.style.marginRight = '0';
    });
  }

  function renderApartmentReviews(slug, apt){
    const section = document.querySelector('[data-guest-feedback]');
    if (!section || !apt || !Array.isArray(apt.airbnbReviews) || !apt.airbnbReviews.length) return;
    const reviews = apt.airbnbReviews.slice(0, 6);
    const rating = Number(apt.airbnbRating || 0).toFixed(2).replace('.', ',');
    const count = Number(apt.airbnbReviewCount || reviews.length);

    section.style.maxWidth = '820px';
    section.style.marginLeft = '0';
    section.style.marginRight = '0';
    section.innerHTML = `
      <div class="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h3 class="text-2xl font-bold text-brand-blue">
            <span class="lang-active" data-lang="fr">Avis des voyageurs</span>
            <span class="font-arabic" data-lang="ar">آراء الضيوف</span>
            <span data-lang="en">Guest reviews</span>
          </h3>
          <div class="mt-2 text-sm text-slate-600 flex flex-wrap items-center gap-3">
            <span class="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1 font-semibold">⭐ ${rating}</span>
            <span class="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1">${count} <span class="lang-active" data-lang="fr">avis</span><span class="font-arabic" data-lang="ar">تقييمات</span><span data-lang="en">reviews</span></span>
          </div>
        </div>
      </div>
      <div class="grid md:grid-cols-2 gap-4">
        ${reviews.map(r => `
          <article class="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div class="flex items-start justify-between gap-3 mb-3">
              <div>
                <div class="font-bold text-brand-blue">${escapeHtml(r.name)}</div>
                <div class="text-xs text-slate-500">${escapeHtml(r.date || '')}</div>
              </div>
              <div class="text-sm font-bold text-brand-blue">★★★★★</div>
            </div>
            <p class="text-gray-700 leading-relaxed">${escapeHtml(r.text)}</p>
          </article>
        `).join('')}
      </div>
    `;
  }

  // HOMEPAGE: hide deleted listings safely and sync prices only
  if(!document.body.dataset.pageSlug){
    document.querySelectorAll('a.property-details-btn[href*="apartments/"]').forEach(link => {
      const href = link.getAttribute('href') || '';
      const slug = href.split('/').pop().replace('.html','');
      const apt = data.apartments[slug];
      const card = link.closest('.bg-white.rounded-2xl') || link.closest('.group') || link.closest('.border');
      if(!card) return;

      if(!apt || apt.deleted){
        card.style.display = 'none';
        return;
      }

      const priceP = card.querySelector('p.text-xl.font-bold.text-brand-blue');
      if(priceP){
        const html = priceP.innerHTML;
        const nightLabel = html.includes('/ night') ? '/ night' :
          html.includes('/ الليلة') ? '/ الليلة' : '/ nuit';
        const fromLabel = html.includes('From') ? 'From' :
          html.includes('ابتداءً من') ? 'ابتداءً من' : 'À partir de';
        priceP.innerHTML = `<span class="text-sm text-gray-500 font-normal mr-1">${fromLabel}</span>${fmt(apt.priceTND, apt.priceEUR)} <span class="text-sm text-gray-500 font-normal">${nightLabel}</span>`;
      }
    });
    return;
  }

  // APARTMENT PAGE
  const slug = document.body.dataset.pageSlug;
  const apt = data.apartments[slug];
  if(!apt || apt.deleted){
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;background:#f8fafc;padding:24px"><div style="max-width:560px;background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:24px;padding:32px;text-align:center;box-shadow:0 10px 24px rgba(15,23,42,.06)"><h1 style="font-size:32px;margin:0 0 12px;color:#16375C">Listing unavailable</h1><p style="color:#64748b;margin:0 0 20px">This apartment is no longer available on the site.</p><a href=\"../index.html\" style=\"display:inline-block;padding:12px 18px;border-radius:999px;background:#16375C;color:#fff;text-decoration:none;font-weight:700\">Back to homepage</a></div></div>';
    return;
  }

  normalizeReviewSections();
  renderApartmentReviews(slug, apt);
  normalizeReviewSections();
  const pricingHorizonStart = `${new Date().getFullYear()}-01-01`;
  const pricingHorizonEnd = `${new Date().getFullYear() + 3}-12-31`;
  const effectiveDatePrices = buildEffectiveDatePrices(apt, pricingHorizonStart, pricingHorizonEnd);
  window.__APT_DATE_PRICES__ = effectiveDatePrices;
  window.__APT_BASE_PRICE__ = Number(apt.priceTND || 0);

  // Prices only
  document.querySelectorAll('p.text-xl.font-bold.text-brand-blue').forEach((p, idx) => {
    if (idx < 3 || p.closest('.booking-card') || p.closest('[id^="detail-view-"]')) {
      const html = p.innerHTML;
      const nightLabel = html.includes('/ night') ? '/ night' :
        html.includes('/ الليلة') ? '/ الليلة' : '/ nuit';
      const fromLabel = html.includes('From') ? 'From' :
        html.includes('ابتداءً من') ? 'ابتداءً من' : 'À partir de';
      p.innerHTML = `<span class="text-sm text-gray-500 font-normal mr-1">${fromLabel}</span>${fmt(apt.priceTND, apt.priceEUR)} <span class="text-sm text-gray-500 font-normal">${nightLabel}</span>`;
    }
  });

  document.querySelectorAll('.booking-card .text-3xl.font-bold.text-brand-blue').forEach(el => {
    el.textContent = fmt(apt.priceTND, apt.priceEUR);
  });

  document.querySelectorAll('.booking-card .text-xl.font-bold.text-brand-gold').forEach(el => {
    el.closest('.flex.items-baseline.gap-2.mt-1')?.remove();
  });



  async function updateCustomerBookingSummary(slugId, apt, blockedDates){
    const checkin = document.getElementById('checkin-' + slugId) || document.querySelector('input[id^="checkin-"]');
    const checkout = document.getElementById('checkout-' + slugId) || document.querySelector('input[id^="checkout-"]');
    const nightsEl = document.getElementById('summary-nights');
    const priceNightEl = document.getElementById('summary-price-night');
    const totalEl = document.getElementById('summary-total');
    const badge = document.getElementById('availability-badge');
    const msg = document.getElementById('summary-message');
    if (!checkin || !checkout || !nightsEl || !priceNightEl || !totalEl || !badge || !msg) return;

    const blockedSet = new Set(blockedDates || []);
    const datePriceMap = buildDatePriceMap((window.__APT_DATE_PRICES__) || apt.datePrices || []);
    const basePrice = Number((window.__APT_BASE_PRICE__) || apt.priceTND || 0);
    const fallbackRate = apt.priceTND && apt.priceEUR ? (Number(apt.priceEUR || 0) / Number(apt.priceTND || 1)) : null;

    const ci = checkin.value;
    const co = checkout.value;

    if (!ci || !co) {
      nightsEl.textContent = '—';
      priceNightEl.textContent = basePrice ? `${basePrice} TND` : '—';
      totalEl.textContent = '—';
      badge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600';
      const lang = (document.querySelector('.lang-btn.active')?.id || '').replace('btn-','') || localStorage.getItem('cosynest-lang') || document.documentElement.lang || 'fr';
      badge.innerHTML = ({fr:'Choisissez vos dates', ar:'اختر التواريخ', en:'Select dates'})[lang] || 'Select dates';
      msg.innerHTML = ({fr:'Choisissez vos dates pour voir le prix estimé et la disponibilité.', ar:'اختر التواريخ لرؤية السعر التقديري ومعرفة التوفر.', en:'Choose your dates to see estimated price and availability.'})[lang] || 'Choose your dates to see estimated price and availability.';
      return;
    }

    const nights = nightsBetween(ci, co);
    const stayDates = [];
    let available = true;
    let total = 0;
    for(let d = parseDateLocal(ci); formatDateLocal(d) < co; d.setDate(d.getDate()+1)){
      const ds = formatDateLocal(d);
      stayDates.push(ds);
      if (blockedSet.has(ds)) available = false;
      total += datePriceMap.has(ds) ? Number(datePriceMap.get(ds)) : basePrice;
    }

    const avgNight = nights > 0 ? Math.round(total / nights) : basePrice;
    nightsEl.textContent = String(nights);
    priceNightEl.textContent = `${avgNight} TND`;
    const eurPerTnd = await getLiveEurRateFromTnd(fallbackRate);
    totalEl.textContent = formatTotalWithCurrencies(total, eurPerTnd);

    if (nights < minStay) {
      badge.innerHTML = 'Minimum stay ' + minStay + ' nights';
      return;
    }

    if (nights <= 0) {
      badge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600';
      const lang = (document.querySelector('.lang-btn.active')?.id || '').replace('btn-','') || localStorage.getItem('cosynest-lang') || document.documentElement.lang || 'fr';
      badge.innerHTML = ({fr:'Choisissez vos dates', ar:'اختر التواريخ', en:'Select dates'})[lang] || 'Select dates';
      msg.innerHTML = ({fr:'Choisissez un départ après la date d’arrivée.', ar:'اختر تاريخ مغادرة بعد تاريخ الوصول.', en:'Choose a checkout date after check-in.'})[lang] || 'Choose a checkout date after check-in.';
      return;
    }

    if (available && nights > 0) {
      badge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700';
      const lang = (document.querySelector('.lang-btn.active')?.id || '').replace('btn-','') || localStorage.getItem('cosynest-lang') || document.documentElement.lang || 'fr';
      badge.innerHTML = {
        fr:'Disponible',
        ar:'متاح',
        en:'Available'
      }[lang] || 'Available';
      const totalDisplay = formatTotalWithCurrencies(total, eurPerTnd);
      msg.innerHTML = {
        fr:`${nights} nuit${nights>1?'s':''} • Total estimé ${totalDisplay}`,
        ar:`${nights} ليلة • الإجمالي التقديري ${totalDisplay}`,
        en:`${nights} night${nights>1?'s':''} • Estimated total ${totalDisplay}`
      }[lang] || `${nights} nights • Estimated total ${totalDisplay}`;
    } else {
      badge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-700';
      const lang = (document.querySelector('.lang-btn.active')?.id || '').replace('btn-','') || localStorage.getItem('cosynest-lang') || document.documentElement.lang || 'fr';
      badge.innerHTML = {
        fr:'Indisponible',
        ar:'غير متاح',
        en:'Unavailable'
      }[lang] || 'Unavailable';
      msg.innerHTML = {
        fr:'Les dates choisies ne sont pas disponibles. Essayez d’autres dates.',
        ar:'التواريخ المختارة غير متاحة. جرّب تواريخ أخرى.',
        en:'The selected dates are unavailable. Try other dates.'
      }[lang] || 'The selected dates are unavailable. Try other dates.';
    }
  }

  // Date picker with blocked dates from Airbnb + manual blocks
  try {
    const res = await fetch('/api/calendar/' + slug);
    let blockedDates = [];
    if (res.ok) {
      const cal = await res.json();
      blockedDates = cal.ok && Array.isArray(cal.blocks) ? expandBlockedDates(cal.blocks) : [];
      initDatePickers(slug, blockedDates);
      updateCustomerBookingSummary(slug, apt, blockedDates);
      const ci = document.getElementById('checkin-' + slug) || document.querySelector('input[id^="checkin-"]');
      const co = document.getElementById('checkout-' + slug) || document.querySelector('input[id^="checkout-"]');
      if (ci) ci.addEventListener('change', () => updateCustomerBookingSummary(slug, apt, blockedDates));
      if (co) co.addEventListener('change', () => updateCustomerBookingSummary(slug, apt, blockedDates));
    } else {
      initDatePickers(slug, []);
      updateCustomerBookingSummary(slug, apt, []);
    }
  } catch(e) {
    initDatePickers(slug, []);
    updateCustomerBookingSummary(slug, apt, []);
  }

  // Extend gallery with admin-uploaded images
  if (window.collectGalleryImages) {
    const originalCollect = window.collectGalleryImages;
    window.collectGalleryImages = function(group){
      const base = originalCollect(group) || [];
      const extra = (apt.extraImages || []).map(normalizeImage);
      return [...new Set([...base, ...extra].filter(Boolean))];
    };
  }
})();