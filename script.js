/**
 * script.js — Sales Analytics Dashboard
 *
 * Architecture:
 *  1. Load JSON data once via fetch()
 *  2. Apply filters → produce a filtered dataset
 *  3. Compute all KPIs and chart datasets from filtered data
 *  4. Render / update all charts
 *
 * No external libraries beyond Chart.js (loaded in index.html).
 */

'use strict';

/* ============================================================
   GLOBAL STATE
   ============================================================ */

/** Holds all raw records loaded from sales_data.json */
let RAW_DATA = [];

/** Map of Chart.js instances, keyed by canvas id */
const CHARTS = {};

/** Current active filter values */
const FILTERS = {
  region:       '',
  category:     '',
  customerType: '',
  channel:      ''
};

/* ============================================================
   COLOUR PALETTE
   Consistent palette used across all charts
   ============================================================ */
const PALETTE = {
  blue:    ['#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'],
  green:   ['#10b981', '#059669', '#047857'],
  purple:  ['#8b5cf6', '#7c3aed', '#6d28d9'],
  amber:   ['#f59e0b', '#d97706', '#b45309'],
  rose:    ['#f43f5e', '#e11d48', '#be123c'],
  teal:    ['#14b8a6', '#0d9488', '#0f766e'],
  multi:   ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#14b8a6', '#6366f1', '#ec4899'],
};

/** Returns a colour at index from a palette array, cycling if needed */
function clr(palette, index = 0) {
  return palette[index % palette.length];
}

/* ============================================================
   CHART.JS GLOBAL DEFAULTS
   ============================================================ */
Chart.defaults.font.family = '-apple-system, "Segoe UI", system-ui, sans-serif';
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#6b7280';
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding  = 12;

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

/**
 * Format a number as compact currency (e.g. 1,234,567 → $1.23M)
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(2) + 'M';
  if (value >= 1_000)     return '$' + (value / 1_000).toFixed(1) + 'K';
  return '$' + value.toFixed(2);
}

/**
 * Format a large number with thousand separators
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
  return value.toLocaleString('en-US');
}

/**
 * Group array of objects by a key, summing a numeric value field
 * @param {object[]} data
 * @param {string} groupKey   - field to group on
 * @param {string} valueField - numeric field to sum
 * @returns {{ labels: string[], values: number[] }}
 */
function groupSum(data, groupKey, valueField) {
  const map = {};
  data.forEach(row => {
    const key = row[groupKey] || 'Unknown';
    map[key] = (map[key] || 0) + parseFloat(row[valueField] || 0);
  });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return {
    labels: sorted.map(e => e[0]),
    values: sorted.map(e => e[1])
  };
}

/**
 * Group array of objects by a key, counting occurrences
 * @param {object[]} data
 * @param {string} groupKey
 * @returns {{ labels: string[], values: number[] }}
 */
function groupCount(data, groupKey) {
  const map = {};
  data.forEach(row => {
    const key = row[groupKey] || 'Unknown';
    map[key] = (map[key] || 0) + 1;
  });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return {
    labels: sorted.map(e => e[0]),
    values: sorted.map(e => e[1])
  };
}

/* ============================================================
   DATA LOADING
   ============================================================ */

/**
 * Fetch sales data from the local JSON file.
 * On success, initialises the dashboard.
 */
async function loadData() {
  try {
    const res = await fetch('sales_data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    RAW_DATA = await res.json();

    // Show total record count in header badge
    document.getElementById('totalRecords').textContent = formatNumber(RAW_DATA.length);

    // Show last-updated timestamp
    const now = new Date();
    document.getElementById('lastUpdated').textContent =
      'Updated: ' + now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Initial render with no filters
    updateDashboard();
  } catch (err) {
    console.error('Failed to load sales_data.json:', err);
    alert('Error: Could not load sales_data.json. Make sure the file exists in the same folder and you are serving via a web server.');
  } finally {
    // Hide loading overlay
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.add('hidden');
    setTimeout(() => { overlay.style.display = 'none'; }, 400);
  }
}

/* ============================================================
   FILTERING
   ============================================================ */

/**
 * Apply current FILTERS to RAW_DATA and return the filtered subset.
 * @returns {object[]}
 */
function getFilteredData() {
  return RAW_DATA.filter(row => {
    if (FILTERS.region       && row.Region           !== FILTERS.region)       return false;
    if (FILTERS.category     && row.Product_Category !== FILTERS.category)     return false;
    if (FILTERS.customerType && row.Customer_Type    !== FILTERS.customerType) return false;
    if (FILTERS.channel      && row.Sales_Channel    !== FILTERS.channel)      return false;
    return true;
  });
}

/* ============================================================
   KPI CALCULATION & RENDERING
   ============================================================ */

/**
 * Calculate and render the four KPI cards.
 * @param {object[]} data - filtered dataset
 */
function renderKPIs(data) {
  const totalRevenue     = data.reduce((s, r) => s + parseFloat(r.Sales_Amount || 0), 0);
  const totalTransactions = data.length;
  const totalQty         = data.reduce((s, r) => s + parseInt(r.Quantity_Sold || 0), 0);
  const avgDiscount      = data.length
    ? data.reduce((s, r) => s + parseFloat(r.Discount || 0), 0) / data.length
    : 0;

  document.getElementById('kpiRevenue').textContent      = formatCurrency(totalRevenue);
  document.getElementById('kpiTransactions').textContent = formatNumber(totalTransactions);
  document.getElementById('kpiQuantity').textContent     = formatNumber(totalQty);
  document.getElementById('kpiDiscount').textContent     = (avgDiscount * 100).toFixed(1) + '%';

  // Sub-labels showing averages or per-unit metrics
  document.getElementById('kpiRevenueChange').textContent =
    'Avg/tx: ' + formatCurrency(totalTransactions ? totalRevenue / totalTransactions : 0);
  document.getElementById('kpiTransactionsChange').textContent =
    'Avg qty/tx: ' + (totalTransactions ? (totalQty / totalTransactions).toFixed(1) : 0);
  document.getElementById('kpiQuantityChange').textContent =
    'Avg/tx: ' + (totalTransactions ? (totalQty / totalTransactions).toFixed(1) : 0) + ' units';
  document.getElementById('kpiDiscountChange').textContent =
    'Min: ' + (Math.min(...data.map(r => parseFloat(r.Discount || 0))) * 100).toFixed(0) +
    '% · Max: ' + (Math.max(...data.map(r => parseFloat(r.Discount || 0))) * 100).toFixed(0) + '%';
}

/* ============================================================
   CHART HELPERS
   ============================================================ */

/**
 * Destroy an existing Chart.js instance if it exists, then create a new one.
 * This avoids the "Canvas already in use" error on filter updates.
 * @param {string} id        - canvas element id
 * @param {object} config    - Chart.js configuration object
 */
function renderChart(id, config) {
  if (CHARTS[id]) {
    CHARTS[id].destroy();
  }
  const ctx = document.getElementById(id).getContext('2d');
  CHARTS[id] = new Chart(ctx, config);
}

/** Shared tooltip styling applied to all charts */
const TOOLTIP_STYLE = {
  backgroundColor: '#1e293b',
  titleColor:      '#f8fafc',
  bodyColor:       '#cbd5e1',
  borderColor:     '#334155',
  borderWidth:     1,
  padding:         10,
  cornerRadius:    8,
  displayColors:   true,
};

/* ============================================================
   INDIVIDUAL CHART RENDERERS
   ============================================================ */

/* ---- 1. Sales Trend (Monthly Line Chart) ---- */
function renderSalesTrend(data) {
  // Aggregate sales by year-month
  const monthMap = {};
  data.forEach(row => {
    const d = new Date(row.Sale_Date);
    if (isNaN(d)) return;
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    monthMap[key] = (monthMap[key] || 0) + parseFloat(row.Sales_Amount || 0);
  });
  const sorted = Object.keys(monthMap).sort();
  const values = sorted.map(k => monthMap[k]);

  renderChart('chartSalesTrend', {
    type: 'line',
    data: {
      labels: sorted,
      datasets: [{
        label: 'Monthly Revenue',
        data: values,
        borderColor:     PALETTE.blue[0],
        backgroundColor: 'rgba(59,130,246,0.08)',
        borderWidth:     2.5,
        pointRadius:     3,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.35,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => ' $' + ctx.parsed.y.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            callback: v => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v)
          }
        }
      }
    }
  });
}

/* ---- 2. Revenue per Region (Polar Area Chart) ---- */
function renderRevenueRegion(data) {
  const { labels, values } = groupSum(data, 'Region', 'Sales_Amount');

  // Semi-transparent fills consistent with dashboard palette
  const bgColors = [
    'rgba(59,130,246,0.65)',   // blue   — East
    'rgba(16,185,129,0.65)',   // green  — North
    'rgba(139,92,246,0.65)',   // purple — South
    'rgba(245,158,11,0.65)',   // amber  — West
  ].slice(0, labels.length);

  const borderColors = [
    '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b',
  ].slice(0, labels.length);

  renderChart('chartRevenueRegion', {
    type: 'polarArea',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: bgColors,
        borderColor:     borderColors,
        borderWidth: 2,
        hoverBackgroundColor: borderColors,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 12 }
        },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => ' ' + ctx.label + ': ' + formatCurrency(ctx.parsed.r)
          }
        }
      },
      scales: {
        r: {
          ticks: {
            backdropColor: 'transparent',
            color: '#9ca3af',
            font: { size: 10 },
            callback: v => formatCurrency(v)
          },
          grid:        { color: '#e5e7eb' },
          angleLines:  { color: '#e5e7eb' },
        }
      }
    }
  });
}

/* ---- 3. Revenue per Product Category (Doughnut) ---- */
function renderRevenueCategory(data) {
  const { labels, values } = groupSum(data, 'Product_Category', 'Sales_Amount');

  renderChart('chartRevenueCategory', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PALETTE.multi.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => ' ' + formatCurrency(ctx.parsed) + ' (' +
              ((ctx.parsed / values.reduce((a, b) => a + b, 0)) * 100).toFixed(1) + '%)'
          }
        }
      }
    }
  });
}

/* ---- 4. Sales per Sales Representative (Vertical Bar) ---- */
function renderSalesRep(data) {
  const { labels, values } = groupSum(data, 'Sales_Rep', 'Sales_Amount');

  renderChart('chartSalesRep', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: PALETTE.purple.concat(PALETTE.blue).slice(0, labels.length),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => ' ' + formatCurrency(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: { callback: v => formatCurrency(v) }
        }
      }
    }
  });
}

/* ---- 5. Customer Type Distribution (Pie) ---- */
function renderCustomerType(data) {
  const { labels, values } = groupCount(data, 'Customer_Type');

  renderChart('chartCustomerType', {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [PALETTE.blue[0], PALETTE.green[0]],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => ' ' + ctx.label + ': ' + ctx.parsed +
              ' (' + ((ctx.parsed / values.reduce((a, b) => a + b, 0)) * 100).toFixed(1) + '%)'
          }
        }
      }
    }
  });
}

/* ---- 6. Payment Method Usage (Pie) ---- */
function renderPaymentMethod(data) {
  const { labels, values } = groupCount(data, 'Payment_Method');

  renderChart('chartPaymentMethod', {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [PALETTE.amber[0], PALETTE.purple[0], PALETTE.teal[0]],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => ' ' + ctx.label + ': ' + ctx.parsed +
              ' (' + ((ctx.parsed / values.reduce((a, b) => a + b, 0)) * 100).toFixed(1) + '%)'
          }
        }
      }
    }
  });
}

/* ---- 7. Sales Channel Distribution (Pie) ---- */
function renderSalesChannel(data) {
  const { labels, values } = groupCount(data, 'Sales_Channel');

  renderChart('chartSalesChannel', {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [PALETTE.rose[0], PALETTE.blue[1]],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => ' ' + ctx.label + ': ' + ctx.parsed +
              ' (' + ((ctx.parsed / values.reduce((a, b) => a + b, 0)) * 100).toFixed(1) + '%)'
          }
        }
      }
    }
  });
}

/* ---- 8. Discount vs Sales Amount (Scatter Plot) ---- */
function renderScatter(data) {
  // Sample up to 400 points for performance
  const sample = data.length > 400
    ? data.filter((_, i) => i % Math.ceil(data.length / 400) === 0)
    : data;

  const points = sample.map(r => ({
    x: parseFloat(r.Discount || 0) * 100,   // convert to percentage
    y: parseFloat(r.Sales_Amount || 0)
  }));

  renderChart('chartScatter', {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Sales',
        data: points,
        backgroundColor: 'rgba(59,130,246,0.35)',
        borderColor:     'rgba(59,130,246,0.6)',
        borderWidth: 1,
        pointRadius: 4,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => ` Discount: ${ctx.parsed.x.toFixed(0)}% | Sales: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Discount (%)', color: '#6b7280', font: { size: 11 } },
          grid:  { color: '#f1f5f9' },
          ticks: { callback: v => v + '%' }
        },
        y: {
          title: { display: true, text: 'Sales Amount', color: '#6b7280', font: { size: 11 } },
          grid:  { color: '#f1f5f9' },
          ticks: { callback: v => formatCurrency(v) }
        }
      }
    }
  });
}

/* ---- 9. Top 10 Highest Sales (Horizontal Bar by Product_ID) ---- */
function renderTop10(data) {
  // Sort records by Sales_Amount desc, take top 10
  const top10 = [...data]
    .sort((a, b) => parseFloat(b.Sales_Amount) - parseFloat(a.Sales_Amount))
    .slice(0, 10);

  const labels = top10.map(r => `ID ${r.Product_ID} (${r.Sales_Rep})`);
  const values = top10.map(r => parseFloat(r.Sales_Amount));

  renderChart('chartTop10', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Sales Amount',
        data: values,
        backgroundColor: PALETTE.teal[0],
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => ' ' + formatCurrency(ctx.parsed.x)
          }
        }
      },
      scales: {
        x: {
          grid:  { color: '#f1f5f9' },
          ticks: { callback: v => formatCurrency(v) }
        },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

/* ---- 10. Quantity Sold per Category (Vertical Bar) ---- */
function renderQtyCategory(data) {
  const { labels, values } = groupSum(data, 'Product_Category', 'Quantity_Sold');

  renderChart('chartQtyCategory', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Qty Sold',
        data: values,
        backgroundColor: PALETTE.amber.concat(PALETTE.rose),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => ' ' + formatNumber(ctx.parsed.y) + ' units'
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid:  { color: '#f1f5f9' },
          ticks: { callback: v => formatNumber(v) }
        }
      }
    }
  });
}

/* ============================================================
   MASTER UPDATE FUNCTION
   Called on initial load and on every filter change
   ============================================================ */
function updateDashboard() {
  const data = getFilteredData();

  // Update the records badge to reflect current filter
  document.getElementById('totalRecords').textContent = formatNumber(data.length);

  // 1. KPI Cards
  renderKPIs(data);

  // 2. All Charts
  renderSalesTrend(data);
  renderRevenueRegion(data);
  renderRevenueCategory(data);
  renderSalesRep(data);
  renderCustomerType(data);
  renderPaymentMethod(data);
  renderSalesChannel(data);
  renderScatter(data);
  renderTop10(data);
  renderQtyCategory(data);
}

/* ============================================================
   FILTER EVENT LISTENERS
   ============================================================ */
function initFilters() {
  /** Helper: attach change listener to a select element */
  function bindFilter(elementId, filterKey) {
    const el = document.getElementById(elementId);
    el.addEventListener('change', e => {
      FILTERS[filterKey] = e.target.value;
      updateDashboard();
    });
  }

  bindFilter('filterRegion',       'region');
  bindFilter('filterCategory',     'category');
  bindFilter('filterCustomerType', 'customerType');
  bindFilter('filterChannel',      'channel');

  // Reset All button — clears all selects and re-renders
  document.getElementById('resetFilters').addEventListener('click', () => {
    FILTERS.region       = '';
    FILTERS.category     = '';
    FILTERS.customerType = '';
    FILTERS.channel      = '';

    // Reset all select elements visually
    document.querySelectorAll('.filter-select').forEach(sel => { sel.value = ''; });

    updateDashboard();
  });
}

/* ============================================================
   ENTRY POINT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initFilters();
  loadData();
});
