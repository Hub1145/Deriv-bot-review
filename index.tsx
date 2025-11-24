import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  Play, 
  Pause, 
  Wallet, 
  Terminal,
  Plus,
  X,
  RefreshCw,
  AlertCircle,
  Wifi,
  WifiOff,
  Cpu,
  BrainCircuit,
  Layers,
  Check,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Target,
  Clock,
  List
} from 'lucide-react';

// --- Configuration ---
const APP_ID = 1089; // Public basic app ID for testing.
const GEMINI_API_KEY = process.env.API_KEY;

// --- Constants ---
const AVAILABLE_SYMBOLS = [
  { id: 'R_100', name: 'Volatility 100' },
  { id: 'R_75', name: 'Volatility 75' },
  { id: 'R_50', name: 'Volatility 50' },
  { id: 'R_25', name: 'Volatility 25' },
  { id: 'R_10', name: 'Volatility 10' },
  { id: '1HZ100V', name: 'Vol. 100 (1s)' },
  { id: '1HZ75V', name: 'Vol. 75 (1s)' },
  { id: '1HZ50V', name: 'Vol. 50 (1s)' },
  { id: '1HZ25V', name: 'Vol. 25 (1s)' },
  { id: '1HZ10V', name: 'Vol. 10 (1s)' },
  { id: 'frxEURUSD', name: 'EUR/USD' },
  { id: 'frxGBPUSD', name: 'GBP/USD' },
  { id: 'frxUSDJPY', name: 'USD/JPY' },
  { id: 'frxXAUUSD', name: 'Gold/USD' },
  { id: 'cryBTCUSD', name: 'BTC/USD' },
];

const TIMEFRAMES = [
  { label: '1 Minute', value: 60 },
  { label: '3 Minutes', value: 180 },
  { label: '5 Minutes', value: 300 },
];

// --- Types ---
type Candle = {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type TradeDecision = {
  symbol: string;
  action: 'CALL' | 'PUT' | 'HOLD';
  duration: number; // Represents NUMBER OF CANDLES
  stake: number;
  confidence: number;
  reasoning: string;
  technical_analysis?: string; // Extended analysis
};

type OpenContract = {
  contract_id: number;
  symbol: string;
  contract_type: string;
  buy_price: number;
  entry_spot: number;
  status: 'open' | 'won' | 'lost';
  profit: number;
};

type SymbolData = {
  symbol: string;
  displayName: string;
  candles: Candle[];
  lastPrice: number;
  isAnalyzing: boolean;
  status: 'waiting' | 'active' | 'error';
  lastDecision?: TradeDecision;
};

type LogEntry = {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'ai' | 'warning' | 'debug';
  message: string;
};

// --- Helpers ---
const getDisplayName = (symbol: string) => {
    const found = AVAILABLE_SYMBOLS.find(s => s.id === symbol);
    return found ? found.name : symbol;
};

// --- AI Logic ---
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const analyzeMarket = async (symbol: string, candles: Candle[], balance: number, timeframeMinutes: number): Promise<TradeDecision> => {
  // Format data for the LLM - PURE PRICE ACTION ONLY
  const ohlcString = candles.slice(-20).map(c => 
    `T:${new Date(c.epoch * 1000).toISOString().split('T')[1].substring(0,5)}|O:${c.open}|H:${c.high}|L:${c.low}|C:${c.close}`
  ).join('\n');

  const prompt = `
    Role: Elite Pure Price Action Binary Options Trader (No Indicators, No Volume).
    Objective: Grow account ($${balance}) to $10,000 using aggressive compounding on high-probability setups.
    Context: Trading ${symbol} on ${timeframeMinutes}-minute timeframe.
    
    MARKET DATA (Last 20 Candles - OHLC Only):
    ${ohlcString}
    
    ANALYSIS METHODOLOGY (CANDLESTICK GEOMETRY ONLY):
    1. MARKET STRUCTURE: Identify Higher Highs/Higher Lows (Uptrend) or Lower Highs/Lower Lows (Downtrend).
    2. CANDLE PSYCHOLOGY: 
       - Long Wicks = Rejection (Price tried to go there but failed).
       - Large Body = Strong Momentum.
       - Small Body (Doji) = Indecision/Potential Reversal.
    3. PATTERNS: Engulfing, Pinbar, Inside Bar, Morning/Evening Star, Railway Tracks.
    4. KEY LEVELS: Identify support/resistance based on previous wicks/bodies.

    STRATEGY (BINARY OPTIONS):
    - TREND CONTINUATION: If strong trend + minor pullback + rejection of pullback -> TRADE WITH TREND.
    - REVERSAL: If price hits key level + prints reversal candle (Pinbar/Engulfing) -> TRADE REVERSAL.
    
    MONEY MANAGEMENT (Growth Plan 10 -> 10k):
    - Account < $100: Risk 10-15% per trade (Aggressive Growth).
    - Account > $100: Risk 5-8% per trade.
    - Account > $1000: Risk 2-4% per trade.
    
    TASK:
    Analyze the *latest* closed candle in the context of the previous 19.
    Explain the psychology of buyers vs sellers.
    
    Output JSON ONLY:
    {
      "action": "CALL" | "PUT" | "HOLD",
      "duration": integer (1, 2, or 3). THIS IS THE NUMBER OF CANDLES to hold. (e.g. 1 = 1 candle expiry. If timeframe is 5m, duration 1 = 5m expiry).
      "stake": number (calculated based on Plan),
      "confidence": integer (0-100),
      "reasoning": "Short Strategy Name (e.g., 'Bullish Pinbar Rejection')",
      "technical_analysis": "Detailed 'Stream of Consciousness' log: 'Latest candle closed as a Hammer at support. Wicks indicate sellers exhausted. Previous 3 candles show deceleration. Expecting push up.'"
    }
  `;

  try {
    // Increased Timeout to 60s to prevent premature failures
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("AI Timeout")), 60000)
    );

    const apiPromise = ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ["CALL", "PUT", "HOLD"] },
            duration: { type: Type.INTEGER },
            stake: { type: Type.NUMBER },
            confidence: { type: Type.INTEGER },
            reasoning: { type: Type.STRING },
            technical_analysis: { type: Type.STRING }
          },
          required: ["action", "duration", "stake", "confidence", "reasoning", "technical_analysis"]
        }
      }
    });

    const response: any = await Promise.race([apiPromise, timeoutPromise]);
    const result = JSON.parse(response.text);
    return { ...result, symbol };
  } catch (error: any) {
    throw error; // Re-throw to be caught by the queue processor
  }
};


// --- Main Component ---

const App = () => {
  // State
  const [derivToken, setDerivToken] = useState<string>(() => localStorage.getItem('deriv_token') || '');
  const [isConnected, setIsConnected] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [currency, setCurrency] = useState('USD');
  const [activeSymbols, setActiveSymbols] = useState<string[]>(['R_100', 'R_50', '1HZ100V']); 
  const [marketData, setMarketData] = useState<Record<string, SymbolData>>({});
  const [openTrades, setOpenTrades] = useState<OpenContract[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isTradingActive, setIsTradingActive] = useState(false);
  const [showSymbolModal, setShowSymbolModal] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [timeframe, setTimeframe] = useState<number>(60); // Default 1 minute (60s)
  
  // Refs
  const ws = useRef<WebSocket | null>(null);
  const pingInterval = useRef<any>(null);
  const activeSymbolsRef = useRef<string[]>(activeSymbols);
  const isTradingActiveRef = useRef(isTradingActive);
  const balanceRef = useRef(balance);
  const currencyRef = useRef(currency);
  const timeframeRef = useRef(timeframe);
  
  // DATA REF: The Source of Truth for the WebSocket (avoids closure staleness)
  const marketDataRef = useRef<Record<string, SymbolData>>({});
  
  // Queue System for Rate Limiting
  const analysisQueue = useRef<{symbol: string, candles: Candle[]}[]>([]);
  const isProcessingQueue = useRef(false);

  // Helpers
  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    const id = Math.random().toString(36).substring(7);
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    
    // NEW LOGIC: Prepend to Top (Feed Style)
    setLogs(prev => [{ id, timestamp: time, type, message }, ...prev].slice(0, 150));
  }, []);

  // Sync refs
  useEffect(() => { activeSymbolsRef.current = activeSymbols; }, [activeSymbols]);
  useEffect(() => { isTradingActiveRef.current = isTradingActive; }, [isTradingActive]);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => { currencyRef.current = currency; }, [currency]);
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);


  // --- WebSocket Logic ---

  const sendRequest = useCallback((request: any, specificSocket?: WebSocket) => {
      const socket = specificSocket || ws.current;
      if (!socket || socket.readyState !== 1) return false;
      try {
        socket.send(JSON.stringify(request));
        return true;
      } catch (e) {
        return false;
      }
  }, []);

  const subscribeToSymbol = useCallback((symbol: string, specificSocket?: WebSocket, specificTimeframe?: number) => {
      const gran = specificTimeframe || timeframeRef.current;
      
      const initialData: SymbolData = {
           symbol,
           displayName: getDisplayName(symbol),
           candles: [], 
           lastPrice: 0,
           isAnalyzing: false,
           status: 'waiting'
      };

      // Initialize both State and Ref
      setMarketData(prev => ({ ...prev, [symbol]: initialData }));
      marketDataRef.current[symbol] = initialData;

      addLog('info', `[${symbol}] 📡 Fetching ${gran/60}m candles...`);

      sendRequest({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 50,
        end: 'latest',
        style: 'candles',
        granularity: gran, 
        subscribe: 1
      }, specificSocket);
  }, [sendRequest, addLog]);

  const changeTimeframe = (newTimeframe: number) => {
      if (newTimeframe === timeframe) return;
      setTimeframe(newTimeframe);
      addLog('warning', `⏰ Switching timeframe to ${newTimeframe / 60} minutes...`);
      
      // Clear current data
      setMarketData({});
      marketDataRef.current = {};

      if (ws.current && isConnected) {
          sendRequest({ forget_all: 'candles' });
          setTimeout(() => {
              activeSymbols.forEach(s => subscribeToSymbol(s, undefined, newTimeframe));
          }, 200);
      }
  };

  const placeTrade = useCallback(async (decision: TradeDecision) => {
      if (decision.action === 'HOLD') return;

      const rawStake = parseFloat(decision.stake.toFixed(2));
      const safeStake = Math.max(0.35, rawStake); 
      
      const currentTfSeconds = timeframeRef.current;
      const currentTfMinutes = currentTfSeconds / 60;
      
      const candles = decision.duration; 
      const actualDurationMinutes = Math.round(candles * currentTfMinutes);

      addLog('ai', `🤖 EXECUTING: ${decision.action} on ${decision.symbol}. Stake: $${safeStake}. Duration: ${actualDurationMinutes}m (${candles} candles)`);

      sendRequest({
          buy: 1,
          price: safeStake + 100, 
          parameters: {
              contract_type: decision.action === 'CALL' ? 'CALL' : 'PUT',
              symbol: decision.symbol,
              duration: actualDurationMinutes, 
              duration_unit: 'm', 
              basis: 'stake',
              amount: safeStake,
              currency: currencyRef.current,
          }
      });
  }, [sendRequest, addLog]); 

  // --- Queue Processing Logic ---
  
  const processQueue = async () => {
    if (isProcessingQueue.current) return;
    if (analysisQueue.current.length === 0) return;

    isProcessingQueue.current = true;
    const item = analysisQueue.current.shift();
    
    if (!item) {
        isProcessingQueue.current = false;
        return;
    }

    const { symbol, candles } = item;

    try {
        // UI Update: Analyzing
        setMarketData(prev => ({
            ...prev,
            [symbol]: { ...prev[symbol], isAnalyzing: true }
        }));

        const lastCandle = candles[candles.length - 1];
        const lastTime = new Date(lastCandle.epoch * 1000).toLocaleTimeString();
        
        // This log confirms exactly WHAT we are analyzing
        addLog('ai', `[${symbol}] 🧠 Analyzing Candle Closed at ${lastTime} (Price: ${lastCandle.close})...`); 

        const tfMinutes = timeframeRef.current / 60;
        const decision = await analyzeMarket(symbol, candles, balanceRef.current, tfMinutes);

        // Improved Visibility for reasoning
        addLog('ai', `[${symbol}] 📝 Analysis: ${decision.reasoning}`); 
        
        if (decision.action !== 'HOLD') {
            addLog('success', `>>> 🚀 SIGNAL: ${decision.action} (${decision.confidence}%)`);
            if (isTradingActiveRef.current) {
                placeTrade(decision);
            }
        } 

        setMarketData(prev => ({
            ...prev,
            [symbol]: { ...prev[symbol], lastDecision: decision }
        }));

    } catch (e: any) {
        addLog('error', `AI Failed [${symbol}]: ${e.message || e}`);
    } finally {
        // Reset Analyzing State
        setMarketData(prev => ({
            ...prev,
            [symbol]: { ...prev[symbol], isAnalyzing: false }
        }));

        // Reduced delay to process queue faster (500ms instead of 1500ms)
        setTimeout(() => {
            isProcessingQueue.current = false;
            processQueue(); 
        }, 500); 
    }
  };

  const queueAnalysis = (symbol: string, candles: Candle[]) => {
      // Validate inputs
      if (!candles || candles.length < 5) return;

      const existingIdx = analysisQueue.current.findIndex(i => i.symbol === symbol);
      if (existingIdx >= 0) {
          analysisQueue.current[existingIdx].candles = candles;
      } else {
          analysisQueue.current.push({ symbol, candles });
      }
      
      if (!isProcessingQueue.current) {
          processQueue();
      }
  };


  const connectDeriv = useCallback(() => {
    if (!derivToken) {
      addLog('error', 'Token required');
      return;
    }

    if (ws.current) {
      ws.current.close();
      if (pingInterval.current) clearInterval(pingInterval.current);
    }

    addLog('info', 'Connecting...');
    const socket = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`);
    ws.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      addLog('success', 'Connected.');
      socket.send(JSON.stringify({ authorize: derivToken }));
      
      pingInterval.current = setInterval(() => {
        if(socket.readyState === 1) socket.send(JSON.stringify({ ping: 1 }));
      }, 10000); 
    };

    socket.onclose = () => {
      setIsConnected(false);
      addLog('warning', 'Disconnected');
      if (pingInterval.current) clearInterval(pingInterval.current);
    };

    socket.onerror = () => addLog('error', 'Socket error');

    socket.onmessage = async (msg) => {
      const data = JSON.parse(msg.data);

      if (data.error) {
        if (data.error.code !== 'MarketIsClosed') {
             addLog('error', `API: ${data.error.message}`);
        }
        return;
      }

      if (data.msg_type === 'authorize') {
        setBalance(Number(data.authorize.balance));
        setCurrency(data.authorize.currency);
        addLog('success', `Auth Success: ${data.authorize.loginid}`);
        
        sendRequest({ balance: 1, subscribe: 1 }, socket);
        sendRequest({ proposal_open_contract: 1, subscribe: 1 }, socket);
        
        activeSymbolsRef.current.forEach(sym => subscribeToSymbol(sym, socket, timeframeRef.current));
      }

      // --- HISTORY / CANDLES HANDLER ---
      if (data.msg_type === 'history' || data.msg_type === 'candles') {
        const symbol = data.echo_req.ticks_history;
        const rawCandles = data.candles || [];
        const candles: Candle[] = rawCandles.map((c: any) => ({
          epoch: c.epoch,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close)
        }));

        // Merge with existing
        const existingCandles = marketDataRef.current[symbol]?.candles || [];
        const lastHistoryEpoch = candles.length > 0 ? candles[candles.length - 1].epoch : 0;
        const newerLiveCandles = existingCandles.filter(c => c.epoch > lastHistoryEpoch);
        const mergedCandles = [...candles, ...newerLiveCandles];

        // Update Ref (Source of Truth)
        marketDataRef.current[symbol] = {
            ...marketDataRef.current[symbol],
            symbol,
            displayName: getDisplayName(symbol),
            candles: mergedCandles,
            lastPrice: mergedCandles.length > 0 ? mergedCandles[mergedCandles.length - 1].close : 0,
            status: 'active'
        };

        // Sync State
        setMarketData(prev => ({
            ...prev,
            [symbol]: marketDataRef.current[symbol]
        }));

        // Initial Analysis if active
        if (isTradingActiveRef.current && mergedCandles.length >= 10) {
            queueAnalysis(symbol, mergedCandles);
        }
      }

      // --- OHLC HANDLER (REAL-TIME UPDATES) ---
      if (data.msg_type === 'ohlc') {
          const symbol = data.ohlc.symbol;
          const gran = data.ohlc.granularity;
          
          if (gran !== timeframeRef.current) return;

          const newCandle: Candle = {
            epoch: data.ohlc.open_time,
            open: Number(data.ohlc.open),
            high: Number(data.ohlc.high),
            low: Number(data.ohlc.low),
            close: Number(data.ohlc.close)
          };

          // 1. Get current accurate data from REF
          const currentData = marketDataRef.current[symbol];
          if (!currentData) return;

          let candles = [...currentData.candles];
          const lastCandle = candles[candles.length - 1];

          let didCandleClose = false;

          // 2. Determine if Update or New Candle
          if (lastCandle && lastCandle.epoch === newCandle.epoch) {
              // UPDATE current candle
              candles[candles.length - 1] = newCandle;
          } else {
              // NEW CANDLE: The previous candle is now fully CLOSED
              // But ONLY if we have a previous candle (startup check)
              if (lastCandle) {
                  didCandleClose = true;
              }
              candles.push(newCandle);
          }

          if (candles.length > 60) candles = candles.slice(-60);

          // 3. Update Ref
          marketDataRef.current[symbol] = {
              ...currentData,
              candles,
              lastPrice: newCandle.close,
              status: 'active'
          };

          // 4. Update UI State
          setMarketData(prev => ({
              ...prev,
              [symbol]: marketDataRef.current[symbol]
          }));

          // 5. TRIGGER AI ANALYSIS (If Candle Closed)
          if (didCandleClose && isTradingActiveRef.current) {
               addLog('info', `[${symbol}] 🕯️ Candle Closed. Checking AI...`);
               
               // slice(0, -1) gives us the candles UP TO the one that just closed.
               // The new candle (last in array) is ignored.
               const closedHistory = candles.slice(0, -1);
               if (closedHistory.length >= 5) {
                   queueAnalysis(symbol, closedHistory);
               }
          }
      }

      if (data.msg_type === 'proposal_open_contract') {
          const contract = data.proposal_open_contract;
          if (contract.is_sold) {
              setOpenTrades(prev => prev.filter(c => c.contract_id !== contract.contract_id));
              const profit = Number(contract.profit);
              const pl = isNaN(profit) ? 0 : profit;
              addLog(pl > 0 ? 'success' : 'error', `Closed: ${contract.display_name}. P/L: ${pl} ${contract.currency}`);
          } else {
              setOpenTrades(prev => {
                  const exists = prev.find(c => c.contract_id === contract.contract_id);
                  const updated: OpenContract = {
                      contract_id: contract.contract_id,
                      symbol: contract.underlying_symbol,
                      contract_type: contract.contract_type,
                      buy_price: Number(contract.buy_price),
                      entry_spot: isNaN(Number(contract.entry_spot)) ? 0 : Number(contract.entry_spot),
                      status: 'open',
                      profit: isNaN(Number(contract.profit)) ? 0 : Number(contract.profit)
                  };
                  return exists ? prev.map(c => c.contract_id === contract.contract_id ? updated : c) : [...prev, updated];
              });
          }
      }
      
      if (data.msg_type === 'balance') {
          setBalance(Number(data.balance.balance));
      }
    };

  }, [derivToken, sendRequest, subscribeToSymbol, addLog, timeframe]);

  const toggleSymbol = (symbolId: string) => {
    const isActive = activeSymbols.includes(symbolId);
    if (isActive) {
        setActiveSymbols(prev => prev.filter(s => s !== symbolId));
        setMarketData(prev => {
            const next = { ...prev };
            delete next[symbolId];
            return next;
        });
        if (marketDataRef.current[symbolId]) {
            delete marketDataRef.current[symbolId];
        }
    } else {
        setActiveSymbols(prev => [...prev, symbolId]);
        if (isConnected && ws.current?.readyState === 1) {
            subscribeToSymbol(symbolId);
        }
    }
  };

  const toggleCardExpansion = (symbolId: string) => {
      setExpandedCards(prev => {
          const next = new Set(prev);
          if (next.has(symbolId)) next.delete(symbolId);
          else next.add(symbolId);
          return next;
      });
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-black text-gray-200 font-sans relative flex flex-col">
      
      {/* Symbol Modal */}
      {showSymbolModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-0 md:p-4">
            <div className="bg-gray-900 border-none md:border border-gray-800 rounded-none md:rounded-xl w-full max-w-3xl h-full md:h-auto md:max-h-[80vh] flex flex-col shadow-2xl">
                <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-900 shrink-0">
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-blue-400" />
                        <h2 className="text-lg font-bold text-white">Manage Markets</h2>
                    </div>
                    <button onClick={() => setShowSymbolModal(false)} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pb-20 md:pb-4">
                    {AVAILABLE_SYMBOLS.map(sym => {
                        const isActive = activeSymbols.includes(sym.id);
                        return (
                            <button 
                                key={sym.id}
                                onClick={() => toggleSymbol(sym.id)}
                                className={`flex items-center justify-between p-4 md:p-3 rounded-lg border transition-all ${
                                    isActive 
                                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-100' 
                                    : 'bg-gray-800/50 border-gray-700 hover:bg-gray-800 text-gray-400'
                                }`}
                            >
                                <span className="font-mono text-sm">{sym.name}</span>
                                {isActive && <Check className="w-4 h-4 text-blue-400" />}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 lg:p-6 gap-4 border-b border-gray-900 bg-black sticky top-0 z-30">
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center border border-blue-500/30 shrink-0">
                <Target className="text-blue-400 w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white leading-none">NeuroTrade <span className="text-blue-500">Pro</span></h1>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-red-500'}`}></span>
                  <span className="font-mono">{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
                </div>
              </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            {/* Balance Card */}
            <div className="bg-gray-900/50 rounded-lg p-2 px-4 border border-gray-800 flex justify-between items-center sm:block">
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0 sm:mb-1 flex items-center gap-1">
                    <Wallet className="w-3 h-3"/> Balance
                </div>
                <div className="text-lg sm:text-xl font-mono font-bold text-white tracking-wider">
                    {currency} {balance.toFixed(2)}
                </div>
            </div>
            
            {/* Timeframe Selector */}
            {isConnected && (
                <div className="relative group">
                    <button className="flex items-center justify-between gap-2 bg-gray-900 border border-gray-700 px-3 py-2 rounded-lg text-sm w-full sm:w-auto min-w-[100px]">
                        <span className="flex items-center gap-2">
                             <Clock className="w-4 h-4 text-gray-400"/>
                             {TIMEFRAMES.find(t => t.value === timeframe)?.label}
                        </span>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    </button>
                    <div className="absolute top-full left-0 w-full mt-1 bg-gray-900 border border-gray-800 rounded-lg shadow-xl overflow-hidden hidden group-hover:block z-50">
                        {TIMEFRAMES.map(tf => (
                            <button
                                key={tf.value}
                                onClick={() => changeTimeframe(tf.value)}
                                className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-800 ${timeframe === tf.value ? 'text-blue-400 font-bold' : 'text-gray-400'}`}
                            >
                                {tf.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Token Input */}
            {!isConnected && (
                <div className="flex gap-2 w-full sm:w-auto">
                    <input 
                        type="password" 
                        placeholder="Deriv API Token" 
                        className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                        value={derivToken}
                        onChange={(e) => {
                            setDerivToken(e.target.value);
                            localStorage.setItem('deriv_token', e.target.value);
                        }}
                    />
                    <button 
                        onClick={connectDeriv}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap"
                    >
                        <Wifi className="w-4 h-4" /> Connect
                    </button>
                </div>
            )}

            {/* Controls */}
            {isConnected && (
                <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                    <button 
                        onClick={() => setShowSymbolModal(true)}
                        className="px-4 py-3 sm:py-2 rounded-lg text-xs sm:text-sm font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors flex items-center justify-center gap-2 border border-gray-700"
                    >
                        <Layers className="w-4 h-4" /> MARKETS
                    </button>
                    <button 
                        onClick={() => setIsTradingActive(!isTradingActive)}
                        className={`px-4 py-3 sm:py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all border ${
                            isTradingActive 
                            ? 'bg-red-500/10 border-red-500 text-red-400 hover:bg-red-500/20' 
                            : 'bg-green-500/10 border-green-500 text-green-400 hover:bg-green-500/20'
                        }`}
                    >
                        {isTradingActive ? <><Pause className="w-4 h-4 fill-current"/> STOP AI</> : <><Play className="w-4 h-4 fill-current"/> START AI</>}
                    </button>
                </div>
            )}
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-3 gap-6 p-4 lg:p-6 lg:h-[calc(100vh-140px)] lg:overflow-hidden pb-20 lg:pb-6">
          
          {/* Left Column: Market Watch */}
          <div className="lg:col-span-2 flex flex-col gap-4 lg:overflow-y-auto lg:pr-1 custom-scrollbar min-h-[300px]">
              {activeSymbols.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 bg-gray-900/30 border border-gray-800 border-dashed rounded-xl text-gray-500">
                      <Layers className="w-12 h-12 mb-4 opacity-20" />
                      <p>No markets selected.</p>
                      <button onClick={() => setShowSymbolModal(true)} className="mt-4 text-blue-400 hover:underline text-sm">Select Markets</button>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 md:pb-0">
                      {activeSymbols.map(symbolId => {
                          const data = marketData[symbolId];
                          const candles = data?.candles || [];
                          const latest = candles[candles.length - 1];
                          const isExpanded = expandedCards.has(symbolId);
                          
                          // SVG Chart Calc
                          const displayCandles = candles.length > 0 ? candles : [];
                          const maxP = Math.max(...displayCandles.map(c => c.high)) || 100;
                          const minP = Math.min(...displayCandles.map(c => c.low)) || 0;
                          const range = maxP - minP || 1;

                          return (
                              <div key={symbolId} className={`bg-gray-900 border rounded-xl relative overflow-hidden transition-all duration-300 ${isExpanded ? 'border-blue-500/30 shadow-lg shadow-blue-900/10 col-span-1 md:col-span-2' : 'border-gray-800 hover:border-gray-700'}`}>
                                  <div className="p-4">
                                      {/* Card Header */}
                                      <div className="flex justify-between items-start mb-2">
                                          <div>
                                              <h3 className="font-bold text-lg text-white tracking-tight">{data?.displayName || symbolId}</h3>
                                              <div className="text-xs text-gray-500 font-mono flex items-center gap-2">
                                                  {data?.status === 'waiting' ? (
                                                      <span className="animate-pulse text-yellow-500">Loading History...</span>
                                                  ) : (
                                                      <span>{candles.length} Candles ({timeframe/60}m)</span>
                                                  )}
                                                  {data?.isAnalyzing && <span className="text-blue-400 animate-pulse flex items-center gap-1"><BrainCircuit className="w-3 h-3"/> Analyzing...</span>}
                                              </div>
                                          </div>
                                          <div className="flex gap-2">
                                              {data?.lastDecision && (
                                                 <div className={`px-2 py-1 rounded text-[10px] font-bold border uppercase flex items-center gap-1 ${
                                                     data.lastDecision.action === 'CALL' ? 'bg-green-900/30 border-green-500/50 text-green-400' :
                                                     data.lastDecision.action === 'PUT' ? 'bg-red-900/30 border-red-500/50 text-red-400' :
                                                     'bg-gray-800 border-gray-700 text-gray-400'
                                                 }`}>
                                                     {data.lastDecision.action} 
                                                     {data.lastDecision.action !== 'HOLD' && <span>| {data.lastDecision.duration} candles</span>}
                                                     <span className="opacity-70">({data.lastDecision.confidence}%)</span>
                                                 </div>
                                              )}
                                              <button 
                                                  onClick={() => toggleSymbol(symbolId)}
                                                  className="p-1 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                                              >
                                                  <X className="w-4 h-4" />
                                              </button>
                                          </div>
                                      </div>

                                      {/* Price Display */}
                                      <div className="flex justify-between items-end mb-4">
                                          <div className="flex items-baseline gap-2">
                                              <span className="text-2xl font-mono font-bold text-white">
                                                  {data?.lastPrice?.toFixed(data.lastPrice < 10 ? 5 : 2) || '---'}
                                              </span>
                                              {latest && candles.length > 1 && (
                                                  <span className={`text-xs font-mono ${latest.close >= candles[candles.length-2].close ? 'text-green-500' : 'text-red-500'}`}>
                                                      {latest.close >= candles[candles.length-2].close ? '▲' : '▼'}
                                                  </span>
                                              )}
                                          </div>
                                          
                                          {/* Expand Button */}
                                          {data?.lastDecision?.technical_analysis && (
                                              <button 
                                                onClick={() => toggleCardExpansion(symbolId)}
                                                className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold bg-blue-900/20 px-2 py-1 rounded"
                                              >
                                                  {isExpanded ? 'Hide Analysis' : 'View Analysis'}
                                                  {isExpanded ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
                                              </button>
                                          )}
                                      </div>

                                      {/* Collapsible Analysis Section */}
                                      {isExpanded && data?.lastDecision && (
                                          <div className="mb-4 bg-black/40 rounded-lg p-3 border border-gray-800 animate-in slide-in-from-top-2 duration-200">
                                              <div className="text-xs text-gray-400 font-mono mb-1 flex items-center gap-2">
                                                  <Zap className="w-3 h-3 text-yellow-500" /> AI STRATEGY
                                              </div>
                                              <p className="text-sm text-gray-200 mb-2 font-medium">{data.lastDecision.reasoning}</p>
                                              
                                              <div className="border-t border-gray-800 pt-2 mt-2">
                                                  <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Technical Breakdown</div>
                                                  <p className="text-xs text-gray-400 leading-relaxed font-mono whitespace-pre-line">
                                                      {data.lastDecision.technical_analysis || "No detailed analysis available."}
                                                  </p>
                                              </div>
                                          </div>
                                      )}

                                      {/* Mini Chart (SVG) */}
                                      <div className="h-32 w-full bg-gray-950/50 rounded border border-gray-800 relative overflow-hidden">
                                          {displayCandles.length > 0 ? (
                                              <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 100 100`}>
                                                  {displayCandles.map((c, i) => {
                                                      const count = displayCandles.length;
                                                      const x = (i / count) * 100;
                                                      const w = (100 / count) * 0.7;
                                                      
                                                      const yHigh = 100 - ((c.high - minP) / range * 80 + 10);
                                                      const yLow = 100 - ((c.low - minP) / range * 80 + 10);
                                                      const yOpen = 100 - ((c.open - minP) / range * 80 + 10);
                                                      const yClose = 100 - ((c.close - minP) / range * 80 + 10);
                                                      
                                                      const isGreen = c.close >= c.open;
                                                      const color = isGreen ? '#22c55e' : '#ef4444';
                                                      
                                                      return (
                                                          <g key={c.epoch}>
                                                              <line 
                                                                x1={`${x + w/2}%`} y1={`${yHigh}%`} 
                                                                x2={`${x + w/2}%`} y2={`${yLow}%`} 
                                                                stroke={color} 
                                                                strokeWidth="0.5"
                                                                vectorEffect="non-scaling-stroke"
                                                              />
                                                              <rect 
                                                                x={`${x}%`} 
                                                                y={`${Math.min(yOpen, yClose)}%`} 
                                                                width={`${w}%`} 
                                                                height={`${Math.max(0.5, Math.abs(yClose - yOpen))}%`} 
                                                                fill={color} 
                                                              />
                                                          </g>
                                                      );
                                                  })}
                                              </svg>
                                          ) : (
                                              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-700 animate-pulse">
                                                  Waiting for feed...
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              )}
          </div>

          {/* Right Column: Data & Logs */}
          <div className="flex flex-col gap-6 lg:overflow-hidden h-auto">
              
              {/* Active Trades */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex-1 flex flex-col min-h-[250px] max-h-[400px] lg:max-h-[40%]">
                  <h3 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2">
                      <Activity className="w-4 h-4" /> ACTIVE TRADES
                  </h3>
                  <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar space-y-2">
                      {openTrades.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-2">
                              <span className="text-xs">NO OPEN TRADES</span>
                          </div>
                      ) : (
                          openTrades.map(trade => (
                              <div key={trade.contract_id} className="bg-gray-800/50 p-3 rounded border border-gray-700 flex justify-between items-center text-sm">
                                  <div>
                                      <div className="font-bold text-white">{trade.symbol}</div>
                                      <div className={`text-xs font-bold ${trade.contract_type === 'CALL' ? 'text-green-400' : 'text-red-400'}`}>
                                          {trade.contract_type} @ {isNaN(trade.entry_spot) ? '...' : trade.entry_spot}
                                      </div>
                                  </div>
                                  <div className={`font-mono font-bold ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {isNaN(trade.profit) ? '0.00' : (
                                          <>
                                            {trade.profit > 0 ? '+' : ''}{trade.profit.toFixed(2)}
                                          </>
                                      )}
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>

              {/* System Logs - NEWEST AT TOP */}
              <div className="bg-black border border-gray-800 rounded-xl p-4 flex-1 flex flex-col min-h-[300px] lg:h-auto overflow-hidden">
                  <h3 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2">
                      <Terminal className="w-4 h-4" /> SYSTEM LOGS (FEED)
                  </h3>
                  <div className="font-mono text-xs overflow-y-auto flex-1 custom-scrollbar space-y-1.5 p-1 max-h-[300px] lg:max-h-full">
                      {logs.map(log => (
                          <div key={log.id} className="flex gap-2 leading-tight border-b border-gray-900/50 pb-1 last:border-0">
                              <span className="text-gray-600 shrink-0 select-none">[{log.timestamp}]</span>
                              <span className={`${
                                  log.type === 'error' ? 'text-red-500' :
                                  log.type === 'success' ? 'text-green-500' :
                                  log.type === 'warning' ? 'text-yellow-500' :
                                  log.type === 'ai' ? 'text-blue-400' :
                                  log.type === 'debug' ? 'text-gray-600' :
                                  'text-gray-300'
                              } break-words`}>
                                  {log.type === 'ai' && '🤖 '}{log.message}
                              </span>
                          </div>
                      ))}
                  </div>
              </div>

          </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);