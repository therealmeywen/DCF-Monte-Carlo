module.exports = async (request, response) => {
    const { symbol } = request.query;

    if (!symbol) {
        return response.status(400).json({ error: 'Symbol is required' });
    }

    try {
        // Dynamic import is required for yahoo-finance2 in Vercel Serverless Functions (CommonJS environment)
        const { default: yahooFinance } = await import('yahoo-finance2');

        // Suppress survey notices to keep logs clean
        yahooFinance.suppressNotices(['yahooSurvey']);

        // Fetch data using the library, which handles cookies/crumbs automatically
        const quoteSummary = await yahooFinance.quoteSummary(symbol, {
            modules: ['financialData', 'defaultKeyStatistics']
        });

        const financialData = quoteSummary.financialData;
        const keyStats = quoteSummary.defaultKeyStatistics;

        if (!financialData || !keyStats) {
            return response.status(404).json({ error: 'Data not found for this ticker' });
        }

        // Extract and convert to millions
        const revenue = financialData.totalRevenue ? financialData.totalRevenue / 1000000 : 0;
        const shares = keyStats.sharesOutstanding ? keyStats.sharesOutstanding / 1000000 : 0;
        const cash = financialData.totalCash ? financialData.totalCash / 1000000 : 0;
        const debt = financialData.totalDebt ? financialData.totalDebt / 1000000 : 0;

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
            details: error.message,
            stack: error.stack
        });
    }
};
