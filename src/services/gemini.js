import Constants from 'expo-constants';

const GEMINI_MODEL = 'gemini-3.1-flash-lite';

// 1. Securely fetch the API Key
export const getGeminiApiKey = () => {
  try {
    const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};
    return (
      process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
      extra.EXPO_PUBLIC_GEMINI_API_KEY ||
      ''
    );
  } catch (e) {
    console.error('Gemini API Key missing:', e);
    return '';
  }
};

// 2. The core AI processing engine
export const processReceiptImage = async (base64Data, type) => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('Missing Gemini API Key');

  // Strict prompt to ensure clean data extraction
  const prompt = `Extract the menu items from this ${type} receipt image. Return ONLY plain text. Do NOT use JSON, do not use markdown, and do not add any conversational text. CRITICAL: Preserve all decimal values exactly but REMOVE ALL COMMAS from numerical values (e.g. output 1000.00 instead of 1,000.00). For each item, output exactly one line using this exact pipe-separated format: Name | Quantity | Price | Amount`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: base64Data } },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Gemini API error ${res.status}`);
  }

  const json = await res.json();
  const rawText = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  
  return rawText.replace(/`/g, '').trim();
};