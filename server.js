import express from 'express';
import cors from 'cors';
import 'dotenv/config'; // Make sure to install dotenv: npm install dotenv
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';

const app = express();
const port = 3001; // We'll run the server on this port

// --- Middleware ---
// Enable CORS for all requests (so your React app can talk to this server)
app.use(cors());
// Enable parsing JSON in the request body
app.use(express.json());

// --- Google AI Setup ---
// !! IMPORTANT !!
// 1. Create a file named .env in your project root
// 2. Add this line to it: GEMINI_API_KEY=YOUR_API_KEY_HERE
// 3. Get your key from Google AI Studio: https://aistudio.google.com/app/apikey
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-preview-09-2025',
  // System instruction for the model
  systemInstruction: `You are a helpful and knowledgeable chatbot specializing in environmental science. Your name is the 'Explainable Environmental Science Bot'.
Answer the user's questions about environmental topics clearly and concisely.
Base your answers on real-time information.
Keep your answers to a short, explainable paragraph. If you need more space, use newlines.
If the user's query is not related to environmental science, gently guide them back to the topic.`,
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
};

// --- API Endpoint ---
// Your React app will send requests to this /api/chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { query } = req.body; // Get the user's query from the request

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // --- Enable Google Search Grounding ---
    // This is how you enable the "tools" for Google Search
    const request = {
      contents: [{ parts: [{ text: query }] }],
      tools: [{ googleSearch: {} }],
      generationConfig,
    };

    // Use the .generateContent() method
    const result = await model.generateContent(request);
    const response = result.response;
    const text = response.text();

    res.json({ response: text }); // Send the bot's text response back to React

  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});