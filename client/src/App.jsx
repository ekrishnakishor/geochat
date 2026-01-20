import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:3000");

function App() {
  const [step, setStep] = useState("lobby");
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [status, setStatus] = useState("");
  const [onlineCount, setOnlineCount] = useState(0);
  
  // NEW SETTINGS STATES
  const [mode, setMode] = useState("local"); // 'local' | 'global'
  const [region, setRegion] = useState("random");
  const [displayName, setDisplayName] = useState("");
  const [isBanned, setIsBanned] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    socket.on("users_count", (count) => setOnlineCount(count));
    
    socket.on("waiting", (msg) => {
      setStep("searching");
      setStatus(msg);
    });

    socket.on("match_found", () => {
      setStep("chat");
      setMessages([]);
      setStatus("Connected");
    });

    socket.on("receive_message", (data) => setMessages((prev) => [...prev, data]));

    socket.on("partner_left", () => {
      setStatus("Stranger left");
      setMessages((prev) => [...prev, { text: "Stranger disconnected.", type: "system" }]);
    });
    
    // BAN HANDLING
    socket.on("banned", (reason) => {
      setIsBanned(true);
      alert(reason);
      socket.disconnect();
    });
    
    socket.on("system_message", (msg) => {
       setMessages((prev) => [...prev, { text: msg, type: "system" }]);
    });

    return () => {
      socket.off("users_count");
      socket.off("waiting");
      socket.off("match_found");
      socket.off("receive_message");
      socket.off("partner_left");
      socket.off("banned");
    };
  }, []);

  const handleStart = () => {
    if (mode === "local") {
      if (!navigator.geolocation) return alert("Geolocation required for Local Mode.");
      setStatus("Accessing location...");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          socket.emit("find_match", { 
            mode: "local", 
            lat: pos.coords.latitude, 
            lon: pos.coords.longitude, 
            name: displayName 
          });
        },
        () => setStatus("Location denied.")
      );
    } else {
      // GLOBAL MODE
      socket.emit("find_match", { 
        mode: "global", 
        region: region, 
        name: displayName 
      });
    }
  };

  const handleReport = () => {
    if (confirm("Are you sure? This will report and block the user.")) {
      socket.emit("report_user");
      setStep("lobby");
      setMessages([]);
      setStatus("Report submitted.");
    }
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
    setMessages([]);
    setStatus("");
  };

  if (isBanned) return <div className="h-screen flex items-center justify-center font-bold text-red-600">🚫 ACCESS DENIED</div>;

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 flex flex-col h-[650px]">
        
        {/* HEADER */}
        <div className="bg-indigo-600 p-4 text-white flex justify-between items-center shadow-md z-10">
          <div>
            <h1 className="font-bold text-lg tracking-wide">AnonChat</h1>
            <div className="flex items-center gap-1 text-xs text-indigo-200">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              {onlineCount} Online
            </div>
          </div>
          {step === "chat" && (
            <div className="flex gap-2">
              <button onClick={handleReport} className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold py-2 px-3 rounded-lg">
                ⚠️ REPORT
              </button>
              <button onClick={handleExit} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2 px-3 rounded-lg">
                EXIT
              </button>
            </div>
          )}
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-hidden relative bg-slate-50">
          
          {step === "lobby" && (
            <div className="h-full flex flex-col items-center justify-center p-8 space-y-6">
              
              {/* SLIDER TOGGLE */}
              <div className="bg-slate-200 p-1 rounded-full flex w-full relative">
                <div 
                  className={`absolute top-1 bottom-1 w-[48%] bg-white rounded-full shadow-md transition-all duration-300 ${mode === "local" ? "left-1" : "left-[50%]"}`} 
                ></div>
                <button onClick={() => setMode("local")} className="flex-1 py-2 text-sm font-bold z-10 relative text-center">📍 Local</button>
                <button onClick={() => setMode("global")} className="flex-1 py-2 text-sm font-bold z-10 relative text-center">🌍 Global</button>
              </div>

              {/* SETTINGS AREA */}
              <div className="w-full space-y-4">
                
                {/* Name Input */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Your Display Name</label>
                  <input 
                    type="text" 
                    placeholder="Enter nickname (Optional)" 
                    className="w-full mt-1 p-3 border rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>

                {/* Region Select (Only for Global) */}
                {mode === "global" && (
                  <div className="animate-fade-in">
                    <label className="text-xs font-bold text-slate-400 uppercase">Select Region</label>
                    <select 
                      className="w-full mt-1 p-3 border rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                    >
                      <option value="random">🎲 Random Server</option>
                      <option value="india">🇮🇳 India</option>
                      <option value="usa">🇺🇸 USA</option>
                      <option value="uk">🇬🇧 UK</option>
                      <option value="asia">🌏 Asia General</option>
                    </select>
                  </div>
                )}
              </div>

              <button onClick={handleStart} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition transform hover:-translate-y-1">
                Start Chatting
              </button>
              <p className="text-xs text-slate-400 h-4">{status}</p>
            </div>
          )}

          {step === "searching" && (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <span className="relative flex h-20 w-20">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-20 w-20 bg-indigo-500 items-center justify-center text-white text-2xl">🔍</span>
              </span>
              <h3 className="mt-8 text-xl font-semibold text-slate-700">Searching...</h3>
              <p className="text-slate-500 mt-2 text-sm">{status}</p>
              <button onClick={handleExit} className="mt-8 text-slate-400 underline hover:text-slate-600">Cancel</button>
            </div>
          )}

          {step === "chat" && (
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => {
                  if (msg.type === "system") return <div key={i} className="text-center text-xs text-slate-400 my-2 bg-slate-200 py-1 rounded-lg inline-block mx-auto px-3">{msg.text}</div>;
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