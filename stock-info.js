// api/stock-info.js
import yahooFinance from 'yahoo-finance2';

export default async function handler(request, response) {
  // 1. Get the ticker from the URL (e.g., ?ticker=AAPL)
  const { ticker } = request.query;

  if (!ticker) {
    return response.status(400).json({ error: 'Ticker symbol is required' });
  }

  try {
    // 2. Fetch data from Yahoo Finance
    const quote = await yahooFinance.quote(ticker);
    
    // 3. Send the useful bits back to your frontend
    return response.status(200).json({
      symbol: quote.symbol,
      name: quote.shortName || quote.longName,
      price: quote.regularMarketPrice,
      currency: quote.currency,
      marketCap: quote.marketCap,
    });
  } catch (error) {
    console.error("Stock fetch error:", error);
    return response.status(500).json({ error: 'Failed to fetch stock data. Check the ticker symbol.' });
  }
}
