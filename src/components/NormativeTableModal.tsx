import React, { useState } from 'react';
import { X, Table, Check, Info, FileText } from 'lucide-react';

interface NormativeTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTable?: 'mu_z' | 'gamma_c' | 'terrain';
  currentZ?: number;
  currentTerrain?: 'A' | 'B' | 'C' | 'D';
  currentWindSpeed?: number;
  currentLineType?: 'general' | 'large_span';
}

export const NormativeTableModal: React.FC<NormativeTableModalProps> = ({
  isOpen,
  onClose,
  initialTable = 'mu_z',
  currentZ = 20,
  currentTerrain = 'B',
  currentWindSpeed = 25,
  currentLineType = 'general',
}) => {
  const [activeTab, setActiveTab] = useState<'mu_z' | 'gamma_c' | 'terrain'>(initialTable);

  if (!isOpen) return null;

  // 表 9.3.1-1 数据
  const heightList = [5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550];
  const muZData: Record<'A' | 'B' | 'C' | 'D', number[]> = {
    A: [1.09, 1.28, 1.42, 1.52, 1.67, 1.79, 1.89, 1.97, 2.05, 2.12, 2.18, 2.23, 2.46, 2.64, 2.78, 2.91, 2.91, 2.91, 2.91, 2.91, 2.91],
    B: [1.00, 1.00, 1.13, 1.23, 1.39, 1.52, 1.62, 1.71, 1.79, 1.87, 1.93, 2.00, 2.25, 2.46, 2.63, 2.77, 2.91, 2.91, 2.91, 2.91, 2.91],
    C: [0.65, 0.65, 0.65, 0.74, 0.88, 1.00, 1.10, 1.20, 1.28, 1.36, 1.43, 1.50, 1.79, 2.03, 2.24, 2.43, 2.60, 2.76, 2.91, 2.91, 2.91],
    D: [0.51, 0.51, 0.51, 0.51, 0.51, 0.60, 0.69, 0.77, 0.84, 0.91, 0.98, 1.04, 1.33, 1.58, 1.81, 2.02, 2.22, 2.40, 2.58, 2.74, 2.91],
  };

  // 表 9.3.1-2 计算测试数值
  const calcGammaC = (v0: number, line: 'general' | 'large_span', forTension: boolean) => {
    if (v0 < 20) {
      if (line === 'large_span') return 0.9;
      return forTension ? 0.9 : 0.85;
    }
    if (line === 'large_span') {
      return forTension
        ? -(1 / (5.42 + Math.exp(30.5 - v0))) + 0.88
        : -(1 / (6.22 + Math.exp(30.4 - v0))) + 0.77;
    }
    return forTension
      ? -(1 / (5.97 + Math.exp(33.2 - 1.2 * v0))) + 0.83
      : -(1 / (7.16 + Math.exp(32.5 - 1.2 * v0))) + 0.64;
  };

  const sampleSpeeds = [15, 20, 25, 30, 35, 40, 45, 50];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-900/90 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Table className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white tracking-wide">
              GB 50545 规范设计查表速查手册
            </h3>
            <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 px-2 py-0.5 rounded font-mono">
              110kV~750kV 架空输电线路设计规范
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-2 p-2 bg-slate-950/60 border-b border-white/10 px-4">
          <button
            onClick={() => setActiveTab('mu_z')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'mu_z'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span>表 9.3.1-1 风压高度变化系数 μ_z</span>
          </button>

          <button
            onClick={() => setActiveTab('gamma_c')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'gamma_c'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span>表 9.3.1-2 导地线风荷载折减系数 γ_c</span>
          </button>

          <button
            onClick={() => setActiveTab('terrain')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'terrain'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span>地貌粗糙度特征参数 (I₁₀ 与 α)</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: 表 9.3.1-1 */}
          {activeTab === 'mu_z' && (
            <div className="space-y-3">
              <div className="p-3 bg-cyan-950/40 rounded-xl border border-cyan-500/30 text-xs space-y-1">
                <div className="font-bold text-cyan-300 flex items-center justify-between">
                  <span>表 9.3.1-1 风压高度变化系数 μ_z (GB 50545-2010)</span>
                  <span className="text-[10px] text-slate-300 font-mono">
                    当前选定地貌: <strong className="text-cyan-300">{currentTerrain}类</strong> | 平均挂线高度 z = <strong className="text-cyan-300">{currentZ} m</strong>
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  注：当平均挂线高度 z 介于表中高度之间时，按双向线性内插法计算。高度低于5m按5m取值，高于350m/550m按最高界限取值。
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/80">
                <table className="w-full text-center text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-800/90 text-cyan-300 border-b border-white/10 font-bold">
                      <th className="p-2 border-r border-white/10">挂线高度 z (m)</th>
                      <th className={`p-2 border-r border-white/10 ${currentTerrain === 'A' ? 'bg-cyan-500/30 text-cyan-200 font-extrabold' : ''}`}>
                        A 类地貌 (海面/海岛)
                      </th>
                      <th className={`p-2 border-r border-white/10 ${currentTerrain === 'B' ? 'bg-cyan-500/30 text-cyan-200 font-extrabold' : ''}`}>
                        B 类地貌 (田野/乡村)
                      </th>
                      <th className={`p-2 border-r border-white/10 ${currentTerrain === 'C' ? 'bg-cyan-500/30 text-cyan-200 font-extrabold' : ''}`}>
                        C 类地貌 (城镇密集)
                      </th>
                      <th className={`p-2 ${currentTerrain === 'D' ? 'bg-cyan-500/30 text-cyan-200 font-extrabold' : ''}`}>
                        D 类地貌 (城市高楼)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {heightList.map((h, idx) => {
                      const isClosestHeight = Math.abs(currentZ - h) <= 2.5;
                      return (
                        <tr
                          key={h}
                          className={`hover:bg-white/5 transition-colors ${
                            isClosestHeight ? 'bg-cyan-500/15 font-bold text-cyan-200' : ''
                          }`}
                        >
                          <td className="p-1.5 border-r border-white/10 font-bold">
                            {h} {isClosestHeight ? '← (匹配区间)' : ''}
                          </td>
                          <td className={`p-1.5 border-r border-white/10 ${currentTerrain === 'A' && isClosestHeight ? 'bg-cyan-400/30 text-white font-black' : ''}`}>
                            {muZData.A[idx].toFixed(2)}
                          </td>
                          <td className={`p-1.5 border-r border-white/10 ${currentTerrain === 'B' && isClosestHeight ? 'bg-cyan-400/30 text-white font-black' : ''}`}>
                            {muZData.B[idx].toFixed(2)}
                          </td>
                          <td className={`p-1.5 border-r border-white/10 ${currentTerrain === 'C' && isClosestHeight ? 'bg-cyan-400/30 text-white font-black' : ''}`}>
                            {muZData.C[idx].toFixed(2)}
                          </td>
                          <td className={`p-1.5 ${currentTerrain === 'D' && isClosestHeight ? 'bg-cyan-400/30 text-white font-black' : ''}`}>
                            {muZData.D[idx].toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: 表 9.3.1-2 */}
          {activeTab === 'gamma_c' && (
            <div className="space-y-3">
              <div className="p-3 bg-cyan-950/40 rounded-xl border border-cyan-500/30 text-xs space-y-1.5">
                <div className="font-bold text-cyan-300 flex items-center justify-between">
                  <span>表 9.3.1-2 导地线风荷载折减系数 γ_c 规定与解析公式</span>
                  <span className="text-[10px] text-slate-300 font-mono">
                    当前风速 v₀ = <strong className="text-cyan-300">{currentWindSpeed} m/s</strong> | 线路: <strong className="text-cyan-300">{currentLineType === 'large_span' ? '大跨越' : '一般线路'}</strong>
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  按 GB 50545-2010 规范，当设计风速 v₀ ≥ 20m/s 时，折减系数 γ_c 采用连续曲线公式精准计算，克服了阶梯跳变缺陷。
                </p>
              </div>

              {/* 规范条文公式框 */}
              <div className="p-3 bg-black/40 rounded-xl border border-white/10 text-xs font-mono space-y-2">
                <div className="font-bold text-cyan-300 border-b border-white/10 pb-1">
                  1. 一般输电线路折减系数 γ_c 连续公式 (表 9.3.1-2 说明):
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-200">
                  <div className="p-2 bg-white/5 rounded border border-white/5">
                    <span className="text-cyan-300 font-bold block mb-0.5">计算风压 (用于导线风偏角计算):</span>
                    <div>v₀ &lt; 20 m/s: <strong className="text-white">γ_c = 0.85</strong></div>
                    <div>v₀ ≥ 20 m/s: <strong className="text-cyan-300">γ_c = -1 / [7.16 + e^(32.5 - 1.2·v₀)] + 0.64</strong></div>
                  </div>

                  <div className="p-2 bg-white/5 rounded border border-white/5">
                    <span className="text-cyan-300 font-bold block mb-0.5">计算张力 (用于气象工况张力比载):</span>
                    <div>v₀ &lt; 20 m/s: <strong className="text-white">γ_c = 0.90</strong></div>
                    <div>v₀ ≥ 20 m/s: <strong className="text-cyan-300">γ_c = -1 / [5.97 + e^(33.2 - 1.2·v₀)] + 0.83</strong></div>
                  </div>
                </div>

                <div className="font-bold text-cyan-300 border-b border-white/10 pb-1 pt-1">
                  2. 大跨越工程折减系数 γ_c 连续公式:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-200">
                  <div className="p-2 bg-white/5 rounded border border-white/5">
                    <span className="text-cyan-300 font-bold block mb-0.5">计算风压 (大跨越风偏):</span>
                    <div>v₀ &lt; 20 m/s: <strong className="text-white">γ_c = 0.90</strong></div>
                    <div>v₀ ≥ 20 m/s: <strong className="text-cyan-300">γ_c = -1 / [6.22 + e^(30.4 - v₀)] + 0.77</strong></div>
                  </div>

                  <div className="p-2 bg-white/5 rounded border border-white/5">
                    <span className="text-cyan-300 font-bold block mb-0.5">计算张力 (大跨越张力):</span>
                    <div>v₀ &lt; 20 m/s: <strong className="text-white">γ_c = 0.90</strong></div>
                    <div>v₀ ≥ 20 m/s: <strong className="text-cyan-300">γ_c = -1 / [5.42 + e^(30.5 - v₀)] + 0.88</strong></div>
                  </div>
                </div>

                <div className="font-bold text-cyan-300 border-b border-white/10 pb-1 pt-1">
                  3. 绝缘子串跳线 (Jumper) 折减系数:
                </div>
                <div className="text-[11px] text-slate-200">
                  特高压线路取 <strong className="text-amber-300">γ_c = 0.80</strong>；1000kV以下普通线路取 <strong className="text-amber-300">γ_c = 0.65</strong>。
                </div>
              </div>

              {/* 典型风速梯度折减系数速查表 */}
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/80">
                <table className="w-full text-center text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-800/90 text-cyan-300 border-b border-white/10 font-bold">
                      <th className="p-2 border-r border-white/10">基准风速 v₀ (m/s)</th>
                      <th className="p-2 border-r border-white/10">一般线路 (风偏计算 γ_c)</th>
                      <th className="p-2 border-r border-white/10">一般线路 (张力计算 γ_c)</th>
                      <th className="p-2 border-r border-white/10">大跨越 (风偏计算 γ_c)</th>
                      <th className="p-2">大跨越 (张力计算 γ_c)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {sampleSpeeds.map((v) => {
                      const isMatchingSpeed = Math.abs(currentWindSpeed - v) <= 2.5;
                      const g_gen_wind = calcGammaC(v, 'general', false);
                      const g_gen_tens = calcGammaC(v, 'general', true);
                      const g_ls_wind = calcGammaC(v, 'large_span', false);
                      const g_ls_tens = calcGammaC(v, 'large_span', true);

                      return (
                        <tr
                          key={v}
                          className={`hover:bg-white/5 transition-colors ${
                            isMatchingSpeed ? 'bg-cyan-500/20 font-bold text-cyan-200' : ''
                          }`}
                        >
                          <td className="p-2 border-r border-white/10 font-bold">
                            {v} m/s {isMatchingSpeed ? '← (当前气象)' : ''}
                          </td>
                          <td className="p-2 border-r border-white/10">{g_gen_wind.toFixed(3)}</td>
                          <td className="p-2 border-r border-white/10">{g_gen_tens.toFixed(3)}</td>
                          <td className="p-2 border-r border-white/10">{g_ls_wind.toFixed(3)}</td>
                          <td className="p-2">{g_ls_tens.toFixed(3)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: 地貌粗糙度 */}
          {activeTab === 'terrain' && (
            <div className="space-y-3">
              <div className="p-3 bg-cyan-950/40 rounded-xl border border-cyan-500/30 text-xs space-y-1">
                <div className="font-bold text-cyan-300">
                  地貌粗糙度类别与 10m 高度名义湍流强度 I₁₀、粗糙度指数 α 对照表
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  GB 50545 依据地面粗糙程度将地形分为 A、B、C、D 四类，用于确定脉动风湍流强度 I_z = I₁₀·(z/10)⁻ᵃ。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    currentTerrain === 'A'
                      ? 'bg-cyan-500/20 border-cyan-400 text-white ring-2 ring-cyan-400/50'
                      : 'bg-slate-950/80 border-white/10 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-cyan-300 mb-1">
                    <span>A 类地貌 (近海/海岛/沙漠)</span>
                    {currentTerrain === 'A' && <Check className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <div className="text-[11px] space-y-1">
                    <div>• 10m高度湍流强度 I₁₀ = <strong className="text-white">0.12</strong></div>
                    <div>• 粗糙度指数 α = <strong className="text-white">0.12</strong></div>
                    <div className="text-slate-400 text-[10px] mt-1">典型环境: 近海海面、海岛、海岸、湖岸及沙漠地带。</div>
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    currentTerrain === 'B'
                      ? 'bg-cyan-500/20 border-cyan-400 text-white ring-2 ring-cyan-400/50'
                      : 'bg-slate-950/80 border-white/10 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-cyan-300 mb-1">
                    <span>B 类地貌 (田野/乡村/标准)</span>
                    {currentTerrain === 'B' && <Check className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <div className="text-[11px] space-y-1">
                    <div>• 10m高度湍流强度 I₁₀ = <strong className="text-white">0.14</strong></div>
                    <div>• 粗糙度指数 α = <strong className="text-white">0.15</strong></div>
                    <div className="text-slate-400 text-[10px] mt-1">典型环境: 田野、乡村、丛林、丘陵及房屋稀疏的乡镇，通用设计基准。</div>
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    currentTerrain === 'C'
                      ? 'bg-cyan-500/20 border-cyan-400 text-white ring-2 ring-cyan-400/50'
                      : 'bg-slate-950/80 border-white/10 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-cyan-300 mb-1">
                    <span>C 类地貌 (城镇/密集建筑)</span>
                    {currentTerrain === 'C' && <Check className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <div className="text-[11px] space-y-1">
                    <div>• 10m高度湍流强度 I₁₀ = <strong className="text-white">0.23</strong></div>
                    <div>• 粗糙度指数 α = <strong className="text-white">0.22</strong></div>
                    <div className="text-slate-400 text-[10px] mt-1">典型环境: 有密集建筑群的城镇、市区。</div>
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    currentTerrain === 'D'
                      ? 'bg-cyan-500/20 border-cyan-400 text-white ring-2 ring-cyan-400/50'
                      : 'bg-slate-950/80 border-white/10 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-cyan-300 mb-1">
                    <span>D 类地貌 (城市高楼密集区)</span>
                    {currentTerrain === 'D' && <Check className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <div className="text-[11px] space-y-1">
                    <div>• 10m高度湍流强度 I₁₀ = <strong className="text-white">0.39</strong></div>
                    <div>• 粗糙度指数 α = <strong className="text-white">0.30</strong></div>
                    <div className="text-slate-400 text-[10px] mt-1">典型环境: 有密集建筑群且房屋较高的城市市区。</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-white/10 bg-slate-900/90 backdrop-blur-md flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>规范依据: 《110kV~750kV架空输电线路设计规范》(GB 50545-2010) 9.3节</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 font-bold rounded-lg transition-all"
          >
            关闭速查表
          </button>
        </div>
      </div>
    </div>
  );
};
