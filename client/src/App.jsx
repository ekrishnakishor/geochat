import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:3000");

function App() {
  // 1. Load Step/Messages from LocalStorage if they exist
  const savedMessages = JSON.parse(localStorage.getItem("chat_messages")) || [];
  const savedStep = localStorage.getItem("app_step") || "lobby";

  const [step, setStep] = useState(savedStep);
  const [messages, setMessages] = useState(savedMessages);
  const [inputText, setInputText] = useState("");
  const [status, setStatus] = useState("");
  const [onlineCount, setOnlineCount] = useState(0); // New State for Count

  const messagesEndRef = useRef(null);

  // 2. PERSISTENCE: Save to LocalStorage whenever state changes
  useEffect(() => {
    localStorage.setItem("chat_messages", JSON.stringify(messages));
    localStorage.setItem("app_step", step);
  }, [messages, step]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Listen for global user count
    socket.on("users_count", (count) => {
      setOnlineCount(count);
    });

    socket.on("waiting", (msg) => {
      setStep("searching");
      setStatus(msg);
    });

    socket.on("match_found", () => {
      setStep("chat");
      // Only clear messages if we were in lobby, otherwise keep history? 
      // For now, let's clear to start fresh with new person
      // setMessages([]); 
      setStatus("Connected");
    });

    socket.on("receive_message", (data) => {
      setMessages((prev) => [...prev, data]);
    });

    socket.on("partner_left", () => {
      setStatus("Stranger left");
      setMessages((prev) => [...prev, { text: "Stranger disconnected.", type: "system" }]);
    });

    return () => {
      socket.off("users_count");
      socket.off("waiting");
      socket.off("match_found");
      socket.off("receive_message");
      socket.off("partner_left");
    };
  }, []);

  const handleStart = () => {
    setMessages([]); // Clear old history on new start
    if (!navigator.geolocation) {
      alert("Geolocation is needed!");
      return;
    }
    setStatus("Accessing location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        socket.emit("find_match", { lat: latitude, lon: longitude, name: "Anonymous" });
      },
      () => setStatus("Location denied.")
    );
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    setMessages((prev) => [...prev, { text: inputText, sender: "me" }]);
    socket.emit("send_message", inputText);
    setInputText("");
  };

  const handleExit = () => {
    socket.emit("leave_chat");
    setStep("lobby");
    setMessages([]); // Clear UI
    localStorage.removeItem("chat_messages"); // Clear Storage
    localStorage.removeItem("app_step");
    setStatus("");
  };

  // --- UI ---
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 flex flex-col h-[600px]">
        
        {/* HEADER */}
        <div className="bg-indigo-600 p-4 text-white flex justify-between items-center shadow-md z-10">
          <div>
            <h1 className="font-bold text-lg tracking-wide">GeoC-Chat</h1>
            {/* LIVE COUNT BADGE */}
            <div className="flex items-center gap-1 text-xs text-indigo-200">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              {onlineCount} Online
            </div>
          </div>
          {step === "chat" && (
            <button onClick={handleExit} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2 px-4 rounded-full transition-colors">
              EXIT
            </button>
          )}
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-hidden relative bg-slate-50">
          
          {step === "lobby" && (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-4xl">📍</div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Find Nearby</h2>
                <p className="text-slate-500 mt-2">Connect with {onlineCount} people online now.</p>
              </div>
              <button onClick={handleStart} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition transform hover:-translate-y-1">
                Start Chatting
              </button>
              <p className="text-xs text-slate-400">{status}</p>
            </div>
          )}

          {step === "searching" && (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <span className="relative flex h-20 w-20">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-20 w-20 bg-indigo-500 items-center justify-center text-white text-2xl">🔍</span>
              </span>
              <h3 className="mt-8 text-xl font-semibold text-slate-700">Scanning Area...</h3>
              <p className="text-slate-500 mt-2 text-sm">{status}</p>
              <button onClick={handleExit} className="mt-8 text-slate-400 underline hover:text-slate-600">Cancel</button>
            </div>
          )}

          {step === "chat" && (
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => {
                  if (msg.type === "system") return <div key={i} className="text-center text-xs text-slate-400 my-2">{msg.text}</div>;
                  const isMe = msg.sender === "me";
                  return (
                    <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] px-5 py-3 text-sm shadow-sm ${isMe ? "bg-indigo-600 text-white rounded-2xl rounded-tr-sm" : "bg-white text-slate-800 border border-slate-200 rounded-2xl rounded-tl-sm"}`}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={sendMessage} className="bg-white p-3 border-t border-slate-200 flex gap-2">
                <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type a message..." className="flex-1 bg-slate-100 text-slate-800 rounded-full px-5 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                <button type="submit" disabled={!inputText.trim()} className="bg-indigo-600 disabled:bg-slate-300 hover:bg-indigo-700 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-md transition-all">➤</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;