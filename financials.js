const yahooFinance = require('yahoo-finance2').default;

export default async function handler(request, response) {
    const { symbol } = request.query;

    if (!symbol) {
        return response.status(400).json({ error: 'Symbol is required' });
    }

    try {
        const quoteSummary = await yahooFinance.quoteSummary(symbol, {
            modules: ['financialData', 'defaultKeyStatistics']
        });

        const financialData = quoteSummary.financialData;
        const keyStats = quoteSummary.defaultKeyStatistics;

        if (!financialData || !keyStats) {
            return response.status(404).json({ error: 'Data not found' });
        }

        // Extract values, handling potential missing data gracefully
        // Revenue: totalRevenue
        // Shares: sharesOutstanding
        // Cash: totalCash
        // Debt: totalDebt (preferred) or longTermDebt

        const revenue = financialData.totalRevenue ? financialData.totalRevenue / 1000000 : 0; // Convert to Millions
        const shares = keyStats.sharesOutstanding ? keyStats.sharesOutstanding / 1000000 : 0; // Convert to Millions
        const cash = financialData.totalCash ? financialData.totalCash / 1000000 : 0; // Convert to Millions
        const debt = financialData.totalDebt ? financialData.totalDebt / 1000000 : 0; // Convert to Millions

        return response.status(200).json({
            revenue,
            shares,
            cash,
            debt
        });

    } catch (error) {
        console.error('Yahoo Finance Error:', error);
        return response.status(500).json({ error: 'Failed to fetch data', details: error.message });
    }
}
