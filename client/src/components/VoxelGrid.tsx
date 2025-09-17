import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Wifi, WifiOff, Users, Gamepad2, Palette } from 'lucide-react';
const WS_URL = import.meta.env.VITE_WS_URL;

interface GameState {
  w: number;
  h: number;
  data: number[];
}

interface VoxelGridProps {
  serverUrl?: string;
}

const VoxelGrid: React.FC<VoxelGridProps> = ({ 
  serverUrl
}) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);
  const [lastAction, setLastAction] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Dynamically construct WebSocket URL based on current page
  const getWebSocketUrl = () => {

    if (serverUrl) return serverUrl;
    if (WS_URL) return WS_URL;   // ← נוספה השורה הזאת

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  };

  // Convert 2-bit color values (0-3) to CSS colors
  const getColorFromBits = useCallback((value: number) => {
    const getBit = (v: number, bit: number) => (v >> bit) & 1;
    const get2Bits = (v: number, b0: number, b1: number) => 
      (getBit(v, b1) * 2) + getBit(v, b0);

    const r = get2Bits(value, 2, 5); // BIT_R0=2, BIT_R1=5
    const g = get2Bits(value, 3, 6); // BIT_G0=3, BIT_G1=6
    const b = get2Bits(value, 4, 7); // BIT_B0=4, BIT_B1=7

    // Map 0-3 values to 0-255 with nice color distribution
    const colorMap = [0, 85, 170, 255];
    return `rgb(${colorMap[r]}, ${colorMap[g]}, ${colorMap[b]})`;
  }, []);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log('Connected to voxel server');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'matrix') {
            setGameState({
              w: data.w,
              h: data.h,
              data: data.data
            });
            
            // Count players (cells with BIT_IS_PLAYER set)
            const players = data.data.filter((cell: number) => (cell & 1) === 1);
            setPlayerCount(players.length);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setGameState(null);
        setPlayerCount(0);
        
        // Attempt reconnection after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnected(false);
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      setConnected(false);
    }
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (!connected) return;

    const key = event.key.toLowerCase();
    let action = '';

    switch (key) {
      case 'arrowup':
      case 'w':
        sendMessage({ k: 'up' });
        action = 'Moved Up';
        break;
      case 'arrowdown':
      case 's':
        sendMessage({ k: 'down' });
        action = 'Moved Down';
        break;
      case 'arrowleft':
      case 'a':
        sendMessage({ k: 'left' });
        action = 'Moved Left';
        break;
      case 'arrowright':
      case 'd':
        sendMessage({ k: 'right' });
        action = 'Moved Right';
        break;
      case 'c':
        sendMessage({ k: 'c' });
        action = 'Color Changed';
        break;
    }

    if (action) {
      setLastAction(action);
      setTimeout(() => setLastAction(''), 2000);
      event.preventDefault();
    }
  }, [connected, sendMessage]);

  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  const renderGrid = () => {
    if (!gameState) return null;

    const cells = [];
    for (let r = 0; r < gameState.h; r++) {
      for (let c = 0; c < gameState.w; c++) {
        const index = r * gameState.w + c;
        const cellValue = gameState.data[index];
        const isPlayer = (cellValue & 1) === 1;
        
        cells.push(
          <div
            key={`${r}-${c}`}
            className={`
              voxel-cell
              ${isPlayer ? 'voxel-player' : 'voxel-empty'}
            `}
            style={{
              backgroundColor: isPlayer ? getColorFromBits(cellValue) : 'transparent',
            }}
          />
        );
      }
    }
    return cells;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Voxel World
          </h1>
          <p className="text-slate-300 text-lg">
            A multiplayer voxel playground where colors come alive
          </p>
        </div>

        {/* Status Bar */}
        <div className="flex justify-center items-center gap-6 mb-8">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
            connected ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
          }`}>
            {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
            <span className="font-medium">
              {connected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
          
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 text-blue-300">
            <Users size={18} />
            <span className="font-medium">{playerCount} Players</span>
          </div>

          {lastAction && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 text-purple-300 animate-pulse">
              <Gamepad2 size={18} />
              <span className="font-medium">{lastAction}</span>
            </div>
          )}
        </div>

        {/* Game Grid */}
        <div className="flex justify-center mb-8">
          {gameState ? (
            <div 
              className="voxel-grid bg-slate-800/50 p-4 rounded-2xl backdrop-blur-sm border border-slate-700/50 shadow-2xl"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gameState.w}, 1fr)`,
                gap: '1px',
                maxWidth: '800px',
                aspectRatio: '1',
              }}
            >
              {renderGrid()}
            </div>
          ) : (
            <div className="flex items-center justify-center w-96 h-96 bg-slate-800/50 rounded-2xl backdrop-blur-sm border border-slate-700/50">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-slate-400">Connecting to voxel world...</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-semibold mb-6 text-center flex items-center justify-center gap-2">
            <Gamepad2 className="text-purple-400" />
            Controls
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-800/50 p-6 rounded-xl backdrop-blur-sm border border-slate-700/50">
              <h3 className="text-lg font-semibold mb-4 text-blue-300">Movement</h3>
              <div className="space-y-2 text-slate-300">
                <p><kbd className="px-2 py-1 bg-slate-700 rounded text-xs">↑</kbd> <kbd className="px-2 py-1 bg-slate-700 rounded text-xs">W</kbd> Move Up</p>
                <p><kbd className="px-2 py-1 bg-slate-700 rounded text-xs">↓</kbd> <kbd className="px-2 py-1 bg-slate-700 rounded text-xs">S</kbd> Move Down</p>
                <p><kbd className="px-2 py-1 bg-slate-700 rounded text-xs">←</kbd> <kbd className="px-2 py-1 bg-slate-700 rounded text-xs">A</kbd> Move Left</p>
                <p><kbd className="px-2 py-1 bg-slate-700 rounded text-xs">→</kbd> <kbd className="px-2 py-1 bg-slate-700 rounded text-xs">D</kbd> Move Right</p>
              </div>
            </div>
            
            <div className="bg-slate-800/50 p-6 rounded-xl backdrop-blur-sm border border-slate-700/50">
              <h3 className="text-lg font-semibold mb-4 text-purple-300 flex items-center gap-2">
                <Palette size={18} />
                Colors
              </h3>
              <div className="space-y-2 text-slate-300">
                <p><kbd className="px-2 py-1 bg-slate-700 rounded text-xs">C</kbd> Cycle Color</p>
                <p className="text-sm text-slate-400 mt-2">
                  Press C to cycle through 64 different color combinations
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-slate-400">
          <p>Built with React, WebSockets, and lots of ❤️</p>
        </div>
      </div>
    </div>
  );
};

export default VoxelGrid;