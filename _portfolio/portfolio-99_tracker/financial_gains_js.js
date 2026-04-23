const APP_CONFIG = {
  ticker1: 'QQQM',
  ticker2: 'QCLN',
  ticker2Alt: 'CNRG',
  startDate: '2026-02-24',
  cnrgDate: '2026-02-26',
  initialInvestment: 4971.29,
  weightQQQM: 0.60,
  weightQCLN: 0.40,
  initialSharePriceQQQM: 253.16,
  initialSharePriceQCLN: 51.92,
};

const RANGE_MAP = {
  '5D': { days: 5 },
  '15D': { days: 15 },
  '1M': { months: 1 },
  '3M': { months: 3 },
  '6M': { months: 6 },
  '1Y': { years: 1 },
  '5Y': { years: 5 },
  '10Y': { years: 10 },
  '20Y': { years: 20 },
};

const OPTION_LABELS = {
  'SPY': 'S&P500 ETF (SPY)',
  'QQQM': 'NASDAQ-100 ETF (QQQM)',
  'ONEQ': 'NASDAQ-Composite ETF (ONEQ)',
  'DIA': 'Dow Jones ETF (DIA)',
  'QCLN': 'NASDAQ Clean Energy ETF (QCLN)',
  'CNRG': 'S&P Kensho Clean Power ETF (CNRG)',
  'AAPL': 'Apple Inc (AAPL)',
  'NVDA': 'NVIDIA Corp (NVDA)',
  'XOM': 'Exxon Mobile Corp (XOM)',
  'SHEL': 'Shell PLC (SHEL)',
  'WMT': 'Walmart Inc (WMT)',
  'AMZN': 'Amazon.com Inc (AMZN)',
  'GC=F': 'Gold Futures (GC=F)',
  'CL=F': 'Oil Futures (CL=F)',
  'EURUSD=X': 'Euro € (EURUSD=X)',
  'CNYUSD=X': 'Yuan ¥ (CNYUSD=X)'
};

const COMPARE_TICKERS = [
  '', 'SPY', 'ONEQ', 'DIA', 'QCLN', 'CNRG', 'AAPL', 'NVDA', 'XOM', 'SHEL',
  'WMT', 'AMZN', 'GC=F', 'CL=F', 'EURUSD=X', 'CNYUSD=X'
];

let staticData = null;
let currentRangeLabel = '5D';
let compareTicker = '';
let showAlt = true;
let chart = null;
let latestPayload = null;
let chartTransitionTimer = null;
const CHART_TRANSITION_MS = 800;

// value string formatting to 2 decimals and datetime (s). Aligning data sets //
function formatMoney(value) {
  return `$${Number(value).toFixed(2)}`;
}

function formatPercent(value) {
  return `${Number(value).toFixed(2)}%`;
}

function formatMaybeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
  return value;
}

function parseDateOnly(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function toDateString(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftedDate(endDateStr, rangeSpec) {
  const d = parseDateOnly(endDateStr);
  const out = new Date(d.getTime());
  if (rangeSpec.days) out.setDate(out.getDate() - rangeSpec.days);
  if (rangeSpec.months) out.setMonth(out.getMonth() - rangeSpec.months);
  if (rangeSpec.years) out.setFullYear(out.getFullYear() - rangeSpec.years);
  return toDateString(out);
}
// mapping data to ticker selection //
function seriesForTicker(ticker) {
  if (!staticData || !staticData.prices || !staticData.prices[ticker]) return [];
  return staticData.prices[ticker].slice().sort((a, b) => a.date.localeCompare(b.date));
}

function latestDateAcrossBaseTickers() {
  const qqqm = seriesForTicker(APP_CONFIG.ticker1);
  const qcln = seriesForTicker(APP_CONFIG.ticker2);
  const cnrg = seriesForTicker(APP_CONFIG.ticker2Alt);
  const dates = [qqqm, qcln, cnrg]
    .filter(arr => arr.length > 0)
    .map(arr => arr[arr.length - 1].date)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function filterByRange(series, rangeLabel, endDateStr) {
  if (!series.length || !endDateStr) return [];
  const startDate = shiftedDate(endDateStr, RANGE_MAP[rangeLabel] || RANGE_MAP['5D']);
  return series.filter(row => row.date >= startDate && row.date <= endDateStr);
}

function buildDateMap(series) {
  return new Map(series.map(row => [row.date, Number(row.close)]));
}

//  Acquiring nearest available date in the event date selected unavailable  //
function closeOnOrNear(series, targetDateStr) {
  if (!series.length) throw new Error('No data available.');
  const exact = series.find(row => row.date === targetDateStr);
  if (exact) return Number(exact.close);

  const earlier = series.filter(row => row.date <= targetDateStr);
  if (earlier.length) return Number(earlier[earlier.length - 1].close);

  const later = series.find(row => row.date > targetDateStr);
  if (later) return Number(later.close);

  return Number(series[0].close);
}

function roundRows(rows, limit = 5) {
  return rows.slice(-limit).map(row => {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = (typeof value === 'number' && Number.isFinite(value)) ? Number(value.toFixed(2)) : value;
    }
    return out;
  });
}

// Compute x-axis range based on data //
function computeVisibleIndexWindow(labels, rangeLabel, endDateStr) {
  if (!labels.length || !endDateStr) {
    return { startIndex: 0, endIndex: Math.max(0, labels.length - 1) };
  }

  const startDate = shiftedDate(endDateStr, RANGE_MAP[rangeLabel] || RANGE_MAP['5D']);

  let startIndex = labels.findIndex(date => date >= startDate);
  if (startIndex === -1) startIndex = 0;

  let endIndex = -1;
  for (let i = labels.length - 1; i >= 0; i -= 1) {
    if (labels[i] <= endDateStr) {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) endIndex = labels.length - 1;
  if (startIndex > endIndex) startIndex = Math.max(0, endIndex);

  return { startIndex, endIndex };
}

function numericWindow(values, startIndex, endIndex) {
  return values
    .slice(startIndex, endIndex + 1)
    .filter(value => typeof value === 'number' && Number.isFinite(value));
}

// Set bounds so that 0 + padding is always visible  //
function paddedBounds(values, padRatio = 0.08, minPad = 0.5) {
  if (!values.length) return null;

  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);

  if (minValue === maxValue) {
    const basePad = Math.max(Math.abs(minValue) * padRatio, minPad);
    return {
      min: Number((minValue - basePad).toFixed(4)),
      max: Number((maxValue + basePad).toFixed(4)),
    };
  }

  const pad = Math.max((maxValue - minValue) * padRatio, minPad);
  return {
    min: Number((minValue - pad).toFixed(4)),
    max: Number((maxValue + pad).toFixed(4)),
  };
}

//  Dropdown menu of tickers based on static data set in JSON  //
function buildDropdown() {
  const select = document.getElementById('tickerSelect');
  select.innerHTML = '';

  const dataOptionLabels = staticData?.option_labels || staticData?.metadata?.option_labels || {};
  const optionLabels = { ...OPTION_LABELS, ...dataOptionLabels };

  COMPARE_TICKERS.forEach(ticker => {
    const option = document.createElement('option');
    option.value = ticker;
    option.textContent = ticker ? (optionLabels[ticker] || ticker) : 'None';
    select.appendChild(option);
  });
}

// Date range option Buttons based on date range array  //
function buildRangeButtons() {
  const container = document.getElementById('rangeButtons');
  container.innerHTML = '';
  Object.keys(RANGE_MAP).forEach(label => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.label = label;
    if (label === currentRangeLabel) btn.classList.add('active');
    btn.addEventListener('click', () => {
      currentRangeLabel = label;
      [...container.querySelectorAll('button')].forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      refreshData();
    });
    container.appendChild(btn);
  });
}

function renderTable(targetId, rows) {
  const target = document.getElementById(targetId);
  if (!rows || rows.length === 0) {
    target.innerHTML = '<em>No data available.</em>';
    return;
  }
  const cols = Object.keys(rows[0]);
  let html = '<table><thead><tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>' + cols.map(c => `<td>${formatMaybeNumber(row[c])}</td>`).join('') + '</tr>';
  }
  html += '</tbody></table>';
  target.innerHTML = html;
}

function updateSummary(payload) {
  latestPayload = payload;
  document.getElementById('lastUpdated').textContent = `Last updated: ${payload.last_updated}`;
  document.getElementById('statusText').textContent = payload.status;
  document.getElementById('initTot').textContent = `Total: ${payload.inits.initTot}`;
  document.getElementById('initTick1').textContent = `${payload.summary.primary_main_label} Price ${payload.inits.initTick1}`;
  document.getElementById('initTick2').textContent = `${payload.summary.secondary_main_label} Price ${payload.inits.initTick2}`;
  document.getElementById('totalPerc').textContent = payload.summary.total_percent;
  document.getElementById('totalAmt').textContent = payload.summary.total_amount;
  document.getElementById('percQQQM').textContent = payload.summary.qqqm_percent;
  document.getElementById('datasetDate').textContent = payload.dataset.generated_on || 'unknown date';
  document.getElementById('startDateText').textContent = APP_CONFIG.startDate;

  const secondaryLabel = document.getElementById('secondaryTickerLabel');
  const secondaryValue = document.getElementById('secondaryTickerValue');
  if (showAlt) {
    secondaryLabel.textContent = `${payload.summary.secondary_alt_label} %`;
    secondaryValue.textContent = payload.summary.secondary_alt_value;
  } else {
    secondaryLabel.textContent = `${payload.summary.secondary_main_label} %`;
    secondaryValue.textContent = payload.summary.secondary_main_value;
  }

  const positive = payload.summary.total_percent_value >= 0;
  document.getElementById('totalCard').className = `card ${positive ? 'pulse-good' : 'pulse-bad'}`;
  document.getElementById('amountCard').className = `card ${positive ? 'pulse-good' : 'pulse-bad'}`;
  document.getElementById('toggleBtn').textContent = showAlt
    ? `Show ${payload.summary.secondary_main_label}`
    : `Show ${payload.summary.secondary_alt_label}`;
}

// Format chart coloring and dynamic function //
function chartOptions(titleText) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    normalized: true,
    interaction: { mode: 'index', intersect: false },
    animation: {
      duration: CHART_TRANSITION_MS,
      easing: 'easeInOutCubic',
    },
    animations: {
      x: {
        duration: CHART_TRANSITION_MS,
        easing: 'easeInOutCubic',
      },
      y: {
        duration: CHART_TRANSITION_MS,
        easing: 'easeInOutCubic',
      }
    },
    elements: {
      point: {
        radius: 0,
        hoverRadius: 3,
      }
    },
    scales: {
      x: {
        type: 'category',
        ticks: {
          color: '#cbd5e1',
          maxTicksLimit: 12,
          autoSkip: true,
        },
        grid: { color: '#3f4854' },
      },
      y: {
        position: 'left',
        title: { display: true, text: 'Total % / Compare %', color: '#cbd5e1' },
        ticks: { color: '#cbd5e1' },
        grid: { color: '#3f4854' },
      },
      y1: {
        position: 'right',
        title: { display: true, text: 'Portfolio Value ($)', color: '#cbd5e1' },
        ticks: { color: '#cbd5e1' },
        grid: { drawOnChartArea: false },
      }
    },
    plugins: {
      legend: { labels: { color: '#e5e7eb' } },
      title: {
        display: true,
        text: titleText,
        color: '#e5e7eb',
      }
    }
  };
}

// transition chart dispaly between date range selection   //
function setChartTransitionState(isTransitioning) {
  const chartCard = document.querySelector('.chart-card');
  if (!chartCard) return;

  if (chartTransitionTimer) {
    clearTimeout(chartTransitionTimer);
    chartTransitionTimer = null;
  }

  if (isTransitioning) {
    chartCard.classList.add('is-transitioning');
    chartTransitionTimer = setTimeout(() => {
      chartCard.classList.remove('is-transitioning');
      chartTransitionTimer = null;
    }, CHART_TRANSITION_MS + 80);
  } else {
    chartCard.classList.remove('is-transitioning');
  }
}

function updateChart(payload) {
  const ctx = document.getElementById('chart').getContext('2d');

  const datasets = [
    {
      label: 'Total %',
      data: payload.chart.total_percent_series,
      yAxisID: 'y',
      borderWidth: 3,
      tension: 0.15,
      spanGaps: true,
    },
    {
      label: 'QQQM $',
      data: payload.chart.qqqm_value_series,
      yAxisID: 'y1',
      borderWidth: 2,
      tension: 0.15,
      spanGaps: true,
    },
    {
      label: 'QCLN $',
      data: payload.chart.qcln_value_series,
      yAxisID: 'y1',
      borderWidth: 2,
      tension: 0.15,
      spanGaps: true,
    }
  ];

  if (payload.chart.compare_series) {
    datasets.push({
      label: payload.chart.compare_label,
      data: payload.chart.compare_series,
      yAxisID: 'y',
      borderWidth: 2,
      tension: 0.15,
      borderDash: [8, 5],
      spanGaps: true,
    });
  }

  const options = chartOptions(payload.chart.title);
  options.scales.x.min = payload.chart.visible_start_index;
  options.scales.x.max = payload.chart.visible_end_index;
  if (payload.chart.y_bounds) {
    options.scales.y.min = payload.chart.y_bounds.min;
    options.scales.y.max = payload.chart.y_bounds.max;
  }
  if (payload.chart.y1_bounds) {
    options.scales.y1.min = payload.chart.y1_bounds.min;
    options.scales.y1.max = payload.chart.y1_bounds.max;
  }

  setChartTransitionState(true);

  if (!chart) {
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: payload.chart.labels,
        datasets,
      },
      options,
    });
    return;
  }

  chart.data.labels = payload.chart.labels;
  chart.data.datasets = datasets;
  chart.options.plugins.title.text = payload.chart.title;
  chart.options.scales.x.min = payload.chart.visible_start_index;
  chart.options.scales.x.max = payload.chart.visible_end_index;
  chart.options.scales.y.min = payload.chart.y_bounds ? payload.chart.y_bounds.min : undefined;
  chart.options.scales.y.max = payload.chart.y_bounds ? payload.chart.y_bounds.max : undefined;
  chart.options.scales.y1.min = payload.chart.y1_bounds ? payload.chart.y1_bounds.min : undefined;
  chart.options.scales.y1.max = payload.chart.y1_bounds ? payload.chart.y1_bounds.max : undefined;
  chart.update();
}

function updateTables(payload) {
  renderTable('portfolioTable', payload.tables.portfolio);
  renderTable('qqqmTable', payload.tables.qqqm);
  renderTable('qclnTable', payload.tables.qcln);
  renderTable('compareTable', payload.tables.compare);
  document.getElementById('compareTableTitle').textContent = payload.tables.compare_title;
}
// Data analysis + variable calculations  //
function buildPayload(rangeLabel, compareTickerSelection = '') {
  if (!staticData || !staticData.prices) {
    throw new Error('Static data file not loaded.');
  }

  const qqqmFull = seriesForTicker(APP_CONFIG.ticker1);
  const qclnFull = seriesForTicker(APP_CONFIG.ticker2);
  const cnrgFull = seriesForTicker(APP_CONFIG.ticker2Alt);
  if (!qqqmFull.length || !qclnFull.length || !cnrgFull.length) {
    throw new Error('One or more base ticker datasets are missing.');
  }

  const endDate = latestDateAcrossBaseTickers();
  if (!endDate) throw new Error('Could not determine latest dataset date.');

  const qqqmFullMap = buildDateMap(qqqmFull);
  const qclnFullMap = buildDateMap(qclnFull);
  const sharedDatesFull = qqqmFull
    .map(row => row.date)
    .filter(date => qclnFullMap.has(date))
    .sort();
  if (!sharedDatesFull.length) {
    throw new Error('No shared trading dates found between QQQM and QCLN.');
  }

  const initialSharePriceCnrg = closeOnOrNear(cnrgFull, APP_CONFIG.cnrgDate);

  const portfolioRowsFull = sharedDatesFull.map(date => {
    const qqqmClose = qqqmFullMap.get(date);
    const qclnClose = qclnFullMap.get(date);
    const portfolioQQQMValue = qqqmClose * APP_CONFIG.initialInvestment * APP_CONFIG.weightQQQM / APP_CONFIG.initialSharePriceQQQM;
    const portfolioQCLNValue = qclnClose * APP_CONFIG.initialInvestment * APP_CONFIG.weightQCLN / APP_CONFIG.initialSharePriceQCLN;
    const totalPercent = ((portfolioQQQMValue + portfolioQCLNValue - APP_CONFIG.initialInvestment) / APP_CONFIG.initialInvestment) * 100;
    return {
      Date: date,
      'Portfolio %': totalPercent,
      'Close QQQM': qqqmClose,
      'Close QCLN': qclnClose,
      'Portfolio QQQM Value': portfolioQQQMValue,
      'Portfolio QCLN Value': portfolioQCLNValue,
    };
  });

  const visibleWindow = computeVisibleIndexWindow(sharedDatesFull, rangeLabel, endDate);
  const portfolioRowsVisible = portfolioRowsFull.slice(visibleWindow.startIndex, visibleWindow.endIndex + 1);
  if (!portfolioRowsVisible.length) {
    throw new Error('No data available for the selected range.');
  }

  const qclnRange = filterByRange(qclnFull, rangeLabel, endDate);
  const cnrgRange = filterByRange(cnrgFull, rangeLabel, endDate);

  const latestQQQMClose = Number(portfolioRowsVisible[portfolioRowsVisible.length - 1]['Close QQQM']);
  const latestQCLNClose = Number(portfolioRowsVisible[portfolioRowsVisible.length - 1]['Close QCLN']);
  const latestCNRGClose = Number(cnrgRange[cnrgRange.length - 1].close);
  const latestPortfolio = portfolioRowsVisible[portfolioRowsVisible.length - 1];
  const portfolioAmount = latestPortfolio['Portfolio %'] / 100 * APP_CONFIG.initialInvestment;
  const qqqmPct = ((latestQQQMClose / APP_CONFIG.initialSharePriceQQQM) - 1) * 100;
  const qclnPct = ((latestQCLNClose / APP_CONFIG.initialSharePriceQCLN) - 1) * 100;
  const cnrgPct = ((latestCNRGClose / initialSharePriceCnrg) - 1) * 100;

  let compareSeriesPayload = null;
  let compareLabel = '';
  let compareTable = roundRows(cnrgRange.map(row => ({ Date: row.date, Close: Number(row.close) })));
  let compareTableTitle = APP_CONFIG.ticker2Alt;

  if (compareTickerSelection) {
    const customFull = seriesForTicker(compareTickerSelection);
    if (!customFull.length) throw new Error(`No static data found for ${compareTickerSelection}.`);
    const customRange = filterByRange(customFull, rangeLabel, endDate);
    if (!customRange.length) throw new Error(`No visible data found for ${compareTickerSelection}.`);

    let compareReference;
    try {
      compareReference = closeOnOrNear(customFull, APP_CONFIG.startDate);
    } catch (error) {
      compareReference = Number(customRange[0].close);
    }

    const compareMap = new Map(customFull.map(row => [row.date, ((Number(row.close) / compareReference) - 1) * 100]));
    compareSeriesPayload = sharedDatesFull.map(date => {
      const value = compareMap.get(date);
      return (typeof value === 'number' && Number.isFinite(value)) ? Number(value.toFixed(4)) : null;
    });
    compareLabel = compareTickerSelection;
    compareTable = roundRows(customRange.map(row => ({ Date: row.date, Close: Number(row.close) })));
    compareTableTitle = compareTickerSelection;
  }

  const totalPercentSeries = portfolioRowsFull.map(row => Number(row['Portfolio %'].toFixed(4)));
  const qqqmValueSeries = portfolioRowsFull.map(row => Number(row['Portfolio QQQM Value'].toFixed(4)));
  const qclnValueSeries = portfolioRowsFull.map(row => Number(row['Portfolio QCLN Value'].toFixed(4)));

  const yValuesVisible = [
    ...numericWindow(totalPercentSeries, visibleWindow.startIndex, visibleWindow.endIndex),
    ...numericWindow(compareSeriesPayload || [], visibleWindow.startIndex, visibleWindow.endIndex),
  ];
  const y1ValuesVisible = [
    ...numericWindow(qqqmValueSeries, visibleWindow.startIndex, visibleWindow.endIndex),
    ...numericWindow(qclnValueSeries, visibleWindow.startIndex, visibleWindow.endIndex),
  ];

  return {
    dataset: {
      generated_on: staticData.metadata?.generated_on || '',
      dataset_end: staticData.metadata?.dataset_end || endDate,
      source: staticData.metadata?.source || 'local-json',
    },
    last_updated: new Date().toLocaleString(),
    status: `Loaded static range=${rangeLabel}` + (compareTickerSelection ? ` and compare ticker=${compareTickerSelection}` : ''),
    inits: {
      initTot: formatMoney(APP_CONFIG.initialInvestment),
      initTick1: formatMoney(APP_CONFIG.initialSharePriceQQQM),
      initTick2: formatMoney(APP_CONFIG.initialSharePriceQCLN),
    },
    summary: {
      total_percent: formatPercent(latestPortfolio['Portfolio %']),
      total_percent_value: Number(latestPortfolio['Portfolio %']),
      total_amount: formatMoney(portfolioAmount),
      qqqm_percent: formatPercent(qqqmPct),
      primary_main_label: APP_CONFIG.ticker1,
      secondary_main_label: APP_CONFIG.ticker2,
      secondary_main_value: formatPercent(qclnPct),
      secondary_alt_label: APP_CONFIG.ticker2Alt,
      secondary_alt_value: formatPercent(cnrgPct),
    },
    chart: {
      title: `Portfolio Price and Returns: ${APP_CONFIG.ticker1} / ${APP_CONFIG.ticker2}` + (compareTickerSelection ? ` vs ${compareTickerSelection}` : ''),
      labels: sharedDatesFull,
      visible_start_index: visibleWindow.startIndex,
      visible_end_index: visibleWindow.endIndex,
      total_percent_series: totalPercentSeries,
      qqqm_value_series: qqqmValueSeries,
      qcln_value_series: qclnValueSeries,
      compare_series: compareSeriesPayload,
      compare_label: compareLabel,
      y_bounds: paddedBounds(yValuesVisible, 0.1, 0.5),
      y1_bounds: paddedBounds(y1ValuesVisible, 0.08, 1.0),
    },
    tables: {
      portfolio: roundRows(portfolioRowsVisible.map(row => ({ Date: row.Date, 'Portfolio %': row['Portfolio %'] }))),
      qqqm: roundRows(portfolioRowsVisible.map(row => ({ Date: row.Date, Close: row['Close QQQM'], 'Portfolio QQQM Value': row['Portfolio QQQM Value'] }))),
      qcln: roundRows(portfolioRowsVisible.map(row => ({ Date: row.Date, Close: row['Close QCLN'], 'Portfolio QCLN Value': row['Portfolio QCLN Value'] }))),
      compare: compareTable,
      compare_title: compareTableTitle,
    },
  };
}

async function loadStaticData() {
  const response = await fetch('./financial_gains_static_data.json');
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Failed to load static data file.');
  staticData = payload;
}

async function refreshData() {
  try {
    document.getElementById('statusText').textContent = 'Loading...';
    const payload = buildPayload(currentRangeLabel, compareTicker);
    updateSummary(payload);
    updateChart(payload);
    updateTables(payload);
  } catch (error) {
    document.getElementById('statusText').textContent = `Error: ${error.message}`;
  }
}

document.getElementById('refreshBtn').addEventListener('click', refreshData);
document.getElementById('compareBtn').addEventListener('click', () => {
  compareTicker = document.getElementById('tickerSelect').value;
  refreshData();
});
document.getElementById('clearBtn').addEventListener('click', () => {
  compareTicker = '';
  document.getElementById('tickerSelect').value = '';
  refreshData();
});
document.getElementById('toggleBtn').addEventListener('click', () => {
  showAlt = !showAlt;
  if (latestPayload) updateSummary(latestPayload);
});
document.getElementById('tickerSelect').addEventListener('change', (event) => {
  compareTicker = event.target.value;
});

(async function initApp() {
  buildRangeButtons();
  buildDropdown();
  try {
    await loadStaticData();
    document.getElementById('statusText').textContent = 'Static data file loaded.';
    await refreshData();
  } catch (error) {
    document.getElementById('statusText').textContent = `Error: ${error.message}`;
  }
})();
