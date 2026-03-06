// State base sales tax rates (as of 2026)
// Users will enter their total combined rate (state + county + local)
// but we provide the state base as a starting point
export const STATE_TAX_RATES: Record<string, { name: string; rate: number }> = {
  AL: { name: "Alabama", rate: 0.04 },
  AK: { name: "Alaska", rate: 0 },
  AZ: { name: "Arizona", rate: 0.056 },
  AR: { name: "Arkansas", rate: 0.065 },
  CA: { name: "California", rate: 0.0725 },
  CO: { name: "Colorado", rate: 0.029 },
  CT: { name: "Connecticut", rate: 0.0635 },
  DE: { name: "Delaware", rate: 0 },
  FL: { name: "Florida", rate: 0.06 },
  GA: { name: "Georgia", rate: 0.04 },
  HI: { name: "Hawaii", rate: 0.04 },
  ID: { name: "Idaho", rate: 0.06 },
  IL: { name: "Illinois", rate: 0.0625 },
  IN: { name: "Indiana", rate: 0.07 },
  IA: { name: "Iowa", rate: 0.06 },
  KS: { name: "Kansas", rate: 0.065 },
  KY: { name: "Kentucky", rate: 0.06 },
  LA: { name: "Louisiana", rate: 0.0445 },
  ME: { name: "Maine", rate: 0.055 },
  MD: { name: "Maryland", rate: 0.06 },
  MA: { name: "Massachusetts", rate: 0.0625 },
  MI: { name: "Michigan", rate: 0.06 },
  MN: { name: "Minnesota", rate: 0.06875 },
  MS: { name: "Mississippi", rate: 0.07 },
  MO: { name: "Missouri", rate: 0.04225 },
  MT: { name: "Montana", rate: 0 },
  NE: { name: "Nebraska", rate: 0.055 },
  NV: { name: "Nevada", rate: 0.0685 },
  NH: { name: "New Hampshire", rate: 0 },
  NJ: { name: "New Jersey", rate: 0.06625 },
  NM: { name: "New Mexico", rate: 0.04875 },
  NY: { name: "New York", rate: 0.04 },
  NC: { name: "North Carolina", rate: 0.0475 },
  ND: { name: "North Dakota", rate: 0.05 },
  OH: { name: "Ohio", rate: 0.0575 },
  OK: { name: "Oklahoma", rate: 0.045 },
  OR: { name: "Oregon", rate: 0 },
  PA: { name: "Pennsylvania", rate: 0.06 },
  RI: { name: "Rhode Island", rate: 0.07 },
  SC: { name: "South Carolina", rate: 0.06 },
  SD: { name: "South Dakota", rate: 0.042 },
  TN: { name: "Tennessee", rate: 0.07 },
  TX: { name: "Texas", rate: 0.0625 },
  UT: { name: "Utah", rate: 0.0485 },
  VT: { name: "Vermont", rate: 0.06 },
  VA: { name: "Virginia", rate: 0.043 },
  WA: { name: "Washington", rate: 0.065 },
  WV: { name: "West Virginia", rate: 0.06 },
  WI: { name: "Wisconsin", rate: 0.05 },
  WY: { name: "Wyoming", rate: 0.04 },
  DC: { name: "District of Columbia", rate: 0.06 },
};

// Filing due dates by frequency
export function getNextFilingDue(
  frequency: string,
  fromDate: Date = new Date()
): { dueDate: Date; periodLabel: string } {
  const now = fromDate;
  if (frequency === "monthly") {
    // Due by the 20th of the following month
    const due = new Date(now.getFullYear(), now.getMonth() + 1, 20);
    const periodMonth = now.toLocaleString("default", {
      month: "long",
      year: "numeric",
    });
    return { dueDate: due, periodLabel: periodMonth };
  } else {
    // Quarterly: due by the last day of the month following the quarter end
    // Q1 (Jan-Mar) due Apr 30, Q2 (Apr-Jun) due Jul 31, Q3 (Jul-Sep) due Oct 31, Q4 (Oct-Dec) due Jan 31
    const quarter = Math.floor(now.getMonth() / 3);
    const quarterEndMonth = (quarter + 1) * 3;
    const dueMonth = quarterEndMonth; // month after quarter ends (0-indexed)
    let dueYear = now.getFullYear();
    if (dueMonth >= 12) {
      dueYear++;
    }
    const dueDay = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
      dueMonth % 12
    ];
    const due = new Date(dueYear, dueMonth % 12, dueDay);
    const quarterLabels = [
      "Q1 (Jan-Mar)",
      "Q2 (Apr-Jun)",
      "Q3 (Jul-Sep)",
      "Q4 (Oct-Dec)",
    ];
    return {
      dueDate: due,
      periodLabel: `${quarterLabels[quarter]} ${now.getFullYear()}`,
    };
  }
}
