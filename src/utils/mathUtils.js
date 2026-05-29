export const calculateTabs = (event) => {
    if (!event || !Array.isArray(event.items) || !Array.isArray(event.members)) return {};
  
    let foodSubtotal = 0;
    let drinksSubtotal = 0;
  
    // 1. Calculate Subtotals
    event.items.forEach((item) => {
      if (item.type === 'food') foodSubtotal += item.amount || 0;
      if (item.type === 'drinks') drinksSubtotal += item.amount || 0;
    });
  
    const taxes = event.taxes || {};
    const cgstAmt = foodSubtotal * ((Number(taxes.cgstFood) || 0) / 100);
    const sgstAmt = foodSubtotal * ((Number(taxes.sgstFood) || 0) / 100);
    const gstAmt = cgstAmt + sgstAmt;
  
    const vatAmt = drinksSubtotal * ((Number(taxes.vatDrinks) || 0) / 100);
    const serviceFood = foodSubtotal * ((Number(taxes.serviceCharge) || 0) / 100);
    const serviceDrinks = drinksSubtotal * ((Number(taxes.serviceCharge) || 0) / 100);
    const tip = Number(taxes.tipAmount) || 0;
  
    const overallSubtotal = foodSubtotal + drinksSubtotal;
    const rawGrandTotalWithoutFee = overallSubtotal + gstAmt + vatAmt + serviceFood + serviceDrinks + tip;
  
    const convFeeTotal = Math.floor(rawGrandTotalWithoutFee / 1000) * 10;
    const trialDiscountTotal = -convFeeTotal;
    const roundedGrandTotal = Math.ceil(rawGrandTotalWithoutFee + convFeeTotal + trialDiscountTotal) || 0;
  
    // 2. Calculate Individual Shares
    let rawTabs = event.members.map((member) => {
      let myFood = 0;
      let myDrinks = 0;
  
      event.items.forEach((item) => {
        if (item.type === 'food') {
          const isAssigned = (item.splitAmong || []).length > 0;
          if (!isAssigned) {
            const divisor = event.members.length > 0 ? event.members.length : 1;
            myFood += (item.amount || 0) / divisor;
          } else if ((item.splitAmong || []).includes(member.id)) {
            myFood += (item.amount || 0) / item.splitAmong.length;
          }
        }
        if (item.type === 'drinks' && (item.drinksClaimed || {})[member.id] > 0) {
          myDrinks += ((item.drinksClaimed[member.id] || 0) / (item.qty || 1)) * (item.amount || 0);
        }
      });
  
      const mLen = event.members.length > 0 ? event.members.length : 1;
      const totalOwedRaw =
        myFood + myDrinks +
        (myFood * ((Number(taxes.cgstFood) || 0) / 100)) +
        (myFood * ((Number(taxes.sgstFood) || 0) / 100)) +
        (myDrinks * ((Number(taxes.vatDrinks) || 0) / 100)) +
        (myFood * ((Number(taxes.serviceCharge) || 0) / 100)) +
        (myDrinks * ((Number(taxes.serviceCharge) || 0) / 100)) +
        (tip / mLen) + (convFeeTotal / mLen) + (trialDiscountTotal / mLen);
  
      const settled = (event.ledger || [])
        .filter((l) => l.fromId === member.id)
        .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  
      return { ...member, totalOwedRaw, settled };
    });
  
    // 3. Round off and finalize
    let roundedTabs = rawTabs.map((t) => ({ ...t, totalOwed: Math.ceil(t.totalOwedRaw) || 0 }));
    
    // Fix minor rounding differences
    const sumOfRounded = roundedTabs.reduce((sum, t) => sum + t.totalOwed, 0);
    const difference = sumOfRounded - roundedGrandTotal;
    if (roundedTabs.length > 0 && difference !== 0) roundedTabs[0].totalOwed -= difference;
  
    roundedTabs = roundedTabs.map((t) => {
      let finalOwe = t.totalOwed;
      if (event.paymentSettings?.mode === 'one_person' && event.paymentSettings?.payerId === t.name) finalOwe = 0;
      return { ...t, remaining: Math.max(0, finalOwe - t.settled) };
    });
  
    return {
      foodSubtotal, drinksSubtotal, cgstAmt, sgstAmt, gstAmt, vatAmt,
      serviceFood, serviceDrinks, tip, convFeeTotal, trialDiscountTotal,
      roundedGrandTotal, personalTabs: roundedTabs,
    };
  };