import yahooFinance from 'yahoo-finance2';

export default async function handler(request, response) {
    const { symbol } = request.query;

    if (!symbol) {
        return response.status(400).json({ error: 'Symbol is required' });
    }

    try {
        // Suppress survey notices to keep logs clean
        // Check if method exists to be safe, though it should in ESM
        if (yahooFinance.suppressNotices) {
            yahooFinance.suppressNotices(['yahooSurvey']);
        }

        // Fetch data using the library
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
}
