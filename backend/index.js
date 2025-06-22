require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

app.use(cors({
  origin: "*",
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
  const actions = room.gameState.nightActions;
  let killedPlayer = null;
  let savedPlayer = null;
  
  // Process Mafia kill
  if (actions.mafia && actions.mafia.target) {
    killedPlayer = actions.mafia.target;
  }
  
  // Process Doctor save
  if (actions.doctor && actions.doctor.target) {
    savedPlayer = actions.doctor.target;
  }
  
  // If doctor saved the killed player, no one dies
  if (killedPlayer && savedPlayer && killedPlayer === savedPlayer) {
    killedPlayer = null;
  }
  
  // Eliminate killed player
  if (killedPlayer) {
    const player = room.players.get(killedPlayer);
    if (player) {
      player.isAlive = false;
      room.gameState.eliminatedPlayers.add(killedPlayer);
    }
  }
  
  // Clear night actions
  room.gameState.nightActions = {};
  
  return { killedPlayer, savedPlayer };
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
  console.log('User connected:', socket.id);
  
  socket.on('create_room', (data) => {
    console.log('Create room request received:', data);
    try {
      const { nickname } = data;
      const room = createRoom(socket.id, nickname);
      console.log('Room created:', room.code);
      
      socket.join(room.code);
      const response = {
        roomCode: room.code,
        players: Array.from(room.players.values())
      };
      console.log('Sending room_created event:', response);
      socket.emit('room_created', response);
      console.log('room_created event sent successfully');
    } catch (error) {
      console.error('Error creating room:', error);
      socket.emit('join_error', { message: 'Failed to create room' });
    }
  });
  
  socket.on('join_room', (data) => {
    console.log('Join room request received:', data);
    try {
      const { roomCode, nickname } = data;
      const room = joinRoom(roomCode, socket.id, nickname);
      
      if (!room) {
        console.log('Room not found:', roomCode);
        socket.emit('join_error', { message: 'Room not found or full' });
        return;
      }
      
      socket.join(roomCode);
      const response = {
        roomCode: roomCode,
        players: Array.from(room.players.values())
      };
      console.log('Sending room_joined event:', response);
      socket.emit('room_joined', response);
      console.log('room_joined event sent successfully');
      
      // Notify other players
      socket.to(roomCode).emit('player_joined', {
        players: Array.from(room.players.values())
      });
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('join_error', { message: 'Failed to join room' });
    }
  });
  
  socket.on('start_game', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const room = rooms.get(playerInfo.roomCode);
    if (!room || room.players.get(socket.id)?.isHost !== true) return;
    
    if (startGame(playerInfo.roomCode)) {
      // Send role assignments privately
      room.players.forEach((player, socketId) => {
        io.to(socketId).emit('role_assigned', {
          role: player.role,
          phase: PHASES.NIGHT
        });
      });
      
      // Broadcast game start
      io.to(playerInfo.roomCode).emit('game_started', {
        phase: PHASES.NIGHT,
        players: Array.from(room.players.values()).map(p => ({
          socketId: p.socketId,
          nickname: p.nickname,
          isAlive: p.isAlive
        }))
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
    
    if (player.role === ROLES.MAFIA && action === 'kill') {
      room.gameState.nightActions.mafia = { target, actor: socket.id };
    } else if (player.role === ROLES.DOCTOR && action === 'save') {
      room.gameState.nightActions.doctor = { target, actor: socket.id };
    } else if (player.role === ROLES.POLICE && action === 'investigate') {
      const targetPlayer = room.players.get(target);
      if (targetPlayer) {
        socket.emit('investigation_result', {
          target: target,
          role: targetPlayer.role,
          nickname: targetPlayer.nickname
        });
      }
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
      from: player.nickname,
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
    console.log('User disconnected:', socket.id);
    
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
  
  // Check for game end
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
  
  // Check for game end
  if (checkGameEnd(room)) {
    io.to(room.code).emit('game_over', {
      result: room.gameState.gameResult,
      eliminated: eliminated,
      players: Array.from(room.players.values())
    });
    return;
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

