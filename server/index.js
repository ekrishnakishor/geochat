const { Server } = require("socket.io");
const ngeohash = require("ngeohash");

const io = new Server(3000, {
  cors: { origin: "*" },
});

let queue = {}; 
let users = {};

io.on("connection", (socket) => {
  // 1. BROADCAST USER COUNT
  // Whenever someone connects, tell everyone the new total
  io.emit("users_count", io.engine.clientsCount);

  socket.on("find_match", ({ lat, lon, name }) => {
    const geoHash = ngeohash.encode(lat, lon, 5);
    const partnerId = findMatchInGeo(geoHash, socket.id);

    if (partnerId) {
      removeFromQueue(geoHash, partnerId);
      users[socket.id] = { partnerId, geoHash };
      users[partnerId] = { partnerId: socket.id, geoHash };
      
      io.to(socket.id).emit("match_found", { partnerName: "Stranger" });
      io.to(partnerId).emit("match_found", { partnerName: name });
    } else {
      if (!queue[geoHash]) queue[geoHash] = [];
      queue[geoHash].push(socket.id);
      users[socket.id] = { partnerId: null, geoHash };
      socket.emit("waiting", "Looking for someone nearby...");
    }
  });

  socket.on("send_message", (msg) => {
    const user = users[socket.id];
    if (user && user.partnerId) {
      io.to(user.partnerId).emit("receive_message", { text: msg, sender: "them" });
    }
  });

  socket.on("leave_chat", () => {
    cleanupUser(socket.id);
  });

  socket.on("disconnect", () => {
    cleanupUser(socket.id);
    // UPDATE COUNT ON DISCONNECT
    io.emit("users_count", io.engine.clientsCount);
  });
});

// --- HELPER FUNCTIONS (Same as before) ---
function findMatchInGeo(geoHash, myId) {
  if (!queue[geoHash]) return null;
  return queue[geoHash].find(id => id !== myId);
}

function removeFromQueue(geoHash, id) {
  if (queue[geoHash]) {
    queue[geoHash] = queue[geoHash].filter(socketId => socketId !== id);
    if (queue[geoHash].length === 0) delete queue[geoHash];
  }
}

function cleanupUser(id) {
  const user = users[id];
  if (!user) return;
  if (user.partnerId) {
    io.to(user.partnerId).emit("partner_left");
    if(users[user.partnerId]) users[user.partnerId].partnerId = null; 
  }
  if (user.geoHash) removeFromQueue(user.geoHash, id);
  delete users[id];
}

console.log("Server running...");