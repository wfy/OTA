import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Loader2, X, Mic, MicOff, Volume2, VolumeX, Radio } from 'lucide-react';

interface AiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  contextData: any;
}

export const AiAssistant: React.FC<AiAssistantProps> = ({
  isOpen,
  onClose,
  contextData,
}) => {
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([
    {
      sender: 'ai',
      text: '您好！我是输电线路电气设计 AI 专家助手。我已经读取了您当前的工程计算参数（包括导线型号、气象区、状态方程求解应力与弧垂、绝缘子风偏校验等）。您可以向我发送文字或点击语音麦克风直接提问！',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [isVoiceOutputEnabled, setIsVoiceOutputEnabled] = useState(true);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'zh-CN';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setInput(transcript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // ignore
        }
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakText = (text: string, index?: number) => {
    if (!('speechSynthesis' in window)) return;

    if (speakingIdx === index && index !== undefined) {
      window.speechSynthesis.cancel();
      setSpeakingIdx(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[\*\#\`\_]/g, ''); // strip markdown chars
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.05;

    utterance.onend = () => setSpeakingIdx(null);
    utterance.onerror = () => setSpeakingIdx(null);

    if (index !== undefined) setSpeakingIdx(index);
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current) {
      alert('您的浏览器暂未开启 SpeechRecognition 语音识别接口，请使用 Chrome 或 Edge 浏览器体验语音提问。');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        window.speechSynthesis?.cancel();
        setSpeakingIdx(null);
        recognitionRef.current.start();
      } catch (e) {
        console.error('Speech recognition error:', e);
      }
    }
  };

  const presetQuestions = [
    '分析当前导线安全系数与防振张力是否符合 DL/T 5582 要求？',
    '若塔头风偏角过大导致放电间隙不足，有哪些优化措施？',
    '如何根据最高气温和允许发热温度确定架线定位弧垂？',
  ];

  const handleSend = async (questionText?: string) => {
    const textToSend = questionText || input;
    if (!textToSend.trim() || isLoading) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }

    setMessages((prev) => [...prev, { sender: 'user', text: textToSend }]);
    if (!questionText) setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          context: contextData,
        }),
      });

      const data = await response.json();
      if (data.error) {
        const errText = `咨询失败: ${data.error}`;
        setMessages((prev) => [...prev, { sender: 'ai', text: errText }]);
      } else {
        const aiText = data.text;
        setMessages((prev) => {
          const updated = [...prev, { sender: 'ai' as const, text: aiText }];
          if (isVoiceOutputEnabled) {
            setTimeout(() => speakText(aiText, updated.length - 1), 100);
          }
          return updated;
        });
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { sender: 'ai', text: '请求服务失败，请检查网络连接或API配置。' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] glass-panel border-l border-white/15 shadow-2xl z-50 flex flex-col text-slate-100 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-white/10 bg-white/10 text-slate-100">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <span>AI 规范语音助手</span>
              <span className="px-1.5 py-0.5 rounded text-[8px] bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                支持语音交互
              </span>
            </h3>
            <p className="text-[9px] text-slate-300">依据 DL/T 5582-2020 实时工程校验</p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          {/* Voice Output Toggle */}
          <button
            onClick={() => {
              const nextState = !isVoiceOutputEnabled;
              setIsVoiceOutputEnabled(nextState);
              if (!nextState) window.speechSynthesis?.cancel();
            }}
            title={isVoiceOutputEnabled ? '已开启语音朗读助手回复 (点击关闭)' : '语音朗读助手回复已关闭 (点击开启)'}
            className={`p-1.5 rounded-lg border transition-all ${
              isVoiceOutputEnabled
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            {isVoiceOutputEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`group relative max-w-[88%] p-2.5 rounded-xl leading-relaxed whitespace-pre-wrap ${
                m.sender === 'user'
                  ? 'bg-cyan-600 text-white font-semibold shadow-md border border-cyan-400/50'
                  : 'glass-card text-slate-100 border border-white/10'
              }`}
            >
              {m.text}

              {/* Read Aloud Button for AI Messages */}
              {m.sender === 'ai' && (
                <button
                  onClick={() => speakText(m.text, idx)}
                  title={speakingIdx === idx ? '停止朗读' : '朗读此段回复'}
                  className={`mt-1.5 flex items-center space-x-1 text-[9px] px-2 py-0.5 rounded-md transition-colors ${
                    speakingIdx === idx
                      ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 animate-pulse'
                      : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <Volume2 className="w-3 h-3" />
                  <span>{speakingIdx === idx ? '正在朗读...' : '语音朗读'}</span>
                </button>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="glass-card p-2.5 rounded-xl flex items-center space-x-2 text-cyan-300 text-xs font-bold">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>智能分析工程数据中...</span>
            </div>
          </div>
        )}
      </div>

      {/* Listening Status Wave Banner */}
      {isListening && (
        <div className="px-3 py-2 bg-gradient-to-r from-cyan-900/80 via-blue-900/80 to-cyan-900/80 border-t border-b border-cyan-400/40 flex items-center justify-between text-cyan-200 text-xs animate-pulse">
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 text-cyan-300 animate-spin" />
            <span className="font-bold">正在聆听您的语音提问...</span>
          </div>
          <span className="text-[10px] text-cyan-300/80 font-mono">请说话</span>
        </div>
      )}

      {/* Quick Preset Buttons */}
      <div className="p-2.5 bg-white/5 border-t border-b border-white/10 space-y-1.5">
        <span className="text-[10px] font-bold uppercase block text-cyan-300 tracking-wider">快捷推荐提问:</span>
        <div className="flex flex-col space-y-1">
          {presetQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q)}
              className="text-left text-[10px] p-2 glass-button text-slate-200 font-medium rounded-lg truncate transition-all cursor-pointer"
            >
              &gt; {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <div className="p-3 bg-white/10 flex items-center space-x-2 border-t border-white/10">
        {/* Voice Input Button */}
        <button
          onClick={toggleListening}
          title={isListening ? '停止语音录制' : '开启语音提问'}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            isListening
              ? 'bg-rose-500 text-white border-rose-400 animate-bounce shadow-lg shadow-rose-500/50'
              : 'bg-white/10 text-slate-200 hover:text-white border-white/15 hover:bg-white/20'
          }`}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-cyan-300" />}
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={isListening ? '请说话，语音将实时转写为文本...' : '输入或点击麦克风语音提问...'}
          className="flex-1 glass-input rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-mono"
        />

        <button
          onClick={() => handleSend()}
          disabled={isLoading || !input.trim()}
          className="p-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer shadow-md"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

