import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY);

export const processReceiptImage = async (base64Image, mimeType = 'image/jpeg') => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    const prompt = `
    Analyze this restaurant/bar receipt and extract all the ordered items.
    
    CRITICAL RULE 1: For each item, logically identify if it is 'food' or 'drink'.
    - ONLY alcoholic beverages (Beer, Whiskey, Vodka, Wine, etc.) are 'drink'.
    - ALL non-alcoholic beverages (Coke, Water, Mixers) and actual food are 'food'.

    CRITICAL RULE 2: Extract the Price exactly as it is listed for a single unit on the receipt. Do NOT extract the multiplied total.

    Do not include any taxes, service charges, tips, discounts, or grand totals.
    Output EXACTLY in this format, one item per line, with no headers, no formatting, and no bullets:
    Item Name|Quantity|Price|Type
    
    Example Output:
    Margherita Pizza|1|450|food
    Kingfisher Premium|4|350|drink
    Diet Coke|3|150|food
    `;

    const imageParts = [{ inlineData: { data: base64Image, mimeType: mimeType === 'receipt' ? 'image/jpeg' : mimeType } }];
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    return response.text().trim();
    
  } catch (error) {
    console.error('Gemini OCR Error:', error);
    throw new Error(error.message || 'Failed to parse receipt from the image. Please try again.');
  }
};