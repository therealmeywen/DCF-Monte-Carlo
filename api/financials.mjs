export default async function handler(request, response) {
    const { symbol } = request.query;
    const API_KEY = 'TBLWTJ1F4HSNX2EP'; // User provided key

    if (!symbol) {
        return response.status(400).json({ error: 'Symbol is required' });
    }

    try {
        // Alpha Vantage requires two separate calls to get all the data we need
        // 1. OVERVIEW: RevenueTTM, SharesOutstanding
        // 2. BALANCE_SHEET: Cash, Debt

        const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${API_KEY}`;
        const balanceSheetUrl = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${symbol}&apikey=${API_KEY}`;

        // Fetch in parallel for speed
        const [overviewRes, balanceSheetRes] = await Promise.all([
            fetch(overviewUrl),
            fetch(balanceSheetUrl)
        ]);

        if (!overviewRes.ok || !balanceSheetRes.ok) {
            throw new Error(`Alpha Vantage API Error: ${overviewRes.status} / ${balanceSheetRes.status}`);
        }

        const overview = await overviewRes.json();
        const balanceSheet = await balanceSheetRes.json();

        // Check for API limits or empty data
        if (overview.Note || balanceSheet.Note) {
            throw new Error("Alpha Vantage API rate limit reached (5 requests/min). Please wait a moment.");
        }
        if (Object.keys(overview).length === 0) {
            return response.status(404).json({ error: 'Data not found for this ticker' });
        }

        // Extract Data
        // Note: Alpha Vantage returns strings, often "None" or "0"

        // 1. Revenue (TTM)
        const revenueRaw = parseFloat(overview.RevenueTTM) || 0;

        // 2. Shares Outstanding
        const sharesRaw = parseFloat(overview.SharesOutstanding) || 0;

        // 3. Cash & Equivalents + Short Term Investments (Most recent quarterly)
        let cashRaw = 0;
        let debtRaw = 0;

        if (balanceSheet.quarterlyReports && balanceSheet.quarterlyReports.length > 0) {
            const latestReport = balanceSheet.quarterlyReports[0];

            const cash = parseFloat(latestReport.cashAndCashEquivalentsAtCarryingValue) || 0;
            const shortTermInv = parseFloat(latestReport.shortTermInvestments) || 0;
            cashRaw = cash + shortTermInv;

            const longTermDebt = parseFloat(latestReport.longTermDebt) || 0;
            const currentDebt = parseFloat(latestReport.shortTermDebt) || 0; // Optional: add short term debt if desired, usually DCF uses Total Debt or Long Term
            // User asked for "Long-Term Debt" specifically in the UI, but often Total Debt is preferred. 
            // Let's stick to Long Term Debt + Short Term Debt (Total Debt) if available, or just Long Term.
            // The UI label is "Long-Term Debt", so let's use longTermDebt.
            debtRaw = longTermDebt;
        }

        // Convert to Millions (User's UI expects Millions)
        // Alpha Vantage numbers are usually raw units (e.g. 1000000000 for 1B)
        const revenue = revenueRaw / 1000000;
        const shares = sharesRaw / 1000000;
        const cash = cashRaw / 1000000;
        const debt = debtRaw / 1000000;

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
}
