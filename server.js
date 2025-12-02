import express from 'express';
import cors from 'cors';
import 'dotenv/config'; 
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Keeping your requested model version
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-preview-09-2025',
  // SYSTEM INSTRUCTION: We tell Gemini to separate Answer, Image Keyword, and Suggestions
  systemInstruction: `You are a helpful Environmental Science Bot.
  
  Your goal is to answer the user AND provide a single, simple English keyword to search for an image.
  
  You must strictly output your response in this specific string format (do not use JSON blocks):
  
  ANSWER_TEXT||IMAGE_KEYWORD||SUGGESTION_1|SUGGESTION_2|SUGGESTION_3
  
  Rules for IMAGE_KEYWORD:
  1. It must be 1-3 words max.
  2. It must be a visual noun (e.g., "Smog", "Forest", "Solar Panels").
  3. Do NOT use words like "For", "The", "What". Just the object.
  
  Example Output:
  Pollution is the introduction of contaminants.||Factory Smoke||Causes|Effects|Solutions`,
});

// --- HELPER: Fetch Image (Pexels) ---
// Now accepts a specific keyword from Gemini, not the raw query
async function fetchEnvironmentalImage(keyword) {
  try {
    if (!process.env.PEXELS_API_KEY) return null;
    
    console.log(`🔍 Gemini suggested searching Pexels for: "${keyword}"`); 

    const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=1&orientation=landscape`;
    const response = await fetch(pexelsUrl, { headers: { Authorization: process.env.PEXELS_API_KEY } });
    
    if (!response.ok) return null;
    const data = await response.json();
    return (data.photos && data.photos.length > 0) ? data.photos[0].src.medium : null;
  } catch (error) {
    console.error("Image retrieval failed:", error);
    return null;
  }
}

// --- HELPER: Fetch Real-Time AQI ---
async function fetchRealTimeAQI(city) {
  if (!process.env.WEATHER_API_KEY) return null;
  try {
    const geoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${city}&limit=1&appid=${process.env.WEATHER_API_KEY}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    if (!geoData.length) return null;

    const { lat, lon } = geoData[0];
    const aqiUrl = `http://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API_KEY}`;
    const aqiRes = await fetch(aqiUrl);
    const aqiData = await aqiRes.json();
    
    const aqiIndex = aqiData.list[0].main.aqi;
    const aqiLabels = { 1: "Good", 2: "Fair", 3: "Moderate", 4: "Poor", 5: "Very Poor" };
    
    return {
      city: geoData[0].name,
      index: aqiIndex,
      status: aqiLabels[aqiIndex],
      components: aqiData.list[0].components
    };
  } catch (error) {
    console.error("AQI error:", error);
    return null;
  }
}

// --- API Endpoint ---
app.post('/api/chat', async (req, res) => {
  try {
    const { query, includeImage } = req.body; 
    if (!query) return res.status(400).json({ error: 'Query is required' });

    let finalPrompt = query;
    let fetchedAQI = null;

    // Check for AQI intent
    const aqiMatch = query.match(/(?:aqi|pollution)\s+(?:in\s+)?([a-zA-Z\s]+)/i);
    if (aqiMatch && aqiMatch[1]) {
        const city = aqiMatch[1].trim();
        fetchedAQI = await fetchRealTimeAQI(city);
        if (fetchedAQI) {
          finalPrompt = `User Question: ${query}. SYSTEM DATA: The AQI in ${fetchedAQI.city} is ${fetchedAQI.index} (${fetchedAQI.status}). Explain this.`;
        }
    }

    // 1. Generate Text (Gemini)
    const result = await model.generateContent({
      contents: [{ parts: [{ text: finalPrompt }] }]
    });
    const rawText = result.response.text();

    // 2. Parse Gemini's Output
    // Expected format: Answer || Keyword || S1 | S2 | S3
    const parts = rawText.split('||');
    
    const textResponse = parts[0] ? parts[0].trim() : "Sorry, I couldn't generate an answer.";
    
    // Fallback: If Gemini forgets the format, assume the keyword is "Nature" to be safe
    const imageKeyword = (parts[1] && parts[1].trim().length > 0) ? parts[1].trim() : "Nature"; 
    
    const suggestionsRaw = parts[2] ? parts[2].trim() : "";

    // 3. Retrieve Image (Using Gemini's specific keyword)
    let imageUrl = null;
    if (includeImage || fetchedAQI) {
        imageUrl = await fetchEnvironmentalImage(imageKeyword);
    }

    // 4. Send Response
    // We reconstruct the string so the frontend can split it again for the suggestion chips
    const frontendResponseText = `${textResponse}||${suggestionsRaw}`;

    res.json({ 
        response: frontendResponseText,
        image: imageUrl 
    }); 

  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});