# Metal Fixing Report Refactoring Prompt

## Objective
Refactor `getMetalFixingReports` method to follow the same structure and logic as `getOwnStockReport`, specifically:
1. Handle `HEDGE_ENTRY` entries similar to own stock (based on purchase/sale nature)
2. Handle `OPEN-ACCOUNT-FIXING` entries similar to own stock
3. Calculate net purchase as sum of `purchase-fixing` entries
4. Calculate net sale as sum of `sales-fixing` entries  
5. Calculate short/long positions using the same logic as own stock

## Current Implementation Analysis

### Current `getMetalFixingReports` Flow:
1. Validates filters
2. Gets opening balance (if excludeOpening === false)
3. Builds `metalFxingPipeLine` aggregation (only handles purchase-fixing and sales-fixing from Registry)
4. Formats data using `formatFixingReportData`
5. Returns transaction-level report with running balances

### Target `getOwnStockReport` Flow (Reference):
1. Validates filters
2. Gets opening balance (if excludeOpening === false)
3. Gets metal transaction data (respects excludeHedging)
4. Gets fixing transactions from TransactionFixing (Registry type: purchase-fixing, sales-fixing)
5. Gets hedge fixing transactions (Registry type: HEDGE_ENTRY, only when excludeHedging === false)
   - Categorizes as purchaseFix or saleFix based on MetalTransaction.transactionType
   - Purchase nature transactions → saleFix category
   - Sale nature transactions → purchaseFix category
6. Gets open account fixing transactions (Registry type: OPEN-ACCOUNT-FIXING)
   - Categorizes as purchaseFix or saleFix based on Registry.transactionType
   - opening-purchaseFix → purchaseFix category
   - opening-saleFix → saleFix category
7. Merges all fixing data by category (purchaseFix, saleFix)
8. Gets adjustments, purity data, receivables/payables, inventory data
9. Formats using `formatOwnStockData` which calculates:
   - netPurchase = purchase + purchaseReturn + purchaseFix
   - netSale = sale + saleReturn + saleFix
   - subtotal = opening + netPurchase - Math.abs(netSale)
   - final = subtotal + adjustment + purityDifference
   - long/short = final (positive = long, negative = short)

## Required Changes for Metal Fixing Report

### Step 1: Restructure Data Collection
Instead of using a single aggregation pipeline, collect data separately like own stock:

```javascript
async getMetalFixingReports(filters) {
  try {
    // 1. Validate filters
    const validatedFilters = this.validateFilters(filters);

    // 2. Get opening balance (if excludeOpening === false)
    let openingBalance = { opening: 0, openingValue: 0 };
    const excludeOpening = filters.excludeOpening === true || filters.excludeOpening === "true";
    if (!excludeOpening && filters.fromDate) {
      openingBalance = await this.getOwnStockOpeningBalance(filters.fromDate, validatedFilters);
    }

    // 3. Get Purchase Fix / Sale Fix from Registry (type: purchase-fixing, sales-fixing)
    const fixingData = await this.getMetalFixingTransactions(validatedFilters);
    // Returns: [{ category: "purchaseFix", totalGold: X, totalValue: Y }, { category: "saleFix", totalGold: X, totalValue: Y }]

    // 4. Get Hedge Entries as Fixing Transactions (only when excludeHedging === false)
    const hedgeFixingData = await this.getMetalFixingHedgeFixingTransactions({
      ...validatedFilters,
      excludeHedging: filters.excludeHedging,
    });
    // Returns: [{ category: "purchaseFix" or "saleFix", totalGold: X, totalValue: Y }]
    // Logic: Based on MetalTransaction.transactionType
    //   - Purchase nature (purchase, importPurchase, saleReturn, exportSaleReturn, hedgeMetalReceipt) → saleFix
    //   - Sale nature (sale, exportSale, purchaseReturn, importPurchaseReturn, hedgeMetalPayment) → purchaseFix

    // 5. Get Open Account Fixing Transactions
    const openAccountFixingData = await this.getMetalFixingOpenAccountFixingTransactions(validatedFilters);
    // Returns: [{ category: "purchaseFix" or "saleFix", totalGold: X, totalValue: Y }]
    // Logic: Based on Registry.transactionType
    //   - opening-purchaseFix → purchaseFix category
    //   - opening-saleFix → saleFix category

    // 6. Merge all fixing data by category
    const mergedFixingData = [...fixingData];
    hedgeFixingData.forEach((hedgeFix) => {
      const existingIndex = mergedFixingData.findIndex((fix) => fix.category === hedgeFix.category);
      if (existingIndex >= 0) {
        mergedFixingData[existingIndex].totalGold += hedgeFix.totalGold || 0;
        mergedFixingData[existingIndex].totalValue += hedgeFix.totalValue || 0;
      } else {
        mergedFixingData.push(hedgeFix);
      }
    });
    openAccountFixingData.forEach((openAccountFix) => {
      const existingIndex = mergedFixingData.findIndex((fix) => fix.category === openAccountFix.category);
      if (existingIndex >= 0) {
        mergedFixingData[existingIndex].totalGold += openAccountFix.totalGold || 0;
        mergedFixingData[existingIndex].totalValue += openAccountFix.totalValue || 0;
      } else {
        mergedFixingData.push(openAccountFix);
      }
    });

    // 7. Format the output using new formatting method
    const formatted = this.formatMetalFixingData({
      openingBalance,
      fixingData: mergedFixingData,
      filters: {
        ...validatedFilters,
        excludeOpening: filters.excludeOpening,
      }
    });

    return {
      success: true,
      data: formatted,
      totalRecords: 1,
      filters: validatedFilters,
    };
  } catch (error) {
    console.error("Error in getMetalFixingReports:", error);
    throw new Error(`Failed to generate metal fixing report: ${error.message}`);
  }
}
```

### Step 2: Create Helper Methods

#### 2.1. `getMetalFixingTransactions(filters)`
Similar to `getOwnStockFixingTransactions` but specifically for metal fixing report:
- Query Registry where `type: { $in: ["purchase-fixing", "sales-fixing"] }`
- Must have `fixingTransactionId` (valid TransactionFixing)
- Group by type and calculate totals
- Map: purchase-fixing → purchaseFix, sales-fixing → saleFix
- Returns: `[{ category: "purchaseFix", totalGold: X, totalValue: Y }, ...]`

#### 2.2. `getMetalFixingHedgeFixingTransactions(filters)`
Copy from `getOwnStockHedgeFixingTransactions`:
- Only process when `excludeHedging === false`
- Query Registry where `type: "HEDGE_ENTRY"` and has `metalTransactionId`
- Lookup MetalTransaction and filter by `hedge === true`
- Categorize based on MetalTransaction.transactionType:
  - Purchase nature: ["purchase", "importPurchase", "saleReturn", "exportSaleReturn", "hedgeMetalReceipt", "hedgeMetalReciept"] → **saleFix**
  - Sale nature: ["sale", "exportSale", "purchaseReturn", "importPurchaseReturn", "hedgeMetalPayment"] → **purchaseFix**
- Calculate: `totalGold = sum(goldCredit - goldDebit)`, `totalValue = sum(cashDebit - cashCredit)`
- Returns: `[{ category: "purchaseFix" or "saleFix", totalGold: X, totalValue: Y }]`

#### 2.3. `getMetalFixingOpenAccountFixingTransactions(filters)`
Copy from `getOwnStockOpenAccountFixingTransactions`:
- Query Registry where `type: "OPEN-ACCOUNT-FIXING"` and `transactionType: { $in: ["opening-purchaseFix", "opening-saleFix"] }`
- Group by transactionType and map:
  - `opening-purchaseFix` → **purchaseFix** category
  - `opening-saleFix` → **saleFix** category
- Calculate: `totalGold = sum(goldCredit - goldDebit)`, `totalValue = sum(cashDebit - cashCredit)`
- Returns: `[{ category: "purchaseFix" or "saleFix", totalGold: X, totalValue: Y }]`

### Step 3: Create `formatMetalFixingData` Method

Similar to `formatOwnStockData`, but simplified for fixing-only report:

```javascript
formatMetalFixingData(data) {
  const {
    openingBalance,
    fixingData, // Array of { category: "purchaseFix" | "saleFix", totalGold: X, totalValue: Y }
    filters,
  } = data;

  // Handle excludeOpening filter
  const excludeOpening = filters?.excludeOpening === true || filters?.excludeOpening === "true";
  const openingGold = excludeOpening ? 0 : (openingBalance.opening || 0);
  const openingValue = excludeOpening ? 0 : (openingBalance.openingValue || 0);

  // Helper to find category data
  const findCategory = (categoryName) => {
    return fixingData.find((item) => item.category === categoryName) || { totalGold: 0, totalValue: 0 };
  };

  // Get fixing totals
  const purchaseFixData = findCategory("purchaseFix");
  const saleFixData = findCategory("saleFix");

  // Net Purchase = sum of purchase-fixing (purchaseFix category)
  const netPurchaseGold = purchaseFixData.totalGold || 0;
  const netPurchaseValue = purchaseFixData.totalValue || 0;

  // Net Sale = sum of sales-fixing (saleFix category)
  const netSaleGold = saleFixData.totalGold || 0;
  const netSaleValue = saleFixData.totalValue || 0;

  // Calculate subtotal = opening + netPurchase - Math.abs(netSale)
  // Note: netSale is typically negative, so we subtract its absolute value
  const subtotalGold = openingGold + netPurchaseGold - Math.abs(netSaleGold);
  const subtotalValue = openingValue + netPurchaseValue - Math.abs(netSaleValue);

  // For fixing report, final = subtotal (no adjustments or purity)
  const finalGold = subtotalGold;
  const finalValue = subtotalValue;

  // Calculate long/short: positive = long, negative = short
  const longShortGold = finalGold;
  const longShortValue = finalValue;
  const positionType = longShortGold >= 0 ? "long" : "short";

  return {
    openingBalance: {
      gold: Number(openingGold.toFixed(2)),
      value: Number(openingValue.toFixed(2)),
    },
    netPurchase: {
      gold: Number(netPurchaseGold.toFixed(2)),
      value: Number(netPurchaseValue.toFixed(2)),
    },
    netSale: {
      gold: Number(netSaleGold.toFixed(2)),
      value: Number(netSaleValue.toFixed(2)),
    },
    subtotal: {
      gold: Number(subtotalGold.toFixed(2)),
      value: Number(subtotalValue.toFixed(2)),
    },
    longShort: {
      gold: Number(longShortGold.toFixed(2)),
      value: Number(longShortValue.toFixed(2)),
      positionType: positionType, // "long" or "short"
    },
    fixingDetails: {
      purchaseFix: {
        gold: Number((purchaseFixData.totalGold || 0).toFixed(2)),
        value: Number((purchaseFixData.totalValue || 0).toFixed(2)),
      },
      saleFix: {
        gold: Number((saleFixData.totalGold || 0).toFixed(2)),
        value: Number((saleFixData.totalValue || 0).toFixed(2)),
      },
    },
  };
}
```

## Key Logic Points

### 1. Hedge Entry Categorization (Same as Own Stock)
- **Purchase nature transactions** (purchase, importPurchase, saleReturn, exportSaleReturn, hedgeMetalReceipt) → categorized as **saleFix** (hedge against sale)
- **Sale nature transactions** (sale, exportSale, purchaseReturn, importPurchaseReturn, hedgeMetalPayment) → categorized as **purchaseFix** (hedge against purchase)

### 2. Open Account Fixing Categorization (Same as Own Stock)
- `opening-purchaseFix` → **purchaseFix** category
- `opening-saleFix` → **saleFix** category

### 3. Net Purchase Calculation
- **Net Purchase** = sum of all `purchaseFix` category entries
- Includes: purchase-fixing from Registry + hedge entries (sale nature) + open account (opening-purchaseFix)

### 4. Net Sale Calculation
- **Net Sale** = sum of all `saleFix` category entries
- Includes: sales-fixing from Registry + hedge entries (purchase nature) + open account (opening-saleFix)

### 5. Short/Long Calculation (Same as Own Stock)
- **Subtotal** = opening + netPurchase - Math.abs(netSale)
- **Final/Long-Short** = subtotal (for fixing report, no adjustments/purity)
- **Position Type**: positive = "long", negative = "short"

## Implementation Checklist

- [ ] Refactor `getMetalFixingReports` to use separate data collection methods
- [ ] Create `getMetalFixingTransactions` method (similar to `getOwnStockFixingTransactions`)
- [ ] Create `getMetalFixingHedgeFixingTransactions` method (copy from `getOwnStockHedgeFixingTransactions`)
- [ ] Create `getMetalFixingOpenAccountFixingTransactions` method (copy from `getOwnStockOpenAccountFixingTransactions`)
- [ ] Implement merging logic for all fixing data by category
- [ ] Create `formatMetalFixingData` method (similar to `formatOwnStockData` but simplified)
- [ ] Ensure excludeHedging filter works correctly (skip hedge entries when true)
- [ ] Ensure excludeOpening filter works correctly
- [ ] Test with sample data to verify calculations match own stock logic
- [ ] Remove or deprecate old `metalFxingPipeLine` method if no longer needed
- [ ] Update `formatFixingReportData` if still needed for transaction-level reports

## Notes

1. The old `metalFxingPipeLine` method returns transaction-level data (each voucher as a row). The new approach returns aggregated summary data (similar to own stock). If transaction-level data is still needed, keep both methods or add a flag to switch between summary and detailed views.

2. The fixing report is simpler than own stock because it doesn't include:
   - Metal transaction data (purchase, sale, returns)
   - Adjustments (MSA)
   - Purity difference
   - Receivables/Payables
   - Inventory logs
   - Pure weight gold jewelry

3. All date filters, voucher filters, and other filters should work the same way as own stock.

4. Make sure to handle edge cases:
   - Empty data sets
   - Missing categories (default to 0)
   - Negative values in calculations
   - Zero division in averages

