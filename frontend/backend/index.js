require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const allowedOrigin = "http://localhost:5173";

const io = socketIo(server, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"],
  },
  transports: ['websocket', 'polling'],
});

app.use(cors({
  origin: allowedOrigin,
  credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT || 3001;


// Game state storage
const rooms = new Map();
const players = new Map(); // socketId -> player info

// Timer utility functions
function startPhaseTimer(room, duration, onComplete) {
  // Clear existing timer
  if (room.gameState.phaseTimer) {
    clearInterval(room.gameState.phaseTimer);
  }
  
  room.gameState.phaseTimeRemaining = duration;
  
  // Broadcast initial timer
  io.to(room.code).emit('timer_update', {
    timeRemaining: room.gameState.phaseTimeRemaining,
    phase: room.phase
  });
  
  room.gameState.phaseTimer = setInterval(() => {
    room.gameState.phaseTimeRemaining--;
    
    // Broadcast timer update
    io.to(room.code).emit('timer_update', {
      timeRemaining: room.gameState.phaseTimeRemaining,
      phase: room.phase
    });
    
    if (room.gameState.phaseTimeRemaining <= 0) {
      clearInterval(room.gameState.phaseTimer);
      room.gameState.phaseTimer = null;
      onComplete();
    }
  }, 1000);
}

function clearPhaseTimer(room) {
  if (room.gameState.phaseTimer) {
    clearInterval(room.gameState.phaseTimer);
    room.gameState.phaseTimer = null;
  }
  room.gameState.phaseTimeRemaining = 0;
}

// Game constants
const ROLES = {
  MAFIA: 'mafia',
  POLICE: 'police',
  DOCTOR: 'doctor',
  CITIZEN: 'citizen'
};

const PHASES = {
  LOBBY: 'lobby',
  NIGHT: 'night',
  DAY: 'day',
  VOTING: 'voting',
  GAME_OVER: 'game_over'
};

// Utility functions
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function assignRoles(playerCount) {
  const roles = [];
  
  // 1 Police, 1 Doctor
  roles.push(ROLES.POLICE);
  roles.push(ROLES.DOCTOR);
  
  // 1 Mafia for every 3 Citizens
  const mafiaCount = Math.floor((playerCount - 2) / 3);
  for (let i = 0; i < mafiaCount; i++) {
    roles.push(ROLES.MAFIA);
  }
  
  // Fill remaining with Citizens
  while (roles.length < playerCount) {
    roles.push(ROLES.CITIZEN);
  }
  
  // Shuffle roles
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  
  return roles;
}

function createRoom(hostSocketId, hostNickname) {
  const roomCode = generateRoomCode();
  const room = {
    code: roomCode,
    host: hostSocketId,
    players: new Map(),
    phase: PHASES.LOBBY,
    gameState: {
      currentPhase: PHASES.LOBBY,
      nightActions: {},
      dayVotes: {},
      accusations: {},
      eliminatedPlayers: new Set(),
      gameResult: null,
      currentVotingTarget: null,
      phaseTimer: null,
      playersAcknowledgedRole: new Set(), // FIX: New state to track who has seen their role
      phaseTimeRemaining: 0
    },
    timers: {}
  };
  
  // Add host as first player
  room.players.set(hostSocketId, {
    socketId: hostSocketId,
    nickname: hostNickname,
    role: null,
    isAlive: true,
    isHost: true
  });
  
  rooms.set(roomCode, room);
  players.set(hostSocketId, { roomCode, nickname: hostNickname });
  
  return room;
}

function joinRoom(roomCode, socketId, nickname) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  if (room.players.size >= 12) return null; // Max players
  if (room.phase !== PHASES.LOBBY) return null; // Game already started
  
  room.players.set(socketId, {
    socketId: socketId,
    nickname: nickname,
    role: null,
    isAlive: true,
    isHost: false
  });
  
  players.set(socketId, { roomCode, nickname });
  
  return room;
}

function startGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.players.size < 5) return false;
  
  // Assign roles
  const playerArray = Array.from(room.players.values());
  const roles = assignRoles(playerArray.length);
  
  playerArray.forEach((player, index) => {
    player.role = roles[index];
  });
  
  room.phase = PHASES.NIGHT;
  room.gameState.currentPhase = PHASES.NIGHT;
  
  return true;
}

function processNightActions(room) {
  const actions = room.gameState.nightActions || {};
  let killedPlayerId = null;
  let savedPlayerId = null;

  // Helper to resolve either an ID or a nickname into a real player ID
  const resolveTargetId = (target) => {
    if (!target) return null;

    // Direct ID match
    if (room.players.has(target)) {
      return target;
    }

    // Nickname match (case insensitive just in case)
    const found = [...room.players.entries()].find(
      ([id, player]) => player.nickname.toLowerCase() === target.toLowerCase()
    );
    return found ? found[0] : null;
  };

  // Process Mafia kill
  if (actions.mafia && actions.mafia.target) {
    killedPlayerId = resolveTargetId(actions.mafia.target);
  }

  // Process Doctor save
  if (actions.doctor && actions.doctor.target) {
    savedPlayerId = resolveTargetId(actions.doctor.target);
  }

  // If doctor saved the mafia target, no one dies
  if (killedPlayerId && savedPlayerId && killedPlayerId === savedPlayerId) {
    killedPlayerId = null;
  }

  // Eliminate killed player
  if (killedPlayerId) {
    const player = room.players.get(killedPlayerId);
    if (player && player.isAlive) {
      player.isAlive = false;
      room.gameState.eliminatedPlayers.add(killedPlayerId);
    }
  }

  // Clear night actions
  room.gameState.nightActions = {};

  // FIX: Check for game end immediately after a player is eliminated
  if (killedPlayerId && checkGameEnd(room)) {
    io.to(room.code).emit('game_over', {
      result: room.gameState.gameResult,
      players: Array.from(room.players.values())
    });
    return { killedPlayer: null, savedPlayer: null };
  }
  return {
    killedPlayer: killedPlayerId ? room.players.get(killedPlayerId) : null,
    savedPlayer: savedPlayerId ? room.players.get(savedPlayerId) : null
  };
}


function checkGameEnd(room) {
  const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive);
  const aliveMafia = alivePlayers.filter(p => p.role === ROLES.MAFIA);
  const aliveTownspeople = alivePlayers.filter(p => p.role !== ROLES.MAFIA);
  
  if (aliveMafia.length === 0) {
    room.gameState.gameResult = 'townspeople';
    room.phase = PHASES.GAME_OVER;
    return true;
  }
  
  if (aliveMafia.length >= aliveTownspeople.length) {
    room.gameState.gameResult = 'mafia';
    room.phase = PHASES.GAME_OVER;
    return true;
  }
  
  return false;
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  
  socket.on('create_room', (data) => {
    try {
      const { nickname } = data;
      const room = createRoom(socket.id, nickname);
      socket.join(room.code);
      const response = {
        roomCode: room.code,
        players: Array.from(room.players.values())
      };
      socket.emit('room_created', response);
    } catch (error) {
      socket.emit('join_error', { message: 'Failed to create room' });
    }
  });
  
  socket.on('join_room', (data) => {
    try {
      const { roomCode, nickname } = data;
      const room = joinRoom(roomCode, socket.id, nickname);
      
      if (!room) {
        socket.emit('join_error', { message: 'Room not found or full' });
        return;
      }
      
      socket.join(roomCode);
      const response = {
        roomCode: roomCode,
        players: Array.from(room.players.values())
      };
      socket.emit('room_joined', response);
      
      // Notify other players
      socket.to(roomCode).emit('player_joined', {
        players: Array.from(room.players.values())
      });
    } catch (error) {
      socket.emit('join_error', { message: 'Failed to join room' });
    }
  });


  socket.on('lobby_chat', (data) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.phase !== PHASES.LOBBY) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    // Broadcast the message to all clients in the room
    io.to(playerInfo.roomCode).emit('chat_message', {
      sender: player.nickname,
      message: data.message,
      timestamp: Date.now(),
      color: '#E0E0E0' // A neutral color for lobby chat
    });
  });

  // *** NEW: Handler for private Mafia chat ***
  socket.on('mafia_chat', (data) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.phase !== PHASES.NIGHT) return;
    
    const sendingPlayer = room.players.get(socket.id);
    if (!sendingPlayer || !sendingPlayer.isAlive || sendingPlayer.role !== ROLES.MAFIA) return;

    // Find all alive mafia members
    const mafiaMembers = Array.from(room.players.values()).filter(p => p.role === ROLES.MAFIA && p.isAlive);

    // Broadcast the message to only the mafia members
    mafiaMembers.forEach(mafia => {
      io.to(mafia.socketId).emit('chat_message', {
        sender: sendingPlayer.nickname,
        message: data.message,
        timestamp: Date.now(),
        color: '#FF6B6B', // A distinct red color for mafia chat
      });
    });
  });
  
  socket.on('start_game', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.players.get(socket.id)?.isHost !== true) return;
    
    if (startGame(playerInfo.roomCode)) {
      // Send role assignments privately
      // FIX: Emitting role to all players. They will now go to the Role Reveal screen
      room.players.forEach((player, socketId) => {
        io.to(socketId).emit('role_assigned', {
          role: player.role,
          phase: PHASES.NIGHT
        });
      });
      
      // Broadcast game started to all clients
      io.to(playerInfo.roomCode).emit('game_started', {
        phase: PHASES.NIGHT,
        players: Array.from(room.players.values()).map(p => ({
          socketId: p.socketId,
          nickname: p.nickname,
          isAlive: p.isAlive
        }))
      });
    }
  });

  // FIX: New event to handle role acknowledgment from the client
  socket.on('role_acknowledged', (data) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room) return;

    // Add player to the set of acknowledged players
    room.gameState.playersAcknowledgedRole.add(socket.id);

    // If all players have acknowledged their role, start the night phase
    if (room.gameState.playersAcknowledgedRole.size === room.players.size) {
      room.gameState.playersAcknowledgedRole.clear(); // Reset for next round
      room.phase = PHASES.NIGHT;
      room.gameState.currentPhase = PHASES.NIGHT;

      io.to(room.code).emit('start_night_phase', {
        phase: PHASES.NIGHT
      });

      // Start night phase timer (30 seconds)
      startPhaseTimer(room, 30, () => {
        processNightPhase(room);
      });
    }
  });
  
  socket.on('night_action', (data) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.phase !== PHASES.NIGHT) return;

    const player = room.players.get(socket.id);
    if (!player || !player.isAlive) return;

    const { action, target } = data;
    // Helper to resolve target into a valid player ID
    const resolveTargetId = (t) => {
      if (!t) return null;

      // If already a valid ID
      if (room.players.has(t)) {
        return t;
      }

      // If it's a nickname (case-insensitive)
      const found = [...room.players.entries()].find(
        ([id, p]) => p.nickname.toLowerCase() === t.toLowerCase()
      );
      return found ? found[0] : null;
    };

    const targetId = resolveTargetId(target);
    if (!targetId) {
      return;
    }

    const targetPlayer = room.players.get(targetId);
    if (!targetPlayer || !targetPlayer.isAlive) {
      return;
    }

    // Register actions with player IDs (not nicknames)
    if (player.role === ROLES.MAFIA && action === 'kill') {
      room.gameState.nightActions.mafia = { target: targetId, actor: socket.id };
      socket.emit('action_confirmed', { action: 'kill', target: targetPlayer.nickname });

    } else if (player.role === ROLES.DOCTOR && action === 'save') {
      room.gameState.nightActions.doctor = { target: targetId, actor: socket.id };
      socket.emit('action_confirmed', { action: 'save', target: targetPlayer.nickname });

    } else if (player.role === ROLES.POLICE && action === 'investigate') {
      socket.emit('investigation_result', {
        target: targetId,
        role: targetPlayer.role,
        nickname: targetPlayer.nickname,
        isMafia: targetPlayer.role === ROLES.MAFIA
      });

    }
  });

  
  socket.on('day_chat', (data) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.phase !== PHASES.DAY) return;
    
    const player = room.players.get(socket.id);
    if (!player || !player.isAlive) return;
    
    io.to(playerInfo.roomCode).emit('chat_message', {
      sender: player.nickname,
      message: data.message,
      timestamp: Date.now()
    });
  });
  
  socket.on('accuse_player', (data) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.phase !== PHASES.DAY) return;
    
    const player = room.players.get(socket.id);
    if (!player || !player.isAlive) return;
    
    // Check if player has already accused someone
    if (room.gameState.accusations[socket.id]) {
      socket.emit('accusation_error', { message: 'You can only accuse once per day' });
      return;
    }
    
    const { target } = data;
    const targetPlayer = room.players.get(target);
    if (!targetPlayer || !targetPlayer.isAlive) return;
    
    // Check if target is already accused
    const existingAccusation = Object.values(room.gameState.accusations).find(acc => acc.target === target);
    if (existingAccusation) {
      socket.emit('accusation_error', { message: 'This player is already accused' });
      return;
    }
    
    // *** FIX: Clear the day phase timer before starting the voting timer ***
    clearPhaseTimer(room);

    // Record the accusation
    room.gameState.accusations[socket.id] = {
      accuser: socket.id,
      target: target,
      timestamp: Date.now()
    };
    
    // Move to voting phase immediately
    room.phase = PHASES.VOTING;
    room.gameState.currentVotingTarget = target;
    
    io.to(playerInfo.roomCode).emit('player_accused', {
      accuser: player.nickname,
      accused: targetPlayer.nickname,
      accusedId: target
    });
    
    io.to(playerInfo.roomCode).emit('voting_phase_start', {
      accusedPlayer: {
        id: target,
        nickname: targetPlayer.nickname
      }
    });
    
    // Start voting timer (30 seconds)
    startPhaseTimer(room, 30, () => {
      processVoting(room);
    });
  });
  
  socket.on('vote', (data) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.phase !== PHASES.VOTING) return;
    
    const player = room.players.get(socket.id);
    if (!player || !player.isAlive) return;
    
    const { vote, target } = data; // vote: 'guilty' or 'innocent'
    room.gameState.dayVotes[socket.id] = { vote, target };
    
    // Check if all alive players have voted
    const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive);
    const votes = Object.keys(room.gameState.dayVotes);
    
    if (votes.length >= alivePlayers.length) {
      processVoting(room);
    }
  });
  
  socket.on('disconnect', () => {
    const playerInfo = players.get(socket.id);
    if (playerInfo) {
      const room = rooms.get(playerInfo.roomCode);
      if (room) {
        room.players.delete(socket.id);
        
        // If host disconnects, assign new host
        if (room.host === socket.id && room.players.size > 0) {
          const newHost = Array.from(room.players.keys())[0];
          room.host = newHost;
          room.players.get(newHost).isHost = true;
        }
        
        // Notify remaining players
        socket.to(playerInfo.roomCode).emit('player_left', {
          players: Array.from(room.players.values())
        });
        
        // Clean up empty rooms
        if (room.players.size === 0) {
          rooms.delete(playerInfo.roomCode);
        }
      }
      
      players.delete(socket.id);
    }
  });
});

function processNightPhase(room) {
  const nightResult = processNightActions(room);
  
  // Check for game end immediately after a player is eliminated from night actions.
  if (checkGameEnd(room)) {
    io.to(room.code).emit('game_over', {
      result: room.gameState.gameResult,
      players: Array.from(room.players.values())
    });
    return;
  }
  
  // Move to day phase
  room.phase = PHASES.DAY;
  room.gameState.currentPhase = PHASES.DAY;
  
  io.to(room.code).emit('day_phase_start', {
    nightResult: nightResult,
    players: Array.from(room.players.values()).map(p => ({
      socketId: p.socketId,
      nickname: p.nickname,
      isAlive: p.isAlive,
      role: p.isAlive ? null : p.role // Reveal role only if dead
    }))
  });
  
  // Start day discussion timer (60 seconds)
  startPhaseTimer(room, 60, () => {
    // If no one has been accused, continue to next night
    if (Object.keys(room.gameState.accusations).length === 0) {
      room.phase = PHASES.NIGHT;
      room.gameState.currentPhase = PHASES.NIGHT;
      
      io.to(room.code).emit('night_phase_start', {
        players: Array.from(room.players.values()).map(p => ({
          socketId: p.socketId,
          nickname: p.nickname,
          isAlive: p.isAlive,
          role: p.isAlive ? null : p.role
        }))
      });
      
      // Start next night phase timer
      startPhaseTimer(room, 30, () => {
        processNightPhase(room);
      });
    }
  });
}

function processVoting(room) {
  const votes = room.gameState.dayVotes;
  let guiltyVotes = 0;
  let innocentVotes = 0;
  const target = room.gameState.currentVotingTarget;
  
  Object.values(votes).forEach(vote => {
    if (vote.vote === 'guilty') {
      guiltyVotes++;
    } else if (vote.vote === 'innocent') {
      innocentVotes++;
    }
  });
  
  let eliminated = null;
  if (guiltyVotes > innocentVotes && target) {
    const targetPlayer = room.players.get(target);
    if (targetPlayer) {
      targetPlayer.isAlive = false;
      room.gameState.eliminatedPlayers.add(target);
      eliminated = {
        socketId: target,
        nickname: targetPlayer.nickname,
        role: targetPlayer.role
      };
    }
  }
  
  // Clear votes and accusations for next day
  room.gameState.dayVotes = {};
  room.gameState.accusations = {};
  room.gameState.currentVotingTarget = null;
  
  // Broadcast voting result
  io.to(room.code).emit('voting_result', {
    eliminated: eliminated,
    guiltyVotes: guiltyVotes,
    innocentVotes: innocentVotes,
    totalVotes: guiltyVotes + innocentVotes
  });
  
  // FIX: Check for game end immediately after a player is eliminated from voting
  if (checkGameEnd(room)) {
    io.to(room.code).emit('game_over', {
      result: room.gameState.gameResult,
      players: Array.from(room.players.values())
    });
    return; // Return to prevent moving to the next phase
  }
  
  // Move to next night phase
  room.phase = PHASES.NIGHT;
  room.gameState.currentPhase = PHASES.NIGHT;
  
  setTimeout(() => {
    io.to(room.code).emit('night_phase_start', {
      players: Array.from(room.players.values()).map(p => ({
        socketId: p.socketId,
        nickname: p.nickname,
        isAlive: p.isAlive,
        role: p.isAlive ? null : p.role
      }))
    });
    
    // Start next night phase timer
    startPhaseTimer(room, 30, () => {
      processNightPhase(room);
    });
  }, 3000); // 3 second delay to show results
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Whooded game server is running!' });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    rooms: rooms.size,
    players: players.size
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
