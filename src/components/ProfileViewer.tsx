import React, { useState, useRef } from 'react';
import {
  ConditionCalcResult,
  TowerParameters,
  CrossingObstacle,
  Conductor,
  Insulator,
  InsulatorCalcResult,
} from '../types';
import { generateCatenaryCurve } from '../utils/conductorPhysics';
import { ThreeSpanCanvas } from './ThreeSpanCanvas';
import { Sparkles, Box, Compass, Maximize2, X, Layers, Activity } from 'lucide-react';

interface ProfileViewerProps {
  tower: TowerParameters;
  results: ConditionCalcResult[];
  obstacles: CrossingObstacle[];
  conductor?: Conductor;
  insulator?: Insulator;
  insulatorRes?: InsulatorCalcResult;
  rightInsulator?: Insulator;
  rightInsulatorRes?: InsulatorCalcResult;

  // Controlled Profile Simulation States
  selectedConditionId?: string;
  setSelectedConditionId?: (id: string) => void;
  viewDimension?: '3d' | '2d';
  setViewDimension?: (dim: '3d' | '2d') => void;
  is2dModalOpen?: boolean;
  setIs2dModalOpen?: (open: boolean) => void;
  isIceJumping?: boolean;
  triggerIceJump?: () => void;
  showAllOverlay?: boolean;
  setShowAllOverlay?: (show: boolean) => void;
}

export const ProfileViewer: React.FC<ProfileViewerProps> = ({
  tower,
  results,
  obstacles,
  conductor,
  insulator,
  insulatorRes,
  rightInsulator,
  rightInsulatorRes,
  selectedConditionId: propSelectedConditionId,
  setSelectedConditionId: propSetSelectedConditionId,
  viewDimension: propViewDimension,
  setViewDimension: propSetViewDimension,
  is2dModalOpen: propIs2dModalOpen,
  setIs2dModalOpen: propSetIs2dModalOpen,
  isIceJumping: propIsIceJumping,
  triggerIceJump: propTriggerIceJump,
  showAllOverlay: propShowAllOverlay,
  setShowAllOverlay: propSetShowAllOverlay,
}) => {
  const [internalSelectedConditionId, setInternalSelectedConditionId] = useState<string>(
    results.find((r) => r.conditionId === 'max-wind')?.conditionId ||
    results.find((r) => r.isGoverningCondition)?.conditionId ||
    results[0]?.conditionId ||
    ''
  );
  const [internalShowAllOverlay, setInternalShowAllOverlay] = useState<boolean>(true);
  const [internalIsIceJumping, setInternalIsIceJumping] = useState<boolean>(false);
  const [internalViewDimension, setInternalViewDimension] = useState<'3d' | '2d'>('3d');
  const [internalIs2dModalOpen, setInternalIs2dModalOpen] = useState<boolean>(false);

  const selectedConditionId = propSelectedConditionId ?? internalSelectedConditionId;
  const setSelectedConditionId = propSetSelectedConditionId ?? setInternalSelectedConditionId;

  const viewDimension = propViewDimension ?? internalViewDimension;
  const setViewDimension = propSetViewDimension ?? setInternalViewDimension;

  const is2dModalOpen = propIs2dModalOpen ?? internalIs2dModalOpen;
  const setIs2dModalOpen = propSetIs2dModalOpen ?? setInternalIs2dModalOpen;

  const isIceJumping = propIsIceJumping ?? internalIsIceJumping;

  const showAllOverlay = propShowAllOverlay ?? internalShowAllOverlay;
  const setShowAllOverlay = propSetShowAllOverlay ?? setInternalShowAllOverlay;

  // Ice-shedding jump trigger animation
  const triggerIceJump = () => {
    if (propTriggerIceJump) {
      propTriggerIceJump();
      return;
    }
    setInternalIsIceJumping(true);
    setTimeout(() => {
      setInternalIsIceJumping(false);
    }, 1800);
  };

  // Mouse hover measurement state
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const activeResult =
    results.find((r) => r.conditionId === selectedConditionId) || results[0];

  const L = (tower.horizontalSpan && tower.horizontalSpan > 0) ? tower.horizontalSpan : tower.spanLength;
  const L_r = tower.spanLength;
  const h = tower.heightDifference;
  const hLeft = tower.leftAttachmentHeight;
  const hRight = tower.rightAttachmentHeight;

  // SVG coordinate transformation math
  const svgWidth = 800;
  const svgHeight = 420;
  const margin = { top: 40, right: 60, bottom: 50, left: 60 };

  const plotWidth = svgWidth - margin.left - margin.right;
  const plotHeight = svgHeight - margin.top - margin.bottom;

  // Y-axis scaling bounds
  const maxSagValue = Math.max(...results.map((r) => r.sag));
  const minY = -maxSagValue * 1.3;
  const maxY = Math.max(hLeft, hRight + h) * 1.25;

  const xScale = (x: number) => margin.left + (x / L) * plotWidth;
  const yScale = (y: number) =>
    margin.top + plotHeight - ((y - minY) / (maxY - minY)) * plotHeight;

  // Generate curve points for current condition
  const catenaryPoints = activeResult
    ? generateCatenaryCurve(L, hLeft - hRight > 0 ? -Math.abs(h) : Math.abs(h), activeResult.sag, 100)
    : [];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Convert SVG mouseX to real-world span distance x (0 to L)
    const normalizedX = (mouseX - margin.left) / plotWidth;
    if (normalizedX >= 0 && normalizedX <= 1) {
      const realX = normalizedX * L;
      setHoverPos({ x: realX, y: mouseX });
    } else {
      setHoverPos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
  };

  // Render 2D SVG Component
  const render2DSVG = (isInteractive: boolean = true) => (
    <svg
      ref={isInteractive ? svgRef : null}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="w-full h-auto cursor-crosshair select-none"
      onMouseMove={isInteractive ? handleMouseMove : undefined}
      onMouseLeave={isInteractive ? handleMouseLeave : undefined}
    >
      {/* Grid lines */}
      <defs>
        <pattern id="profileGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#CBD5E1" strokeWidth="1" />
        </pattern>
      </defs>
      <rect
        x={margin.left}
        y={margin.top}
        width={plotWidth}
        height={plotHeight}
        fill="#F8FAFC"
      />
      <rect
        x={margin.left}
        y={margin.top}
        width={plotWidth}
        height={plotHeight}
        fill="url(#profileGrid)"
      />

      {/* Ground Baseline */}
      <line
        x1={margin.left}
        y1={yScale(0)}
        x2={margin.left + plotWidth}
        y2={yScale(0)}
        stroke="#0F172A"
        strokeWidth="2"
        strokeDasharray="4 4"
      />
      <text
        x={margin.left + 8}
        y={yScale(0) - 6}
        fill="#334155"
        fontSize="10"
        fontFamily="monospace"
        fontWeight="bold"
      >
        地面基准线 y=0.0m
      </text>

      {/* Left Tower Structure */}
      <g transform={`translate(${xScale(0)}, ${yScale(0)})`}>
        <polygon
          points={`-10,0 10,0 2,${- (plotHeight * hLeft) / (maxY - minY)} -2,${- (plotHeight * hLeft) / (maxY - minY)}`}
          fill="#E2E8F0"
          stroke="#0F172A"
          strokeWidth="2"
        />
        <line
          x1="-20"
          y1={- (plotHeight * hLeft) / (maxY - minY)}
          x2="20"
          y2={- (plotHeight * hLeft) / (maxY - minY)}
          stroke="#0F172A"
          strokeWidth="3"
        />
        <text
          x="-24"
          y={- (plotHeight * hLeft) / (maxY - minY) - 8}
          fill="#0F172A"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="bold"
        >
          左塔 ({hLeft}m)
        </text>
      </g>

      {/* Right Tower Structure */}
      <g transform={`translate(${xScale(L)}, ${yScale(0)})`}>
        <polygon
          points={`-10,0 10,0 2,${- (plotHeight * (hLeft + h)) / (maxY - minY)} -2,${- (plotHeight * (hLeft + h)) / (maxY - minY)}`}
          fill="#E2E8F0"
          stroke="#0F172A"
          strokeWidth="2"
        />
        <line
          x1="-20"
          y1={- (plotHeight * (hLeft + h)) / (maxY - minY)}
          x2="20"
          y2={- (plotHeight * (hLeft + h)) / (maxY - minY)}
          stroke="#0F172A"
          strokeWidth="3"
        />
        <text
          x="-24"
          y={- (plotHeight * (hLeft + h)) / (maxY - minY) - 8}
          fill="#0F172A"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="bold"
        >
          右塔 ({hLeft + h}m)
        </text>
      </g>

      {/* Left Tower Insulator Graphic */}
      {(() => {
        const xA = xScale(0);
        const yA = yScale(hLeft);
        const stringLenA = insulatorRes?.stringLength || 2.5;
        const typeA = insulator?.stringType || 'single_I';

        if (typeA === 'tension') {
          // 耐张绝缘子串: 沿导线方向水平拉紧向右
          const endX = xScale(stringLenA);
          return (
            <g>
              <line x1={xA} y1={yA} x2={endX} y2={yA} stroke="#78716c" strokeWidth="4" />
              <line x1={xA} y1={yA} x2={endX} y2={yA} stroke="#141414" strokeWidth="1.5" strokeDasharray="3 3" />
              <circle cx={endX} cy={yA} r="3" fill="#047857" />
              <text x={xA + 4} y={yA - 6} fill="#047857" fontSize="9" fontFamily="monospace" fontWeight="bold">
                耐张串 ({stringLenA.toFixed(2)}m)
              </text>
            </g>
          );
        } else if (typeA === 'V_string') {
          const halfV = (((insulator?.vAngle || 90) / 2) * Math.PI) / 180;
          const vDrop = stringLenA * Math.cos(halfV);
          const endY = yScale(hLeft - vDrop);
          return (
            <g>
              <line x1={xA - 12} y1={yA} x2={xA} y2={endY} stroke="#78716c" strokeWidth="2.5" />
              <line x1={xA + 12} y1={yA} x2={xA} y2={endY} stroke="#78716c" strokeWidth="2.5" />
              <circle cx={xA} cy={endY} r="3" fill="#141414" />
              <text x={xA + 6} y={endY + 12} fill="#141414" fontSize="8" fontFamily="monospace">
                V串
              </text>
            </g>
          );
        } else {
          // 悬垂绝缘子串 (单I / 双I)
          const endY = yScale(hLeft - stringLenA);
          return (
            <g>
              <line x1={xA} y1={yA} x2={xA} y2={endY} stroke="#78716c" strokeWidth="3" />
              <circle cx={xA} cy={endY} r="3" fill="#141414" />
              <text x={xA + 6} y={(yA + endY) / 2} fill="#141414" fontSize="8" fontFamily="monospace">
                {typeA === 'double_I' ? '双I串' : '悬垂串'}
              </text>
            </g>
          );
        }
      })()}

      {/* Right Tower Insulator Graphic */}
      {(() => {
        const xB = xScale(L);
        const yB = yScale(hLeft + h);
        const stringLenB = rightInsulatorRes?.stringLength || insulatorRes?.stringLength || 2.5;
        const typeB = rightInsulator?.stringType || insulator?.stringType || 'single_I';

        if (typeB === 'tension') {
          // 耐张绝缘子串: 沿导线方向水平拉紧向左
          const endX = xScale(L - stringLenB);
          return (
            <g>
              <line x1={xB} y1={yB} x2={endX} y2={yB} stroke="#78716c" strokeWidth="4" />
              <line x1={xB} y1={yB} x2={endX} y2={yB} stroke="#141414" strokeWidth="1.5" strokeDasharray="3 3" />
              <circle cx={endX} cy={yB} r="3" fill="#047857" />
              <text x={endX - 40} y={yB - 6} fill="#047857" fontSize="9" fontFamily="monospace" fontWeight="bold">
                耐张串 ({stringLenB.toFixed(2)}m)
              </text>
            </g>
          );
        } else if (typeB === 'V_string') {
          const halfV = ((((rightInsulator?.vAngle || insulator?.vAngle || 90)) / 2) * Math.PI) / 180;
          const vDrop = stringLenB * Math.cos(halfV);
          const endY = yScale(hLeft + h - vDrop);
          return (
            <g>
              <line x1={xB - 12} y1={yB} x2={xB} y2={endY} stroke="#78716c" strokeWidth="2.5" />
              <line x1={xB + 12} y1={yB} x2={xB} y2={endY} stroke="#78716c" strokeWidth="2.5" />
              <circle cx={xB} cy={endY} r="3" fill="#141414" />
              <text x={xB - 20} y={endY + 12} fill="#141414" fontSize="8" fontFamily="monospace">
                V串
              </text>
            </g>
          );
        } else {
          const endY = yScale(hLeft + h - stringLenB);
          return (
            <g>
              <line x1={xB} y1={yB} x2={xB} y2={endY} stroke="#78716c" strokeWidth="3" />
              <circle cx={xB} cy={endY} r="3" fill="#141414" />
              <text x={xB - 36} y={(yB + endY) / 2} fill="#141414" fontSize="8" fontFamily="monospace">
                {typeB === 'double_I' ? '双I串' : '悬垂串'}
              </text>
            </g>
          );
        }
      })()}

      {/* Overlay curves for all working conditions if enabled */}
      {showAllOverlay &&
        results.map((res) => {
          if (res.conditionId === selectedConditionId) return null;
          const points = generateCatenaryCurve(
            L,
            hLeft - hRight > 0 ? -Math.abs(h) : Math.abs(h),
            res.sag,
            100
          );
          const pathD = points
            .map((p, idx) => {
              const px = xScale(p.x);
              const py = yScale(hLeft + p.y);
              return `${idx === 0 ? 'M' : 'L'} ${px} ${py}`;
            })
            .join(' ');

          return (
            <path
              key={res.conditionId}
              d={pathD}
              fill="none"
              stroke="#94A3B8"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity="0.6"
            />
          );
        })}

      {/* Main Active Catenary Conductor Line */}
      {activeResult && (
        <g className={isIceJumping ? 'animate-bounce transition-transform duration-700' : ''}>
          {(() => {
            const pathD = catenaryPoints
              .map((p, idx) => {
                const px = xScale(p.x);
                const py = yScale(hLeft + p.y);
                return `${idx === 0 ? 'M' : 'L'} ${px} ${py}`;
              })
              .join(' ');

            return (
              <path
                d={pathD}
                fill="none"
                stroke="#0284C7"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            );
          })()}
        </g>
      )}

      {/* Crossing Obstacles Visual Elements */}
      {obstacles.map((obs) => {
        const ox = xScale(obs.distanceFromLeftTower);
        const oyGround = yScale(0);
        const oyObstacleTop = yScale(obs.obstacleHeight);

        return (
          <g key={obs.id}>
            <rect
              x={ox - 8}
              y={oyObstacleTop}
              width="16"
              height={oyGround - oyObstacleTop}
              fill="#FCA5A5"
              stroke="#DC2626"
              strokeWidth="1.5"
              rx="2"
            />
            <text
              x={ox}
              y={oyObstacleTop - 6}
              fill="#991B1B"
              fontSize="10"
              fontFamily="monospace"
              textAnchor="middle"
              fontWeight="bold"
            >
              {obs.name} ({obs.obstacleHeight}m)
            </text>
          </g>
        );
      })}

      {/* Interactive Mouse Measurement Pointer */}
      {isInteractive && hoverPos && activeResult && (
        <g>
          {(() => {
            const xVal = hoverPos.x;
            const lineY = hLeft + (h / L) * xVal;
            const sagOffset = (4 * activeResult.sag * xVal * (L - xVal)) / (L * L);
            const conductorY = lineY - sagOffset;

            const cx = xScale(xVal);
            const cy = yScale(conductorY);
            const gy = yScale(0);

            return (
              <g>
                {/* Vertical Measurement Line */}
                <line
                  x1={cx}
                  y1={cy}
                  x2={cx}
                  y2={gy}
                  stroke="#0284C7"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                {/* Conductor Point */}
                <circle cx={cx} cy={cy} r="4.5" fill="#0284C7" stroke="#0F172A" strokeWidth="2" />
                {/* Ground Intersection */}
                <circle cx={cx} cy={gy} r="3" fill="#0F172A" />

                {/* Tooltip Box */}
                <g transform={`translate(${cx > svgWidth / 2 ? cx - 170 : cx + 15}, ${cy - 20})`}>
                  <rect
                    width="155"
                    height="65"
                    fill="#FFFFFF"
                    stroke="#0284C7"
                    strokeWidth="1.5"
                    rx="8"
                    className="shadow-lg"
                  />
                  <text x="10" y="18" fill="#0F172A" fontSize="11" fontFamily="monospace" fontWeight="bold">
                    x = {xVal.toFixed(1)} m (距左塔)
                  </text>
                  <text x="10" y="36" fill="#334155" fontSize="10" fontFamily="monospace">
                    导线高程: {conductorY.toFixed(2)} m
                  </text>
                  <text x="10" y="52" fill="#0284C7" fontSize="10" fontFamily="monospace" fontWeight="bold">
                    对地距离: {conductorY.toFixed(2)} m
                  </text>
                </g>
              </g>
            );
          })()}
        </g>
      )}

      {/* Legend */}
      <g transform={`translate(${margin.left + 10}, ${margin.top + 35})`}>
        <rect width="210" height="24" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1" rx="6" />
        <circle cx="12" cy="12" r="4" fill="#0284C7" />
        <text x="22" y="16" fill="#0F172A" fontSize="10" fontFamily="monospace" fontWeight="bold">
          {activeResult?.conditionName || '基准工况'} 弧垂 f = {(activeResult?.sag ?? 0).toFixed(2)} m
        </text>
      </g>
    </svg>
  );

  return (
    <div className="w-full h-full relative overflow-hidden font-mono">
      {/* Main Visualization Stage Container */}
      <div className="w-full h-full relative">
        {viewDimension === '3d' ? (
          <div className="w-full h-full relative">
            {/* Full 3D Canvas with Integrated Control Dock */}
            <ThreeSpanCanvas
              tower={tower}
              conductor={conductor || (results[0] as any)}
              results={results}
              obstacles={obstacles}
              selectedConditionId={selectedConditionId}
              onConditionChange={setSelectedConditionId}
              viewDimension={viewDimension}
              onViewDimensionChange={setViewDimension}
              onTriggerIceJump={triggerIceJump}
              isIceJumping={isIceJumping}
              insulator={insulator}
              insulatorRes={insulatorRes}
              rightInsulator={rightInsulator}
              rightInsulatorRes={rightInsulatorRes}
              render2DThumbnail={() => render2DSVG(false)}
              onOpen2DModal={() => setIs2dModalOpen(true)}
            />
          </div>
        ) : (
          /* SVG Canvas Stage (When explicitly in 2D mode - Light Theme) */
          <div className="relative w-full h-full bg-slate-50 border border-slate-200 p-4 overflow-auto rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] border border-slate-300 px-3 py-1.5 bg-white text-slate-800 font-bold rounded-xl flex items-center gap-2 shadow-sm">
                <Compass className="w-4 h-4 text-cyan-600" />
                <span>2D 导线悬垂弧垂剖面图</span>
                <label className="flex items-center space-x-1 cursor-pointer font-bold text-slate-700 ml-4">
                  <input
                    type="checkbox"
                    checked={showAllOverlay}
                    onChange={(e) => setShowAllOverlay(e.target.checked)}
                    className="accent-cyan-600"
                  />
                  <span>全工况包络</span>
                </label>
              </div>
              <button
                onClick={() => setViewDimension('3d')}
                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl flex items-center gap-1 shadow-sm transition-all"
              >
                <Box className="w-4 h-4" /> 返回 3D 空间
              </button>
            </div>
            {render2DSVG(true)}
          </div>
        )}
      </div>

      {/* Enlarged 2D Profile Modal Dialog (Light Bright Theme) */}
      {is2dModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 font-mono animate-fadeIn">
          <div className="bg-white/70 backdrop-blur-xl border border-slate-300 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900">
            {/* Modal Header */}
            <div className="bg-slate-100/70 border-b border-slate-200 p-3.5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Compass className="w-5 h-5 text-cyan-600" />
                <h3 className="font-bold text-sm text-slate-900 tracking-tight">
                  2D 纵向平剖面与耐张/直线悬垂档距高程图 (亮色模式)
                </h3>
              </div>
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-1.5 cursor-pointer font-semibold text-slate-800 text-xs bg-white px-2.5 py-1 border border-slate-300 rounded-lg shadow-sm">
                  <input
                    type="checkbox"
                    checked={showAllOverlay}
                    onChange={(e) => setShowAllOverlay(e.target.checked)}
                    className="accent-cyan-600"
                  />
                  <span>显示全工况弧垂包络</span>
                </label>
                <button
                  onClick={() => setIs2dModalOpen(false)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 p-1.5 rounded-lg font-bold text-xs flex items-center gap-1 transition-all"
                >
                  <X className="w-4 h-4" />
                  <span>关闭 [ESC]</span>
                </button>
              </div>
            </div>

            {/* Modal Content SVG Canvas */}
            <div className="p-4 bg-slate-50 overflow-auto flex-1">
              {render2DSVG(true)}
            </div>

            {/* Modal Footer Controls */}
            <div className="bg-slate-100 border-t border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-800 font-mono">
              <div className="flex items-center space-x-4 text-[11px] font-bold">
                <span>水平档距 l_hA/l_hB: {tower.leftHorizontalSpan ?? L}m / {tower.rightHorizontalSpan ?? L}m</span>
                <span>垂直档距 l_vA/l_vB: {tower.leftVerticalSpan ?? (tower.leftKvValue !== undefined ? Math.round(tower.leftKvValue * (tower.leftHorizontalSpan ?? L)) : L)}m / {tower.rightVerticalSpan ?? (tower.rightKvValue !== undefined ? Math.round(tower.rightKvValue * (tower.rightHorizontalSpan ?? L)) : L)}m</span>
                <span>视图档距: {L} m</span>
                <span>代表档距 L_r: {L_r} m</span>
                <span>高差 h: {h} m</span>
                <span>左挂点: {hLeft} m</span>
                <span>右挂点: {hLeft + h} m</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={triggerIceJump}
                  disabled={isIceJumping}
                  className="flex items-center space-x-1 px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-bold uppercase transition-all shadow-sm shadow-sky-500/20 cursor-pointer"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isIceJumping ? 'animate-spin' : ''}`} />
                  <span>{isIceJumping ? '脱冰跳跃中...' : '模拟脱冰跳跃'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mechanics Metrics Summary Cards (Bright Light Theme) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-sm">
          <span className="text-slate-500 block mb-0.5 text-[10px] uppercase font-semibold">控制工况 (Governing)</span>
          <span className="font-extrabold text-slate-900 text-xs block truncate">
            {results.find((r) => r.isGoverningCondition)?.conditionName || '未确定'}
          </span>
          <span className="text-[9px] text-slate-500">控导线强度上限</span>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-sm">
          <span className="text-slate-500 block mb-0.5 text-[10px] uppercase font-semibold">工况水平张力 T_m</span>
          <span className="font-extrabold text-slate-900 text-xs font-mono block">
            {(((activeResult?.tension ?? 0)) / 1000).toFixed(2)} kN
          </span>
          <span className="text-[9px] text-slate-500">
            σ = {(activeResult?.stress ?? 0).toFixed(2)} N/mm²
          </span>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-sm">
          <span className="text-slate-500 block mb-0.5 text-[10px] uppercase font-semibold">安全系数 K_c</span>
          <span
            className={`font-extrabold text-xs font-mono block ${
              (activeResult?.safetyFactor ?? 0) >= 2.5 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {(activeResult?.safetyFactor ?? 0).toFixed(2)}
          </span>
          <span className="text-[9px] text-slate-500">规程要求 ≥ 2.50</span>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-sm">
          <span className="text-slate-500 block mb-0.5 text-[10px] uppercase font-semibold">最低挂线净空</span>
          <span className="font-extrabold text-slate-900 text-xs font-mono block">
            {(
              Math.min(tower.leftAttachmentHeight, tower.rightAttachmentHeight) - (activeResult?.sag ?? 0)
            ).toFixed(2)}{' '}
            m
          </span>
          <span className="text-[9px] text-slate-500">档距中央对地净高</span>
        </div>
      </div>
    </div>
  );
};
