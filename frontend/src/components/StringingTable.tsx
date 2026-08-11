import React from 'react';
import { Conductor, TowerParameters, WorkingCondition } from '../types';
import { generateStringingChart } from '../utils/conductorPhysics';
import { Download, FileSpreadsheet } from 'lucide-react';

interface StringingTableProps {
  conductor: Conductor;
  tower: TowerParameters;
  conditions: WorkingCondition[];
}

export const StringingTable: React.FC<StringingTableProps> = ({
  conductor,
  tower,
  conditions,
}) => {
  const temps = [-10, 0, 10, 15, 20, 30, 40];
  const spans = [100, 200, 300, 400, 500, 600, 700, 800];

  const stringingData = generateStringingChart(conductor, conditions, tower, temps, spans);

  // Export CSV Handler
  const exportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += `档距 L (m),` + temps.map((t) => `${t}°C 张力(kN),${t}°C 弧垂(m)`).join(',') + '\n';

    stringingData.forEach((row) => {
      let line = `${row.span},`;
      const cellValues = row.data.map(
        (d) => `${(d.tension / 1000).toFixed(2)},${d.sag.toFixed(2)}`
      );
      line += cellValues.join(',') + '\n';
      csvContent += line;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${conductor.name}_架线安装张力弧垂表.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="glass-panel rounded-2xl p-4 shadow-2xl text-slate-100 font-sans space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/10 p-3 rounded-xl border border-white/10 text-xs">
        <div className="flex items-center space-x-3">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">施工架线安装张力与弧垂百米百度换算表</h3>
            <p className="text-[10px] text-slate-300 font-mono">
              用于现场紧线与弧垂观测，不同施工气温下的水平张力 (kN) 与中央弧垂 (m)
            </p>
          </div>
        </div>

        <button
          id="btn-export-csv"
          onClick={exportCSV}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>导出 CSV 数据表</span>
        </button>
      </div>

      {/* Responsive Table */}
      <div className="overflow-x-auto rounded-xl border border-white/15 glass-inner">
        <table className="w-full text-xs text-left border-collapse font-mono">
          <thead className="text-[10px] uppercase bg-white/10 text-slate-300 border-b border-white/10">
            <tr>
              <th className="px-3 py-2.5 bg-slate-900/90 border-r border-white/10 font-bold text-slate-200 sticky left-0 z-10">
                代表档距 L (m)
              </th>
              {temps.map((t) => (
                <th key={t} className="px-3 py-2.5 text-center border-r border-white/10 font-bold">
                  <span className="text-cyan-300 block text-xs">{t} °C</span>
                  <span className="block text-[9px] text-slate-400">T(kN) / f(m)</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {stringingData.map((row) => (
              <tr key={row.span} className="hover:bg-white/10 transition-colors">
                <td className="px-3 py-2 font-bold bg-slate-900/90 text-cyan-300 border-r border-white/10 sticky left-0 z-10">
                  {row.span} m
                </td>
                {row.data.map((d, i) => (
                  <td key={i} className="px-3 py-2 text-center border-r border-white/10">
                    <div className="font-bold text-slate-200">{(d.tension / 1000).toFixed(2)}</div>
                    <div className="text-[10px] text-sky-300 font-mono">{d.sag.toFixed(2)} m</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
