module.exports = async (request, response) => {
    const { symbol } = request.query;

    if (!symbol) {
        return response.status(400).json({ error: 'Symbol is required' });
    }

    try {
        // Direct fetch to Yahoo Finance API
        // This avoids library dependency issues and works with standard Node.js fetch (Node 18+)
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,defaultKeyStatistics`;

        // User-Agent is often required by Yahoo to avoid blocking
        const apiResponse = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        if (!apiResponse.ok) {
            throw new Error(`Yahoo API Error: ${apiResponse.status} ${apiResponse.statusText}`);
        }

        const data = await apiResponse.json();
        const result = data.quoteSummary.result;

        if (!result || result.length === 0) {
            return response.status(404).json({ error: 'Data not found for this ticker' });
        }

        const financialData = result[0].financialData;
        const keyStats = result[0].defaultKeyStatistics;

        const revenue = financialData.totalRevenue ? financialData.totalRevenue.raw / 1000000 : 0;
        const shares = keyStats.sharesOutstanding ? keyStats.sharesOutstanding.raw / 1000000 : 0;
        const cash = financialData.totalCash ? financialData.totalCash.raw / 1000000 : 0;
        const debt = financialData.totalDebt ? financialData.totalDebt.raw / 1000000 : 0;

        return response.status(200).json({
            revenue,
            shares,
            cash,
            debt
        });

    } catch (error) {
        console.error('API Error:', error);
        return response.status(500).json({
            error: 'Failed to fetch data',
            details: error.message
        });
    }
};
