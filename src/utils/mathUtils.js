export const calculateTabs = (event) => {
  if (!event || !Array.isArray(event.items) || !Array.isArray(event.members)) return {};

  let foodSubtotal = 0;
  let drinksSubtotal = 0;

  // 1. Calculate Subtotals exactly
  event.items.forEach((item) => {
    // Safely handle both 'amount' and 'price * qty' logic
    const itemTotal = Number(item.amount) || (Number(item.price) * Number(item.qty)) || 0;
    
    // Safely check type (handling casing, singular/plural, and undefined)
    const itemType = item.type ? item.type.toLowerCase() : 'uncategorized';
    
    // Default strict routing: If it's not explicitly a drink, it goes to food
    if (itemType === 'drink' || itemType === 'drinks') {
      drinksSubtotal += itemTotal;
    } else {
      foodSubtotal += itemTotal;
    }
  });

  // Bridge the tax variable names from SummaryScreen
  const taxes = event.taxes || {};
  const cgstRate = Number(taxes.cgstFood) || Number(taxes.cgstRate) || 0;
  const sgstRate = Number(taxes.sgstFood) || Number(taxes.sgstRate) || 0;
  const vatRate = Number(taxes.vatDrinks) || Number(taxes.vatRate) || 0;
  const serviceRate = Number(taxes.serviceCharge) || Number(taxes.serviceChargeRate) || 0;

  const cgstAmt = foodSubtotal * (cgstRate / 100);
  const sgstAmt = foodSubtotal * (sgstRate / 100);
  const gstAmt = cgstAmt + sgstAmt;

  const vatAmt = drinksSubtotal * (vatRate / 100);
  const serviceFood = foodSubtotal * (serviceRate / 100);
  const serviceDrinks = drinksSubtotal * (serviceRate / 100);
  const tip = Number(taxes.tipAmount) || 0;

  const overallSubtotal = foodSubtotal + drinksSubtotal;
  const rawGrandTotalWithoutFee = overallSubtotal + gstAmt + vatAmt + serviceFood + serviceDrinks + tip;

  const convFeeTotal = Math.floor(rawGrandTotalWithoutFee / 1000) * 10;
  const trialDiscountTotal = -convFeeTotal;
  
  // EXACT TOTAL INSTEAD OF ROUNDING
  const exactGrandTotal = Number((rawGrandTotalWithoutFee + convFeeTotal + trialDiscountTotal).toFixed(2));

  // 2. Calculate Individual Shares
  let rawTabs = event.members.map((member) => {
    let myFood = 0;
    let myDrinks = 0;

    event.items.forEach((item) => {
      const itemTotal = Number(item.amount) || (Number(item.price) * Number(item.qty)) || 0;
      const itemType = item.type ? item.type.toLowerCase() : 'uncategorized';

      if (itemType === 'drink' || itemType === 'drinks') {
        const claimed = item.drinkCounts || item.drinksClaimed || {};
        if (claimed[member.id] > 0) {
          myDrinks += (claimed[member.id] / (item.qty || 1)) * itemTotal;
        }
      } else {
        const splitAmong = item.assignedTo || item.splitAmong || [];
        if (splitAmong.length === 0) {
          const divisor = event.members.length > 0 ? event.members.length : 1;
          myFood += itemTotal / divisor;
        } else if (splitAmong.includes(member.id)) {
          myFood += itemTotal / splitAmong.length;
        }
      }
    });

    const mLen = event.members.length > 0 ? event.members.length : 1;
    const totalOwedRaw =
      myFood + myDrinks +
      (myFood * (cgstRate / 100)) +
      (myFood * (sgstRate / 100)) +
      (myDrinks * (vatRate / 100)) +
      (myFood * (serviceRate / 100)) +
      (myDrinks * (serviceRate / 100)) +
      (tip / mLen) + (convFeeTotal / mLen) + (trialDiscountTotal / mLen);

    const settled = (event.ledger || [])
      .filter((l) => l.fromId === member.id)
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

    return { ...member, totalOwedRaw, settled };
  });

  // 3. Lock to 2 decimal places exactly
  let exactTabs = rawTabs.map((t) => ({ ...t, totalOwed: Number(t.totalOwedRaw.toFixed(2)) }));
  
  // Distribute any 0.01 cent floating point division remainders to the first person
  const sumOfExact = Number(exactTabs.reduce((sum, t) => sum + t.totalOwed, 0).toFixed(2));
  const difference = Number((sumOfExact - exactGrandTotal).toFixed(2));
  
  if (exactTabs.length > 0 && difference !== 0) {
    exactTabs[0].totalOwed = Number((exactTabs[0].totalOwed - difference).toFixed(2));
  }

  exactTabs = exactTabs.map((t) => {
    let finalOwe = t.totalOwed;
    if (event.paymentSettings?.mode === 'one_person' && event.paymentSettings?.payerId === t.name) finalOwe = 0;
    return { ...t, remaining: Number(Math.max(0, finalOwe - t.settled).toFixed(2)) };
  });

  return {
    foodSubtotal, drinksSubtotal, cgstAmt, sgstAmt, gstAmt, vatAmt,
    serviceFood, serviceDrinks, tip, convFeeTotal, trialDiscountTotal,
    roundedGrandTotal: exactGrandTotal, // Keeping this key name backwards compatible so other screens don't crash
    personalTabs: exactTabs,
  };
};