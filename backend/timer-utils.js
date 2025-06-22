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


