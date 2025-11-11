import React, { useState, useEffect, useRef } from 'react';
// 1. Import your new CSS file
import './App.css';

// 2. All styles are gone from here! Much cleaner.

/**
 * Main Chatbot Application Component
 */
function App() {
  // State for the user's current input
  const [inputValue, setInputValue] = useState('');
  
  // State for the list of all messages (user and bot)
  const [messages, setMessages] = useState([
    { 
      sender: 'bot', 
      text: "Hi! I'm the Environmental Science Bot. Ask me about topics like pollution, renewable energy, or sustainability!",
      isError: false 
    }
  ]);
  
  // State to show a "typing..." indicator
  const [isLoading, setIsLoading] = useState(false);

  // Ref to the end of the message list, for auto-scrolling
  const messagesEndRef = useRef(null);

  // Function to scroll to the bottom of the message list
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // useEffect to scroll to bottom whenever messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  /**
   * Fetches a response from the new local proxy server.
   * @param {string} query - The user's input
   * @param {number} maxRetries - Maximum number of retries
   */
  const fetchBotResponse = async (query, maxRetries = 3) => {
    // Points to your local server
    const apiUrl = `http://localhost:3001/api/chat`;

    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Send the user's query in the body
          body: JSON.stringify({ query: query }),
        });

        if (!response.ok) {
          if (response.status >= 500) {
            console.warn(`Attempt ${attempt + 1}: Server error ${response.status}`);
            throw new Error(`Server error: ${response.status}`);
          }
          const errorData = await response.json();
          console.error('API Error Response:', errorData);
          return { text: `Sorry, I encountered an error: ${errorData.error || response.statusText}`, isError: true };
        }

        const result = await response.json();
        
        if (result.response) {
          return { text: result.response, isError: false };
        } else {
          console.error('Unexpected API response structure:', result);
          return { text: "Sorry, I received an an unexpected response. Please try again.", isError: true };
        }

      } catch (error) {
        console.warn(`Attempt ${attempt + 1} failed:`, error.message);
        attempt++;
        if (attempt >= maxRetries) {
          return { text: "Sorry, I'm having trouble connecting. Please check your network and try again later.", isError: true };
        }
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return { text: "Sorry, all attempts to get a response failed.", isError: true };
  };

  /**
   * Handles the form submission (when user presses Enter or clicks Send)
   * @param {React.FormEvent} e - The form event
   */
  const handleSubmit = async (e) => {
    e.preventDefault(); // Prevent page reload
    const userInput = inputValue.trim();

    if (!userInput) return; // Don't send empty messages

    setMessages(prev => [...prev, { sender: 'user', text: userInput, isError: false }]);
    setInputValue('');
    setIsLoading(true);

    const botResponse = await fetchBotResponse(userInput);

    setIsLoading(false);
    setMessages(prev => [...prev, { sender: 'bot', text: botResponse.text, isError: botResponse.isError }]);
  };

  // 3. All 'style' props are changed to 'className'
  return (
    <div className="app-container">
      {/* --- Header --- */}
      <header className="header">
        <h1 className="title">Explainable Environmental Science Chatbot</h1>
      </header>

      {/* --- Message List --- */}
      <div className="message-list">
        {messages.map((msg, index) => (
          <div
            key={index}
            // Combine multiple class names
            className={`message ${
              msg.sender === 'user' 
                ? 'user-message' 
                : (msg.isError ? 'error-message' : 'bot-message')
            }`}
          >
            {msg.text}
          </div>
        ))}

        {/* Show loading indicator */}
        {isLoading && (
          <div className="loading-message">
            Bot is typing...
          </div>
        )}

        {/* Empty div for auto-scrolling */}
        <div ref={messagesEndRef} />
      </div>

      {/* --- Input Form --- */}
      <form onSubmit={handleSubmit} className="form">
        <input
          type="text"
          className="input"
          placeholder="Ask about pollution, sustainability..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          aria-label="Chat input"
        />
        <button
          type="submit"
          className="button"
          disabled={isLoading} // Disable button while loading
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default App;