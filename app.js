/* Suivi PEA — application de suivi de portefeuille à partir d'un CSV d'opérations */
(function () {
  'use strict';

  const LS_PRICES = 'suivi-pea:prices';
  const LS_CSV = 'suivi-pea:csv';
  const LS_PROJ = 'suivi-pea:projection';

  // ---------- Utilitaires ----------
  const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const num = (v, d = 2) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const pct = (v) => (v >= 0 ? '+' : '') + num(v * 100, 2) + ' %';
  const signed = (v) => (v >= 0 ? '+' : '') + eur.format(v);
  const cls = (v) => (v > 0.0001 ? 'pos' : v < -0.0001 ? 'neg' : '');
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const palette = () => ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'].map(css);
  const monthKey = (d) => d.slice(0, 7);
  const monthLabel = (k) => {
    const [y, m] = k.split('-');
    return new Date(+y, +m - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  };

  function storeGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function storeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
  }

  // ---------- Parsing CSV ----------
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQ = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQ = false;
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',' || c === ';') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((f) => f.trim() !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
    if (rows.length < 2) throw new Error('CSV vide');
    const head = rows[0].map((h) => h.trim());
    const required = ['date', 'type_operation', 'isin', 'quantite', 'montant_total_eur'];
    const missing = required.filter((r) => !head.includes(r));
    if (missing.length) throw new Error('Colonnes manquantes : ' + missing.join(', '));
    return rows.slice(1).map((r) => {
      const o = {};
      head.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
      o.quantite = parseFloat(o.quantite.replace(',', '.')) || 0;
      o.montant_total_eur = parseFloat(o.montant_total_eur.replace(',', '.')) || 0;
      o.prix_unitaire_eur = parseFloat((o.prix_unitaire_eur || '').replace(',', '.')) || (o.quantite ? o.montant_total_eur / o.quantite : 0);
      o.isVente = /vente/i.test(o.type_operation);
      o.ticker = o.ticker || o.isin;
      o.nom = o.nom || o.libelle_courtier || o.ticker;
      return o;
    }).sort((a, b) => a.date.localeCompare(b.date) || (+a.id || 0) - (+b.id || 0));
  }

  // ---------- Calcul des positions (méthode du PRU) ----------
  function computePositions(ops) {
    const map = new Map();
    for (const o of ops) {
      let p = map.get(o.isin);
      if (!p) {
        p = { isin: o.isin, ticker: o.ticker, yahoo: o.symbole_yahoo, nom: o.nom, type_actif: o.type_actif,
          categorie: o.categorie || 'Autre', zone_geo: o.zone_geo || 'Autre',
          qty: 0, cost: 0, realized: 0, bought: 0, sold: 0, lastPrice: 0, lastDate: '', first: o.date };
        map.set(o.isin, p);
      }
      if (o.isVente) {
        const pru = p.qty ? p.cost / p.qty : 0;
        const q = Math.min(o.quantite, p.qty);
        p.realized += o.montant_total_eur - pru * q;
        p.cost -= pru * q;
        p.qty -= q;
        p.sold += o.montant_total_eur;
      } else {
        p.qty += o.quantite;
        p.cost += o.montant_total_eur;
        p.bought += o.montant_total_eur;
      }
      if (p.qty < 1e-9) { p.qty = 0; p.cost = 0; }
      p.lastPrice = o.prix_unitaire_eur;
      p.lastDate = o.date;
    }
    return [...map.values()];
  }

  // ---------- État ----------
  let ops = [];
  let positions = [];
  let prices = storeGet(LS_PRICES, {});
  const charts = {};
  let allocKey = 'categorie';

  const currentPrice = (p) => (prices[p.isin] > 0 ? prices[p.isin] : p.lastPrice);

  function load(csvText) {
    ops = parseCSV(csvText);
    positions = computePositions(ops);
    renderAll();
  }

  // ---------- Rendu : Suivi ----------
  function totals() {
    const open = positions.filter((p) => p.qty > 0);
    const value = open.reduce((s, p) => s + p.qty * currentPrice(p), 0);
    const cost = open.reduce((s, p) => s + p.cost, 0);
    const realized = positions.reduce((s, p) => s + p.realized, 0);
    const deposits = ops.reduce((s, o) => s + (o.isVente ? -o.montant_total_eur : o.montant_total_eur), 0);
    return { open, value, cost, realized, latent: value - cost, deposits };
  }

  function renderKpis() {
    const t = totals();
    const total = t.latent + t.realized;
    const first = ops[0] ? new Date(ops[0].date).toLocaleDateString('fr-FR') : '–';
    $('#subtitle').textContent = `${ops.length} opérations depuis le ${first}`;
    $('#kpis').innerHTML = [
      kpi('Valeur du portefeuille', eur.format(t.value), `${t.open.length} lignes en portefeuille`),
      kpi('Montant investi (PRU)', eur.format(t.cost), `Apport net : ${eur.format(t.deposits)}`),
      kpi('Plus-value latente', `<span class="${cls(t.latent)}">${signed(t.latent)}</span>`,
        `<span class="${cls(t.latent)}">${t.cost ? pct(t.latent / t.cost) : '–'}</span>`),
      kpi('Plus-value réalisée', `<span class="${cls(t.realized)}">${signed(t.realized)}</span>`, 'Sur les ventes'),
      kpi('Performance totale', `<span class="${cls(total)}">${signed(total)}</span>`,
        `<span class="${cls(total)}">${t.deposits ? pct(total / t.deposits) : '–'}</span> de l'apport net`),
    ].join('');
  }
  const kpi = (label, value, sub) => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub muted">${sub || ''}</div></div>`;

  function monthRange(start, end) {
    const out = [];
    let [y, m] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  function buildHistory() {
    if (!ops.length) return { months: [], invested: [], value: [], flows: [] };
    const nowKey = monthKey(new Date().toISOString());
    const lastOp = monthKey(ops[ops.length - 1].date);
    const months = monthRange(monthKey(ops[0].date), nowKey > lastOp ? nowKey : lastOp);
    const qty = {}, last = {};
    let invested = 0, i = 0;
    const res = { months, invested: [], value: [], buys: [], sells: [] };
    months.forEach((mk, idx) => {
      let buys = 0, sells = 0;
      while (i < ops.length && monthKey(ops[i].date) === mk) {
        const o = ops[i++];
        qty[o.isin] = (qty[o.isin] || 0) + (o.isVente ? -o.quantite : o.quantite);
        last[o.isin] = o.prix_unitaire_eur;
        if (o.isVente) { invested -= o.montant_total_eur; sells += o.montant_total_eur; }
        else { invested += o.montant_total_eur; buys += o.montant_total_eur; }
      }
      const isLast = idx === months.length - 1;
      let v = 0;
      for (const isin in qty) {
        if (qty[isin] <= 1e-9) continue;
        const p = positions.find((x) => x.isin === isin);
        v += qty[isin] * (isLast && p ? currentPrice(p) : last[isin]);
      }
      res.invested.push(+invested.toFixed(2));
      res.value.push(+v.toFixed(2));
      res.buys.push(+buys.toFixed(2));
      res.sells.push(+(-sells).toFixed(2));
    });
    return res;
  }

  function baseChartOptions() {
    const text = css('--muted'), grid = css('--border');
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: text, usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label} : ${eur.format(c.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: text, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
        y: { ticks: { color: text, callback: (v) => eur0.format(v) }, grid: { color: grid } },
      },
    };
  }

  function setChart(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }

  function renderHistory() {
    const h = buildHistory();
    const labels = h.months.map(monthLabel);
    const c1 = css('--c1'), c8 = css('--c8');
    setChart('historyChart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Valeur estimée', data: h.value, borderColor: c1, backgroundColor: css('--accent-soft'), fill: true, tension: 0.25, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
          { label: 'Apport net cumulé', data: h.invested, borderColor: c8, borderDash: [5, 4], fill: false, stepped: true, pointRadius: 0, borderWidth: 1.5 },
        ],
      },
      options: baseChartOptions(),
    });

    const flowOpts = baseChartOptions();
    flowOpts.scales.x.stacked = true;
    flowOpts.scales.y.stacked = true;
    setChart('flowChart', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Achats', data: h.buys, backgroundColor: css('--c3'), borderRadius: 3 },
          { label: 'Ventes', data: h.sells, backgroundColor: css('--neg'), borderRadius: 3 },
        ],
      },
      options: flowOpts,
    });
  }

  function renderAlloc() {
    const groups = {};
    for (const p of positions) {
      if (p.qty <= 0) continue;
      const k = p[allocKey] || 'Autre';
      groups[k] = (groups[k] || 0) + p.qty * currentPrice(p);
    }
    const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, e) => s + e[1], 0);
    const pal = palette();
    setChart('allocChart', {
      type: 'doughnut',
      data: {
        labels: entries.map((e) => e[0]),
        datasets: [{ data: entries.map((e) => +e[1].toFixed(2)), backgroundColor: entries.map((_, i) => pal[i % pal.length]), borderColor: css('--surface'), borderWidth: 2 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { color: css('--text'), usePointStyle: true, boxWidth: 8,
            generateLabels: (chart) => chart.data.labels.map((l, i) => ({
              text: `${l}  ${num(chart.data.datasets[0].data[i] / total * 100, 1)} %`,
              fillStyle: chart.data.datasets[0].backgroundColor[i], strokeStyle: 'transparent', fontColor: css('--text'), index: i, pointStyle: 'circle',
            })) } },
          tooltip: { callbacks: { label: (c) => `${c.label} : ${eur.format(c.parsed)} (${num(c.parsed / total * 100, 1)} %)` } },
        },
      },
    });
  }

  function renderPositions() {
    const t = totals();
    const rows = t.open.sort((a, b) => b.qty * currentPrice(b) - a.qty * currentPrice(a)).map((p) => {
      const cp = currentPrice(p);
      const val = p.qty * cp;
      const pv = val - p.cost;
      const edited = prices[p.isin] > 0;
      return `<tr>
        <td><div class="name"><strong>${esc(p.ticker)}</strong><small>${esc(p.nom)}</small></div></td>
        <td class="left"><span class="badge">${esc(p.categorie)}</span></td>
        <td>${num(p.qty, p.qty % 1 ? 4 : 0)}</td>
        <td>${eur.format(p.cost / p.qty)}</td>
        <td><input class="price-input ${edited ? 'edited' : ''}" type="number" step="0.01" min="0" data-isin="${esc(p.isin)}" value="${cp.toFixed(cp < 10 ? 4 : 2)}" title="${edited ? 'Cours saisi manuellement' : 'Dernier prix d\'achat connu (' + p.lastDate + ')'}"></td>
        <td>${eur.format(p.cost)}</td>
        <td><strong>${eur.format(val)}</strong></td>
        <td class="${cls(pv)}">${signed(pv)}</td>
        <td class="${cls(pv)}">${pct(pv / p.cost)}</td>
        <td>${t.value ? num(val / t.value * 100, 1) + ' %' : '–'}</td>
      </tr>`;
    }).join('');
    $('#positionsTable').innerHTML = `
      <thead><tr><th>Ligne</th><th class="left">Catégorie</th><th>Qté</th><th>PRU</th><th>Cours actuel</th><th>Investi</th><th>Valeur</th><th>+/- value</th><th>Perf.</th><th>Poids</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td><td></td><td></td><td></td><td><button class="btn ghost" id="resetPrices" style="font-size:12px;padding:3px 8px">Réinitialiser</button></td>
        <td>${eur.format(t.cost)}</td><td>${eur.format(t.value)}</td>
        <td class="${cls(t.latent)}">${signed(t.latent)}</td><td class="${cls(t.latent)}">${t.cost ? pct(t.latent / t.cost) : '–'}</td><td>100 %</td></tr></tfoot>`;

    const closed = positions.filter((p) => p.qty <= 0 && p.sold > 0).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
    const realized = closed.reduce((s, p) => s + p.realized, 0);
    $('#closedTable').innerHTML = closed.length ? `
      <thead><tr><th>Ligne</th><th class="left">Catégorie</th><th class="left">Période</th><th>Total acheté</th><th>Total vendu</th><th>+/- value réalisée</th><th>Perf.</th></tr></thead>
      <tbody>${closed.map((p) => `<tr>
        <td><div class="name"><strong>${esc(p.ticker)}</strong><small>${esc(p.nom)}</small></div></td>
        <td class="left"><span class="badge">${esc(p.categorie)}</span></td>
        <td class="left muted">${fmtDate(p.first)} → ${fmtDate(p.lastDate)}</td>
        <td>${eur.format(p.bought)}</td><td>${eur.format(p.sold)}</td>
        <td class="${cls(p.realized)}">${signed(p.realized)}</td>
        <td class="${cls(p.realized)}">${pct(p.realized / (p.sold - p.realized))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td></td><td></td><td></td><td></td><td class="${cls(realized)}">${signed(realized)}</td><td></td></tr></tfoot>`
      : '<tbody><tr><td class="muted">Aucune position soldée</td></tr></tbody>';
  }
  const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR');

  function refreshValuation() {
    storeSet(LS_PRICES, prices);
    renderKpis();
    renderHistory();
    renderAlloc();
    renderPositions();
    syncStartCapital(false);
    renderProjection();
  }

  // ---------- Rendu : Opérations ----------
  function renderOps() {
    const q = $('#opSearch').value.trim().toLowerCase();
    const type = $('#opType').value;
    const list = ops.filter((o) => (!type || o.type_operation === type) &&
      (!q || [o.nom, o.ticker, o.isin, o.libelle_courtier].join(' ').toLowerCase().includes(q))).slice().reverse();
    $('#opsTable').innerHTML = `
      <thead><tr><th>Date</th><th class="left">Type</th><th class="left">Ligne</th><th class="left">ISIN</th><th>Qté</th><th>Prix unitaire</th><th>Montant</th></tr></thead>
      <tbody>${list.map((o) => `<tr>
        <td>${fmtDate(o.date)}</td>
        <td class="left"><span class="badge ${o.isVente ? 'sell' : 'buy'}">${esc(o.type_operation)}</span></td>
        <td class="left"><div class="name"><strong>${esc(o.ticker)}</strong><small>${esc(o.nom)}</small></div></td>
        <td class="left muted">${esc(o.isin)}</td>
        <td>${num(o.quantite, o.quantite % 1 ? 4 : 0)}</td>
        <td>${eur.format(o.prix_unitaire_eur)}</td>
        <td class="${o.isVente ? 'neg' : ''}">${o.isVente ? '−' : ''}${eur.format(o.montant_total_eur)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="6">${list.length} opération(s)</td><td>${eur.format(list.reduce((s, o) => s + (o.isVente ? -1 : 1) * o.montant_total_eur, 0))}</td></tr></tfoot>`;
  }

  // ---------- Projection ----------
  const proj = Object.assign({ dca: null, rate: 7, years: 15, start: null, startEdited: false }, storeGet(LS_PROJ, {}));

  function averageMonthlyDca() {
    // Moyenne des achats nets des 12 derniers mois
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate()).toISOString().slice(0, 10);
    const recent = ops.filter((o) => o.date >= from);
    const net = recent.reduce((s, o) => s + (o.isVente ? -o.montant_total_eur : o.montant_total_eur), 0);
    return Math.max(0, net / 12);
  }

  function syncStartCapital(force) {
    if (force || !proj.startEdited || proj.start == null) {
      proj.start = Math.round(totals().value * 100) / 100;
      proj.startEdited = false;
    }
    $('#startInput').value = proj.start;
  }

  function simulate(start, dca, ratePct, years) {
    const rm = Math.pow(1 + ratePct / 100, 1 / 12) - 1;
    let v = start, paid = start;
    const out = [{ year: 0, value: v, paid }];
    for (let m = 1; m <= years * 12; m++) {
      v = v * (1 + rm) + dca;
      paid += dca;
      if (m % 12 === 0) out.push({ year: m / 12, value: v, paid });
    }
    return out;
  }

  function bindPair(rangeSel, inputSel, key, parse) {
    const r = $(rangeSel), i = $(inputSel);
    const set = (v, from) => {
      if (!isFinite(v)) return;
      proj[key] = v;
      if (from !== r) r.value = v;
      if (from !== i) i.value = v;
      highlightPresets();
      saveProj();
      renderProjection();
    };
    r.addEventListener('input', () => set(parse(r.value), r));
    i.addEventListener('input', () => { if (i.value !== '') set(parse(i.value), i); });
    return set;
  }

  let setters = {};
  function initProjection() {
    if (proj.dca == null) proj.dca = Math.round(averageMonthlyDca() / 10) * 10 || 100;
    setters.dca = bindPair('#dcaRange', '#dcaInput', 'dca', (v) => Math.max(0, parseFloat(v)));
    setters.rate = bindPair('#rateRange', '#rateInput', 'rate', (v) => parseFloat(v));
    setters.years = bindPair('#yearsRange', '#yearsInput', 'years', (v) => Math.max(1, Math.min(60, Math.round(parseFloat(v)))));
    ['dca', 'rate', 'years'].forEach((k) => {
      $(`#${k}Range`).value = proj[k];
      $(`#${k}Input`).value = proj[k];
    });
    document.querySelectorAll('.presets').forEach((box) => {
      box.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) setters[box.dataset.target](parseFloat(b.dataset.v));
      });
    });
    $('#startInput').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (!isFinite(v)) return;
      proj.start = Math.max(0, v);
      proj.startEdited = true;
      saveProj();
      renderProjection();
    });
    $('#startReset').addEventListener('click', () => { syncStartCapital(true); saveProj(); renderProjection(); });
    highlightPresets();
  }

  function highlightPresets() {
    document.querySelectorAll('.presets').forEach((box) => {
      box.querySelectorAll('button').forEach((b) => b.classList.toggle('active', parseFloat(b.dataset.v) === proj[box.dataset.target]));
    });
  }
  const saveProj = () => storeSet(LS_PROJ, proj);

  function renderProjection() {
    if (!ops.length) return;
    const { dca, rate, years, start } = proj;
    const avg = averageMonthlyDca();
    $('#dcaHint').innerHTML = `Votre DCA moyen sur 12 mois : <strong>${eur.format(avg)}</strong>/mois`;

    const base = simulate(start, dca, rate, years);
    const low = simulate(start, dca, rate - 2, years);
    const high = simulate(start, dca, rate + 2, years);
    const end = base[base.length - 1];
    const gains = end.value - end.paid;
    const yearNow = new Date().getFullYear();

    $('#projKpis').innerHTML = [
      kpi(`Capital estimé en ${yearNow + years}`, eur0.format(end.value), `Dans ${years} an${years > 1 ? 's' : ''} à ${num(rate, 1)} %/an`),
      kpi('Total versé', eur0.format(end.paid), `${eur0.format(start)} de départ + ${eur0.format(dca * 12 * years)} de DCA`),
      kpi('Intérêts composés', `<span class="${cls(gains)}">${(gains >= 0 ? '+' : '') + eur0.format(gains)}</span>`,
        `${end.value ? num(gains / end.value * 100, 1) : 0} % du capital final`),
      kpi('Fourchette ±2 pts', `${eur0.format(low[low.length - 1].value)} – ${eur0.format(high[high.length - 1].value)}`, `${num(rate - 2, 1)} % à ${num(rate + 2, 1)} %/an`),
    ].join('');

    const labels = base.map((p) => String(yearNow + p.year));
    const opts = baseChartOptions();
    opts.plugins.legend.labels.filter = (item) => !item.text.startsWith('_');
    opts.plugins.tooltip.filter = (item) => !item.dataset.label.startsWith('_');
    setChart('projChart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '_haut', data: high.map((p) => +p.value.toFixed(0)), borderColor: 'transparent', backgroundColor: css('--accent-soft'), fill: '+1', pointRadius: 0 },
          { label: '_bas', data: low.map((p) => +p.value.toFixed(0)), borderColor: 'transparent', fill: false, pointRadius: 0 },
          { label: `Valeur projetée (${num(rate, 1)} %)`, data: base.map((p) => +p.value.toFixed(0)), borderColor: css('--c1'), borderWidth: 2.5, tension: 0.2, pointRadius: 0, pointHoverRadius: 4, fill: false },
          { label: 'Total versé', data: base.map((p) => +p.paid.toFixed(0)), borderColor: css('--c8'), borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
        ],
      },
      options: opts,
    });

    $('#projTable').innerHTML = `
      <thead><tr><th>Année</th><th>Versé dans l'année</th><th>Total versé</th><th>Intérêts cumulés</th><th>Capital estimé</th><th>Bas (${num(rate - 2, 1)} %)</th><th>Haut (${num(rate + 2, 1)} %)</th></tr></thead>
      <tbody>${base.slice(1).map((p, i) => `<tr>
        <td>${yearNow + p.year}</td><td>${eur0.format(dca * 12)}</td><td>${eur0.format(p.paid)}</td>
        <td class="${cls(p.value - p.paid)}">${eur0.format(p.value - p.paid)}</td>
        <td><strong>${eur0.format(p.value)}</strong></td>
        <td class="muted">${eur0.format(low[i + 1].value)}</td><td class="muted">${eur0.format(high[i + 1].value)}</td></tr>`).join('')}</tbody>`;
  }

  // ---------- Global ----------
  function renderAll() {
    renderKpis();
    renderHistory();
    renderAlloc();
    renderPositions();
    renderOps();
    syncStartCapital(false);
    renderProjection();
  }

  function initEvents() {
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab));
      Object.values(charts).forEach((c) => c.resize());
    }));

    $('#allocSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      allocKey = b.dataset.key;
      $('#allocSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      renderAlloc();
    });

    $('#positionsTable').addEventListener('change', (e) => {
      if (e.target.matches('.price-input')) {
        const v = parseFloat(e.target.value);
        if (v > 0) prices[e.target.dataset.isin] = v; else delete prices[e.target.dataset.isin];
        refreshValuation();
      }
    });
    $('#positionsTable').addEventListener('click', (e) => {
      if (e.target.id === 'resetPrices') { prices = {}; refreshValuation(); }
    });

    $('#opSearch').addEventListener('input', renderOps);
    $('#opType').addEventListener('change', renderOps);

    $('#csvInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          load(reader.result);
          try { localStorage.setItem(LS_CSV, reader.result); } catch (err) { /* trop gros ou indisponible */ }
        } catch (err) {
          alert('Impossible de lire ce fichier : ' + err.message);
        }
      };
      reader.readAsText(f, 'utf-8');
      e.target.value = '';
    });

    // Re-rendu des graphiques si le thème clair/sombre change
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { renderHistory(); renderAlloc(); renderProjection(); });
    }
  }

  function start() {
    initEvents();
    let csv = null;
    try { csv = localStorage.getItem(LS_CSV); } catch (e) { /* ignore */ }
    try { load(csv || window.DEFAULT_CSV); }
    catch (e) { load(window.DEFAULT_CSV); }
    initProjection();
    renderProjection();
  }

  if (typeof Chart === 'undefined') {
    document.querySelector('main').insertAdjacentHTML('afterbegin', '<div class="card neg">Chart.js n\'a pas pu être chargé (connexion internet requise pour les graphiques).</div>');
    window.Chart = function () { return { destroy() {}, resize() {} }; };
  }
  start();
})();
