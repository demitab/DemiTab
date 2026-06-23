export const calculateTabs = (event) => {
  if (!event || !Array.isArray(event.items) || !Array.isArray(event.members)) return {};

  let foodSubtotal = 0;
  let drinksSubtotal = 0;

  // 1. Calculate Subtotals exactly
  event.items.forEach((item) => {
    const itemTotal = Number(item.amount) || (Number(item.price) * Number(item.qty)) || 0;
    const itemType = item.type ? item.type.toLowerCase() : 'uncategorized';
    
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
  const globalDiscount = Number(taxes.discountAmt) || 0;

  // 🚀 MATH FIX: Apply discount to Food Subtotal first
  let effectiveFoodSubtotal = Math.max(0, foodSubtotal - globalDiscount);
  let remainingDiscount = Math.max(0, globalDiscount - foodSubtotal);
  let effectiveDrinksSubtotal = Math.max(0, drinksSubtotal - remainingDiscount);

  // Apply service charge to the discounted amounts
  const serviceFood = effectiveFoodSubtotal * (serviceRate / 100);
  const serviceDrinks = effectiveDrinksSubtotal * (serviceRate / 100);

  // Taxes are applied ON TOP of the discounted (Food + Service Charge) per Indian tax norms
  const cgstAmt = (effectiveFoodSubtotal + serviceFood) * (cgstRate / 100);
  const sgstAmt = (effectiveFoodSubtotal + serviceFood) * (sgstRate / 100);
  const gstAmt = cgstAmt + sgstAmt;

  const vatAmt = (effectiveDrinksSubtotal + serviceDrinks) * (vatRate / 100);
  const tip = Number(taxes.tipAmount) || 0;

  const rawGrandTotalWithoutFee = effectiveFoodSubtotal + effectiveDrinksSubtotal + gstAmt + vatAmt + serviceFood + serviceDrinks + tip;

  const convFeeTotal = Math.floor(rawGrandTotalWithoutFee / 1000) * 10;
  const trialDiscountTotal = -convFeeTotal;
  
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

    // 🚀 MATH FIX: Proportionally distribute the global discount to this specific member
    const memberFoodDiscount = foodSubtotal > 0 ? (globalDiscount * (myFood / foodSubtotal)) : 0;
    const memberDrinkDiscount = drinksSubtotal > 0 ? (remainingDiscount * (myDrinks / drinksSubtotal)) : 0;

    const effectiveMyFood = Math.max(0, myFood - memberFoodDiscount);
    const effectiveMyDrinks = Math.max(0, myDrinks - memberDrinkDiscount);

    const mLen = event.members.length > 0 ? event.members.length : 1;
    
    // Calculates their specific slice of the pie based on their discounted baseline
    const totalOwedRaw =
      effectiveMyFood + effectiveMyDrinks +
      (effectiveMyFood * (serviceRate / 100)) +
      (effectiveMyDrinks * (serviceRate / 100)) +
      (effectiveMyFood + (effectiveMyFood * (serviceRate / 100))) * (cgstRate / 100) +
      (effectiveMyFood + (effectiveMyFood * (serviceRate / 100))) * (sgstRate / 100) +
      (effectiveMyDrinks + (effectiveMyDrinks * (serviceRate / 100))) * (vatRate / 100) +
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
    roundedGrandTotal: exactGrandTotal, 
    personalTabs: exactTabs,
  };
};