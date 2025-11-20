export default async function handler(request, response) {
    const { symbol } = request.query;
    const API_KEY = 'TBLWTJ1F4HSNX2EP'; // Alpha Vantage Key

    if (!symbol) {
        return response.status(400).json({ error: 'Symbol is required' });
    }

    try {
        // Strategy: 3 Calls to get everything (Revenue TTM, Shares, Cash, Debt, FCF Margin)
        // 1. INCOME_STATEMENT: Revenue History (Annual) + Revenue TTM (Quarterly sum)
        // 2. CASH_FLOW: Cash from Ops & Capex (Annual) for FCF Margin
        // 3. BALANCE_SHEET: Cash, Debt, Shares Outstanding

        const incomeUrl = `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${symbol}&apikey=${API_KEY}`;
        const cashFlowUrl = `https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${symbol}&apikey=${API_KEY}`;
        const balanceSheetUrl = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${symbol}&apikey=${API_KEY}`;

        // Fetch in parallel
        const [incomeRes, cashFlowRes, balanceSheetRes] = await Promise.all([
            fetch(incomeUrl),
            fetch(cashFlowUrl),
            fetch(balanceSheetUrl)
        ]);

        if (!incomeRes.ok || !cashFlowRes.ok || !balanceSheetRes.ok) {
            throw new Error(`Alpha Vantage API Error: ${incomeRes.status} / ${cashFlowRes.status} / ${balanceSheetRes.status}`);
        }

        const income = await incomeRes.json();
        const cashFlow = await cashFlowRes.json();
        const balanceSheet = await balanceSheetRes.json();

        // Check for API limits or empty data
        if (income.Note || cashFlow.Note || balanceSheet.Note) {
            throw new Error("Alpha Vantage API rate limit reached (5 requests/min). Please wait a moment.");
        }
        if (Object.keys(income).length === 0 && Object.keys(balanceSheet).length === 0) {
            return response.status(404).json({ error: 'Data not found for this ticker' });
        }

        // --- 1. Revenue (TTM) ---
        // Sum the last 4 quarters from INCOME_STATEMENT
        let revenueRaw = 0;
        if (income.quarterlyReports && income.quarterlyReports.length >= 4) {
            for (let i = 0; i < 4; i++) {
                revenueRaw += parseFloat(income.quarterlyReports[i].totalRevenue) || 0;
            }
        } else if (income.annualReports && income.annualReports.length > 0) {
            // Fallback to last annual if quarterly not available
            revenueRaw = parseFloat(income.annualReports[0].totalRevenue) || 0;
        }

        // --- 2. Shares Outstanding ---
        // From BALANCE_SHEET (commonStockSharesOutstanding)
        let sharesRaw = 0;
        if (balanceSheet.annualReports && balanceSheet.annualReports.length > 0) {
            sharesRaw = parseFloat(balanceSheet.annualReports[0].commonStockSharesOutstanding) || 0;
        }

        // --- 3. Cash & Debt ---
        // From BALANCE_SHEET (Most recent quarterly)
        let cashRaw = 0;
        let debtRaw = 0;
        if (balanceSheet.quarterlyReports && balanceSheet.quarterlyReports.length > 0) {
            const latestReport = balanceSheet.quarterlyReports[0];
            const cash = parseFloat(latestReport.cashAndCashEquivalentsAtCarryingValue) || 0;
            const shortTermInv = parseFloat(latestReport.shortTermInvestments) || 0;
            cashRaw = cash + shortTermInv;
            debtRaw = parseFloat(latestReport.longTermDebt) || 0;
        }

        // --- 4. FCF Margin (3-Year Average) ---
        // Formula: (Operating Cash Flow - Capital Expenditures) / Revenue
        // We need annual reports from CASH_FLOW and INCOME_STATEMENT
        let fcfMarginAvg = 0;
        let count = 0;
        let totalMargin = 0;

        if (cashFlow.annualReports && income.annualReports) {
            // Try to match up to 3 years
            const years = Math.min(3, cashFlow.annualReports.length, income.annualReports.length);

            for (let i = 0; i < years; i++) {
                const cfReport = cashFlow.annualReports[i];
                const incReport = income.annualReports[i];

                // Verify fiscal dates match (roughly)
                // simplistic check: same year string or just assume index alignment (usually safe for same ticker)

                const opsCash = parseFloat(cfReport.operatingCashflow) || 0;
                const capex = parseFloat(cfReport.capitalExpenditures) || 0;

                // Fix: Ensure we subtract Capex. 
                // If Capex is negative (e.g. -500), we want 1000 - 500 = 500.
                // If Capex is positive (e.g. 500), we want 1000 - 500 = 500.
                // Safest way is: OpsCash - Math.abs(Capex)
                const fcf = opsCash - Math.abs(capex);
                const rev = parseFloat(incReport.totalRevenue) || 1; // Avoid div by 0

                if (rev > 0) {
                    const margin = (fcf / rev) * 100;
                    totalMargin += margin;
                    count++;
                }
            }
        }

        if (count > 0) {
            fcfMarginAvg = totalMargin / count;
        } else {
            // Default fallback if no data
            fcfMarginAvg = 15;
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
