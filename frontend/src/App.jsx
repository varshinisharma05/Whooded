import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { Users, Crown, Skull, Eye, Heart, Shield, MessageCircle, Vote, Clock } from 'lucide-react';
import socketService from './lib/socketService';
import './App.css';

const PHASES = {
  LOBBY: 'lobby',
  NIGHT: 'night',
  DAY: 'day',
  VOTING: 'voting',
  GAME_OVER: 'game_over'
};

const ROLES = {
  MAFIA: 'mafia',
  POLICE: 'police',
  DOCTOR: 'doctor',
  CITIZEN: 'citizen'
};

const ROLE_ICONS = {
  [ROLES.MAFIA]: Skull,
  [ROLES.POLICE]: Shield,
  [ROLES.DOCTOR]: Heart,
  [ROLES.CITIZEN]: Users
};

const ROLE_COLORS = {
  [ROLES.MAFIA]: 'bg-red-600',
  [ROLES.POLICE]: 'bg-blue-600',
  [ROLES.DOCTOR]: 'bg-green-600',
  [ROLES.CITIZEN]: 'bg-gray-600'
};

function App() {
  const [gameState, setGameState] = useState('menu'); // menu, lobby, game
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [phase, setPhase] = useState(PHASES.LOBBY);
  const [role, setRole] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [investigationResult, setInvestigationResult] = useState(null);
  const [nightResult, setNightResult] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [timer, setTimer] = useState(0);
  const [accusedPlayer, setAccusedPlayer] = useState(null);
  const [votingTarget, setVotingTarget] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasAccused, setHasAccused] = useState(false);
  const [phaseNumber, setPhaseNumber] = useState(1);
  const [showIntro, setShowIntro] = useState(false);
  const [introStep, setIntroStep] = useState(0);
  const [phaseTimer, setPhaseTimer] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("");

  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  // Only connect when user actually tries to create or join a room
  const connectToServer = async () => {
    if (!isConnected) {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      try {
        await socketService.connect(backendUrl);
        return true;
      } catch (error) {
        console.error('Failed to connect:', error);
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    // Socket event listeners (only set up once)
    socketService.on('connect', () => {
      setIsConnected(true);
    });

    socketService.on('disconnect', () => {
      setIsConnected(false);
    });

    socketService.on('room_created', (data) => {
      console.log('🎉 Room created event received:', data);
      setRoomCode(data.roomCode);
      setPlayers(data.players);
      setGameState('lobby');
      setCurrentPlayer(data.players.find(p => p.isHost));
      setIsCreating(false);
      console.log('✅ Room creation completed successfully');
    });

    socketService.on('room_joined', (data) => {
      console.log('🎉 Room joined event received:', data);
      setRoomCode(data.roomCode);
      setPlayers(data.players);
      setGameState('lobby');
      setCurrentPlayer(data.players.find(p => p.nickname === nickname));
      setIsJoining(false);
      console.log('✅ Room joining completed successfully');
    });

    socketService.on('join_error', (data) => {
      console.log('❌ Join error received:', data);
      alert(data.message);
      setIsJoining(false);
      setIsCreating(false);
    });

    socketService.on('player_joined', (data) => {
      setPlayers(data.players);
    });

    socketService.on('player_left', (data) => {
      setPlayers(data.players);
    });

    socketService.on('role_assigned', (data) => {
      setRole(data.role);
      setPhase(data.phase);
      setGameState('game');
    });

    socketService.on('game_started', (data) => {
      setPhase(data.phase);
      setPlayers(data.players);
      setGameState('game');
    });

    socketService.on('investigation_result', (data) => {
      setInvestigationResult(data);
    });

    socketService.on('day_phase_start', (data) => {
      setPhase(PHASES.DAY);
      setNightResult(data.nightResult);
      setPlayers(data.players);
      setSelectedTarget(null);
      setInvestigationResult(null);
    });

    socketService.on('chat_message', (data) => {
      setChatMessages(prev => [...prev, data]);
    });

    socketService.on('player_accused', (data) => {
      setAccusedPlayer(data);
    });

    socketService.on('voting_phase_start', (data) => {
      setPhase(PHASES.VOTING);
      if (data.accusedPlayer) {
        setAccusedPlayer(data.accusedPlayer);
      }
    });

    socketService.on('voting_result', (data) => {
      if (data.eliminated) {
        alert(`${data.eliminated.nickname} was eliminated! Role: ${data.eliminated.role}`);
      } else {
        alert(`No one was eliminated. Votes: ${data.guiltyVotes} Guilty, ${data.innocentVotes} Innocent`);
      }
      setVotingTarget(null);
      setAccusedPlayer(null);
      setHasAccused(false); // Reset for next day
      setPhaseNumber(prev => prev + 1);
    });

    socketService.on('night_phase_start', (data) => {
      setPhase(PHASES.NIGHT);
      setPlayers(data.players);
    });

    socketService.on('accusation_error', (data) => {
      alert(data.message);
    });

    socketService.on("timer_update", (data) => {
      setPhaseTimer(data.timeRemaining);
      setCurrentPhase(data.phase);
    });

    socketService.on('game_over', (data) => {
      setPhase(PHASES.GAME_OVER);
      setGameResult(data.result);
      setPlayers(data.players);
    });

    return () => {
      socketService.disconnect();
    };
  }, []);

   const createRoom = async () => {
    if (!nickname.trim()) {
      alert("Please enter a nickname");
      return;
    }
    
    console.log('🎮 Creating room with nickname:', nickname.trim());
    setIsCreating(true);
    
    try {
      const connected = await connectToServer();
      
      if (connected) {
        console.log('📡 Emitting create_room event');
        socketService.emit("create_room", { nickname: nickname.trim() });
        console.log('✅ create_room event emitted successfully');
      } else {
        throw new Error('Failed to connect to server');
      }
    } catch (error) {
      console.error('❌ Error creating room:', error);
      alert("Failed to connect to server. Please try again.");
      setIsCreating(false);
    }
  };

  const joinRoom = async () => {
    if (!nickname.trim() || !roomCode.trim()) {
      alert("Please enter both nickname and room code");
      return;
    }
    
    console.log('🎮 Joining room:', roomCode.trim().toUpperCase(), 'with nickname:', nickname.trim());
    setIsJoining(true);
    
    try {
      const connected = await connectToServer();
      
      if (connected) {
        console.log('📡 Emitting join_room event');
        socketService.emit("join_room", {
          roomCode: roomCode.trim().toUpperCase(),
          nickname: nickname.trim(),
        });
        console.log('✅ join_room event emitted successfully');
      } else {
        throw new Error('Failed to connect to server');
      }
    } catch (error) {
      console.error('❌ Error joining room:', error);
      alert("Failed to connect to server. Please try again.");
      setIsJoining(false);
    }
  };;

  const startGame = () => {
    setShowIntro(true);
    setIntroStep(0);
  };

  const performNightAction = (action, target) => {
    socketService.emit('night_action', { action, target });
    setSelectedTarget(target);
  };

  const sendChatMessage = () => {
    if (!chatInput.trim()) return;
    socketService.emit('day_chat', { message: chatInput.trim() });
    setChatInput('');
  };

  const accusePlayer = (targetId) => {
    if (hasAccused) {
      alert('You can only accuse once per day phase');
      return;
    }
    socketService.emit('accuse_player', { target: targetId });
    setHasAccused(true);
  };

  const vote = (voteType) => {
    socketService.emit('vote', { vote: voteType });
    setVotingTarget(voteType);
  };

  const resetGame = () => {
    setGameState('menu');
    setPlayers([]);
    setCurrentPlayer(null);
    setPhase(PHASES.LOBBY);
    setRole(null);
    setChatMessages([]);
    setSelectedTarget(null);
    setInvestigationResult(null);
    setNightResult(null);
    setGameResult(null);
    setAccusedPlayer(null);
    setVotingTarget(null);
    setRoomCode('');
    setHasAccused(false);
    setPhaseNumber(1);
    setShowIntro(false);
    setIntroStep(0);
    setPhaseTimer(0);
    setCurrentPhase('');
    setIsCreating(false);
    setIsJoining(false);
  };

  const getRoleIcon = (roleName) => {
    const IconComponent = ROLE_ICONS[roleName] || Users;
    return <IconComponent className="w-4 h-4" />;
  };

  const getRoleColor = (roleName) => {
    return ROLE_COLORS[roleName] || 'bg-gray-600';
  };

  const getAlivePlayers = () => {
    return players.filter(p => p.isAlive);
  };

  const canPerformNightAction = () => {
    return phase === PHASES.NIGHT && role && getAlivePlayers().find(p => p.nickname === nickname)?.isAlive;
  };

  const canChat = () => {
    return phase === PHASES.DAY && getAlivePlayers().find(p => p.nickname === nickname)?.isAlive;
  };

  const canVote = () => {
    return phase === PHASES.VOTING && getAlivePlayers().find(p => p.nickname === nickname)?.isAlive;
  };

  if (gameState === 'menu') {
    return (
      <div className="game-container village-bg flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-primary">Whooded</CardTitle>
            <p className="text-muted-foreground">A dark multiplayer Mafia game</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Your Nickname</label>
              <Input
                type="text"
                placeholder="Enter your nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
              />
            </div>
            
            <div className="space-y-2">
              <Button 
                onClick={createRoom} 
                className="w-full action-button" 
                disabled={isCreating}
              >
                <Crown className="w-4 h-4 mr-2" />
                {isCreating ? 'Creating...' : 'Create Room'}
              </Button>
              
              <div className="flex space-x-2">
                <Input
                  type="text"
                  placeholder="Room Code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="flex-1"
                />
                <Button 
                  onClick={joinRoom} 
                  className="action-button" 
                  disabled={isJoining}
                >
                  {isJoining ? 'Joining...' : 'Join'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (gameState === 'lobby') {
    return (
      <div className="game-container village-bg p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Room: {roomCode}</CardTitle>
                <p className="text-muted-foreground">
                  {players.length}/12 players • Minimum 5 to start
                </p>
              </CardHeader>
              <CardContent>
                <div className="player-list">
                  {players.map((player, index) => (
                    <div key={player.socketId} className="player-item">
                      <div className="flex items-center space-x-2">
                        <Users className="w-4 h-4" />
                        <span>{player.nickname}</span>
                        {player.isHost && <Crown className="w-4 h-4 text-yellow-500" />}
                      </div>
                    </div>
                  ))}
                </div>
                
                {currentPlayer?.isHost && players.length >= 5 && (
                <Button onClick={startGame} className="w-full mt-4 action-button">
                  Start Game
                </Button>
              )}
              
              {players.length < 5 && (
                <p className="text-center text-muted-foreground mt-4">
                  Need {5 - players.length} more players to start
                </p>
              )}
            </CardContent>
          </Card>
          
          {/* Game Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">📘 How to Play</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-h-64 overflow-y-auto">
              <div>
                <h4 className="font-semibold text-primary mb-2">🎭 Roles</h4>
                <ul className="space-y-1 text-sm">
                  <li><span className="text-red-400">🔴 Mafia:</span> Eliminate townspeople during the night</li>
                  <li><span className="text-blue-400">🔵 Police:</span> Investigate players to discover their roles</li>
                  <li><span className="text-green-400">💚 Doctor:</span> Save players from being eliminated</li>
                  <li><span className="text-gray-400">⚪ Citizens:</span> Help find and eliminate the Mafia</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold text-primary mb-2">🌙 Night Phase</h4>
                <p className="text-sm text-muted-foreground">Players with special roles act privately. Mafia chooses victims, Police investigates, Doctor saves.</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-primary mb-2">☀️ Day Phase</h4>
                <p className="text-sm text-muted-foreground">Players discuss, accuse suspicious players, and vote to eliminate someone.</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-primary mb-2">🎯 Goal</h4>
                <p className="text-sm text-muted-foreground">Citizens win by eliminating all Mafia. Mafia wins by surviving and outnumbering citizens.</p>
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      </div>
    );
  }

  // Intro Story Component
  const introStory = [
    "In a peaceful village, everyone lived in harmony…",
    "Until one night, mysterious crimes began.",
    "The Mafia hides among them…",
    "The Doctor tries to save lives…",
    "The Police hunts in secret…",
    "And the villagers must vote to survive."
  ];

  const skipIntro = () => {
    setShowIntro(false);
    socketService.emit('start_game');
  };

  useEffect(() => {
    if (showIntro && introStep < introStory.length) {
      const timer = setTimeout(() => {
        setIntroStep(prev => prev + 1);
      }, 3000);
      return () => clearTimeout(timer);
    } else if (showIntro && introStep >= introStory.length) {
      setTimeout(() => {
        setShowIntro(false);
        socketService.emit('start_game');
      }, 2000);
    }
  }, [showIntro, introStep]);

  if (showIntro) {
    return (
      <div className="game-container village-bg flex items-center justify-center p-4">
        <div className="text-center space-y-8 max-w-2xl">
          <div className="h-32 flex items-center justify-center">
            {introStep < introStory.length && (
              <p className="text-2xl text-foreground animate-fade-in">
                {introStory[introStep]}
              </p>
            )}
          </div>
          <Button onClick={skipIntro} variant="outline" className="mt-8">
            Skip Intro
          </Button>
        </div>
      </div>
    );
  }

  if (gameState === 'game') {
    return (
      <div className="game-container village-bg p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Phase Indicator */}
          <div className="phase-indicator">
            <div className="flex justify-between items-center">
              <div>
                {phase === PHASES.NIGHT && `🌙 Night ${Math.ceil(phaseNumber / 2)} - Roles are acting...`}
                {phase === PHASES.DAY && `☀️ Day ${Math.ceil(phaseNumber / 2)} - Discuss and find the Mafia!`}
                {phase === PHASES.VOTING && `🗳️ Voting Phase - Decide who to eliminate`}
                {phase === PHASES.GAME_OVER && `🎭 Game Over - ${gameResult === 'mafia' ? 'Mafia Wins!' : 'Townspeople Win!'}`}
              </div>
              {phaseTimer > 0 && phase !== PHASES.GAME_OVER && (
                <div className="timer-display">
                  ⏱️ {Math.floor(phaseTimer / 60)}:{(phaseTimer % 60).toString().padStart(2, '0')}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Role & Actions */}
            <div className="space-y-4">
              {/* Role Card */}
              {role && (
                <Card className="role-card">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      {getRoleIcon(role)}
                      <span>Your Role</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge className={`${getRoleColor(role)} text-white`}>
                      {role.toUpperCase()}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-2">
                      {role === ROLES.MAFIA && "Eliminate townspeople during the night."}
                      {role === ROLES.POLICE && "Investigate players to discover their roles."}
                      {role === ROLES.DOCTOR && "Save players from being eliminated."}
                      {role === ROLES.CITIZEN && "Help find and eliminate the Mafia."}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Night Actions */}
              {canPerformNightAction() && (
                <Card>
                  <CardHeader>
                    <CardTitle>Night Action</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {role === ROLES.MAFIA && (
                      <div className={phase === PHASES.NIGHT ? 'mafia-animation' : ''}>
                        <p className="text-sm mb-2">Choose someone to eliminate:</p>
                        {getAlivePlayers().filter(p => p.nickname !== nickname).map(player => (
                          <Button
                            key={player.socketId}
                            onClick={() => performNightAction('kill', player.socketId)}
                            disabled={selectedTarget === player.socketId}
                            className="w-full mb-1 danger-button"
                            size="sm"
                          >
                            <Skull className="w-4 h-4 mr-2" />
                            {player.nickname}
                          </Button>
                        ))}
                      </div>
                    )}
                    
                    {role === ROLES.POLICE && (
                      <div>
                        <p className="text-sm mb-2">Choose someone to investigate:</p>
                        {getAlivePlayers().filter(p => p.nickname !== nickname).map(player => (
                          <Button
                            key={player.socketId}
                            onClick={() => performNightAction('investigate', player.socketId)}
                            disabled={selectedTarget === player.socketId}
                            className="w-full mb-1 action-button"
                            size="sm"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            {player.nickname}
                          </Button>
                        ))}
                      </div>
                    )}
                    
                    {role === ROLES.DOCTOR && (
                      <div>
                        <p className="text-sm mb-2">Choose someone to save:</p>
                        {getAlivePlayers().map(player => (
                          <Button
                            key={player.socketId}
                            onClick={() => performNightAction('save', player.socketId)}
                            disabled={selectedTarget === player.socketId}
                            className="w-full mb-1 action-button"
                            size="sm"
                          >
                            <Heart className="w-4 h-4 mr-2" />
                            {player.nickname}
                          </Button>
                        ))}
                      </div>
                    )}
                    
                    {selectedTarget && (
                      <p className="text-sm text-green-400">Action submitted!</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Investigation Result */}
              {investigationResult && (
                <Card className="border-blue-500">
                  <CardHeader>
                    <CardTitle className="text-blue-400">Investigation Result</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p><strong>{investigationResult.nickname}</strong> is a <Badge className={getRoleColor(investigationResult.role)}>{investigationResult.role.toUpperCase()}</Badge></p>
                  </CardContent>
                </Card>
              )}

              {/* Voting */}
              {canVote() && accusedPlayer && (
                <Card>
                  <CardHeader>
                    <CardTitle>Vote</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm">Vote on {accusedPlayer.nickname || accusedPlayer.accused}:</p>
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => vote('guilty')}
                        disabled={votingTarget !== null}
                        className="flex-1 danger-button"
                      >
                        Guilty
                      </Button>
                      <Button
                        onClick={() => vote('innocent')}
                        disabled={votingTarget !== null}
                        className="flex-1 action-button"
                      >
                        Innocent
                      </Button>
                    </div>
                    {votingTarget && <p className="text-sm text-green-400">Vote submitted!</p>}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Middle Column - Chat */}
            <div className="space-y-4">
              {/* Night Result */}
              {nightResult && (
                <Card className="border-red-500">
                  <CardHeader>
                    <CardTitle className="text-red-400">Night Report</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {nightResult.killedPlayer ? (
                      <p>A player was eliminated during the night.</p>
                    ) : (
                      <p>No one was eliminated last night.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Chat */}
              {(phase === PHASES.DAY || phase === PHASES.VOTING) && (
                <Card className="chat-container">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <MessageCircle className="w-4 h-4" />
                      <span>Discussion</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64 overflow-y-auto space-y-2 mb-4">
                      {chatMessages.map((msg, index) => (
                        <div key={index} className="chat-message">
                          <div className="flex justify-between items-start">
                            <span className="font-semibold">{msg.from}:</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm">{msg.message}</p>
                        </div>
                      ))}
                    </div>
                    
                    {canChat() && (
                      <div className="flex space-x-2">
                        <Input
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Type your message..."
                          onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                        />
                        <Button onClick={sendChatMessage} size="sm">
                          Send
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column - Players */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Users className="w-4 h-4" />
                    <span>Players ({getAlivePlayers().length} alive)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="player-list">
                    {players.map(player => (
                      <div 
                        key={player.socketId} 
                        className={`player-item ${!player.isAlive ? 'player-dead' : ''}`}
                      >
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4" />
                          <span>{player.nickname}</span>
                          {!player.isAlive && player.role && (
                            <Badge className={`${getRoleColor(player.role)} text-white text-xs`}>
                              {player.role}
                            </Badge>
                          )}
                          {!player.isAlive && <Skull className="w-4 h-4 text-red-500" />}
                        </div>
                        
                        {phase === PHASES.DAY && canChat() && player.isAlive && player.nickname !== nickname && (
                          <Button
                            onClick={() => accusePlayer(player.socketId)}
                            size="sm"
                            className="danger-button"
                          >
                            Accuse
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Game Over */}
          {phase === PHASES.GAME_OVER && (
            <Card className="text-center">
              <CardContent className="p-6">
                <h2 className="text-3xl font-bold mb-4">
                  {gameResult === 'mafia' ? '🔴 Mafia Wins!' : '🔵 Townspeople Win!'}
                </h2>
                <Button onClick={resetGame} className="action-button">
                  Play Again
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default App;

