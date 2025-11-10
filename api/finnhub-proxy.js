// api/finnhub-proxy.js
export default async function handler(req, res) {
  const { symbol } = req.query;
  if (!symbol) {
    res.status(400).json({ error: 'symbol required' });
    return;
  }

  const API_KEY = process.env.FINNHUB_API_KEY;
  if (!API_KEY) {
    res.status(500).json({ error: 'FINNHUB_API_KEY not set in environment' });
    return;
  }

  // try quote
  const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${API_KEY}`;

  try {
    const qRes = await fetch(quoteUrl);
    if (!qRes.ok) {
      const txt = await qRes.text();
      return res.status(502).json({ error: 'Finnhub quote error', status: qRes.status, body: txt });
    }
    const quote = await qRes.json();

    // optionally fetch candles for small chart
    const to = Math.floor(Date.now() / 1000);
    // 3 days back to be safe (covers holidays)
    const from = to - 3 * 24 * 60 * 60;
    const candleUrl = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=60&from=${from}&to=${to}&token=${API_KEY}`;

    let candles = null;
    try {
      const cRes = await fetch(candleUrl);
      if (cRes.ok) {
        const cJson = await cRes.json();
        // cJson: {c:[],h:[],l:[],o:[],s:'ok',t:[]}
        if (cJson && cJson.s === 'ok') {
          candles = {
            t: cJson.t,
            c: cJson.c
          };
        }
      }
    } catch(e){
      // ignore candle errors
    }

    // respond with both quote and candles if available
    const out = {
      c: quote.c ?? null,
      d: quote.d ?? null,
      dp: quote.dp ?? null,
      h: quote.h ?? null,
      l: quote.l ?? null,
      o: quote.o ?? null,
      pc: quote.pc ?? null,
      t: quote.t ?? null
    };
    if (candles) out.candles = candles;

    res.setHeader('Access-Control-Allow-Origin','*');
    res.status(200).json(out);
  } catch (err) {
    console.error('proxy error', err);
    res.setHeader('Access-Control-Allow-Origin','*');
    res.status(500).json({ error: 'internal', message: err.message });
  }
}
