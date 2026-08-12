import React from 'react';
import {
  Activity,
  ShieldCheck,
  Zap,
  BookOpen,
  Bot,
  FileSpreadsheet,
  Sliders,
  Table,
  ChevronUp,
  Sparkles,
  Pin,
  Eye,
  Box,
  Compass,
  Maximize2,
  Layers,
} from 'lucide-react';
import { ConditionCalcResult } from '../types';

interface HeaderProps {
  voltageLevel: number;
  onVoltageChange: (voltage: number) => void;
  activeTab: 'profile' | 'charts' | 'stringing' | 'compliance' | 'windswing';
  setActiveTab: (tab: 'profile' | 'charts' | 'stringing' | 'compliance' | 'windswing') => void;
  toggleAiAssistant: () => void;
  isAiOpen: boolean;
  showSidebar: boolean;
  setShowSidebar: (show: boolean | ((prev: boolean) => boolean)) => void;
  showTable: boolean;
  setShowTable: (show: boolean | ((prev: boolean) => boolean)) => void;
  showHeader: boolean;
  setShowHeader: (show: boolean | ((prev: boolean) => boolean)) => void;
  uiMode?: 'pinned' | 'auto-hide';
  setUiMode?: React.Dispatch<React.SetStateAction<'pinned' | 'auto-hide'>>;

  // Profile CAD Simulation Tools
  results?: ConditionCalcResult[];
  selectedConditionId?: string;
  onConditionChange?: (id: string) => void;
  viewDimension?: '3d' | '2d';
  onViewDimensionChange?: (dim: '3d' | '2d') => void;
  onOpen2DModal?: () => void;
  onOpenFormulaModal?: (tab?: 'conductor' | 'insulator') => void;
  onOpenPointCloudModal?: () => void;
  onTriggerIceJump?: () => void;
  isIceJumping?: boolean;
  showAllOverlay?: boolean;
  setShowAllOverlay?: (show: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  voltageLevel,
  onVoltageChange,
  activeTab,
  setActiveTab,
  toggleAiAssistant,
  isAiOpen,
  showSidebar,
  setShowSidebar,
  showTable,
  setShowTable,
  showHeader,
  setShowHeader,
  uiMode = 'pinned',
  setUiMode,
  results,
  selectedConditionId,
  onConditionChange,
  viewDimension = '3d',
  onViewDimensionChange,
  onOpen2DModal,
  onOpenFormulaModal,
  onOpenPointCloudModal,
  onTriggerIceJump,
  isIceJumping = false,
  showAllOverlay = true,
  setShowAllOverlay,
}) => {
  const voltageLevels = [110, 220, 330, 500, 750, 1000];

  return (
    <header className="glass-panel text-slate-100 rounded-2xl shadow-2xl p-2.5 font-sans transition-all duration-300">
      <div className="max-w-7xl mx-auto flex flex-col gap-2">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
          {/* Brand & Badge */}
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl shadow-lg flex items-center justify-center bg-gradient-to-tr from-cyan-600 to-blue-500 text-white shadow-cyan-500/20 ring-1 ring-cyan-400/30">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-extrabold text-sm sm:text-base tracking-tight flex items-center gap-1.5 text-slate-100">
                  P-LINE CAD <span className="text-cyan-400 font-mono text-xs">v4.5 PRO</span>
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-cyan-500/15 text-cyan-300 border-cyan-500/30">
                  <Sparkles className="w-2.5 h-2.5" />
                  DL/T 5582-2020
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono hidden md:block">
                输电线路三维张力-风偏-弧垂工程仿真系统
              </p>
            </div>
          </div>

          {/* Quick Voltage Switcher */}
          <div className="hidden lg:flex items-center gap-1 p-1 rounded-xl glass-button text-xs">
            <span className="text-slate-400 text-[10px] px-2 font-semibold uppercase font-mono">等级:</span>
            {voltageLevels.map((v) => (
              <button
                key={v}
                id={`btn-voltage-${v}`}
                onClick={() => onVoltageChange(v)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold font-mono transition-all cursor-pointer ${
                  voltageLevel === v
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20 ring-1 ring-cyan-400/40 font-bold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/10'
                }`}
              >
                {v}kV
              </button>
            ))}
          </div>

          {/* Overlay Windows Toggle Controls */}
          <div className="flex items-center space-x-1.5 text-xs font-medium">
            {/* Display Mode Toggle (Pinned vs Auto-Hide Edge Detection) */}
            {setUiMode && (
              <button
                onClick={() => setUiMode((prev) => (prev === 'pinned' ? 'auto-hide' : 'pinned'))}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-semibold glass-button cursor-pointer ${
                  uiMode === 'auto-hide'
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-md'
                    : 'text-cyan-300 hover:bg-white/10'
                }`}
                title={uiMode === 'pinned' ? '当前模式: 固定常显示 (点击切换为边缘自动检测)' : '当前模式: 边缘自动检测 (点击切换为固定常显示)'}
              >
                {uiMode === 'pinned' ? (
                  <>
                    <Pin className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="hidden sm:inline">固定</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    <span className="hidden sm:inline">自动隐藏</span>
                  </>
                )}
              </button>
            )}

            {/* Sidebar Toggle */}
            <button
              onClick={() => setShowSidebar((prev) => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-medium glass-button cursor-pointer ${
                showSidebar
                  ? 'bg-cyan-500/25 text-cyan-300 border-cyan-500/50 shadow-md shadow-cyan-500/10'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              title="显示/隐藏参数侧边栏"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">{showSidebar ? '侧栏:开启' : '侧栏:隐藏'}</span>
            </button>

            {/* AI Assistant Toggle */}
            <button
              id="btn-toggle-ai"
              onClick={toggleAiAssistant}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-medium glass-button cursor-pointer ${
                isAiOpen
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-400/50 shadow-md shadow-indigo-500/20'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">AI规范助手</span>
            </button>

            {/* Formula Modal Trigger */}
            {onOpenFormulaModal && (
              <button
                id="btn-toggle-formula"
                onClick={() => onOpenFormulaModal('conductor')}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-medium glass-button text-cyan-300 hover:bg-white/10 hover:text-white cursor-pointer shadow-sm"
                title="查看导线与绝缘子工况计算公式与推导流程"
              >
                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">工况公式</span>
              </button>
            )}

            {/* Minimize Header */}
            <button
              onClick={() => setShowHeader(false)}
              className="p-1.5 rounded-xl glass-button text-slate-400 hover:text-white transition-all cursor-pointer"
              title="折叠 CAD 工具栏"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center space-x-1 p-1 rounded-xl glass-card overflow-x-auto scrollbar-none text-xs font-medium">
          <button
            id="tab-profile"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-md font-semibold'
                : 'text-slate-300 hover:text-slate-100 hover:bg-white/10 border border-transparent'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>档距三维剖面</span>
          </button>

          <button
            id="tab-charts"
            onClick={() => setActiveTab('charts')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'charts'
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-md font-semibold'
                : 'text-slate-300 hover:text-slate-100 hover:bg-white/10 border border-transparent'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span>状态特性曲线</span>
          </button>

          <button
            id="tab-windswing"
            onClick={() => setActiveTab('windswing')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'windswing'
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-md font-semibold'
                : 'text-slate-300 hover:text-slate-100 hover:bg-white/10 border border-transparent'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-sky-400" />
            <span>绝缘子风偏模拟</span>
          </button>

          <button
            id="tab-stringing"
            onClick={() => setActiveTab('stringing')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'stringing'
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-md font-semibold'
                : 'text-slate-300 hover:text-slate-100 hover:bg-white/10 border border-transparent'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>施工安装放线表</span>
          </button>

          <button
            id="tab-compliance"
            onClick={() => setActiveTab('compliance')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'compliance'
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-md font-semibold'
                : 'text-slate-300 hover:text-slate-100 hover:bg-white/10 border border-transparent'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            <span>规范强条核查</span>
          </button>
        </div>

        {/* Integrated CAD Simulation Toolbar (从底层UI搬入到顶层CAD工具栏的功能) */}
        {activeTab === 'profile' && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 px-3 rounded-xl glass-panel-dark text-xs font-mono shadow-lg">
            {/* Left Group: 工况选择器 */}
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-cyan-400" /> 模拟工况:
              </span>
              {results && results.length > 0 && onConditionChange ? (
                <select
                  id="header-select-condition"
                  value={selectedConditionId}
                  onChange={(e) => onConditionChange(e.target.value)}
                  className="glass-input rounded-lg px-2.5 py-1 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-400 cursor-pointer shadow-inner"
                >
                  {results.map((r) => (
                    <option key={r.conditionId} value={r.conditionId} className="bg-slate-950 text-slate-100">
                      {r.conditionName} ({r.temp}°C, {r.windSpeed}m/s, {r.iceThickness}mm) {r.isGoverningCondition ? '★控制' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-cyan-300 font-bold">即时求解工况</span>
              )}
            </div>

            {/* Right Group: 2D放大, 脱冰跳跃, 包络 */}
            <div className="flex items-center space-x-2">

              {onOpen2DModal && (
                <button
                  onClick={onOpen2DModal}
                  className="flex items-center space-x-1 px-2.5 py-1 glass-button rounded-xl font-bold text-[11px] uppercase transition-all cursor-pointer shadow-sm text-slate-200 hover:text-white"
                  title="2D平剖面独立放大弹窗"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">2D放大</span>
                </button>
              )}

              {onTriggerIceJump && (
                <button
                  id="btn-header-ice-jump"
                  onClick={onTriggerIceJump}
                  disabled={isIceJumping}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-gradient-to-r from-sky-500 to-cyan-600 hover:opacity-90 text-white rounded-xl font-bold text-[11px] uppercase transition-all cursor-pointer shadow-sm shadow-sky-500/20"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isIceJumping ? 'animate-spin' : ''}`} />
                  <span>{isIceJumping ? '跳跃中...' : '脱冰跳跃'}</span>
                </button>
              )}

              {setShowAllOverlay && (
                <button
                  onClick={() => setShowAllOverlay(!showAllOverlay)}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl font-bold text-[11px] uppercase transition-all cursor-pointer border ${
                    showAllOverlay
                      ? 'bg-purple-500/25 text-purple-300 border-purple-400/50'
                      : 'glass-button text-slate-400 hover:bg-white/10'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>工况包络</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
