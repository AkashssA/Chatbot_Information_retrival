import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [inputValue, setInputValue] = useState('');
  const [wantImage, setWantImage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // NEW: State for listening status
  const [isListening, setIsListening] = useState(false);
  
  const [messages, setMessages] = useState([
    { 
      sender: 'bot', 
      text: "Hi! I'm EcoBot. Type or use the microphone to ask about the environment!",
      image: null,
      suggestions: ["What is pollution?", "AQI in Delhi", "Save water tips"], 
      isError: false 
    }
  ]);
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // --- NEW: Voice Recognition Logic ---
  const startListening = () => {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Browser does not support speech recognition. Try Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US'; // You can change to 'en-IN' for Indian English
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsListening(true);
    recognition.start();

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(transcript);
      setIsListening(false);
      // Optional: Auto-send after speaking
      // handleSend(transcript); 
    };

    recognition.onerror = (event) => {
      console.error("Speech error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };
  };

  // --- Existing Download Logic ---
  const handleDownloadChat = () => {
    const timestamp = new Date().toLocaleString();
    let fileContent = `TRANSCRIPT - ${timestamp}\n\n`;
    messages.forEach((msg) => {
      fileContent += `[${msg.sender.toUpperCase()}]: ${msg.text}\n`;
      if (msg.image) fileContent += `[Image]: ${msg.image}\n`;
      fileContent += `\n`;
    });
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EcoBot_Chat.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const fetchBotResponse = async (query, includeImage) => {
    const apiUrl = `http://localhost:3001/api/chat`;
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, includeImage }),
      });

      if (!response.ok) throw new Error("Server error");
      const result = await response.json();
      
      if (result.response) {
        const parts = result.response.split('||');
        return { 
          text: parts[0].trim(), 
          image: result.image || null,
          suggestions: parts[1] ? parts[1].split('|').map(s => s.trim()) : [],
          isError: false 
        };
      } 
      return { text: "Unexpected response.", isError: true };

    } catch (error) {
      return { text: "Connection failed.", isError: true };
    }
  };

  const handleSend = async (text) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { sender: 'user', text: text, isError: false }]);
    setInputValue('');
    setIsLoading(true);
    const botResponse = await fetchBotResponse(text, wantImage);
    setIsLoading(false);
    setMessages(prev => [...prev, { 
        sender: 'bot', 
        text: botResponse.text, 
        image: botResponse.image, 
        suggestions: botResponse.suggestions, 
        isError: botResponse.isError 
    }]);
  };

  const handleSubmit = (e) => {
    e.preventDefault(); 
    handleSend(inputValue);
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="title">EcoBot</h1>
        <button className="download-btn" onClick={handleDownloadChat}>💾 Save Chat</button>
      </header>

      <div className="message-list">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender === 'user' ? 'user-message' : 'bot-message'}`}>
            <p>{msg.text}</p>
            {msg.image && <div className="message-image-container"><img src={msg.image} className="bot-image" onLoad={scrollToBottom} /></div>}
            {msg.suggestions && (
              <div className="suggestions-container">
                <div className="chips-wrapper">
                  {msg.suggestions.map((s, i) => (
                    <button key={i} className="suggestion-chip" onClick={() => handleSend(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {isLoading && <div className="loading-message">Bot is typing...</div>}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="form">
        {/* NEW: Microphone Button */}
        <button 
            type="button" 
            className={`mic-button ${isListening ? 'listening' : ''}`}
            onClick={startListening}
            title="Speak"
        >
            {isListening ? '🔴' : '🎤'}
        </button>

        <input
          type="text"
          className="input"
          placeholder={isListening ? "Listening..." : "Ask about pollution..."}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        
        <div className="checkbox-container">
            <label>
                <input type="checkbox" checked={wantImage} onChange={(e) => setWantImage(e.target.checked)}/>
                <span>Image?</span>
            </label>
        </div>
        <button type="submit" className="button" disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}

export default App;