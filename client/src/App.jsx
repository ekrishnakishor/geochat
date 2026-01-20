// client/src/App.jsx
import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:3000");
const generateRandomSeed = () => Math.random().toString(36).substring(7);

function App() {
  const [step, setStep] = useState("lobby");
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [status, setStatus] = useState("");
  const [onlineCount, setOnlineCount] = useState(0);

  // Avatar & Typing
  const [myAvatar, setMyAvatar] = useState(generateRandomSeed());
  const [partnerAvatar, setPartnerAvatar] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [reconnectOffer, setReconnectOffer] = useState(null);
  
  // Settings
  const [mode, setMode] = useState("local");
  const [displayName, setDisplayName] = useState("");

  // --- DEVELOPER CONSOLE STATE ---
  const [showDevLogs, setShowDevLogs] = useState(false);
  const [logs, setLogs] = useState([]);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const logsEndRef = useRef(null);

  // Helper to add logs to our Dev Console
  const addLog = (type, event, data) => {
    const time = new Date().toLocaleTimeString().split(" ")[0];
    setLogs(prev => [...prev.slice(-49), { time, type, event, data }]); // Keep last 50 logs
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Scroll dev logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, showDevLogs]);

  useEffect(() => {
    // 1. LISTEN TO EVERYTHING (Incoming)
    socket.onAny((eventName, ...args) => {
      if (eventName === "timer" || eventName === "typing_start") return; // Ignore spammy events
      addLog("RX", eventName, args[0]);
    });

    // 2. STANDARD LISTENERS
    socket.on("users_count", (count) => setOnlineCount(count));
    
    socket.on("waiting", (msg) => {
      setStep("searching");
      setStatus(msg);
    });

    socket.on("match_found", ({ partnerAvatar }) => {
      setStep("chat");
      setMessages([]);
      setPartnerAvatar(partnerAvatar);
      setStatus("Connected");
      setReconnectOffer(null);
      addLog("SYS", "Match Started", "Clearing previous state");
    });

    socket.on("receive_message", (data) => {
      setMessages((prev) => [...prev, data]);
      setIsTyping(false);
    });

    socket.on("partner_typing", (typing) => setIsTyping(typing));

    socket.on("partner_left", () => {
      setStatus("Stranger left");
      setMessages((prev) => [...prev, { text: "Stranger disconnected.", type: "system" }]);
      setIsTyping(false);
    });

    socket.on("reconnect_offer", ({ offererId }) => {
      setReconnectOffer(offererId);
    });

    socket.on("system_message", (msg) => {
        if(step === 'chat') setMessages((prev) => [...prev, { text: msg, type: "system" }]);
        else alert(msg);
    });

    return () => {
      socket.offAny(); // Cleanup global listener
      socket.off("users_count");
      socket.off("waiting");
      socket.off("match_found");
      socket.off("receive_message");
      socket.off("partner_typing");
      socket.off("partner_left");
      socket.off("reconnect_offer");
      socket.off("system_message");
    };
  }, [step]); // Re-run when step changes to ensure listeners are active

  // Wrapper for Emit to log Outgoing events
  const emit = (event, data) => {
    addLog("TX", event, data);
    socket.emit(event, data);
  };

  // --- HANDLERS ---
  const handleStart = () => {
    const payload = { name: displayName, avatarSeed: myAvatar };
    if (mode === "local") {
      if (!navigator.geolocation) return alert("Location needed.");
      setStatus("Locating...");
      navigator.geolocation.getCurrentPosition(
        (pos) => emit("find_match", { ...payload, mode: "local", lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => setStatus("Location denied.")
      );
    } else {
      emit("find_match", { ...payload, mode: "global", region: "random" });
    }
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    socket.emit("typing_start"); // Don't log this one, too spammy
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socket.emit("typing_stop"), 1000);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    socket.emit("typing_stop");
    setMessages((prev) => [...prev, { text: inputText, sender: "me" }]);
    emit("send_message", inputText); // Use wrapper
    setInputText("");
  };

  const handleExit = () => {
    emit("leave_chat"); // Use wrapper
    setStep("lobby");
    setMessages([]);
    setIsTyping(false);
    setStatus("");
  };

  const requestReconnect = () => {
    emit("request_reconnect"); // Use wrapper
    setMessages((prev) => [...prev, { text: "Sending request...", type: "system" }]);
  };

  const acceptReconnect = () => {
    if (reconnectOffer) {
      emit("accept_reconnect", { offererId: reconnectOffer }); // Use wrapper
      setReconnectOffer(null);
    }
  };

  const getAvatar = (seed) => `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}&backgroundColor=b6e3f4`;

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans relative">
      
      {/* --- APP CONTAINER --- */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 flex flex-col h-[650px] relative z-10">
        
        {/* HEADER */}
        <div className="bg-indigo-600 p-4 text-white flex justify-between items-center shadow-md z-10">
          <div className="flex items-center gap-3">
            <img src={getAvatar(myAvatar)} className="w-8 h-8 rounded-full border border-white/50 bg-white" />
            <div>
              <h1 className="font-bold text-lg leading-tight">Geo-c-Chat</h1>
              <div className="flex items-center gap-1 text-xs text-indigo-200">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                {onlineCount} Online
              </div>
            </div>
          </div>
          {step === "chat" && <button onClick={handleExit} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2 px-3 rounded-lg">EXIT</button>}
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-hidden relative bg-slate-50">
          {step === "lobby" && (
            <div className="h-full flex flex-col items-center justify-center p-8 space-y-6 animate-fade-in">
              <div className="relative group cursor-pointer" onClick={() => setMyAvatar(generateRandomSeed())}>
                 <img src={getAvatar(myAvatar)} className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-indigo-50" />
                 <div className="absolute bottom-0 right-0 bg-indigo-600 text-white p-1 rounded-full text-xs border-2 border-white">✏️</div>
              </div>
              <div className="bg-slate-200 p-1 rounded-full flex w-full relative">
                <div className={`absolute top-1 bottom-1 w-[48%] bg-white rounded-full shadow-md transition-all duration-300 ${mode === "local" ? "left-1" : "left-[50%]"}`}></div>
                <button onClick={() => setMode("local")} className="flex-1 py-2 text-sm font-bold z-10 relative">📍 Local</button>
                <button onClick={() => setMode("global")} className="flex-1 py-2 text-sm font-bold z-10 relative">🌍 Global</button>
              </div>
              <input type="text" placeholder="Display Name (Optional)" className="w-full p-3 border rounded-xl bg-white outline-none text-center" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              <button onClick={handleStart} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg">Start Chatting</button>
            </div>
          )}

          {step === "searching" && (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
               <span className="relative flex h-20 w-20">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-20 w-20 bg-indigo-500 items-center justify-center text-white text-2xl">🔍</span>
              </span>
              <h3 className="mt-8 text-xl font-semibold text-slate-700">Finding Partner...</h3>
              <button onClick={handleExit} className="mt-8 text-slate-400 underline">Cancel</button>
            </div>
          )}

          {step === "chat" && (
            <div className="h-full flex flex-col animate-fade-in">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => {
                  if (msg.type === "system") return <div key={i} className="text-center text-xs text-slate-400 my-2 bg-slate-200 py-1 rounded-lg inline-block mx-auto px-3">{msg.text}</div>;
                  const isMe = msg.sender === "me";
                  return (
                    <div key={i} className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                      <img src={getAvatar(isMe ? myAvatar : partnerAvatar)} className="w-8 h-8 rounded-full border border-slate-200 bg-white shadow-sm" />
                      <div className={`max-w-[70%] px-4 py-2 text-sm shadow-sm ${isMe ? "bg-indigo-600 text-white rounded-2xl rounded-br-none" : "bg-white text-slate-800 border border-slate-200 rounded-2xl rounded-bl-none"}`}>{msg.text}</div>
                    </div>
                  );
                })}
                {isTyping && <div className="text-xs text-slate-400 ml-12">Stranger is typing...</div>}
                <div ref={messagesEndRef} />
              </div>

              {status === "Stranger left" && (
                <div className="absolute bottom-20 left-0 right-0 flex justify-center z-20">
                  <button onClick={requestReconnect} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-full shadow-lg border-2 border-white">↩️ Ask to Reconnect</button>
                </div>
              )}

              <form onSubmit={sendMessage} className="bg-white p-3 border-t border-slate-200 flex gap-2">
                <input value={inputText} onChange={handleInputChange} placeholder="Type a message..." className="flex-1 bg-slate-100 text-slate-800 rounded-full px-5 py-3 outline-none" />
                <button type="submit" disabled={!inputText.trim()} className="bg-indigo-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-md">➤</button>
              </form>
            </div>
          )}
        </div>

        {reconnectOffer && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-white p-6 rounded-2xl shadow-2xl text-center max-w-[80%] mx-4">
              <div className="text-4xl mb-2">🤝</div>
              <h3 className="font-bold text-lg">Reconnection Request</h3>
              <div className="flex gap-2 justify-center mt-4">
                <button onClick={() => setReconnectOffer(null)} className="px-4 py-2 text-slate-500">Ignore</button>
                <button onClick={acceptReconnect} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold">Accept</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- DEVELOPER CONSOLE --- */}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
         {/* Toggle Button */}
         <button 
          onClick={() => setShowDevLogs(!showDevLogs)}
          className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-full shadow-xl transition-all"
          title="Toggle Developer Logs"
        >
          {showDevLogs ? "❌" : "🐞"}
        </button>

        {/* Log Window */}
        {showDevLogs && (
          <div className="w-80 h-96 bg-slate-900 rounded-xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden text-xs font-mono">
            <div className="bg-slate-800 p-2 text-slate-400 font-bold border-b border-slate-700 flex justify-between">
              <span>CONSOLE</span>
              <button onClick={() => setLogs([])} className="text-red-400 hover:text-red-300">CLEAR</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {logs.length === 0 && <div className="text-slate-600 text-center mt-10">No logs yet...</div>}
              {logs.map((log, i) => (
                <div key={i} className="break-words">
                  <span className="text-slate-500">[{log.time}]</span>
                  <span className={`font-bold mx-1 ${log.type === "TX" ? "text-blue-400" : "text-green-400"}`}>
                    {log.type}
                  </span>
                  <span className="text-slate-300">{log.event}</span>
                  {log.data && (
                    <div className="text-slate-500 pl-4 border-l-2 border-slate-700 ml-1">
                      {typeof log.data === 'object' ? JSON.stringify(log.data).substring(0, 100) : log.data}
                    </div>
                  )}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

export default App;