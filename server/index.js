// server/index.js
const { Server } = require("socket.io");
const ngeohash = require("ngeohash");
const requestIp = require("request-ip");
const fs = require("fs");

const io = new Server(3000, {
  cors: { origin: "*" },
});

// STATE
let queue = { local: {}, global: {} };
let users = {}; 
let disconnectHistory = {}; // { socketId: lastPartnerId }
let blockedIPs = [];

// Load blocked IPs
if (fs.existsSync("blocked.json")) {
  try { blockedIPs = JSON.parse(fs.readFileSync("blocked.json")); } catch (e) {}
}

io.on("connection", (socket) => {
  // 1. FIX: Send Online Count IMMEDIATELY to the new user
  socket.emit("users_count", io.engine.clientsCount);
  // Then broadcast to everyone else
  io.emit("users_count", io.engine.clientsCount);

  socket.on("get_online_count", () => {
    socket.emit("users_count", io.engine.clientsCount);
});

  const clientIp = requestIp.getClientIp(socket.request) || socket.handshake.address;
  if (blockedIPs.includes(clientIp)) {
    socket.emit("banned", "You have been banned.");
    socket.disconnect(true);
    return;
  }

  // Initialize User
  users[socket.id] = { ip: clientIp, partnerId: null, avatarSeed: null };

  // --- RECONNECT LOGIC ---
socket.on("request_reconnect", () => {
    const lastPartnerId = disconnectHistory[socket.id];
    console.log(`[DEBUG] User ${socket.id} asked to reconnect. Last partner: ${lastPartnerId}`);

    if (!lastPartnerId) {
      console.log(`[DEBUG] No history found for ${socket.id}`);
      socket.emit("system_message", "No recent partner found.");
      return;
    }

    // Check if partner is in our "users" list
    const targetUser = users[lastPartnerId];
    if (!targetUser) {
      console.log(`[DEBUG] Partner ${lastPartnerId} is no longer in memory.`);
      socket.emit("system_message", "Partner has disconnected completely.");
      return;
    }

    // Check if they are already busy
    if (targetUser.partnerId) {
      console.log(`[DEBUG] Partner ${lastPartnerId} is already chatting.`);
      socket.emit("system_message", "User is already in another chat.");
      return;
    }

    // If we get here, it should work
    console.log(`[DEBUG] Sending offer to ${lastPartnerId}`);
    io.to(lastPartnerId).emit("reconnect_offer", { offererId: socket.id });
    socket.emit("system_message", "Reconnection request sent!");
  });

  socket.on("accept_reconnect", ({ offererId }) => {
    const me = users[socket.id];
    const them = users[offererId];
    if (me && them && !me.partnerId && !them.partnerId) {
      me.partnerId = offererId;
      them.partnerId = socket.id;
      
      delete disconnectHistory[socket.id];
      delete disconnectHistory[offererId];

      io.to(socket.id).emit("match_found", { partnerName: "Stranger", partnerAvatar: them.avatarSeed });
      io.to(offererId).emit("match_found", { partnerName: "Stranger", partnerAvatar: me.avatarSeed });
    }
  });

  // --- STANDARD MATCH LOGIC ---
  socket.on("find_match", ({ mode, region, lat, lon, name, avatarSeed }) => {
    const user = users[socket.id];
    user.avatarSeed = avatarSeed;
    user.mode = mode;

    let matchKey = mode === "local" ? ngeohash.encode(lat, lon, 5) : (region || "random");
    let queueType = mode === "local" ? "local" : "global";
    
    user.matchKey = matchKey;
    const partnerId = findMatch(queueType, matchKey, socket.id);

    if (partnerId) {
      removeFromQueue(queueType, matchKey, partnerId);
      user.partnerId = partnerId;
      users[partnerId].partnerId = socket.id;

      io.to(socket.id).emit("match_found", { partnerName: "Stranger", partnerAvatar: users[partnerId].avatarSeed });
      io.to(partnerId).emit("match_found", { partnerName: name || "Stranger", partnerAvatar: avatarSeed });
    } else {
      if (!queue[queueType][matchKey]) queue[queueType][matchKey] = [];
      queue[queueType][matchKey].push(socket.id);
      socket.emit("waiting", "Looking for partner...");
    }
  });

  socket.on("send_message", (msg) => {
    const user = users[socket.id];
    if (user && user.partnerId) io.to(user.partnerId).emit("receive_message", { text: msg, sender: "them" });
  });

  socket.on("typing_start", () => {
    const user = users[socket.id];
    if (user && user.partnerId) io.to(user.partnerId).emit("partner_typing", true);
  });

  socket.on("typing_stop", () => {
    const user = users[socket.id];
    if (user && user.partnerId) io.to(user.partnerId).emit("partner_typing", false);
  });

  socket.on("leave_chat", () => {
    const user = users[socket.id];
    if (user && user.partnerId) {
      const pid = user.partnerId;
      disconnectHistory[socket.id] = pid;
      disconnectHistory[pid] = socket.id;
      
      io.to(pid).emit("partner_left");
      if(users[pid]) users[pid].partnerId = null;
      user.partnerId = null;
    }
    if (user.matchKey) {
        const type = user.mode === "local" ? "local" : "global";
        removeFromQueue(type, user.matchKey, socket.id);
    }
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
      if (user.partnerId) {
        io.to(user.partnerId).emit("partner_left");
        if(users[user.partnerId]) users[user.partnerId].partnerId = null;
      }
      if (user.matchKey) {
        const type = user.mode === "local" ? "local" : "global";
        removeFromQueue(type, user.matchKey, socket.id);
      }
      delete users[socket.id];
    }
    io.emit("users_count", io.engine.clientsCount);
  });
});

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

console.log("Server running...");