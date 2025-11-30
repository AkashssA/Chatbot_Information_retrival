import express from 'express';
import cors from 'cors';
import 'dotenv/config'; 
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-preview-09-2025',
  // System instruction demands the || format for suggestion chips
  systemInstruction: `You are a helpful Environmental Science Bot. 
Answer clearly and concisely in one paragraph.
If you are provided with real-time AQI data in the prompt, use it to answer the user.
At the very end of your response, strictly add '||' followed by 3 related short follow-up questions separated by '|'.
Example format:
Your main answer text goes here.||What are the causes?|How to prevent it?|Global statistics`,
});

// --- HELPER 1: Clean query for Image ---
function cleanQueryForImage(query) {
  const stopWords = ['give', 'me', 'show', 'an', 'image', 'of', 'picture', 'photo', 'images', 'pictures', 'photos', 'the', 'a', 'aqi', 'pollution', 'in'];
  const words = query.split(' ');
  const keywords = words.filter(word => !stopWords.includes(word.toLowerCase()));
  return keywords.length > 0 ? keywords.join(' ') : query;
}

// --- HELPER 2: Fetch Image (Pexels) ---
async function fetchEnvironmentalImage(rawQuery) {
  try {
    if (!process.env.PEXELS_API_KEY) return null;
    const searchTerm = cleanQueryForImage(rawQuery);
    const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchTerm)}&per_page=1&orientation=landscape`;
    const response = await fetch(pexelsUrl, { headers: { Authorization: process.env.PEXELS_API_KEY } });
    if (!response.ok) return null;
    const data = await response.json();
    return (data.photos && data.photos.length > 0) ? data.photos[0].src.medium : null;
  } catch (error) {
    console.error("Image retrieval failed:", error);
    return null;
  }
}

// --- HELPER 3: Fetch Real-Time AQI (OpenWeatherMap) ---
async function fetchRealTimeAQI(city) {
  if (!process.env.WEATHER_API_KEY) {
    console.warn("Weather API Key missing");
    return null;
  }

  try {
    // 1. Get Coordinates (Lat/Lon)
    const geoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${city}&limit=1&appid=${process.env.WEATHER_API_KEY}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();

    if (!geoData.length) return null;

    const { lat, lon } = geoData[0];

    // 2. Get Air Pollution Data
    const aqiUrl = `http://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API_KEY}`;
    const aqiRes = await fetch(aqiUrl);
    const aqiData = await aqiRes.json();
    
    // Map index 1-5 to readable text
    const aqiIndex = aqiData.list[0].main.aqi;
    const aqiLabels = { 1: "Good", 2: "Fair", 3: "Moderate", 4: "Poor", 5: "Very Poor" };
    
    return {
      city: geoData[0].name,
      index: aqiIndex,
      status: aqiLabels[aqiIndex],
      components: aqiData.list[0].components // contains pm2_5, pm10, etc.
    };
  } catch (error) {
    console.error("AQI Fetch Error:", error);
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

    // --- LOGIC: CHECK FOR AQI INTENT ---
    // Regex checks for "aqi [city]" or "pollution in [city]"
    const aqiMatch = query.match(/(?:aqi|pollution)\s+(?:in\s+)?([a-zA-Z\s]+)/i);
    
    if (aqiMatch && aqiMatch[1]) {
        const city = aqiMatch[1].trim();
        console.log(`🌍 Detecting AQI request for city: ${city}`);
        
        fetchedAQI = await fetchRealTimeAQI(city);

        if (fetchedAQI) {
          // RAG: Inject the real data into the prompt for Gemini
          finalPrompt = `
          User Question: ${query}
          
          SYSTEM NOTE - REAL TIME DATA FETCHED:
          The current Air Quality Index (AQI) in ${fetchedAQI.city} is ${fetchedAQI.index} which is considered "${fetchedAQI.status}".
          Pollutant details: PM2.5: ${fetchedAQI.components.pm2_5}, PM10: ${fetchedAQI.components.pm10}.
          
          Task: Explain this air quality status to the user simply. Is it safe?
          `;
        }
    }

    // 1. Generate Text (Gemini)
    const result = await model.generateContent({
      contents: [{ parts: [{ text: finalPrompt }] }]
    });
    const textResponse = result.response.text();

    // 2. Retrieve Image (if requested OR if it's an AQI query, we force an image search for visual context)
    let imageUrl = null;
    
    // If user checked box OR we just fetched AQI (it looks nice to show the city/smog)
    if (includeImage || fetchedAQI) {
        // If we found AQI, search for "Smog in Delhi" or just "Delhi"
        const searchCanvas = fetchedAQI ? `Pollution in ${fetchedAQI.city}` : query;
        imageUrl = await fetchEnvironmentalImage(searchCanvas);
    }

    res.json({ response: textResponse, image: imageUrl }); 

  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});