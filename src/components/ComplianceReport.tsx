import React from 'react';
import { Conductor, TowerParameters, InsulatorCalcResult } from '../types';
import { generateCodeComplianceReport } from '../utils/insulatorPhysics';
import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';

interface ComplianceReportProps {
  conductor: Conductor;
  tower: TowerParameters;
  maxTension: number;
  avgTension: number;
  maxSag: number;
  insulatorRes: InsulatorCalcResult;
}

export const ComplianceReport: React.FC<ComplianceReportProps> = ({
  conductor,
  tower,
  maxTension,
  avgTension,
  maxSag,
  insulatorRes,
}) => {
  const auditItems = generateCodeComplianceReport(
    conductor,
    tower,
    maxTension,
    avgTension,
    maxSag,
    insulatorRes
  );

  const allPassed = auditItems.every((item) => item.passed);

  return (
    <div className="glass-panel rounded-2xl p-4 shadow-2xl text-slate-100 font-sans space-y-4 max-w-7xl mx-auto">
      {/* Header card */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/10 p-3 rounded-xl border border-white/10 text-xs">
        <div className="flex items-center space-x-3">
          <div
            className={`p-2 rounded-xl border ${
              allPassed
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}
          >
            {allPassed ? (
              <ShieldCheck className="w-6 h-6" />
            ) : (
              <ShieldAlert className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
              DL/T 5582-2020 国家架空输电线路电气设计规程合规核查报告
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              综合评估导线机械裕度、防振张力、对地距离及绝缘子电气间隙
            </p>
          </div>
        </div>

        <div>
          {allPassed ? (
            <span className="px-3.5 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold rounded-lg uppercase flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>全项校验合格 (Pass)</span>
            </span>
          ) : (
            <span className="px-3.5 py-1.5 bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold rounded-lg uppercase flex items-center space-x-1.5">
              <XCircle className="w-4 h-4 text-red-400" />
              <span>存在不合规项 (Warning)</span>
            </span>
          )}
        </div>
      </div>

      {/* Compliance Audit Items List */}
      <div className="space-y-2.5">
        {auditItems.map((item, idx) => (
          <div
            key={idx}
            className={`p-3.5 rounded-xl border transition-all ${
              item.passed
                ? 'glass-card hover:border-white/20'
                : 'bg-red-950/30 border-red-800/80'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-xs text-slate-100 uppercase">{item.item}</span>
                  <span className="text-[9px] px-2 py-0.5 bg-slate-800 text-cyan-300 border border-slate-700 font-mono font-bold rounded uppercase">
                    {item.codeReference}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  规程标准限值: <span className="font-bold text-slate-200">{item.standardRequirement}</span>
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-500 block uppercase font-mono">实际计算结果</span>
                <span
                  className={`text-xs font-bold font-mono ${
                    item.passed ? 'text-cyan-300' : 'text-red-400'
                  }`}
                >
                  {item.calculatedValue}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
