export default async function handler(request, response) {
    const { symbol } = request.query;
    const API_KEY = 'bygF424H6WL5l5DxreTatnmuvXQFwnhI'; // FMP Key

    if (!symbol) {
        return response.status(400).json({ error: 'Symbol is required' });
    }

    try {
        // Financial Modeling Prep (FMP) Strategy
        // 1. Income Statement (Annual & Quarterly)
        // 2. Balance Sheet (Quarterly)
        // 3. Cash Flow (Annual)

        const incomeAnnualUrl = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=3&apikey=${API_KEY}`;
        const incomeQuarterlyUrl = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=quarter&limit=4&apikey=${API_KEY}`;
        const balanceSheetUrl = `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${symbol}?period=quarter&limit=1&apikey=${API_KEY}`;
        const cashFlowUrl = `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?limit=3&apikey=${API_KEY}`;

        // Fetch in parallel
        const [incAnnRes, incQuartRes, balRes, cfRes] = await Promise.all([
            fetch(incomeAnnualUrl),
            fetch(incomeQuarterlyUrl),
            fetch(balanceSheetUrl),
            fetch(cashFlowUrl)
        ]);

        if (!incAnnRes.ok || !incQuartRes.ok || !balRes.ok || !cfRes.ok) {
            // FMP often returns 200 even with empty array, but check status just in case
            // If 403, it means key is invalid or limit reached
            if (incAnnRes.status === 403) throw new Error("FMP API Limit Reached or Invalid Key");
            throw new Error(`FMP API Error`);
        }

        const incomeAnnual = await incAnnRes.json();
        const incomeQuarterly = await incQuartRes.json();
        const balanceSheet = await balRes.json();
        const cashFlow = await cfRes.json();

        // FMP returns empty array [] if invalid ticker
        if (!Array.isArray(incomeAnnual) || incomeAnnual.length === 0) {
            return response.status(404).json({ error: 'Data not found for this ticker' });
        }

        // --- 1. Revenue (TTM) ---
        // Sum last 4 quarters
        let revenueRaw = 0;
        if (incomeQuarterly && incomeQuarterly.length === 4) {
            revenueRaw = incomeQuarterly.reduce((sum, q) => sum + (q.revenue || 0), 0);
        } else if (incomeAnnual.length > 0) {
            // Fallback to last annual
            revenueRaw = incomeAnnual[0].revenue || 0;
        }

        // --- 2. Shares Outstanding ---
        // Use 'weightedAverageShsOut' from most recent annual income statement or balance sheet
        // FMP Income Statement has 'weightedAverageShsOut'
        let sharesRaw = 0;
        if (incomeAnnual.length > 0) {
            sharesRaw = incomeAnnual[0].weightedAverageShsOut || 0;
        }

        // --- 3. Cash & Debt ---
        // From latest Quarterly Balance Sheet
        let cashRaw = 0;
        let debtRaw = 0;
        if (balanceSheet && balanceSheet.length > 0) {
            const bs = balanceSheet[0];
            cashRaw = (bs.cashAndCashEquivalents || 0) + (bs.shortTermInvestments || 0);
            debtRaw = bs.longTermDebt || 0; // Or bs.totalDebt for total
        }

        // --- 4. FCF Margin (3-Year Average) ---
        // Formula: (Operating Cash Flow - Capital Expenditures) / Revenue
        // FMP Cash Flow has 'operatingCashFlow' and 'capitalExpenditure' (usually negative)
        let fcfMarginAvg = 0;
        let count = 0;
        let totalMargin = 0;

        if (cashFlow && cashFlow.length > 0 && incomeAnnual.length > 0) {
            // We requested limit=3, so we should have up to 3 years
            const years = Math.min(3, cashFlow.length, incomeAnnual.length);

            for (let i = 0; i < years; i++) {
                const cf = cashFlow[i];
                // Find matching income statement by year (FMP returns sorted by date desc)
                // Ideally index matches if both have same history length
                const inc = incomeAnnual[i];

                if (cf && inc) {
                    const opsCash = cf.operatingCashFlow || 0;
                    const capex = cf.capitalExpenditure || 0;
                    // FMP Capex is negative. 
                    // FCF = Ops - |Capex|
                    const fcf = opsCash - Math.abs(capex);
                    const rev = inc.revenue || 1;

                    if (rev > 0) {
                        const margin = (fcf / rev) * 100;
                        totalMargin += margin;
                        count++;
                    }
                }
            }
        }

        if (count > 0) {
            fcfMarginAvg = totalMargin / count;
        } else {
            fcfMarginAvg = 15; // Default
        }

        // Convert to Millions
        const revenue = revenueRaw / 1000000;
        const shares = sharesRaw / 1000000;
        const cash = cashRaw / 1000000;
        const debt = debtRaw / 1000000;

        return response.status(200).json({
            revenue,
            shares,
            cash,
            debt,
            fcfMargin: fcfMarginAvg
        });

    } catch (error) {
        console.error('API Error:', error);
        return response.status(500).json({
            error: 'Failed to fetch data',
            details: error.message
        });
    }
}
