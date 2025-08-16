import { useState, useEffect, useRef } from 'react';
import { Eye, Users, Clock, Skull, Shield, Heart, Crown, MessageCircle, Vote, ClipboardCopy } from 'lucide-react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import socketService from './lib/socketService';
import './App.css';
import StoryIntroPage from './components/StoryIntro';
import useSound from './hooks/useSound';

// Import image assets
import villageDayBgImage from './assets/story/scene1_peaceful_village.jpg';
import villageNightBgImage from './assets/story/scene3_dark_turn.jpg'; // Using an existing image for the night background

const PHASES = {
  LOBBY: 'lobby',
  NIGHT: 'night',
  DAY: 'day',
  VOTING: 'voting',
  GAME_OVER: 'game_over',
  ROLE_REVEAL: 'role_reveal' // New phase for role reveal
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

// Main application content component
function AppContent() {

  const [gameState, setGameState] = useState('menu');
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
  const [phaseTimer, setPhaseTimer] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("");
  const [currentTip, setCurrentTip] = useState("");
  const chatMessagesRef = useRef(null); // Ref for chatbox scrolling
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [background, setBackground] = useState(villageDayBgImage); // State for dynamic background
  const [hasPerformedNightAction, setHasPerformedNightAction] = useState(false); // *** NEW: State to track night actions ***


  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const navigate = useNavigate();

  // Audio hooks - Please verify these file paths are correct in your public/audio folder
  // Using html5: true for background music for better performance on larger files
  // *** FIX: Added html5: true to all sound hooks to attempt to fix decoding errors ***
  const { play: playLobbyMusic, stop: stopLobbyMusic } = useSound(
    "/audio/background/lobby.mp3",
    { loop: true, volume: 0.3, html5: true }
  );
  const { play: playGameTensionMusic, stop: stopGameTensionMusic } = useSound(
    "/audio/background/game-tension.mp3",
    { loop: true, volume: 0.3, html5: true }
  );
  const { play: playClickSound } = useSound("/audio/ui/click-1.mp3", { html5: true });
  const { play: playNightStartSound } = useSound("/audio/events/night-start.mp3", { html5: true });
  const { play: playDayStartSound } = useSound("/audio/events/day-start.mp3", { html5: true });
  const { play: playEliminationSound } = useSound("/audio/events/elimination.mp3", { html5: true });
  const { play: playGameOverSound } = useSound("/audio/events/gameover.mp3", { html5: true });
  const { play: playTimerSound, stop: stopTimerSound } = useSound("/audio/events/timer.mp3", { html5: true });

  const connectToServer = async () => {
  if (!isConnected) {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    try {
      socketService.on('connect', () => {
        setIsConnected(true);
      });

      socketService.on('disconnect', () => {
        setIsConnected(false);
      });

      socketService.on('room_created', (data) => {
        setRoomCode(data.roomCode);
        setPlayers(data.players);
        setGameState('lobby');
        setCurrentPlayer(data.players.find(p => p.isHost));
        setIsCreating(false);
      });

      socketService.on('room_joined', (data) => {
        setRoomCode(data.roomCode);
        setPlayers(data.players);
        setGameState('lobby');
        setCurrentPlayer(data.players.find(p => p.nickname === nickname));
        setIsJoining(false);
      });

      socketService.on('join_error', (data) => {
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
      // FIX: New game flow: receive role and navigate to reveal screen
      socketService.on('role_assigned', (data) => {
        setRole(data.role);
        setPhase(PHASES.ROLE_REVEAL); // Set new phase for role reveal
        setGameState('role_reveal'); // Set new game state
      });

      socketService.on('game_started', (data) => {
        setPlayers(data.players);
        setGameState('game');
        stopLobbyMusic();
        playGameTensionMusic();
        navigate("/story-intro");
      });

      // FIX: Game now starts the night phase timer after all players acknowledge their roles
      socketService.on('start_night_phase', (data) => {
        setPhase(data.phase);
        playNightStartSound();
        // The timer is handled by the backend
      });

      socketService.on('investigation_result', (data) => {
        setInvestigationResult(data);
      });

      socketService.on('action_confirmed', (data) => {
        alert(`Action confirmed: ${data.action} on ${data.target}`);
      });

      // NEW: Centralized announcement logic
      socketService.on('day_phase_start', (data) => {
        setPhase(PHASES.DAY);
        setPlayers(data.players);
        setSelectedTarget(null);
        setInvestigationResult(null);
        playDayStartSound();
        if (data.nightResult?.killedPlayer) {
          setAnnouncementMessage(`A body has been discovered! ${data.nightResult.killedPlayer.nickname} was eliminated. Their role was: ${data.nightResult.killedPlayer.role}.`);
        } else {
          setAnnouncementMessage("The night was peaceful. No one was eliminated.");
        }
      });

      socketService.on('chat_message', (data) => {
       const chatEntry = {
        sender: data.from ?? data.sender ?? 'Unknown',
        message: data.message ?? data.text ?? '',
        timestamp: data.timestamp ?? Date.now(),
        color: data.color ?? '#FFFFFF'
        };
        setChatMessages(prev => [...prev, chatEntry]);
      });

      socketService.on('player_accused', (data) => {
        setAccusedPlayer(data);
      });

      socketService.on('voting_phase_start', (data) => {
        setPhase(PHASES.VOTING);
        if (data.accusedPlayer) {
          setAccusedPlayer(data.accusedPlayer);
          // NEW: Announce the accusation
          setAnnouncementMessage(`${data.accusedPlayer.nickname} has been accused! All players must now vote.`);
        }
      });

      // NEW: Centralized announcement for voting results
      socketService.on('voting_result', (data) => {
        if (data.eliminated) {
          setAnnouncementMessage(`${data.eliminated.nickname} was eliminated! Their role was: ${data.eliminated.role}.`);
          playEliminationSound();
        } else {
          setAnnouncementMessage(`No one was eliminated. The town could not agree on a culprit.`);
        }
        setVotingTarget(null);
        setAccusedPlayer(null);
        setHasAccused(false);
        setPhaseNumber(prev => prev + 1);
        setTimeout(() => {
          setAnnouncementMessage("");
        }, 5000);
      });

      socketService.on('night_phase_start', (data) => {
        setPhase(PHASES.NIGHT);
        setPlayers(data.players);
        playNightStartSound();
        setAnnouncementMessage(""); // Clear announcement for the next phase
        setHasPerformedNightAction(false); // *** FIX: Reset night action state ***
      });

      socketService.on('accusation_error', (data) => {
        alert(data.message);
      });

      socketService.on('timer_update', (data) => {
        setPhaseTimer(data.timeRemaining);
        setCurrentPhase(data.phase);
        if (data.timeRemaining <= 10 && data.timeRemaining > 0) {
          playTimerSound();
        } else if (data.timeRemaining === 0) {
          stopTimerSound();
        }
      });

      socketService.on('game_over', (data) => {
        // *** FIX: Set the main game state to 'game_over' to show the results screen ***
        setGameState(PHASES.GAME_OVER);
        setPhase(PHASES.GAME_OVER);
        setGameResult(data.result);
        setPlayers(data.players);
        playGameOverSound();
        stopGameTensionMusic();
        setAnnouncementMessage("");
      });

      await socketService.connect(backendUrl);

      return true;
    } catch (error) {
      console.error('❌ Failed to connect to server:', error);
      return false;
    }
  }
  return true;
};

  useEffect(() => {
    if (gameState === "menu" || gameState === "lobby") {
      playLobbyMusic();
      stopGameTensionMusic();
    } else if (gameState === "game" || gameState === "role_reveal" || gameState === "game_over") {
      stopLobbyMusic();
      playGameTensionMusic();
    } else {
      stopLobbyMusic();
      stopGameTensionMusic();
    }
  }, [gameState, playLobbyMusic, stopLobbyMusic, playGameTensionMusic, stopGameTensionMusic]);

  // *** NEW: useEffect to change background based on game phase ***
  useEffect(() => {
    if (phase === PHASES.NIGHT) {
      setBackground(villageNightBgImage);
    } else {
      setBackground(villageDayBgImage);
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      socketService.disconnect();
      stopLobbyMusic();
      stopGameTensionMusic();
    };
  }, []);

  // New useEffect to display random tips based on the phase
  useEffect(() => {
    const tips = {
      [PHASES.LOBBY]: ["Waiting for other players...", "The game will start once the host is ready.", "Get to know your fellow villagers."],
      [PHASES.NIGHT]: ["The Mafia is choosing their victim...", "Doctor, choose who to protect wisely!", "Police, who do you suspect?"],
      [PHASES.DAY]: ["Discuss who you think the Mafia is.", "Don't trust public claims too easily.", "Look for contradictions in player stories."],
      [PHASES.VOTING]: [`Will the accused player be eliminated?`, "Cast your vote - guilty or innocent.", `The fate of ${accusedPlayer?.nickname || 'the accused'} is in your hands.`],
      [PHASES.GAME_OVER]: ["Game over! Thanks for playing.", "You can start a new game from the menu."],
    };
    
    if (currentPhase && tips[currentPhase]) {
        const randomTip = tips[currentPhase][Math.floor(Math.random() * tips[currentPhase].length)];
        setCurrentTip(randomTip);
    } else {
        setCurrentTip("");
    }
  }, [currentPhase, accusedPlayer]);

  // useEffect to scroll chat to the bottom
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);


const createRoom = async () => {
  if (!nickname.trim()) {
    alert("Please enter a nickname");
    return;
  }

  playClickSound();
  setIsCreating(true);

  try {
    const connected = await connectToServer();

    if (connected) {
      socketService.emit("create_room", { nickname: nickname.trim() });
    } else {
      throw new Error('Failed to connect to server');
    }
  } catch (error) {
    alert("Failed to connect to server. Please try again.");
    setIsCreating(false);
  }
};

  const joinRoom = async () => {
    if (!nickname.trim() || !roomCode.trim()) {
      alert("Please enter both nickname and room code");
      return;
    }
    
    playClickSound();
    setIsJoining(true);
    
    try {
      const connected = await connectToServer();
      
      if (connected) {
        socketService.emit("join_room", {
          roomCode: roomCode.trim().toUpperCase(),
          nickname: nickname.trim(),
        });
      } else {
        throw new Error('Failed to connect to server');
      }
    } catch (error) {
      alert("Failed to connect to server. Please try again.");
      setIsJoining(false);
    }
  };

  const startGame = () => {
    if (currentPlayer?.isHost) {
      socketService.emit('start_game', { roomCode });
    }
  };

  const copyRoomCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode)
        .then(() => alert('Room code copied to clipboard!'))
        .catch(err => console.error('Failed to copy text: ', err));
    }
  };

  const performNightAction = (action, targetSocketId) => {
    const target = targetSocketId ?? selectedTarget?.socketId;
    if (!target) {
      alert('Please select a target first.');
      return; 
    }
    playClickSound();
    socketService.emit('night_action', { action, target });
    setSelectedTarget(players.find(p => p.socketId === target) ?? null);
    setHasPerformedNightAction(true); // *** FIX: Set action as performed ***
  }

  const sendChatMessage = () => {
    if (!chatInput.trim()) return;

    if (phase === PHASES.NIGHT && role === ROLES.MAFIA) {
      socketService.emit('mafia_chat', { message: chatInput.trim() });
    } else if (phase === PHASES.LOBBY) {
        socketService.emit('lobby_chat', { message: chatInput.trim() });
    } else if (phase === PHASES.DAY) {
        socketService.emit('day_chat', { message: chatInput.trim() });
    }
    
    setChatInput('');
  };

  const accusePlayer = (targetId) => {
    if (hasAccused) {
      alert('You can only accuse once per day phase');
      return;
    }
    playClickSound();
    socketService.emit('accuse_player', { target: targetId });
    setHasAccused(true);
  };

  const vote = (voteType) => {
    playClickSound();
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
    setPhaseTimer(0);
    setCurrentPhase('');
    setIsCreating(false);
    setIsJoining(false);
    stopLobbyMusic();
    stopGameTensionMusic();
    stopTimerSound();
  };

  const acknowledgeRole = () => {
    playClickSound();
    socketService.emit('role_acknowledged', { roomCode });
    setGameState('game');
    navigate('/');
  }

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
    const isAlive = getAlivePlayers().some(p => p.nickname === nickname);
    if (!isAlive) return false;

    if (phase === PHASES.DAY || phase === PHASES.LOBBY) {
      return true;
    }
    if (phase === PHASES.NIGHT && role === ROLES.MAFIA) {
      return true;
    }
    return false;
  };

  // *** FIX: Added the missing canVote function ***
  const canVote = () => {
    const isAlive = getAlivePlayers().some(p => p.nickname === nickname);
    if (!isAlive) return false;

    return phase === PHASES.VOTING;
  };

  const handleStoryComplete = () => {
    setGameState(PHASES.ROLE_REVEAL);
    navigate('/');
  };


  return (
    <Routes>
      <Route path="/story-intro" element={<StoryIntroPage onComplete={handleStoryComplete} />} />
      <Route path="/" element={
        <div className="game-container village-bg flex items-center justify-center p-4" style={{ backgroundImage: `url(${background})` }}>
          {gameState === 'menu' && (
            <Card className="w-full max-w-lg">
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
                    onClick={() => createRoom(nickname)}
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
          )}

          {gameState === 'lobby' && (
            <div className="w-full p-4 flex justify-center">
              <div className="w-full max-w-4xl space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl flex items-center"><Crown className="w-6 h-6 mr-2" /> Lobby: {roomCode}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Players ({players.length}/12)</h3>
                      <div className="flex space-x-2">
                        <Button onClick={() => setGameState('about')} variant="outline" className="text-sm">
                          <Eye className="w-4 h-4 mr-2" /> How to Play
                        </Button>
                        <Button onClick={copyRoomCode} variant="outline" className="text-sm">
                          <ClipboardCopy className="w-4 h-4 mr-2" /> Copy Code
                        </Button>
                      </div>
                      {currentPlayer?.isHost && players.length >= 5 && (
                        <Button onClick={startGame} className="action-button">Start Game</Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {players.map((player, idx) =>(
                         <Card key={player.socketId || idx} className={`p-3 flex flex-col items-center ${player.isAlive ? '' : 'opacity-50 line-through'}`}>
                           {getRoleIcon(player.role)}
                           <span className="text-sm font-medium mt-1">{player.nickname} {player.isHost && '(Host)'}</span>
                         </Card>
                      ))}
                    </div>
                    <Button onClick={resetGame} variant="outline" className="w-full text-red-500 border-red-500 hover:bg-red-500 hover:text-white">Leave Room</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center"><MessageCircle className="w-5 h-5 mr-2" /> Chat</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div ref={chatMessagesRef} className="chat-messages space-y-2 h-64 overflow-y-auto p-2 bg-gray-800 rounded-md">
                      {chatMessages.map((msg, index) => (
                        <div key={`${msg.sender}-${msg.timestamp || index}`} className="text-sm">
                          <span className="font-bold" style={{ color: msg.color }}>{msg.sender}:</span>{" "} {msg.message}
                        </div>
                      ))}
                    </div>
                    {canChat() && (
                      <div className="flex space-x-2">
                        <Textarea
                          placeholder="Type your message..."
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              sendChatMessage();
                            }
                          }}
                          className="flex-1"
                        />
                        <Button onClick={sendChatMessage} className="action-button">Send</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {gameState === 'role_reveal' && role && (
            <Card className="w-full max-w-lg text-center">
              <CardHeader>
                <CardTitle className="text-4xl font-bold">Your Role</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className={`p-6 rounded-lg ${getRoleColor(role)}/20 border border-${getRoleColor(role)}/30`}>
                  {getRoleIcon(role)}
                  <h3 className="text-3xl font-bold mt-4">{role.toUpperCase()}</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    {role === ROLES.MAFIA && "You can eliminate one player each night. Your goal is to outnumber the townspeople."}
                    {role === ROLES.POLICE && "You can investigate one player each night to learn if they are Mafia."}
                    {role === ROLES.DOCTOR && "You can protect one player each night from elimination."}
                    {role === ROLES.CITIZEN && "You have no special abilities. Use your wits to find the Mafia!"}
                  </p>
                </div>
                <Button onClick={acknowledgeRole} className="w-full action-button">Continue to Game</Button>
              </CardContent>
            </Card>
          )}

          {gameState === 'game' && (
            <div className="w-full p-4 flex justify-center">
              <div className="w-full max-w-4xl space-y-6">
                {announcementMessage && (
                  <Card className="bg-gray-800 border-gray-700 animate-fade-in">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm italic text-gray-400">
                        "{announcementMessage}"
                      </p>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl flex items-center"><Clock className="w-6 h-6 mr-2" /> Phase: {currentPhase} (Time: {phaseTimer}s)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-lg">Your Role: <span className={`font-bold ${getRoleColor(role)} px-2 py-1 rounded-md`}>{role?.toUpperCase()}</span></p>
                    {nightResult && (
                      <div className="bg-gray-700 p-3 rounded-md">
                        <h4 className="font-semibold">Night Actions Result:</h4>
                        <p>Killed: {nightResult.killedPlayer?.nickname || 'None'}</p>
                        <p>Saved: {nightResult.savedPlayer?.nickname || 'None'}</p>
                      </div>
                    )}
                    {investigationResult && (
                      <div className="bg-gray-700 p-3 rounded-md">
                        <h4 className="font-semibold">Investigation Result:</h4>
                        <p>{investigationResult.targetNickname} is {investigationResult.isMafia ? 'Mafia' : 'not Mafia'}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center"><Users className="w-5 h-5 mr-2" /> Players</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {players.map((player) => (
                        <Card
                          key={player.socketId}
                          className={`p-3 flex flex-col items-center cursor-pointer ${!player.isAlive ? 'opacity-50 line-through' : ''} ${selectedTarget?.socketId === player.socketId ? 'border-4 border-blue-500' : ''}`}
                          onClick={() => player.isAlive && setSelectedTarget(player)}
                        >
                          {getRoleIcon(player.role)}
                          <span className="text-sm font-medium mt-1">{player.nickname}</span>
                          {!player.isAlive && <Badge variant="destructive" className="mt-1">Eliminated</Badge>}
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {phase === PHASES.NIGHT && canPerformNightAction() && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xl flex items-center"><Skull className="w-5 h-5 mr-2" /> Night Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {role === ROLES.MAFIA && (
                        <Button onClick={() => performNightAction('kill', selectedTarget?.socketId)} disabled={!selectedTarget || hasPerformedNightAction}>
                          Kill {selectedTarget?.nickname || '...'}
                          </Button>
                        )}
                      {role === ROLES.POLICE && (
                        <Button onClick={() => performNightAction('investigate', selectedTarget?.socketId)} disabled={!selectedTarget || hasPerformedNightAction}>
                          Investigate {selectedTarget?.nickname || '...'}
                          </Button>
                        )}
                        {role === ROLES.DOCTOR && (
                          <Button onClick={() => performNightAction('save', selectedTarget?.socketId)} disabled={!selectedTarget || hasPerformedNightAction}>
                            Save {selectedTarget?.nickname || '...'}
                             </Button>
                        )}
                    </CardContent>
                  </Card>
                )}

                {/* FIX: Moved accusation to Day phase and vote to Voting phase */}
                {phase === PHASES.DAY && currentPlayer?.isAlive && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xl flex items-center"><Vote className="w-5 h-5 mr-2" /> Accusation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button onClick={() => accusePlayer(selectedTarget?.socketId)} disabled={!selectedTarget || hasAccused}>Accuse {selectedTarget?.nickname || '...'}</Button>
                      {accusedPlayer && (
                        <p className="text-lg font-semibold">{accusedPlayer.nickname} has been accused!</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {phase === PHASES.VOTING && canVote() && accusedPlayer && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xl flex items-center"><Vote className="w-5 h-5 mr-2" /> Vote to Eliminate</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-lg">Vote on <span className="font-bold text-red-400">{accusedPlayer.nickname}</span>:</p>
                      <div className="flex space-x-4">
                        <Button onClick={() => vote('guilty')} disabled={votingTarget}>Guilty</Button>
                        <Button onClick={() => vote('innocent')} disabled={votingTarget}>Innocent</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center">
                      <MessageCircle className="w-5 h-5 mr-2" />
                      {phase === PHASES.NIGHT && role === ROLES.MAFIA ? 'Mafia Chat (Private)' : 'Chat'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div ref={chatMessagesRef} className="chat-messages space-y-2 h-64 overflow-y-auto p-2 bg-gray-800 rounded-md">
                      {chatMessages.map((msg, index) => (
                        <div key={`${msg.sender}-${msg.timestamp || index}`} className="text-sm">
                          <span className="font-bold" style={{ color: msg.color || '#FFFFFF' }}>{msg.sender}:</span>{" "} {msg.message}
                        </div>
                      ))}
                    </div>
                    {canChat() && (
                      <div className="flex space-x-2">
                        <Textarea
                          placeholder={phase === PHASES.NIGHT && role === ROLES.MAFIA ? "Chat with fellow Mafia..." : "Type your message..."}
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              sendChatMessage();
                            }
                          }}
                          className="flex-1"
                        />
                        <Button onClick={sendChatMessage} className="action-button">Send</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {gameState === 'game_over' && (
            <div className="w-full p-4 flex justify-center">
              <div className="w-full max-w-4xl space-y-6">
                <Card>
                  <CardHeader className={`text-center ${gameResult === 'townspeople' ? 'bg-green-700/20 text-green-400' : 'bg-red-700/20 text-red-400'}`}>
                    <CardTitle className="text-2xl">Game Over!</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-center">
                    {gameResult === 'townspeople' ? (
                      <p className="text-xl font-bold text-green-400">
                        <span className="text-4xl">🎉</span> Townspeople Win! You caught the culprit and saved your village. <span className="text-4xl">🎉</span>
                      </p>
                    ) : (
                      <p className="text-xl font-bold text-red-400">
                        <span className="text-4xl">💀</span> Mafia Wins! Your village has fallen. You trusted too easily and lost. <span className="text-4xl">💀</span>
                      </p>
                    )}
                    <h3 className="text-lg font-semibold">Roles Revealed:</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {players.map((player) => (
                        <Card key={player.socketId} className={`p-3 flex flex-col items-center ${player.isAlive ? '' : 'opacity-50 line-through'}`}>
                          {getRoleIcon(player.role)}
                          <span className="text-sm font-medium mt-1">{player.nickname}</span>
                          <Badge className={`mt-1 ${getRoleColor(player.role)}`}>{player.role}</Badge>
                        </Card>
                      ))}
                    </div>
                    <Button onClick={resetGame} className="action-button">Play Again</Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {gameState === 'about' && (
            <Card className="w-full max-w-4xl">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl font-bold text-primary">About Whooded</CardTitle>
                <p className="text-muted-foreground">Learn the rules and gameplay mechanics</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-3 flex items-center">
                      <Users className="w-5 h-5 mr-2" />
                      Game Overview
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Whooded is a multiplayer social deduction game based on Mafia. Players are secretly assigned roles 
                      and must work together to eliminate the Mafia while the Mafia tries to eliminate the townspeople.
                    </p>
                    <h4 className="font-semibold mb-2">Victory Conditions:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• <strong>Townspeople win</strong> when all Mafia are eliminated</li>
                      <li>• <strong>Mafia wins</strong> when they equal or outnumber the townspeople</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-semibold mb-3 flex items-center">
                      <Clock className="w-5 h-5 mr-2" />
                      Game Phases
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div className="p-3 bg-card/50 rounded-lg">
                        <h4 className="font-semibold">Night Phase</h4>
                        <p className="text-muted-foreground">Players with special roles perform their actions secretly.</p>
                      </div>
                      <div className="p-3 bg-card/50 rounded-lg">
                        <h4 className="font-semibold">Day Phase</h4>
                        <p className="text-muted-foreground">All players discuss and can accuse others of being Mafia.</p>
                      </div>
                      <div className="p-3 bg-card/50 rounded-lg">
                        <h4 className="font-semibold">Voting Phase</h4>
                        <p className="text-muted-foreground">Players vote guilty or innocent on the accused player.</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-xl font-semibold mb-4 text-center">Player Roles</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-red-600/20 border border-red-600/30 rounded-lg text-center">
                      <Skull className="w-8 h-8 mx-auto mb-2 text-red-400" />
                      <h4 className="font-semibold text-red-400">Mafia</h4>
                      <p className="text-xs text-muted-foreground mt-2">
                        Can eliminate one player each night. Wins by outnumbering townspeople.
                      </p>
                    </div>
                    
                    <div className="p-4 bg-blue-600/20 border border-blue-600/30 rounded-lg text-center">
                      <Shield className="w-8 h-8 mx-auto mb-2 text-blue-400" />
                      <h4 className="font-semibold text-blue-400">Police</h4>
                      <p className="text-xs text-muted-foreground mt-2">
                        Can investigate one player each night to learn their role.
                      </p>
                    </div>
                    
                    <div className="p-4 bg-green-600/20 border border-green-600/30 rounded-lg text-center">
                      <Heart className="w-8 h-8 mx-auto mb-2 text-green-400" />
                      <h4 className="font-semibold text-green-400">Doctor</h4>
                      <p className="text-xs text-muted-foreground mt-2">
                        Can protect one player each night from elimination.
                      </p>
                    </div>
                    
                    <div className="p-4 bg-gray-600/20 border border-gray-600/30 rounded-lg text-center">
                      <Users className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <h4 className="font-semibold text-gray-400">Citizen</h4>
                      <p className="text-xs text-muted-foreground mt-2">
                        No special abilities. Must use discussion and voting to find Mafia.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="text-center">
                  <Button 
                    onClick={() => setGameState('lobby')}
                    className="action-button"
                  >
                    Back to Lobby
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      } />
    </Routes>
  );
}

const App = () => (
  <AppContent />
);

export default App;
