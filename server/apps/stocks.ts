import type { Express, Request, Response } from "express";
import { FETCH_TIMEOUT_MS } from "../route-helpers";

export function registerStocksRoutes(app: Express): void {
  // Market data endpoint - fetches all requested stocks with historical performance
  app.get("/api/market", async (req: Request, res: Response) => {
    try {
      const symbolsParam = req.query.symbols as string || "DJI,SPX,VNQ,BTC,GOLD";
      const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase());

      const stockConfig: Record<string, { yahooSymbol?: string; isCrypto?: boolean; name: string }> = {
        "DJI": { yahooSymbol: "^DJI", name: "Dow Jones" },
        "SPX": { yahooSymbol: "^GSPC", name: "S&P 500" },
        "VNQ": { yahooSymbol: "VNQ", name: "Real Estate" },
        "BTC": { isCrypto: true, name: "Bitcoin" },
        "GOLD": { yahooSymbol: "GC=F", name: "Gold" },
        "MSFT": { yahooSymbol: "MSFT", name: "Microsoft" },
        "CRM": { yahooSymbol: "CRM", name: "Salesforce" },
        "ISRG": { yahooSymbol: "ISRG", name: "Intuitive Surgical" },
      };

      interface MarketResult {
        symbol: string;
        name: string;
        price: number;
        change: number;
        changePercent: number;
        changeLabel: string; // "1D", "1M" etc. to indicate what period the change covers
        change1Y?: number;
        change3Y?: number;
        change5Y?: number;
        change10Y?: number;
        historicalPrices?: Array<{ t: number; p: number }>; // ms timestamp + price for chart
      }

      const results: Record<string, MarketResult | null> = {};

      // Build fetch requests - now fetching 5 year data for historical analysis
      const fetchPromises: Promise<{ symbol: string; data: any; historical?: any }>[] = [];

      for (const symbol of symbols) {
        const config = stockConfig[symbol];
        if (!config) continue;

        if (config.isCrypto) {
          // Fetch current price and historical data for Bitcoin (max range for 10Y)
          fetchPromises.push(
            Promise.all([
              fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true", { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null),
              fetch("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=3650", { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
            ]).then(([data, historical]) => ({ symbol, data, historical }))
          );
        } else if (config.yahooSymbol) {
          // Fetch 10 year data for historical analysis
          fetchPromises.push(
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(config.yahooSymbol)}?interval=1mo&range=10y`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
              .then(r => r.ok ? r.json() : null)
              .then(data => ({ symbol, data }))
              .catch(() => ({ symbol, data: null }))
          );
        }
      }

      const responses = await Promise.all(fetchPromises);

      for (const { symbol, data, historical } of responses) {
        const config = stockConfig[symbol];
        if (!config || !data) {
          results[symbol.toLowerCase()] = null;
          continue;
        }

        if (config.isCrypto && data.bitcoin) {
          const currentPrice = data.bitcoin.usd;
          const dailyChange = data.bitcoin.usd_24h_change || 0;
          const result: MarketResult = {
            symbol,
            name: config.name,
            price: currentPrice,
            change: dailyChange,
            changePercent: dailyChange,
            changeLabel: "1D"
          };

          // Calculate historical changes from CoinGecko market_chart data
          if (historical?.prices && historical.prices.length > 0) {
            const prices = historical.prices as Array<[number, number]>;
            const now = Date.now();
            const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
            const threeYearsAgo = now - 3 * 365 * 24 * 60 * 60 * 1000;
            const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60 * 1000;
            const tenYearsAgo = now - 10 * 365 * 24 * 60 * 60 * 1000;

            // Find prices closest to 1Y, 3Y, 5Y, 10Y ago
            const findPriceAtTime = (targetTime: number) => {
              let closest = prices[0];
              for (const p of prices) {
                if (Math.abs(p[0] - targetTime) < Math.abs(closest[0] - targetTime)) {
                  closest = p;
                }
              }
              // Only return if the closest data point is within 60 days of the target
              if (Math.abs(closest[0] - targetTime) > 60 * 24 * 60 * 60 * 1000) return null;
              return closest[1];
            };

            const price1YAgo = findPriceAtTime(oneYearAgo);
            const price3YAgo = findPriceAtTime(threeYearsAgo);
            const price5YAgo = findPriceAtTime(fiveYearsAgo);
            const price10YAgo = findPriceAtTime(tenYearsAgo);

            if (price1YAgo) result.change1Y = ((currentPrice - price1YAgo) / price1YAgo) * 100;
            if (price3YAgo) result.change3Y = ((currentPrice - price3YAgo) / price3YAgo) * 100;
            if (price5YAgo) result.change5Y = ((currentPrice - price5YAgo) / price5YAgo) * 100;
            if (price10YAgo) result.change10Y = ((currentPrice - price10YAgo) / price10YAgo) * 100;

            // If daily change is 0, fall back to comparing last two data points
            if (result.changePercent === 0 && prices.length >= 2) {
              const lastPrice = prices[prices.length - 1][1];
              const prevPrice = prices[prices.length - 2][1];
              if (prevPrice !== 0) {
                result.change = lastPrice - prevPrice;
                result.changePercent = ((lastPrice - prevPrice) / prevPrice) * 100;
                result.changeLabel = "prev";
              }
            }

            // Downsample historical prices for chart (keep ~120 points max)
            const step = Math.max(1, Math.floor(prices.length / 120));
            result.historicalPrices = prices
              .filter((_: [number, number], i: number) => i % step === 0 || i === prices.length - 1)
              .map((p: [number, number]) => ({ t: p[0], p: p[1] }));
          }

          results[symbol.toLowerCase()] = result;
        } else if (data.chart?.result?.[0]) {
          const chart = data.chart.result[0];
          const price = chart.meta?.regularMarketPrice;
          const prevClose = chart.meta?.previousClose;

          if (price) {
            const change = prevClose ? price - prevClose : 0;
            const changePercent = prevClose ? (change / prevClose) * 100 : 0;
            const result: MarketResult = {
              symbol,
              name: config.name,
              price,
              change,
              changePercent,
              changeLabel: "1D"
            };

            // Calculate historical changes from Yahoo Finance monthly data
            const timestamps = chart.timestamp || [];
            const closes = chart.indicators?.quote?.[0]?.close || [];

            if (timestamps.length > 0 && closes.length > 0) {
              const now = Math.floor(Date.now() / 1000);
              const oneYearAgo = now - 365 * 24 * 60 * 60;
              const threeYearsAgo = now - 3 * 365 * 24 * 60 * 60;
              const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60;
              const tenYearsAgo = now - 10 * 365 * 24 * 60 * 60;

              // Find prices closest to 1Y, 3Y, 5Y, 10Y ago (within 60 days tolerance)
              const findPriceAtTime = (targetTime: number) => {
                let closestIdx = 0;
                let closestDiff = Math.abs(timestamps[0] - targetTime);
                for (let i = 1; i < timestamps.length; i++) {
                  const diff = Math.abs(timestamps[i] - targetTime);
                  if (diff < closestDiff) {
                    closestDiff = diff;
                    closestIdx = i;
                  }
                }
                // Only return if within 60 days of target
                if (closestDiff > 60 * 24 * 60 * 60) return null;
                return closes[closestIdx];
              };

              const price1YAgo = findPriceAtTime(oneYearAgo);
              const price3YAgo = findPriceAtTime(threeYearsAgo);
              const price5YAgo = findPriceAtTime(fiveYearsAgo);
              const price10YAgo = findPriceAtTime(tenYearsAgo);

              if (price1YAgo) result.change1Y = ((price - price1YAgo) / price1YAgo) * 100;
              if (price3YAgo) result.change3Y = ((price - price3YAgo) / price3YAgo) * 100;
              if (price5YAgo) result.change5Y = ((price - price5YAgo) / price5YAgo) * 100;
              if (price10YAgo) result.change10Y = ((price - price10YAgo) / price10YAgo) * 100;

              // If daily change is 0, fall back to last two monthly close prices
              if (result.changePercent === 0) {
                // Find last two valid (non-null) closes
                let lastValid = -1;
                let prevValid = -1;
                for (let i = closes.length - 1; i >= 0; i--) {
                  if (closes[i] != null) {
                    if (lastValid === -1) lastValid = i;
                    else if (prevValid === -1) { prevValid = i; break; }
                  }
                }
                if (lastValid >= 0 && prevValid >= 0 && closes[prevValid] !== 0) {
                  result.change = closes[lastValid] - closes[prevValid];
                  result.changePercent = ((closes[lastValid] - closes[prevValid]) / closes[prevValid]) * 100;
                  result.changeLabel = "1M";
                }
              }

              // Build historical prices for chart
              result.historicalPrices = timestamps
                .map((ts: number, i: number) => closes[i] != null ? { t: ts * 1000, p: closes[i] } : null)
                .filter((d: { t: number; p: number } | null): d is { t: number; p: number } => d !== null);
            }

            results[symbol.toLowerCase()] = result;
          } else {
            results[symbol.toLowerCase()] = null;
          }
        } else {
          results[symbol.toLowerCase()] = null;
        }
      }

      // Legacy support: also return dow and bitcoin at top level
      res.json({
        ...results,
        dow: results.dji || null,
        bitcoin: results.btc || null
      });
    } catch (error) {
      console.error("Market data error:", error);
      res.json({ dow: null, bitcoin: null });
    }
  });
}
