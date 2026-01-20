// server/index.js
const { Server } = require("socket.io");
const ngeohash = require("ngeohash");
const requestIp = require("request-ip");
const fs = require("fs");

const io = new Server(3000, {
  cors: { origin: "*" },
});

// --- STATE MANAGEMENT ---
let queue = {
  local: {},      // { "geohash": [socketId] }
  global: {}      // { "india": [socketId], "us": [socketId] }
};

let users = {};   // { socketId: { partnerId, mode, region, ip } }

// Load Blocked IPs from file (Persistent Ban)
let blockedIPs = [];
if (fs.existsSync("blocked.json")) {
  blockedIPs = JSON.parse(fs.readFileSync("blocked.json"));
}

// --- HELPER: BAN USER ---
function banUser(ip) {
  if (!blockedIPs.includes(ip)) {
    blockedIPs.push(ip);
    fs.writeFileSync("blocked.json", JSON.stringify(blockedIPs));
    console.log(`BANNED IP: ${ip}`);
  }
}

io.on("connection", (socket) => {
  // 1. GET IP ADDRESS
  const clientIp = requestIp.getClientIp(socket.request); 
  
  // 2. CHECK BAN STATUS
  if (blockedIPs.includes(clientIp)) {
    socket.emit("banned", "You have been permanently banned for violating community guidelines.");
    socket.disconnect(true);
    return;
  }

  // Broadcast online count
  io.emit("users_count", io.engine.clientsCount);

  // --- FIND MATCH LOGIC ---
  socket.on("find_match", ({ mode, region, lat, lon, name }) => {
    // mode = 'local' or 'global'
    // region = 'india', 'us', 'random' (only if mode is global)
    
    let matchKey;
    let queueType;

    if (mode === "local") {
      matchKey = ngeohash.encode(lat, lon, 5); // GeoHash for local
      queueType = "local";
    } else {
      matchKey = region || "random"; // Region name for global
      queueType = "global";
    }

    // Try to find a partner
    const partnerId = findMatch(queueType, matchKey, socket.id);

    if (partnerId) {
      // MATCH FOUND
      removeFromQueue(queueType, matchKey, partnerId);
      
      users[socket.id] = { partnerId, ip: clientIp };
      users[partnerId] = { partnerId: socket.id }; // Partner IP is already stored

      io.to(socket.id).emit("match_found", { partnerName: "Stranger" });
      io.to(partnerId).emit("match_found", { partnerName: name || "Stranger" });
      
    } else {
      // NO MATCH - WAIT
      if (!queue[queueType][matchKey]) queue[queueType][matchKey] = [];
      queue[queueType][matchKey].push(socket.id);
      
      users[socket.id] = { partnerId: null, ip: clientIp, mode, matchKey };
      socket.emit("waiting", mode === "local" ? "Scanning area..." : `Looking for someone in ${matchKey}...`);
    }
  });

  // --- REPORT LOGIC ---
  socket.on("report_user", () => {
    const user = users[socket.id];
    if (user && user.partnerId) {
      const partnerId = user.partnerId;
      const partner = users[partnerId];

      if (partner && partner.ip) {
        // BAN THE PARTNER
        banUser(partner.ip);
        
        // Notify the reporter
        socket.emit("system_message", "User reported and blocked. Disconnecting...");
        
        // Disconnect the banned user
        io.to(partnerId).emit("banned", "You have been reported and banned.");
        io.sockets.sockets.get(partnerId)?.disconnect(true);
        
        // Disconnect reporter cleanly so they can find new match
        cleanupUser(socket.id); 
      }
    }
  });

  socket.on("send_message", (msg) => {
    const user = users[socket.id];
    if (user && user.partnerId) {
      io.to(user.partnerId).emit("receive_message", { text: msg, sender: "them" });
    }
  });

  socket.on("leave_chat", () => cleanupUser(socket.id));
  socket.on("disconnect", () => {
    cleanupUser(socket.id);
    io.emit("users_count", io.engine.clientsCount);
  });
});

// --- HELPERS ---

function findMatch(type, key, myId) {
  if (!queue[type][key]) return null;
  return queue[type][key].find(id => id !== myId);
}

function removeFromQueue(type, key, id) {
  if (queue[type][key]) {
    queue[type][key] = queue[type][key].filter(socketId => socketId !== id);
    if (queue[type][key].length === 0) delete queue[type][key];
  }
}

function cleanupUser(id) {
  const user = users[id];
  if (!user) return;

  if (user.partnerId) {
    io.to(user.partnerId).emit("partner_left");
    if(users[user.partnerId]) users[user.partnerId].partnerId = null;
  }
  
  // Remove from whichever queue they were in
  if (user.matchKey) {
    const type = user.mode === "local" ? "local" : "global";
    removeFromQueue(type, user.matchKey, id);
  }
  
  delete users[id];
}

console.log("Server running...");