// @ts-nocheck
/* eslint-disable */
/*
 * Finances — faithful port of the standalone single-file app. Kept as imperative
 * DOM logic (rather than rewritten into React) so the net-worth chart, donut,
 * activity log, subscriptions/orders/wishlist, and auto-deduct math behave exactly
 * as designed. State lives in localStorage and syncs via lib/client-sync.ts.
 * The standalone back button was dropped (Kova's nav handles navigation).
 */

import { scheduleClientSyncPush } from "@/lib/client-sync";

export const FINANCES_HTML = `
<div class="shell">

<!-- ===== FINANCE TICKER (rotating subscription renewals) ===== -->
<div class="finance-ticker hidden" id="financeTicker">
  <span class="ticker-tag" id="tickerTag">RENEWS</span>
  <div class="ticker-stream" id="tickerStream"></div>
  <div class="ticker-dots" id="tickerDots"></div>
</div>

<!-- ===== NET WORTH ===== -->
<div class="section" data-section="net">
  <div class="section-title">
    <span class="section-title-text">NET WORTH</span>
  </div>
  <div class="card" style="background:transparent;border:none !important;box-shadow:none;padding:0;overflow:visible">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;margin-bottom:14px">
      <div>
        <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.04em;font-weight:500">Total net worth</div>
        <div id="netWorthTotal" style="font-size:34px;font-weight:700;color:var(--text-primary);line-height:1.05;margin-top:2px">USD 0</div>
        <div id="netWorthBreakdown" style="font-size:11px;color:var(--text-tertiary);margin-top:4px"></div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:var(--text-tertiary)">Display</span>
        <select id="netWorthCurrency" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px;font-family:inherit;cursor:pointer">
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="CHF">CHF</option>
        </select>
      </div>
    </div>

    <div class="nw-overview-grid">
      <div class="nw-chart-wrap" id="nwChartWrap">
        <div class="nw-chart-head">
          <span class="nw-chart-label">All-time</span>
          <span class="nw-chart-delta" id="nwChartDelta">—</span>
        </div>
        <svg class="nw-chart-svg" id="nwChartSvg" viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="nwChartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stop-color="currentColor" stop-opacity="0.55"/>
              <stop offset="60%"  stop-color="currentColor" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <line class="nw-chart-grid" x1="0" x2="600" y1="40"  y2="40"/>
          <line class="nw-chart-grid" x1="0" x2="600" y1="100" y2="100"/>
          <line class="nw-chart-grid" x1="0" x2="600" y1="160" y2="160"/>
          <path id="nwChartArea" fill="url(#nwChartGrad)" d=""/>
          <path id="nwChartLine" fill="none" stroke="currentColor" stroke-width="2.4"
                stroke-linejoin="round" stroke-linecap="round"
                style="filter: drop-shadow(0 0 6px currentColor)" d=""/>
        </svg>
        <div class="nw-chart-stats" id="nwChartStats">
          <div class="nw-stat">
            <div class="nw-stat-label">1% =</div>
            <div class="nw-stat-val" id="nwStat1pct">—</div>
          </div>
          <div class="nw-stat">
            <div class="nw-stat-label">All-time high</div>
            <div class="nw-stat-val" id="nwStatHigh">—</div>
          </div>
          <div class="nw-stat">
            <div class="nw-stat-label">All-time low</div>
            <div class="nw-stat-val" id="nwStatLow">—</div>
          </div>
          <div class="nw-stat">
            <div class="nw-stat-label">Snapshots</div>
            <div class="nw-stat-val" id="nwStatCount">—</div>
          </div>
        </div>
        <div class="nw-chart-empty" id="nwChartEmpty">Add or edit an asset to start tracking your net worth over time.</div>
      </div>

      <div class="nw-donut-wrap">
        <div class="nw-chart-head">
          <span class="nw-chart-label">Allocation</span>
          <span class="nw-chart-delta" id="nwDonutCount">—</span>
        </div>
        <div class="nw-donut-stage">
          <svg class="nw-donut-svg" id="nwDonutSvg" viewBox="0 0 140 140" aria-hidden="true"></svg>
          <div class="nw-donut-center">
            <div class="nw-donut-num" id="nwDonutTotal">—</div>
            <div class="nw-donut-sub">total</div>
          </div>
        </div>
        <div class="nw-donut-empty" id="nwDonutEmpty">Add an account to see your breakdown</div>
        <div class="nw-donut-legend" id="nwDonutLegend"></div>
      </div>
    </div>

    <div class="nw-activity" id="nwActivity">
      <div class="nw-activity-h">
        <span class="nw-chart-label">Recent activity</span>
        <span class="nw-chart-delta" id="nwActivityCount">—</span>
      </div>
      <div class="nw-activity-list" id="nwActivityList"></div>
      <div class="nw-activity-empty" id="nwActivityEmpty">No activity yet — add your first account.</div>
    </div>

    <div class="card-grid" style="gap:10px">
      <div class="card nw-subcard">
        <div class="label" style="display:flex;justify-content:space-between;align-items:center"><span>🏦 Bank accounts</span><span id="bankTotal" style="font-size:13px;color:var(--text-primary);font-weight:600">0</span></div>
        <div id="bankList" class="nw-list"></div>
        <div class="quick-add">
          <input type="text" placeholder="Account name" id="bankName" />
          <input type="number" placeholder="Amount" id="bankAmount" step="0.01" />
          <button class="quick-add-btn" id="bankAddBtn">+</button>
        </div>
      </div>
      <div class="card nw-subcard">
        <div class="label" style="display:flex;justify-content:space-between;align-items:center"><span>📈 Stocks / Investments</span><span id="stocksTotal" style="font-size:13px;color:var(--text-primary);font-weight:600">0</span></div>
        <div id="stocksList" class="nw-list"></div>
        <div class="quick-add">
          <input type="text" placeholder="Stock / fund" id="stocksName" />
          <input type="number" placeholder="Value" id="stocksAmount" step="0.01" />
          <button class="quick-add-btn" id="stocksAddBtn">+</button>
        </div>
      </div>
      <div class="card nw-subcard">
        <div class="label" style="display:flex;justify-content:space-between;align-items:center"><span>🪙 Crypto</span><span id="cryptoTotal" style="font-size:13px;color:var(--text-primary);font-weight:600">0</span></div>
        <div id="cryptoList" class="nw-list"></div>
        <div class="quick-add">
          <input type="text" placeholder="Coin / wallet" id="cryptoName" />
          <input type="number" placeholder="Value" id="cryptoAmount" step="0.01" />
          <button class="quick-add-btn" id="cryptoAddBtn">+</button>
        </div>
      </div>
      <div class="card nw-subcard">
        <div class="label" style="display:flex;justify-content:space-between;align-items:center"><span>💼 Other assets</span><span id="otherTotal" style="font-size:13px;color:var(--text-primary);font-weight:600">0</span></div>
        <div id="otherList" class="nw-list"></div>
        <div class="quick-add">
          <input type="text" placeholder="Asset name" id="otherName" />
          <input type="number" placeholder="Value" id="otherAmount" step="0.01" />
          <button class="quick-add-btn" id="otherAddBtn">+</button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ===== ACTIVE SUBSCRIPTIONS ===== -->
<div class="section" data-section="subs">
  <div class="section-title">
    <span class="section-title-text">ACTIVE SUBSCRIPTIONS</span>
  </div>
  <div class="card" style="background:linear-gradient(135deg, rgba(83,74,183,0.07), rgba(216,90,48,0.05));border:1px solid rgba(83,74,183,0.20)">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;margin-bottom:12px">
      <div>
        <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.04em;font-weight:500">Monthly burn</div>
        <div id="subsTotal" style="font-size:28px;font-weight:700;color:var(--text-primary);line-height:1.1;margin-top:2px">USD 0 <span style="font-size:13px;color:var(--text-tertiary);font-weight:500">/ mo</span></div>
        <div id="subsYearly" style="font-size:11px;color:var(--text-tertiary);margin-top:2px"></div>
      </div>
      <div id="subsCount" style="font-size:11px;color:var(--text-tertiary)"></div>
    </div>
    <div id="subsList"></div>
    <div class="empty-state" id="subsEmpty">No subscriptions yet</div>
    <div class="quick-add" style="flex-wrap:wrap;gap:6px">
      <input type="text" placeholder="Service (e.g. Netflix)" id="subName" style="flex:1.5;min-width:120px" />
      <input type="number" placeholder="Amount" id="subAmount" step="0.01" style="flex:1;max-width:100px" />
      <select id="subCurrency" style="padding:6px 10px;border:0.5px solid var(--border);border-radius:var(--radius-md);font-size:12px;font-family:inherit;background:var(--bg-card);color:var(--text-primary);max-width:90px">
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
        <option value="GBP">GBP</option>
        <option value="CHF">CHF</option>
      </select>
      <select id="subPeriod" style="padding:6px 10px;border:0.5px solid var(--border);border-radius:var(--radius-md);font-size:12px;font-family:inherit;background:var(--bg-card);color:var(--text-primary);max-width:100px">
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
        <option value="weekly">Weekly</option>
      </select>
      <label class="date-field" title="Next renewal date" style="min-width:150px"><span class="date-emoji" aria-hidden="true">📅</span><input type="date" id="subRenewal" /></label>
      <select id="subFromCat" title="Which net worth account to deduct from" style="padding:6px 10px;border:0.5px solid var(--border);border-radius:var(--radius-md);font-size:12px;font-family:inherit;background:var(--bg-card);color:var(--text-primary);min-width:130px">
        <option value="">No accounts yet</option>
      </select>
      <label class="sub-auto-toggle" title="Auto-deduct from the linked account on each renewal">
        <input type="checkbox" id="subAutoDeduct" />
        <span class="sub-auto-track"><span class="sub-auto-thumb"></span></span>
        <span class="sub-auto-label">Auto-deduct</span>
      </label>
      <button class="quick-add-btn" id="subAddBtn" onclick="window.__addSub && window.__addSub()">+ Add</button>
    </div>
  </div>
</div>

<!-- ===== INCOMING ORDERS ===== -->
<div class="section" data-section="incoming">
  <div class="section-title">
    <span class="section-title-text">INCOMING ORDERS</span>
  </div>

  <div class="card ord-add-card">
    <div class="ord-add-eyebrow">+ NEW ORDER</div>
    <div class="ord-add-grid">
      <input type="text"   id="ordName"   placeholder="Item (e.g. New iPhone)" class="ord-input ord-input-name">
      <input type="number" id="ordCost"   placeholder="Cost" step="0.01" class="ord-input ord-input-cost">
      <select id="ordCurrency" class="ord-input ord-input-ccy">
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
        <option value="GBP">GBP</option>
        <option value="CHF">CHF</option>
      </select>
      <select id="ordFromCat" class="ord-input ord-input-from" title="Which net worth account this comes out of">
        <option value="">No accounts yet</option>
      </select>
      <label class="date-field ord-input-date" title="Expected arrival"><span class="date-emoji" aria-hidden="true">📅</span><input type="date" id="ordArrival" /></label>
      <button class="ord-add-btn" id="ordAddBtn" onclick="window.__addOrder && window.__addOrder()">+ Add Order</button>
    </div>
    <div class="ord-add-preview" id="ordAddPreview">Type a cost — preview will show what % of net worth it takes.</div>
  </div>

  <div class="ord-section-h">
    <span class="ord-section-label">ITEMS ON THE WAY</span>
    <span class="ord-section-count" id="ordCount">0 items</span>
  </div>
  <div id="ordList"></div>
  <div class="ord-empty-card" id="ordEmpty">
    <div class="ord-empty-icon">📦</div>
    <div class="ord-empty-title">Nothing on the way</div>
    <div class="ord-empty-sub">Log an order above. Pick the account it comes out of, the expected arrival date, and the dashboard will show what % of your net worth it costs.</div>
  </div>
</div>

<!-- ===== WISHLIST ===== -->
<div class="section" data-section="wish">
  <div class="section-title">
    <span class="section-title-text">WISHLIST</span>
  </div>
  <div class="card wish-hero">
    <div class="wish-hero-top">
      <div>
        <div class="wish-hero-eyebrow">WISHLIST TOTAL</div>
        <div class="wish-hero-num" id="wishTotal">USD 0</div>
      </div>
      <div class="wish-hero-pct-wrap">
        <div class="wish-hero-pct-label">% OF NET WORTH</div>
        <div class="wish-hero-pct-num" id="wishPctOfNwHero">—</div>
      </div>
    </div>
    <div class="wish-hero-bar">
      <div class="wish-hero-bar-fill" id="wishHeroFill" style="width:0%"></div>
    </div>
    <div class="wish-hero-foot" id="wishPctOfNw">Add net worth first to see this as a %</div>
  </div>

  <div class="card wish-add-card">
    <div class="wish-add-eyebrow">+ ADD AN ITEM</div>
    <div class="wish-add-row">
      <input type="text"   id="wishName"   placeholder="Item name (e.g. New iPhone Pro Max)" class="wish-input wish-input-name">
      <input type="number" id="wishAmount" placeholder="Cost" step="0.01" class="wish-input wish-input-amt">
      <select id="wishCurrency" class="wish-input wish-input-ccy">
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
        <option value="GBP">GBP</option>
        <option value="CHF">CHF</option>
      </select>
      <button class="wish-add-btn" id="wishAddBtn" onclick="window.__addWish && window.__addWish()">+ Add</button>
    </div>
  </div>

  <div class="wish-section-h">
    <span class="wish-section-label">YOUR WISHES</span>
    <span class="wish-section-count" id="wishCount">0 items</span>
  </div>
  <div id="wishList"></div>
  <div class="wish-empty-card" id="wishEmpty">
    <div class="wish-empty-icon">🎯</div>
    <div class="wish-empty-title">No wishes yet</div>
    <div class="wish-empty-sub">Add anything you're saving for — the dashboard will calculate what % of your net worth it'd cost.</div>
  </div>
</div>

</div>

<!-- ===== BOTTOM TAB BAR ===== -->
<nav class="bottom-tabs" id="bottomTabs" aria-label="Sections">
  <button class="bot-tab active" data-tab="net">
    <span class="bot-tab-icon">📊</span>
    <span class="bot-tab-label">Net Worth</span>
  </button>
  <button class="bot-tab" data-tab="subs">
    <span class="bot-tab-icon">🔁</span>
    <span class="bot-tab-label">Subs</span>
  </button>
  <button class="bot-tab" data-tab="incoming">
    <span class="bot-tab-icon">📦</span>
    <span class="bot-tab-label">Orders</span>
  </button>
  <button class="bot-tab" data-tab="wish">
    <span class="bot-tab-icon">🎯</span>
    <span class="bot-tab-label">Wishlist</span>
  </button>
</nav>
`;

export function mountFinances() {

  function storeGet(key) {
    try { const raw = localStorage.getItem(key); return raw == null ? null : JSON.parse(raw); }
    catch (e) { return null; }
  }
  function storeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      scheduleClientSyncPush("finances");
    } catch (e) {}
  }

  const ORD_FROM_META = {
    bank:   { name: 'Bank',   color: '#7DD3FC' },
    stocks: { name: 'Stocks', color: '#6EE7B7' },
    crypto: { name: 'Crypto', color: '#FBBF24' },
    other:  { name: 'Other',  color: '#B794F4' }
  };

  // ============================================================
  // BOTTOM TABS
  // ============================================================
  const TAB_KEY = 'finance_active_tab';
  const tabs = document.querySelectorAll('.bot-tab');
  const sections = document.querySelectorAll('.section[data-section]');
  function setActiveTab(name) {
    tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    sections.forEach(s => {
      if (s.dataset.section === name) s.removeAttribute('hidden');
      else s.setAttribute('hidden', '');
    });
    storeSet(TAB_KEY, name);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  tabs.forEach(b => b.addEventListener('click', () => setActiveTab(b.dataset.tab)));
  const savedTab = storeGet(TAB_KEY);
  setActiveTab(savedTab && ['net','subs','incoming','wish'].includes(savedTab) ? savedTab : 'net');

  // ============================================================
  // NET WORTH
  // ============================================================
  const CURRENCY_KEY = 'nw_currency';
  const NW_CATS = [
    { key: 'bank',   listId: 'bankList',   totalId: 'bankTotal',   nameId: 'bankName',   amtId: 'bankAmount',   addId: 'bankAddBtn' },
    { key: 'stocks', listId: 'stocksList', totalId: 'stocksTotal', nameId: 'stocksName', amtId: 'stocksAmount', addId: 'stocksAddBtn' },
    { key: 'crypto', listId: 'cryptoList', totalId: 'cryptoTotal', nameId: 'cryptoName', amtId: 'cryptoAmount', addId: 'cryptoAddBtn' },
    { key: 'other',  listId: 'otherList',  totalId: 'otherTotal',  nameId: 'otherName',  amtId: 'otherAmount',  addId: 'otherAddBtn' }
  ];
  const currencyEl = document.getElementById('netWorthCurrency');
  const netWorthTotal = document.getElementById('netWorthTotal');
  const netWorthBreakdown = document.getElementById('netWorthBreakdown');

  let exchangeRates = { CHF: 1, USD: 1, EUR: 1, GBP: 1 };
  async function loadExchangeRates() {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/CHF');
      const data = await res.json();
      if (data && data.rates) {
        exchangeRates = {
          CHF: 1,
          USD: data.rates.USD || 1,
          EUR: data.rates.EUR || 1,
          GBP: data.rates.GBP || 1
        };
        renderAllNetWorth();
        if (typeof renderSubs === 'function') renderSubs();
      }
    } catch (e) {}
  }
  loadExchangeRates();

  function fmtMoney(amountCHF) {
    const symbol = currencyEl ? currencyEl.value : 'CHF';
    const rate = exchangeRates[symbol] || 1;
    const num = (Number(amountCHF) || 0) * rate;
    return symbol + ' ' + num.toLocaleString('en-US', { minimumFractionDigits: num % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  }

  function renderNetWorthCategory(cat) {
    const items = storeGet('nw:' + cat.key) || [];
    const list = document.getElementById(cat.listId);
    if (!list) return 0;
    list.innerHTML = '';
    let total = 0;
    items.forEach((it, idx) => {
      total += Number(it.amount) || 0;
      const row = document.createElement('div');
      row.className = 'nw-row';
      const name = document.createElement('span');
      name.className = 'nw-name nw-name-edit';
      name.textContent = it.name;
      name.title = 'Tap to rename';
      name.addEventListener('click', () => beginNwNameEdit(name, items, idx, cat.key));
      const amt = document.createElement('span');
      amt.className = 'nw-amt nw-amt-edit';
      amt.textContent = fmtMoney(it.amount);
      amt.title = 'Tap to edit · type +500 to add, -200 to subtract, or a new total';
      amt.addEventListener('click', () => beginNwAmountEdit(amt, items, idx, cat.key));
      const del = document.createElement('button'); del.className = 'nw-del'; del.textContent = '×';
      del.addEventListener('click', () => {
        const removed = items[idx];
        items.splice(idx, 1); storeSet('nw:' + cat.key, items);
        if (removed) logActivity(cat.key, removed.name, -(Number(removed.amount) || 0), 'delete');
        renderAllNetWorth();
      });
      row.appendChild(name); row.appendChild(amt); row.appendChild(del);
      list.appendChild(row);
    });
    document.getElementById(cat.totalId).textContent = fmtMoney(total);
    return total;
  }

  function beginNwAmountEdit(amtEl, items, idx, catKey) {
    if (amtEl.querySelector('input')) return;
    const symbol = currencyEl ? currencyEl.value : 'CHF';
    const rate = exchangeRates[symbol] || 1;
    const curCHF = Number(items[idx].amount) || 0;
    const curDisplay = curCHF * rate;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = String(curDisplay.toFixed(curDisplay % 1 === 0 ? 0 : 2));
    input.style.cssText = 'width:110px;padding:4px 8px;font-family:var(--font-mono);font-size:12px;background:rgba(0,0,0,0.30);border:1px solid rgba(255,255,255,0.10);color:var(--text-primary);border-radius:6px;text-align:right;font-variant-numeric:tabular-nums;outline:none;';
    amtEl.textContent = '';
    amtEl.appendChild(input);
    setTimeout(() => { input.focus(); input.select(); }, 0);
    let saved = false;
    function save() {
      if (saved) return; saved = true;
      const v = input.value.trim();
      if (v === '') { renderAllNetWorth(); return; }
      let nextDisplay = curDisplay;
      if (/^[+\-]\s*\d/.test(v)) {
        const delta = parseFloat(v.replace(/\s+/g, ''));
        if (!isNaN(delta)) nextDisplay = curDisplay + delta;
      } else {
        const n = parseFloat(v);
        if (!isNaN(n)) nextDisplay = n;
      }
      if (nextDisplay < 0) nextDisplay = 0;
      const nextCHF = nextDisplay / rate;
      const deltaCHF = nextCHF - curCHF;
      items[idx].amount = nextCHF;
      storeSet('nw:' + catKey, items);
      if (Math.abs(deltaCHF) > 0.005) {
        logActivity(catKey, items[idx].name, deltaCHF, 'edit');
      }
      renderAllNetWorth();
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      else if (e.key === 'Escape') { saved = true; renderAllNetWorth(); }
    });
    input.addEventListener('blur', save);
  }
  function beginNwNameEdit(nameEl, items, idx, catKey) {
    if (nameEl.querySelector('input')) return;
    const cur = String(items[idx].name || '');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = cur;
    input.style.cssText = 'width:100%;padding:4px 8px;font-family:inherit;font-size:13px;background:rgba(0,0,0,0.30);border:1px solid rgba(255,255,255,0.10);color:var(--text-primary);border-radius:6px;outline:none;';
    nameEl.textContent = '';
    nameEl.appendChild(input);
    setTimeout(() => { input.focus(); input.select(); }, 0);
    let saved = false;
    function save() {
      if (saved) return; saved = true;
      const v = input.value.trim();
      if (v) { items[idx].name = v; storeSet('nw:' + catKey, items); }
      renderAllNetWorth();
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      else if (e.key === 'Escape') { saved = true; renderAllNetWorth(); }
    });
    input.addEventListener('blur', save);
  }

  function renderAllNetWorth() {
    let grand = 0;
    const breakdown = [];
    const sliceTotals = {};
    NW_CATS.forEach(cat => {
      const sub = renderNetWorthCategory(cat);
      grand += sub;
      sliceTotals[cat.key] = sub;
      if (sub > 0) breakdown.push(cat.key + ': ' + fmtMoney(sub));
    });
    if (netWorthTotal) netWorthTotal.textContent = fmtMoney(grand);
    if (netWorthBreakdown) netWorthBreakdown.textContent = breakdown.join('  •  ');
    logNetWorthSnapshot(grand);
    renderNetWorthChart();
    renderAllocationDonut(sliceTotals, grand);
    renderActivity();
    if (typeof renderWishlist === 'function') renderWishlist();
    if (typeof renderOrders   === 'function') renderOrders();
    if (typeof updateOrdPreview === 'function') updateOrdPreview();
  }

  // ============================================================
  // ACTIVITY LOG
  // ============================================================
  const ACTIVITY_KEY = 'nw:activity';
  const ACTIVITY_MAX = 50;
  function logActivity(catKey, name, deltaCHF, kind) {
    const arr = storeGet(ACTIVITY_KEY) || [];
    arr.push({ ts: Date.now(), cat: catKey, name: String(name || ''), delta: Number(deltaCHF) || 0, kind: kind || 'add' });
    if (arr.length > ACTIVITY_MAX) arr.splice(0, arr.length - ACTIVITY_MAX);
    storeSet(ACTIVITY_KEY, arr);
  }
  function fmtActivityDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (dayStart === today) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    if (dayStart === yesterday) return 'yest';
    const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return mons[d.getMonth()] + ' ' + d.getDate();
  }
  function renderActivity() {
    const list = document.getElementById('nwActivityList');
    const empty = document.getElementById('nwActivityEmpty');
    const count = document.getElementById('nwActivityCount');
    if (!list) return;
    const arr = (storeGet(ACTIVITY_KEY) || []).slice().sort((a, b) => b.ts - a.ts);
    if (!arr.length) {
      list.classList.add('hidden');
      empty.classList.remove('hidden');
      count.textContent = '—';
      return;
    }
    list.classList.remove('hidden');
    empty.classList.add('hidden');
    count.textContent = arr.length + ' event' + (arr.length === 1 ? '' : 's');
    list.innerHTML = arr.slice(0, 30).map(e => {
      const meta = NW_SLICE_META[e.cat] || { name: e.cat, color: '#FFFFFF' };
      const sign = e.delta >= 0 ? '+' : '—';
      const cls = e.delta >= 0 ? 'up' : 'down';
      const amt = fmtMoney(Math.abs(e.delta));
      const kind = e.kind === 'edit' ? 'EDIT' : (e.kind === 'delete' ? 'DELETE' : 'ADD');
      return '<div class="nw-activity-row" style="color:' + meta.color + '">'
        + '<span class="nw-activity-bar" style="background:' + meta.color + '"></span>'
        + '<div class="nw-activity-info">'
        +   '<div class="nw-activity-name">' + escapeHtml(e.name || '(unnamed)') + '</div>'
        +   '<div class="nw-activity-meta">' + meta.name + ' · ' + kind + '</div>'
        + '</div>'
        + '<span class="nw-activity-amt ' + cls + '">' + sign + amt + '</span>'
        + '<span class="nw-activity-date">' + fmtActivityDate(e.ts) + '</span>'
        + '</div>';
    }).join('');
  }

  // ============================================================
  // ALLOCATION DONUT
  // ============================================================
  const NW_SLICE_META = {
    bank:   { name: 'Bank',     color: '#7DD3FC' },
    stocks: { name: 'Stocks',   color: '#6EE7B7' },
    crypto: { name: 'Crypto',   color: '#FBBF24' },
    other:  { name: 'Other',    color: '#B794F4' },
    subs:   { name: 'Subs/yr',  color: '#FF8A8A' }
  };
  function donutArcPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
    const x1o = cx + rOuter * Math.cos(startAngle);
    const y1o = cy + rOuter * Math.sin(startAngle);
    const x2o = cx + rOuter * Math.cos(endAngle);
    const y2o = cy + rOuter * Math.sin(endAngle);
    const x1i = cx + rInner * Math.cos(endAngle);
    const y1i = cy + rInner * Math.sin(endAngle);
    const x2i = cx + rInner * Math.cos(startAngle);
    const y2i = cy + rInner * Math.sin(startAngle);
    const large = (endAngle - startAngle) > Math.PI ? 1 : 0;
    return 'M ' + x1o.toFixed(2) + ' ' + y1o.toFixed(2)
      + ' A ' + rOuter + ' ' + rOuter + ' 0 ' + large + ' 1 ' + x2o.toFixed(2) + ' ' + y2o.toFixed(2)
      + ' L ' + x1i.toFixed(2) + ' ' + y1i.toFixed(2)
      + ' A ' + rInner + ' ' + rInner + ' 0 ' + large + ' 0 ' + x2i.toFixed(2) + ' ' + y2i.toFixed(2)
      + ' Z';
  }
  function renderAllocationDonut(catTotals, grand) {
    const svg    = document.getElementById('nwDonutSvg');
    const total  = document.getElementById('nwDonutTotal');
    const empty  = document.getElementById('nwDonutEmpty');
    const legend = document.getElementById('nwDonutLegend');
    const count  = document.getElementById('nwDonutCount');
    if (!svg || !total || !legend) return;

    const slices = [];
    NW_CATS.forEach(cat => {
      const meta = NW_SLICE_META[cat.key] || { color: '#FFFFFF' };
      const items = storeGet('nw:' + cat.key) || [];
      items.forEach((it, i) => {
        const v = Number(it.amount) || 0;
        if (v > 0) {
          slices.push({
            key: cat.key + '::' + i,
            name: String(it.name || '(unnamed)'),
            color: meta.color,
            value: v
          });
        }
      });
    });
    const subItems = storeGet('subs') || [];
    const annualSubsCHF = subItems.reduce((s, it) => s + monthlyEquivalent(it) * 12, 0);
    if (annualSubsCHF > 0) {
      const meta = NW_SLICE_META.subs;
      slices.push({ key: 'subs', name: meta.name, color: meta.color, value: annualSubsCHF });
    }

    const sliceTotal = slices.reduce((s, x) => s + x.value, 0);

    if (!slices.length || sliceTotal <= 0) {
      svg.innerHTML = '<circle cx="70" cy="70" r="60" fill="rgba(255,255,255,0.025)"/>'
                    + '<circle cx="70" cy="70" r="44" fill="#0A0A0B"/>';
      total.textContent = '—';
      empty.classList.remove('hidden');
      legend.innerHTML = '';
      count.textContent = '—';
      return;
    }
    empty.classList.add('hidden');
    total.textContent = fmtMoney(grand).split(' ')[1] || fmtMoney(grand);
    count.textContent = slices.length + ' slice' + (slices.length === 1 ? '' : 's');

    slices.sort((a, b) => b.value - a.value);
    let angle = -Math.PI / 2;
    let html = '';
    slices.forEach(s => {
      const sliceAngle = (s.value / sliceTotal) * Math.PI * 2;
      const pad = slices.length > 1 ? 0.015 : 0;
      const a1 = angle + pad;
      const a2 = angle + sliceAngle - pad;
      if (a2 > a1) {
        html += '<path d="' + donutArcPath(70, 70, 60, 44, a1, a2) + '" fill="' + s.color + '"></path>';
      }
      angle += sliceAngle;
    });
    svg.innerHTML = html;

    legend.innerHTML = slices.map(s => {
      const pct = ((s.value / sliceTotal) * 100).toFixed(1);
      return '<div class="nw-leg" style="color:' + s.color + '">'
        + '<span class="nw-leg-dot" style="background:' + s.color + '"></span>'
        + '<span class="nw-leg-name">' + escapeHtml(s.name) + '</span>'
        + '<span class="nw-leg-pct">' + pct + '%</span>'
        + '</div>';
    }).join('');
  }

  // Net-worth history chart
  const NW_HISTORY_KEY = 'nw:history';
  const NW_HISTORY_MAX = 500;
  function logNetWorthSnapshot(grandCHF) {
    const v = Number(grandCHF) || 0;
    const hist = storeGet(NW_HISTORY_KEY) || [];
    const last = hist[hist.length - 1];
    if (last && Math.abs((last.v || 0) - v) < 0.005) return;
    hist.push({ t: Date.now(), v: v });
    if (hist.length > NW_HISTORY_MAX) hist.splice(0, hist.length - NW_HISTORY_MAX);
    storeSet(NW_HISTORY_KEY, hist);
  }
  function nwSmoothPath(points) {
    if (points.length < 2) return '';
    if (points.length === 2) return 'M' + points[0].x + ',' + points[0].y + ' L' + points[1].x + ',' + points[1].y;
    const d = ['M' + points[0].x + ',' + points[0].y];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d.push('C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + p2.x + ',' + p2.y);
    }
    return d.join(' ');
  }
  function renderNetWorthChart() {
    const wrap = document.getElementById('nwChartWrap');
    const svg = document.getElementById('nwChartSvg');
    const linePath = document.getElementById('nwChartLine');
    const areaPath = document.getElementById('nwChartArea');
    const deltaEl = document.getElementById('nwChartDelta');
    if (!wrap || !svg || !linePath || !areaPath) return;
    const hist = storeGet(NW_HISTORY_KEY) || [];
    if (hist.length < 1) {
      wrap.classList.remove('has-data');
      linePath.setAttribute('d', '');
      areaPath.setAttribute('d', '');
      if (deltaEl) { deltaEl.textContent = '—'; deltaEl.classList.remove('up', 'down'); }
      renderChartStats([]);
      return;
    }
    wrap.classList.add('has-data');
    const first = hist[0].v;
    const last = hist[hist.length - 1].v;
    const change = last - first;
    const direction = Math.abs(change) < 0.005 ? 'flat' : (change > 0 ? 'up' : 'down');
    const color = direction === 'up' ? '#6BE3A4' : direction === 'down' ? '#FF8A8A' : 'var(--text-tertiary)';
    svg.style.color = color;
    if (deltaEl) {
      deltaEl.classList.remove('up', 'down');
      if (direction === 'up')   deltaEl.classList.add('up');
      if (direction === 'down') deltaEl.classList.add('down');
      if (direction === 'flat') {
        deltaEl.textContent = 'Flat';
      } else if (Math.abs(first) < 0.5) {
        const sign = change > 0 ? '+' : '—';
        deltaEl.textContent = sign + fmtMoney(Math.abs(change));
      } else {
        const pct = (change / Math.abs(first)) * 100;
        const sign = change > 0 ? '+' : '—';
        const absPct = Math.abs(pct);
        const pctStr = absPct >= 100 ? absPct.toFixed(0) : absPct >= 10 ? absPct.toFixed(1) : absPct.toFixed(2);
        deltaEl.textContent = sign + pctStr + '%';
      }
    }
    const W = 600, H = 200, pad = 8;
    const vals = hist.map(p => p.v);
    const minV = Math.min.apply(null, vals);
    const maxV = Math.max.apply(null, vals);
    const range = (maxV - minV) || Math.max(1, Math.abs(maxV));
    if (hist.length === 1) {
      const y = H / 2;
      linePath.setAttribute('d', 'M0,' + y + ' L' + W + ',' + y);
      areaPath.setAttribute('d', 'M0,' + y + ' L' + W + ',' + y + ' L' + W + ',' + H + ' L0,' + H + ' Z');
      renderChartStats(hist);
      return;
    }
    const points = hist.map((p, i) => ({
      x: (i / (hist.length - 1)) * W,
      y: H - pad - ((p.v - minV) / range) * (H - pad * 2)
    }));
    const lineD = nwSmoothPath(points);
    linePath.setAttribute('d', lineD);
    const lastPt = points[points.length - 1];
    const firstPt = points[0];
    areaPath.setAttribute('d', lineD + ' L' + lastPt.x + ',' + H + ' L' + firstPt.x + ',' + H + ' Z');
    renderChartStats(hist);
  }

  function renderChartStats(hist) {
    const oneEl   = document.getElementById('nwStat1pct');
    const highEl  = document.getElementById('nwStatHigh');
    const lowEl   = document.getElementById('nwStatLow');
    const countEl = document.getElementById('nwStatCount');
    if (!oneEl) return;
    if (!hist || !hist.length) {
      oneEl.textContent = '—';
      highEl.textContent = '—';
      lowEl.textContent = '—';
      countEl.textContent = '0';
      return;
    }
    const vals = hist.map(p => p.v);
    const last = vals[vals.length - 1];
    const high = Math.max.apply(null, vals);
    const low  = Math.min.apply(null, vals);
    oneEl.textContent   = fmtMoney(last / 100);
    highEl.textContent  = fmtMoney(high);
    lowEl.textContent   = fmtMoney(low);
    countEl.textContent = String(hist.length);
  }

  NW_CATS.forEach(cat => {
    const addBtn = document.getElementById(cat.addId);
    const nameInput = document.getElementById(cat.nameId);
    const amtInput = document.getElementById(cat.amtId);
    if (!addBtn) return;
    function doAdd() {
      const n = nameInput.value.trim();
      const a = parseFloat(amtInput.value);
      if (!n || isNaN(a)) return;
      const symbol = currencyEl ? currencyEl.value : 'CHF';
      const rate = exchangeRates[symbol] || 1;
      const amountCHF = a / rate;
      const items = storeGet('nw:' + cat.key) || [];
      items.push({ name: n, amount: amountCHF });
      storeSet('nw:' + cat.key, items);
      logActivity(cat.key, n, amountCHF, 'add');
      nameInput.value = ''; amtInput.value = '';
      renderAllNetWorth();
    }
    addBtn.addEventListener('click', doAdd);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    amtInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  });

  if (currencyEl) {
    const savedCur = storeGet(CURRENCY_KEY);
    if (savedCur) currencyEl.value = savedCur;
    currencyEl.addEventListener('change', () => {
      storeSet(CURRENCY_KEY, currencyEl.value);
      renderAllNetWorth();
      renderSubs();
    });
  }
  renderAllNetWorth();

  // ============================================================
  // SUBSCRIPTIONS
  // ============================================================
  const subsList = document.getElementById('subsList');
  const subsEmpty = document.getElementById('subsEmpty');
  const subsTotal = document.getElementById('subsTotal');
  const subsYearly = document.getElementById('subsYearly');
  const subsCount = document.getElementById('subsCount');
  const subAddBtn = document.getElementById('subAddBtn');
  const subName = document.getElementById('subName');
  const subAmount = document.getElementById('subAmount');
  const subPeriod = document.getElementById('subPeriod');

  function monthlyEquivalent(item) {
    const a = Number(item.amount) || 0;
    if (item.period === 'yearly') return a / 12;
    if (item.period === 'weekly') return a * 4.345;
    return a;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function formatRenewal(iso) {
    if (!iso) return '';
    const isoSafe = (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)) ? iso + 'T00:00' : iso;
    const d = new Date(isoSafe);
    if (isNaN(d)) return iso;
    const now = new Date();
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((dayStart - todayStart) / (1000 * 60 * 60 * 24));
    const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    let prefix = '';
    if (diffDays < 0) prefix = 'past · ';
    else if (diffDays === 0) prefix = 'today · ';
    else if (diffDays === 1) prefix = 'tomorrow · ';
    else if (diffDays <= 7) prefix = 'in ' + diffDays + 'd · ';
    return prefix + dateLabel;
  }

  function renderSubs() {
    if (!subsList) return;
    processAutoDeductSubs();
    populateSubFromSelect();
    const items = storeGet('subs') || [];
    subsList.innerHTML = '';
    if (!items.length) {
      subsEmpty.style.display = 'flex';
      subsTotal.innerHTML = fmtMoney(0) + ' <span style="font-size:13px;color:var(--text-tertiary);font-weight:500">/ mo</span>';
      subsYearly.textContent = '';
      subsCount.textContent = '';
      return;
    }
    subsEmpty.style.display = 'none';
    let monthly = 0;
    items.forEach((it, idx) => {
      const m = monthlyEquivalent(it);
      monthly += m;
      let daysToRenew = null;
      if (it.renewal && typeof nextRenewalDate === 'function') {
        const next = nextRenewalDate(it.renewal, it.period);
        if (next) {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          daysToRenew = Math.round((next.getTime() - today) / 86400000);
        }
      }
      const isUrgent = daysToRenew != null && daysToRenew <= 5;
      const row = document.createElement('div');
      row.className = 'sub-row' + (isUrgent ? ' is-urgent' : '');
      row.style.cssText = 'display:grid;grid-template-columns:1fr auto auto;align-items:center;padding:12px 14px;background:rgba(255,255,255,0.025);border-radius:var(--radius-md);margin-bottom:8px;gap:12px;';
      const renewLine = it.renewal
        ? '<div class="sub-renew-line" style="font-size:10px;color:#F2C063;margin-top:3px">↻ Renews ' + formatRenewal(it.renewal) + '</div>'
        : '';
      let metaLine = '';
      const pills = [];
      if (it.fromCat && it.fromAccount) {
        pills.push('<span class="sub-from-pill">from · ' + escapeHtml(it.fromAccount) + '</span>');
      }
      pills.push(
        '<button class="sub-row-toggle' + (it.autoDeduct ? ' is-on' : '') + '" data-sub-toggle="' + idx + '" type="button" title="Auto-deduct from the linked account on each renewal">'
        + '<span class="sub-row-toggle-dot"></span>'
        + (it.autoDeduct ? 'Auto-deduct ON' : 'Auto-deduct off')
        + '</button>'
      );
      metaLine = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">' + pills.join('') + '</div>';

      const left = document.createElement('div');
      left.style.cssText = 'min-width:0';
      left.innerHTML = '<div style="font-weight:600;color:var(--text-primary);font-size:14px">' + escapeHtml(it.name) + '</div>' +
        '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;text-transform:capitalize">' + it.period + '</div>' +
        renewLine +
        metaLine;
      const cost = document.createElement('div');
      cost.style.cssText = 'text-align:right;line-height:1.1';
      const bigNum = fmtMoney(m);
      const origHint = (it.entered_currency && it.entered_currency !== 'CHF' && it.entered_amount != null)
        ? '<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">billed ' + it.entered_currency + ' ' + Number(it.entered_amount).toLocaleString('en-US', { minimumFractionDigits: it.entered_amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 }) + ' / ' + it.period + '</div>'
        : (it.period !== 'monthly'
            ? '<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">billed ' + fmtMoney(it.amount) + ' / ' + it.period + '</div>'
            : '');
      cost.innerHTML = '<div style="font-size:20px;font-weight:700;color:var(--text-primary);font-variant-numeric:tabular-nums">' + bigNum + '</div>' +
        '<div style="font-size:10px;color:var(--text-tertiary);margin-top:1px">/ month</div>' +
        origHint;
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;flex-direction:column;gap:4px;align-items:center';
      const editBtn = document.createElement('button');
      editBtn.title = 'Edit';
      editBtn.style.cssText = 'background:transparent;border:1px solid rgba(255,255,255,0.10);color:var(--text-tertiary);cursor:pointer;font-size:12px;padding:3px 7px;border-radius:5px;font-family:inherit;line-height:1';
      editBtn.textContent = '✏';
      editBtn.addEventListener('click', () => editSubInline(idx));
      const del = document.createElement('button');
      del.title = 'Delete';
      del.style.cssText = 'background:transparent;border:1px solid rgba(255,255,255,0.10);color:var(--text-tertiary);cursor:pointer;font-size:12px;padding:3px 7px;border-radius:5px;font-family:inherit;line-height:1';
      del.textContent = '×';
      del.addEventListener('click', () => {
        if (!confirm('Delete "' + it.name + '"?')) return;
        items.splice(idx, 1); storeSet('subs', items); renderSubs();
      });
      actions.appendChild(editBtn);
      actions.appendChild(del);
      row.appendChild(left); row.appendChild(cost); row.appendChild(actions);
      subsList.appendChild(row);
    });
    subsList.querySelectorAll('[data-sub-toggle]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = parseInt(b.dataset.subToggle, 10);
        const arr = storeGet('subs') || [];
        if (!arr[i]) return;
        if (!arr[i].autoDeduct && (!arr[i].fromCat || !arr[i].fromAccount)) {
          alert('Pick a "From account" first (use the ✏ edit button) so the deduction knows where to take the money from.');
          return;
        }
        arr[i].autoDeduct = !arr[i].autoDeduct;
        storeSet('subs', arr);
        renderSubs();
      });
    });
    subsTotal.innerHTML = fmtMoney(monthly) + ' <span style="font-size:13px;color:var(--text-tertiary);font-weight:500">/ mo</span>';
    subsYearly.textContent = '~' + fmtMoney(monthly * 12) + ' per year';
    subsCount.textContent = items.length + (items.length === 1 ? ' subscription' : ' subscriptions');
    if (typeof renderAllNetWorth === 'function') renderAllNetWorth();
  }

  function populateSubFromSelect() {
    const sel = document.getElementById('subFromCat');
    if (!sel) return;
    const prev = sel.value;
    const accounts = (typeof listAllNwAccounts === 'function') ? listAllNwAccounts() : [];
    const ICONS = { bank: '🏦', stocks: '📈', crypto: '🪙', other: '💼' };
    if (!accounts.length) {
      sel.innerHTML = '<option value="">No accounts yet</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = accounts.map(a => {
      const value = a.catKey + '::' + a.itemName;
      return '<option value="' + value + '">' + ICONS[a.catKey] + ' ' + escapeHtml(a.itemName) + '</option>';
    }).join('');
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  }

  function processAutoDeductSubs() {
    const items = storeGet('subs') || [];
    if (!items.length) return false;
    const now = new Date();
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let changed = false;
    items.forEach(it => {
      if (!it.autoDeduct || !it.renewal || !it.fromCat || !it.fromAccount) return;
      const isoSafe = (typeof it.renewal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.renewal)) ? it.renewal + 'T00:00' : it.renewal;
      let renewalDate = new Date(isoSafe);
      if (isNaN(renewalDate)) return;
      let safety = 0;
      while (renewalDate.getTime() <= todayMs && safety++ < 200) {
        const renewalMs = new Date(renewalDate.getFullYear(), renewalDate.getMonth(), renewalDate.getDate()).getTime();
        if (!(it.lastDeductedAt && it.lastDeductedAt >= renewalMs)) {
          const nwItems = storeGet('nw:' + it.fromCat) || [];
          const idx = nwItems.findIndex(x => String(x.name) === String(it.fromAccount));
          if (idx < 0) break;
          const cost = Number(it.amount) || 0;
          nwItems[idx].amount = (Number(nwItems[idx].amount) || 0) - cost;
          storeSet('nw:' + it.fromCat, nwItems);
          logActivity(it.fromCat, nwItems[idx].name, -cost, 'edit');
          it.lastDeductedAt = renewalMs;
          changed = true;
        }
        if (it.period === 'weekly') renewalDate.setDate(renewalDate.getDate() + 7);
        else if (it.period === 'yearly') renewalDate.setFullYear(renewalDate.getFullYear() + 1);
        else renewalDate.setMonth(renewalDate.getMonth() + 1);
      }
      const newRenewal = renewalDate.getFullYear() + '-' + String(renewalDate.getMonth() + 1).padStart(2, '0') + '-' + String(renewalDate.getDate()).padStart(2, '0');
      if (newRenewal !== it.renewal) {
        it.renewal = newRenewal;
        changed = true;
      }
    });
    if (changed) storeSet('subs', items);
    return changed;
  }

  function editSubInline(idx) {
    const items = storeGet('subs') || [];
    const it = items[idx];
    if (!it) return;
    const rows = subsList.querySelectorAll('.sub-row');
    const row = rows[idx];
    if (!row) return;
    const enteredCcy = it.entered_currency || 'CHF';
    const enteredAmt = it.entered_amount != null ? it.entered_amount : it.amount;
    const periodOpts = ['monthly','yearly','weekly'].map(p =>
      '<option value="' + p + '"' + (p === it.period ? ' selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>'
    ).join('');
    const ccyOpts = ['USD','EUR','GBP','CHF'].map(c =>
      '<option value="' + c + '"' + (c === enteredCcy ? ' selected' : '') + '>' + c + '</option>'
    ).join('');
    const accounts = (typeof listAllNwAccounts === 'function') ? listAllNwAccounts() : [];
    const ICONS = { bank: '🏦', stocks: '📈', crypto: '🪙', other: '💼' };
    const currentFrom = (it.fromCat && it.fromAccount) ? (it.fromCat + '::' + it.fromAccount) : '';
    const fromOpts = '<option value="">No account linked</option>' + accounts.map(a => {
      const v = a.catKey + '::' + a.itemName;
      return '<option value="' + v + '"' + (v === currentFrom ? ' selected' : '') + '>' + ICONS[a.catKey] + ' ' + escapeHtml(a.itemName) + '</option>';
    }).join('');
    row.innerHTML = '';
    row.style.gridTemplateColumns = '1fr';
    row.style.padding = '14px';
    const form = document.createElement('div');
    form.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center';
    form.innerHTML =
      '<input type="text" class="se-name" value="' + escapeHtml(it.name) + '" style="flex:1.5;min-width:120px;padding:6px 10px;border:0.5px solid rgba(255,255,255,0.10);border-radius:var(--radius-md);font-size:12px;font-family:inherit;background:var(--bg-card);color:var(--text-primary)" />' +
      '<input type="number" step="0.01" class="se-amt" value="' + Number(enteredAmt).toFixed(2) + '" style="width:90px;padding:6px 10px;border:0.5px solid rgba(255,255,255,0.10);border-radius:var(--radius-md);font-size:12px;font-family:inherit;background:var(--bg-card);color:var(--text-primary)" />' +
      '<select class="se-ccy" style="padding:6px 10px;border:0.5px solid rgba(255,255,255,0.10);border-radius:var(--radius-md);font-size:12px;font-family:inherit;background:var(--bg-card);color:var(--text-primary)">' + ccyOpts + '</select>' +
      '<select class="se-per" style="padding:6px 10px;border:0.5px solid rgba(255,255,255,0.10);border-radius:var(--radius-md);font-size:12px;font-family:inherit;background:var(--bg-card);color:var(--text-primary)">' + periodOpts + '</select>' +
      '<label class="date-field" style="min-width:140px"><span class="date-emoji" aria-hidden="true">📅</span><input type="date" class="se-ren" value="' + (it.renewal && /^\d{4}-\d{2}-\d{2}/.test(it.renewal) ? it.renewal.slice(0,10) : '') + '" /></label>' +
      '<select class="se-from" style="padding:6px 10px;border:0.5px solid rgba(255,255,255,0.10);border-radius:var(--radius-md);font-size:12px;font-family:inherit;background:var(--bg-card);color:var(--text-primary);min-width:130px">' + fromOpts + '</select>' +
      '<label class="sub-auto-toggle" style="padding:6px 10px"><input type="checkbox" class="se-auto"' + (it.autoDeduct ? ' checked' : '') + ' /><span class="sub-auto-track"><span class="sub-auto-thumb"></span></span><span class="sub-auto-label">Auto-deduct</span></label>' +
      '<button class="se-save quick-add-btn">Save</button>' +
      '<button class="se-cancel" style="background:transparent;border:1px solid rgba(255,255,255,0.10);color:var(--text-tertiary);cursor:pointer;font-size:12px;padding:6px 10px;border-radius:var(--radius-md);font-family:inherit">Cancel</button>';
    row.appendChild(form);
    const save = () => {
      const newName = row.querySelector('.se-name').value.trim();
      const newAmtRaw = parseFloat(row.querySelector('.se-amt').value);
      const newCcy = row.querySelector('.se-ccy').value;
      const newPer = row.querySelector('.se-per').value;
      const newRen = row.querySelector('.se-ren').value || null;
      const newFromVal = row.querySelector('.se-from').value;
      const newAuto = row.querySelector('.se-auto').checked;
      let newFromCat = null, newFromAccount = null;
      if (newFromVal) {
        const ix = newFromVal.indexOf('::');
        if (ix > 0) { newFromCat = newFromVal.slice(0, ix); newFromAccount = newFromVal.slice(ix + 2); }
      }
      if (newAuto && (!newFromCat || !newFromAccount)) {
        alert('Pick a "From account" — auto-deduct needs somewhere to take the money from.');
        return;
      }
      if (!newName || isNaN(newAmtRaw)) return;
      const rate = exchangeRates[newCcy] || 1;
      items[idx] = { ...it, name: newName, amount: newAmtRaw / rate, period: newPer, renewal: newRen, entered_amount: newAmtRaw, entered_currency: newCcy, fromCat: newFromCat, fromAccount: newFromAccount, autoDeduct: newAuto };
      storeSet('subs', items); renderSubs();
    };
    const cancel = () => renderSubs();
    row.querySelector('.se-save').addEventListener('click', save);
    row.querySelector('.se-cancel').addEventListener('click', cancel);
    row.querySelectorAll('input').forEach(i => {
      i.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
        else if (e.key === 'Escape') cancel();
      });
    });
    row.querySelector('.se-name').focus();
  }

  function doSubAdd() {
    try {
      const nEl = document.getElementById('subName');
      const aEl = document.getElementById('subAmount');
      const ccEl = document.getElementById('subCurrency');
      const pEl = document.getElementById('subPeriod');
      const rEl = document.getElementById('subRenewal');
      const fEl = document.getElementById('subFromCat');
      const tEl = document.getElementById('subAutoDeduct');
      if (!nEl || !aEl) return;
      const n = (nEl.value || '').trim();
      const aRaw = parseFloat(aEl.value);
      if (!n || isNaN(aRaw)) { nEl.focus(); return; }
      const enteredCcy = ccEl ? ccEl.value : 'CHF';
      const rate = exchangeRates[enteredCcy] || 1;
      const amountCHF = aRaw / rate;
      let fromCat = null, fromAccount = null;
      if (fEl && fEl.value) {
        const ix = fEl.value.indexOf('::');
        if (ix > 0) { fromCat = fEl.value.slice(0, ix); fromAccount = fEl.value.slice(ix + 2); }
      }
      const autoDeduct = !!(tEl && tEl.checked);
      if (autoDeduct && (!fromCat || !fromAccount)) {
        alert('Pick a "From account" first — auto-deduct needs to know where to take the money from.');
        return;
      }
      const items = storeGet('subs') || [];
      items.push({
        name: n, amount: amountCHF,
        period: pEl ? pEl.value : 'monthly',
        renewal: rEl && rEl.value ? rEl.value : null,
        entered_amount: aRaw,
        entered_currency: enteredCcy,
        fromCat: fromCat,
        fromAccount: fromAccount,
        autoDeduct: autoDeduct,
        lastDeductedAt: null
      });
      storeSet('subs', items);
      nEl.value = ''; aEl.value = '';
      if (rEl) rEl.value = '';
      if (tEl) tEl.checked = false;
      renderSubs();
    } catch (e) { console.error('subAdd failed', e); }
  }
  if (subName)   subName.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubAdd(); });
  if (subAmount) subAmount.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubAdd(); });
  renderSubs();

  // ============================================================
  // WISHLIST
  // ============================================================
  function nwGrandCHF() {
    let g = 0;
    NW_CATS.forEach(cat => {
      const items = storeGet('nw:' + cat.key) || [];
      items.forEach(it => { g += Number(it.amount) || 0; });
    });
    return g;
  }
  function pctClass(pct) {
    if (pct < 5)  return 'good';
    if (pct < 25) return 'warn';
    return 'bad';
  }
  function renderWishlist() {
    const wishList    = document.getElementById('wishList');
    const wishEmpty   = document.getElementById('wishEmpty');
    const wishTotalEl = document.getElementById('wishTotal');
    const wishPctEl   = document.getElementById('wishPctOfNw');
    const wishCountEl = document.getElementById('wishCount');
    const heroPctEl   = document.getElementById('wishPctOfNwHero');
    const heroFill    = document.getElementById('wishHeroFill');
    if (!wishList) return;
    const items = storeGet('wishlist') || [];
    const grand = nwGrandCHF();
    let total = 0;
    items.forEach(it => { total += Number(it.amount) || 0; });

    if (wishTotalEl) wishTotalEl.textContent = fmtMoney(total);
    if (grand > 0) {
      const pct = (total / grand) * 100;
      const cls = pctClass(pct);
      if (heroPctEl) {
        heroPctEl.textContent = pct.toFixed(2) + '%';
        heroPctEl.className = 'wish-hero-pct-num' + (cls === 'good' ? '' : (cls === 'warn' ? ' warn' : ' bad'));
      }
      if (heroFill) heroFill.style.width = Math.min(100, pct) + '%';
      if (wishPctEl) wishPctEl.textContent = 'Your wishlist is ' + pct.toFixed(2) + '% of your ' + fmtMoney(grand) + ' net worth';
    } else {
      if (heroPctEl) { heroPctEl.textContent = '—'; heroPctEl.className = 'wish-hero-pct-num'; }
      if (heroFill) heroFill.style.width = '0%';
      if (wishPctEl) wishPctEl.textContent = 'Add accounts in Net Worth first to see this as a %';
    }
    if (wishCountEl) wishCountEl.textContent = items.length + (items.length === 1 ? ' item' : ' items');

    wishList.innerHTML = '';
    if (!items.length) { if (wishEmpty) wishEmpty.classList.remove('hidden'); return; }
    if (wishEmpty) wishEmpty.classList.add('hidden');

    items.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0)).forEach((it) => {
      const idx = items.indexOf(it);
      const cost = Number(it.amount) || 0;
      const pct = grand > 0 ? (cost / grand) * 100 : null;
      const cls = pct == null ? 'flat' : pctClass(pct);
      const pctText = pct == null ? '—' : pct.toFixed(2) + '%';
      const fillPct = Math.min(100, pct == null ? 0 : pct);
      const row = document.createElement('div');
      row.className = 'wish-row';
      row.innerHTML =
          '<div class="wish-row-h">'
        + '<div class="wish-row-info">'
        +   '<div class="wish-row-name">' + escapeHtml(it.name) + '</div>'
        +   '<div class="wish-row-meta">' + (it.entered_currency || 'CHF') + ' ' + Number(it.entered_amount != null ? it.entered_amount : it.amount).toLocaleString('en-US', {maximumFractionDigits: 2}) + ' · added ' + fmtActivityDate(it.ts || Date.now()) + '</div>'
        + '</div>'
        + '<div class="wish-row-amt-wrap">'
        +   '<div class="wish-row-amt">' + fmtMoney(cost) + '</div>'
        +   '<div class="wish-row-pct ' + cls + '">' + pctText + ' of NW</div>'
        + '</div>'
        + '<button class="wish-row-x" data-i="' + idx + '" aria-label="Remove">×</button>'
        + '</div>'
        + '<div class="wish-row-bar"><div class="wish-row-bar-fill ' + cls + '" style="width:' + fillPct + '%"></div></div>';
      wishList.appendChild(row);
    });
    wishList.querySelectorAll('.wish-row-x').forEach(b => {
      b.addEventListener('click', () => {
        const i = parseInt(b.dataset.i, 10);
        const arr = storeGet('wishlist') || [];
        arr.splice(i, 1);
        storeSet('wishlist', arr);
        renderWishlist();
      });
    });
  }
  function doWishAdd() {
    try {
      const nEl = document.getElementById('wishName');
      const aEl = document.getElementById('wishAmount');
      const cEl = document.getElementById('wishCurrency');
      if (!nEl || !aEl) return;
      const n = (nEl.value || '').trim();
      const aRaw = parseFloat(aEl.value);
      if (!n || isNaN(aRaw)) { nEl.focus(); return; }
      const enteredCcy = cEl ? cEl.value : 'CHF';
      const rate = exchangeRates[enteredCcy] || 1;
      const amountCHF = aRaw / rate;
      const arr = storeGet('wishlist') || [];
      arr.push({
        name: n, amount: amountCHF, ts: Date.now(),
        entered_amount: aRaw, entered_currency: enteredCcy
      });
      storeSet('wishlist', arr);
      nEl.value = ''; aEl.value = '';
      renderWishlist();
    } catch (e) { console.error('wishAdd failed', e); }
  }
  const _wishName   = document.getElementById('wishName');
  const _wishAmount = document.getElementById('wishAmount');
  if (_wishName)   _wishName.addEventListener('keydown', (e) => { if (e.key === 'Enter') doWishAdd(); });
  if (_wishAmount) _wishAmount.addEventListener('keydown', (e) => { if (e.key === 'Enter') doWishAdd(); });
  renderWishlist();

  // ============================================================
  // ADD-BUTTON BULLETPROOFING
  // ============================================================
  window.__addSub  = doSubAdd;
  window.__addWish = doWishAdd;
  function onDocClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('onclick')) return;
    if (t.id === 'subAddBtn')  { e.preventDefault(); doSubAdd();  }
    if (t.id === 'wishAddBtn') { e.preventDefault(); doWishAdd(); }
  }
  document.addEventListener('click', onDocClick);

  // ============================================================
  // INCOMING ORDERS
  // ============================================================
  function ordPctClass(pct) {
    if (pct < 5)  return 'good';
    if (pct < 25) return 'warn';
    return 'bad';
  }
  function ordFmtArrival(iso) {
    if (!iso) return null;
    const isoSafe = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T00:00' : iso;
    const d = new Date(isoSafe);
    if (isNaN(d)) return null;
    const now = new Date();
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((dayStart - todayStart) / 86400000);
    const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    let cls = '', prefix = '';
    if (diffDays < 0)        { cls = 'past';  prefix = 'late · '; }
    else if (diffDays === 0) { cls = 'today'; prefix = 'today · '; }
    else if (diffDays === 1) { cls = 'soon';  prefix = 'tomorrow · '; }
    else if (diffDays <= 7)  { cls = 'soon';  prefix = 'in ' + diffDays + 'd · '; }
    return { cls, label: prefix + dateLabel };
  }
  function listAllNwAccounts() {
    const out = [];
    NW_CATS.forEach(cat => {
      const items = storeGet('nw:' + cat.key) || [];
      items.forEach((it, idx) => {
        out.push({
          catKey: cat.key,
          itemIdx: idx,
          itemName: String(it.name || ''),
          amountCHF: Number(it.amount) || 0
        });
      });
    });
    return out;
  }
  function populateOrdFromSelect() {
    const sel = document.getElementById('ordFromCat');
    if (!sel) return;
    const accounts = listAllNwAccounts();
    const prev = sel.value;
    const ICONS = { bank: '🏦', stocks: '📈', crypto: '🪙', other: '💼' };
    if (!accounts.length) {
      sel.innerHTML = '<option value="">No accounts yet</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = accounts.map(a => {
      const value = a.catKey + '::' + a.itemName;
      return '<option value="' + value + '">' + ICONS[a.catKey] + ' ' + escapeHtml(a.itemName) + '</option>';
    }).join('');
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  }
  function renderOrders() {
    const list = document.getElementById('ordList');
    const empty = document.getElementById('ordEmpty');
    const count = document.getElementById('ordCount');
    if (!list) return;
    populateOrdFromSelect();
    const items = storeGet('incoming_orders') || [];
    const grand = nwGrandCHF();
    if (count) count.textContent = items.length + (items.length === 1 ? ' item' : ' items');
    list.innerHTML = '';
    if (!items.length) {
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    items.slice().sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    }).forEach(o => {
      const cost = Number(o.amount) || 0;
      const isDeducted = !!o.deductedAt;
      let pct, pctText, pctCls;
      if (isDeducted && typeof o.pctAtDeduction === 'number') {
        pct = o.pctAtDeduction;
        pctText = pct.toFixed(2) + '% of NW';
        pctCls = ordPctClass(pct) + ' frozen';
      } else if (grand > 0) {
        pct = (cost / grand) * 100;
        pctText = pct.toFixed(2) + '% of NW';
        pctCls = ordPctClass(pct);
      } else {
        pct = null;
        pctText = '— of NW';
        pctCls = '';
      }
      const fromMeta = ORD_FROM_META[o.fromCat] || ORD_FROM_META.bank;
      const fromAccountLabel = o.fromAccount ? escapeHtml(o.fromAccount) : fromMeta.name;
      const arr = ordFmtArrival(o.date);
      const arrHtml = arr
        ? '<span class="ord-meta-pill date ' + arr.cls + '">' + arr.label + '</span>'
        : '<span class="ord-meta-pill date">no arrival</span>';
      const row = document.createElement('div');
      row.className = 'ord-card cat-' + (o.fromCat || 'bank') + (isDeducted ? ' is-deducted' : '');
      const footHtml = isDeducted
        ? '<div class="ord-card-foot">'
          +   '<span class="ord-deducted-pill">Deducted from ' + escapeHtml(o.deductedFrom && o.deductedFrom.name ? o.deductedFrom.name : fromAccountLabel) + '</span>'
          +   '<button class="ord-deduct-undo" data-undo-id="' + o.id + '">Undo</button>'
          + '</div>'
        : '<div class="ord-card-foot">'
          +   '<button class="ord-deduct-btn" data-deduct-id="' + o.id + '">− Deduct from net worth</button>'
          + '</div>';
      row.innerHTML =
          '<div class="ord-card-h">'
        +   '<div class="ord-card-name">' + escapeHtml(o.name) + '</div>'
        +   '<div class="ord-card-amt">' + fmtMoney(cost) + '</div>'
        +   '<button class="ord-card-x" data-id="' + o.id + '" aria-label="Remove">×</button>'
        + '</div>'
        + '<div class="ord-card-meta">'
        +   '<span class="ord-meta-pill from">from · ' + fromAccountLabel + '</span>'
        +   '<span class="ord-meta-pill pct ' + pctCls + '">' + pctText + '</span>'
        +   arrHtml
        + '</div>'
        + footHtml;
      list.appendChild(row);
    });
    list.querySelectorAll('.ord-card-x').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        const arr = (storeGet('incoming_orders') || []).filter(x => x.id !== id);
        storeSet('incoming_orders', arr);
        renderOrders();
      });
    });
    list.querySelectorAll('.ord-deduct-btn').forEach(b => {
      b.addEventListener('click', () => openDeductChooser(b.dataset.deductId, b.closest('.ord-card')));
    });
    list.querySelectorAll('.ord-deduct-undo').forEach(b => {
      b.addEventListener('click', () => undoDeduct(b.dataset.undoId));
    });
  }
  function openDeductChooser(orderId, cardEl) {
    if (!cardEl) return;
    const existing = cardEl.querySelector('.ord-deduct-chooser');
    if (existing) { existing.remove(); return; }
    const order = (storeGet('incoming_orders') || []).find(x => x.id === orderId);
    if (!order) return;
    const accounts = listAllNwAccounts();
    if (!accounts.length) {
      alert('Add at least one net worth account before deducting.');
      return;
    }
    const ICONS = { bank: '🏦', stocks: '📈', crypto: '🪙', other: '💼' };
    const cost = Number(order.amount) || 0;
    const optsHtml = accounts.map(a => {
      const insufficient = a.amountCHF < cost - 0.005;
      const cls = 'ord-deduct-opt' + (insufficient ? ' insufficient' : '');
      return '<button class="' + cls + '" '
        + 'data-cat="' + a.catKey + '" '
        + 'data-name="' + escapeHtml(a.itemName) + '" '
        + (insufficient ? 'data-insuf="1" ' : '')
        + '>'
        + ICONS[a.catKey] + ' ' + escapeHtml(a.itemName)
        + '<small>' + fmtMoney(a.amountCHF) + (insufficient ? ' · not enough' : ' available') + '</small>'
        + '</button>';
    }).join('');
    const chooser = document.createElement('div');
    chooser.className = 'ord-deduct-chooser';
    chooser.innerHTML =
        '<div class="ord-deduct-chooser-title">Deduct ' + fmtMoney(cost) + ' from…</div>'
      + '<div class="ord-deduct-options">' + optsHtml + '</div>'
      + '<button class="ord-deduct-cancel" type="button">cancel</button>';
    cardEl.appendChild(chooser);
    chooser.querySelectorAll('.ord-deduct-opt').forEach(b => {
      b.addEventListener('click', () => {
        if (b.dataset.insuf === '1') {
          if (!confirm('That account doesn\'t have enough — deduct anyway? (it will go negative)')) return;
        }
        confirmDeduct(orderId, b.dataset.cat, b.dataset.name);
      });
    });
    chooser.querySelector('.ord-deduct-cancel').addEventListener('click', () => chooser.remove());
  }
  function confirmDeduct(orderId, catKey, itemName) {
    const orders = storeGet('incoming_orders') || [];
    const oIdx = orders.findIndex(x => x.id === orderId);
    if (oIdx < 0) return;
    const order = orders[oIdx];
    if (order.deductedAt) return;
    const items = storeGet('nw:' + catKey) || [];
    const itemIdx = items.findIndex(it => String(it.name) === String(itemName));
    if (itemIdx < 0) {
      alert('That account no longer exists. Refresh the chooser.');
      return;
    }
    const cost = Number(order.amount) || 0;
    const grandBefore = nwGrandCHF();
    const pctAtDeduction = grandBefore > 0 ? (cost / grandBefore) * 100 : 0;
    items[itemIdx].amount = (Number(items[itemIdx].amount) || 0) - cost;
    storeSet('nw:' + catKey, items);
    logActivity(catKey, items[itemIdx].name, -cost, 'edit');
    orders[oIdx] = {
      ...order,
      deductedAt: Date.now(),
      pctAtDeduction: pctAtDeduction,
      deductedFrom: { cat: catKey, name: items[itemIdx].name }
    };
    storeSet('incoming_orders', orders);
    renderAllNetWorth();
  }
  function undoDeduct(orderId) {
    const orders = storeGet('incoming_orders') || [];
    const oIdx = orders.findIndex(x => x.id === orderId);
    if (oIdx < 0) return;
    const order = orders[oIdx];
    if (!order.deductedAt || !order.deductedFrom) return;
    const cost = Number(order.amount) || 0;
    const items = storeGet('nw:' + order.deductedFrom.cat) || [];
    const itemIdx = items.findIndex(it => String(it.name) === String(order.deductedFrom.name));
    if (itemIdx >= 0) {
      items[itemIdx].amount = (Number(items[itemIdx].amount) || 0) + cost;
      storeSet('nw:' + order.deductedFrom.cat, items);
      logActivity(order.deductedFrom.cat, items[itemIdx].name, cost, 'edit');
    }
    orders[oIdx] = { ...order, deductedAt: null, pctAtDeduction: null, deductedFrom: null };
    storeSet('incoming_orders', orders);
    renderAllNetWorth();
  }
  function parseFromValue(v) {
    const s = String(v || '');
    const ix = s.indexOf('::');
    if (ix < 0) return { cat: 'bank', name: '' };
    return { cat: s.slice(0, ix), name: s.slice(ix + 2) };
  }
  function updateOrdPreview() {
    const costEl = document.getElementById('ordCost');
    const ccyEl  = document.getElementById('ordCurrency');
    const fromEl = document.getElementById('ordFromCat');
    const prev   = document.getElementById('ordAddPreview');
    if (!prev) return;
    const aRaw = parseFloat(costEl && costEl.value);
    if (!costEl || isNaN(aRaw) || aRaw <= 0) {
      prev.textContent = 'Type a cost — preview will show what % of net worth it takes.';
      prev.className = 'ord-add-preview';
      return;
    }
    const ccy = ccyEl ? ccyEl.value : 'CHF';
    const rate = exchangeRates[ccy] || 1;
    const amountCHF = aRaw / rate;
    const grand = nwGrandCHF();
    const parsed = parseFromValue(fromEl ? fromEl.value : '');
    const fromName = parsed.name || (ORD_FROM_META[parsed.cat] || ORD_FROM_META.bank).name;
    if (grand > 0) {
      const pct = (amountCHF / grand) * 100;
      const cls = ordPctClass(pct);
      prev.textContent = fmtMoney(amountCHF) + ' from ' + fromName + ' · ' + pct.toFixed(2) + '% of your ' + fmtMoney(grand) + ' net worth';
      prev.className = 'ord-add-preview ' + (cls === 'good' ? '' : cls);
    } else {
      prev.textContent = fmtMoney(amountCHF) + ' from ' + fromName + ' · add net worth first to see %';
      prev.className = 'ord-add-preview';
    }
  }
  function doOrdAdd() {
    try {
      const nEl = document.getElementById('ordName');
      const aEl = document.getElementById('ordCost');
      const cEl = document.getElementById('ordCurrency');
      const fEl = document.getElementById('ordFromCat');
      const dEl = document.getElementById('ordArrival');
      if (!nEl || !aEl) return;
      const n = (nEl.value || '').trim();
      const aRaw = parseFloat(aEl.value);
      if (!n || isNaN(aRaw)) { nEl.focus(); return; }
      const ccy = cEl ? cEl.value : 'CHF';
      const rate = exchangeRates[ccy] || 1;
      const amountCHF = aRaw / rate;
      const parsed = parseFromValue(fEl ? fEl.value : '');
      const arr = storeGet('incoming_orders') || [];
      arr.push({
        id: 'o_' + Date.now() + '_' + Math.floor(Math.random() * 9999),
        name: n,
        amount: amountCHF,
        entered_amount: aRaw,
        entered_currency: ccy,
        fromCat: parsed.cat || 'bank',
        fromAccount: parsed.name || null,
        date: dEl && dEl.value ? dEl.value : null,
        ts: Date.now(),
        deductedAt: null,
        pctAtDeduction: null,
        deductedFrom: null
      });
      storeSet('incoming_orders', arr);
      nEl.value = ''; aEl.value = '';
      if (dEl) dEl.value = '';
      updateOrdPreview();
      renderOrders();
    } catch (e) { console.error('ordAdd failed', e); }
  }
  window.__addOrder = doOrdAdd;
  ['ordCost','ordCurrency','ordFromCat'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateOrdPreview);
    if (el) el.addEventListener('change', updateOrdPreview);
  });
  ['ordName','ordCost'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doOrdAdd(); });
  });
  renderOrders();
  updateOrdPreview();

  // ============================================================
  // FINANCE TICKER
  // ============================================================
  function nextRenewalDate(isoDate, period) {
    const isoSafe = (typeof isoDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) ? isoDate + 'T00:00' : isoDate;
    let d = new Date(isoSafe);
    if (isNaN(d)) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let safety = 0;
    while (d < today && safety++ < 600) {
      if (period === 'weekly')      d.setDate(d.getDate() + 7);
      else if (period === 'yearly') d.setFullYear(d.getFullYear() + 1);
      else                          d.setMonth(d.getMonth() + 1);
    }
    return d;
  }
  function buildTickerEntries() {
    const subs = storeGet('subs') || [];
    const out = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    subs.forEach(s => {
      if (!s.renewal) return;
      const next = nextRenewalDate(s.renewal, s.period);
      if (!next) return;
      const days = Math.round((next.getTime() - today) / 86400000);
      out.push({
        name: s.name,
        amount: Number(s.amount) || 0,
        days,
        period: s.period
      });
    });
    out.sort((a, b) => a.days - b.days);
    return out;
  }
  let tickerIdx = 0;
  let tickerTimer = null;
  let tickerLastSig = '';
  let tickerLastEntries = [];
  function tickerSig(entries) {
    return entries.map(e => e.name + '|' + e.amount + '|' + e.days + '|' + (e.period || '')).join('~');
  }
  function paintTickerActive(wrap, stream, dots, entries) {
    if (tickerIdx >= entries.length) tickerIdx = 0;
    const items = stream.querySelectorAll('.ticker-item');
    const dotEls = dots.querySelectorAll('.ticker-dot');
    items.forEach((el, i) => el.classList.toggle('active', i === tickerIdx));
    dotEls.forEach((el, i) => el.classList.toggle('active', i === tickerIdx));
    const cur = entries[tickerIdx];
    wrap.classList.toggle('urgent', !!(cur && cur.days <= 5));
  }
  function renderTicker() {
    const wrap   = document.getElementById('financeTicker');
    const stream = document.getElementById('tickerStream');
    const dots   = document.getElementById('tickerDots');
    if (!wrap || !stream || !dots) return;
    const entries = buildTickerEntries();
    const sig = tickerSig(entries);
    if (sig === tickerLastSig) {
      if (entries.length) paintTickerActive(wrap, stream, dots, entries);
      return;
    }
    tickerLastSig = sig;
    tickerLastEntries = entries;
    if (!entries.length) {
      wrap.classList.add('hidden');
      stream.innerHTML = '';
      dots.innerHTML = '';
      if (tickerTimer) { clearInterval(tickerTimer); tickerTimer = null; }
      return;
    }
    wrap.classList.remove('hidden');
    if (tickerIdx >= entries.length) tickerIdx = 0;

    stream.innerHTML = entries.map((e, i) => {
      const daysLabel = e.days < 0
        ? Math.abs(e.days) + 'd late'
        : e.days === 0
          ? 'TODAY'
          : e.days === 1
            ? 'TOMORROW'
            : 'in ' + e.days + 'd';
      return '<div class="ticker-item' + (i === tickerIdx ? ' active' : '') + '" data-i="' + i + '">'
        +   '<span class="ticker-item-name">' + escapeHtml(e.name) + '</span>'
        +   '<span class="ticker-item-amt">' + fmtMoney(e.amount) + '</span>'
        +   '<span class="ticker-item-days">' + daysLabel + '</span>'
        + '</div>';
    }).join('');
    dots.innerHTML = entries.map((_, i) =>
      '<span class="ticker-dot' + (i === tickerIdx ? ' active' : '') + '"></span>'
    ).join('');
    paintTickerActive(wrap, stream, dots, entries);

    if (tickerTimer) { clearInterval(tickerTimer); tickerTimer = null; }
    if (entries.length > 1) {
      tickerTimer = setInterval(() => {
        if (!tickerLastEntries.length) return;
        tickerIdx = (tickerIdx + 1) % tickerLastEntries.length;
        const w = document.getElementById('financeTicker');
        const s = document.getElementById('tickerStream');
        const d = document.getElementById('tickerDots');
        if (w && s && d) paintTickerActive(w, s, d, tickerLastEntries);
      }, 5000);
    }
  }
  function safeRenderTicker() {
    try { renderTicker(); } catch (e) { console.error('ticker render failed', e); }
  }
  safeRenderTicker();
  const heartbeat = setInterval(safeRenderTicker, 1500);

  // ============================================================
  // CLEANUP — clear timers, the delegated click listener, and the
  // window globals so React unmount/SPA navigation doesn't leak.
  // ============================================================
  return function cleanup() {
    clearInterval(heartbeat);
    if (tickerTimer) { clearInterval(tickerTimer); tickerTimer = null; }
    document.removeEventListener('click', onDocClick);
    try {
      delete window.__addSub;
      delete window.__addWish;
      delete window.__addOrder;
    } catch (e) {}
  };
}
