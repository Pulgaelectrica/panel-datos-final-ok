// panel final: actualiza cada 60s, muestra % y grafica suavizada por tarjeta
const SYMBOLS = {
  btc: "BINANCE:BTCUSDT",      // lo convertimos a EUR en el cliente usando EURUSD
  oro: "OANDA:XAU_EUR",
  sp500: "INDEX:SPX",
  nvda: "NASDAQ:NVDA",
  tsla: "NASDAQ:TSLA",
  aapl: "NASDAQ:AAPL",
  amzn: "NASDAQ:AMZN",
  googl: "NASDAQ:GOOGL"
};

const UPDATE_INTERVAL = 60_000; // 60s

// util: moving average smoothing
function smooth(arr, window = 3) {
  if (!arr || arr.length <= window) return arr.slice();
  const res = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1);
    res.push(slice.reduce((a,b)=>a+b,0)/slice.length);
  }
  return res;
}

// pintar mini gráfico en canvas: escala lineal, suaviza
function drawMiniChart(canvas, data, color = '#cfe') {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth;
  const h = canvas.height = canvas.offsetHeight;
  ctx.clearRect(0,0,w,h);
  if (!data || data.length < 2) return;
  const s = smooth(data, 4);
  const min = Math.min(...s);
  const max = Math.max(...s);
  ctx.beginPath();
  s.forEach((v,i)=>{
    const x = (i/(s.length-1))*w;
    const y = h - ((v-min)/(max-min || 1))*h;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  });
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  // small fill (subtle)
  ctx.lineTo(w, h); ctx.lineTo(0,h); ctx.closePath();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

// fetch via proxy; returns JSON or null
async function proxyFetch(symbol, extra = {}) {
  try {
    const url = new URL('/api/finnhub-proxy', location.origin);
    url.searchParams.set('symbol', symbol);
    if (extra.candle) url.searchParams.set('candle', '1');
    const r = await fetch(url.toString());
    if (!r.ok) {
      const t = await r.text();
      console.warn('Proxy error', r.status, t);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error('Fetch error', e);
    return null;
  }
}

async function updateOne(id, symbol) {
  const container = document.getElementById(id);
  if (!container) return;
  const priceEl = container.querySelector('.price');
  const canvas = container.querySelector('canvas.chart');

  // special: BTC convert USD->EUR via EURUSD pair
  try {
    let data = await proxyFetch(symbol, {candle:1});
    if (!data) throw new Error('no data');
    // data for quote: {c,d,dp,h,l,o,pc,t}
    // data.candle maybe {s, c:[], t:[], ...} if implemented by proxy (see api)
    // ensure we have last price 'c' and previous 'pc'
    let last = data.c ?? null;
    let prev = data.pc ?? null;
    let series = [];
    if (data.candles && Array.isArray(data.candles.c)) {
      series = data.candles.c.slice(-24); // last 24 points (whatever resolution)
    } else if (data.historical && Array.isArray(data.historical)) {
      series = data.historical.slice(-24);
    } else if (last !== null && prev !== null) {
      series = [prev, last];
    }

    // if BTC -> convert USD->EUR using OANDA:EUR_USD
    if (symbol === 'BINANCE:BTCUSDT') {
      const fx = await proxyFetch('OANDA:EUR_USD');
      if (fx && (fx.c || fx.pc)) {
        const eurUsd = fx.c ?? fx.pc;
        if (eurUsd) {
          // USD per EUR => EUR = USD / (USD per EUR)
          last = last ? last / eurUsd : last;
          prev = prev ? prev / eurUsd : prev;
          series = series.map(v => v / eurUsd);
        }
      }
    }

    // choose displayed price and percent change
    const display = (last != null) ? last : prev != null ? prev : null;
    const pct = (last != null && prev != null && prev !== 0) ? ((last - prev)/prev)*100 : 0;

    // set text and color
    priceEl.textContent = display != null ? display.toFixed(2) + (symbol === 'OANDA:XAU_EUR' ? ' €' : (symbol.includes('BTC') ? ' €' : '')) : '—';
    container.classList.remove('up','down','neutral');
    priceEl.classList.remove('up','down','neutral');
    if (last != null && prev != null) {
      if (last > prev) { container.classList.add('up'); priceEl.classList.add('up'); }
      else if (last < prev) { container.classList.add('down'); priceEl.classList.add('down'); }
      else { container.classList.add('neutral'); priceEl.classList.add('neutral'); }
    } else { container.classList.add('neutral'); priceEl.classList.add('neutral'); }

    // draw chart
    drawMiniChart(canvas, series, (pct >= 0) ? '#b6ffb0' : '#ffb6b6');

  } catch (err) {
    console.error('updateOne error', id, err);
    priceEl.textContent = 'ERR';
    container.classList.remove('up','down'); container.classList.add('neutral');
  }
}

async function updateAll() {
  const entries = Object.entries(SYMBOLS);
  for (const [id, sym] of entries) {
    await updateOne(id, sym);
  }
}

updateAll();
setInterval(updateAll, UPDATE_INTERVAL);
