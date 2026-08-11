export type UiTheme = 'cyber-dark' | 'light-cad' | 'midnight-gold' | 'emerald-matrix';

export interface ThemeMeta {
  id: UiTheme;
  name: string;
  subtitle: string;
  previewColorBg: string;
  previewColorCard: string;
  previewAccent: string;
  description: string;
  // Class mappings for key UI elements
  appBg: string;
  headerBg: string;
  headerBorder: string;
  panelBg: string;
  panelBorder: string;
  cardHeaderBg: string;
  cardHeaderBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  inputBg: string;
  inputBorder: string;
  tableHeadBg: string;
  tableHeadText: string;
  tableRowBg: string;
  tableBorder: string;
  badgeGov: string;
}

export const THEME_PRESETS: Record<UiTheme, ThemeMeta> = {
  'cyber-dark': {
    id: 'cyber-dark',
    name: '赛博暗色 CAD',
    subtitle: '夜间工程仿真 (默认高科技)',
    previewColorBg: 'bg-[#0a0e17]',
    previewColorCard: 'bg-slate-900/30',
    previewAccent: 'bg-cyan-500',
    description: '深邃夜空黑搭配高亮荧光蓝与半透明玻璃质感面板，三维场景清晰透过 UI 呈现。',
    appBg: 'bg-[#070a12] text-slate-100',
    headerBg: 'bg-slate-950/20 backdrop-blur-2xl',
    headerBorder: 'border-slate-800/30',
    panelBg: 'bg-slate-950/20 backdrop-blur-2xl',
    panelBorder: 'border-slate-800/30 shadow-2xl',
    cardHeaderBg: 'bg-slate-900/20 border-b border-slate-800/30',
    cardHeaderBorder: 'border-slate-800/30',
    textPrimary: 'text-slate-100',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-400',
    accentText: 'text-cyan-400',
    accentBg: 'bg-cyan-500/15',
    accentBorder: 'border-cyan-500/30',
    inputBg: 'bg-slate-900/20',
    inputBorder: 'border-slate-800/30',
    tableHeadBg: 'bg-slate-950/20',
    tableHeadText: 'text-slate-400',
    tableRowBg: 'bg-cyan-950/15',
    tableBorder: 'border-slate-800/30',
    badgeGov: 'bg-sky-950/30 text-sky-300 border-sky-500/30',
  },
  'light-cad': {
    id: 'light-cad',
    name: '现代明亮工程',
    subtitle: '日间蓝图打印 (高对比清爽)',
    previewColorBg: 'bg-slate-100',
    previewColorCard: 'bg-white/40',
    previewAccent: 'bg-blue-600',
    description: '明亮工程蓝图与高对比深蓝文字，符合国家电网设计院标准白底汇报图表格式。',
    appBg: 'bg-slate-100 text-slate-900',
    headerBg: 'bg-white/20 backdrop-blur-2xl',
    headerBorder: 'border-slate-300/40 shadow-md shadow-slate-200/50',
    panelBg: 'bg-white/20 backdrop-blur-2xl',
    panelBorder: 'border-slate-300/40 shadow-xl shadow-slate-300/20',
    cardHeaderBg: 'bg-slate-100/20 border-b border-slate-200/30',
    cardHeaderBorder: 'border-slate-200/30',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-700',
    textMuted: 'text-slate-500',
    accentText: 'text-blue-600',
    accentBg: 'bg-blue-50/50',
    accentBorder: 'border-blue-400/50',
    inputBg: 'bg-white/25 text-slate-900',
    inputBorder: 'border-slate-300/40',
    tableHeadBg: 'bg-slate-200/20',
    tableHeadText: 'text-slate-700',
    tableRowBg: 'bg-blue-50/20',
    tableBorder: 'border-slate-200/40',
    badgeGov: 'bg-sky-100/60 text-sky-800 border-sky-300',
  },
  'midnight-gold': {
    id: 'midnight-gold',
    name: '黑金特高压',
    subtitle: '尊享黑金 (特高压汇报大屏)',
    previewColorBg: 'bg-[#09090b]',
    previewColorCard: 'bg-zinc-900/40',
    previewAccent: 'bg-amber-500',
    description: '黑曜石基底配合辉煌金黄线条与琥珀暖色，专为特高压工程高层汇报与展览大屏打造。',
    appBg: 'bg-[#08080a] text-zinc-100',
    headerBg: 'bg-zinc-950/20 backdrop-blur-2xl',
    headerBorder: 'border-amber-900/25',
    panelBg: 'bg-zinc-950/20 backdrop-blur-2xl',
    panelBorder: 'border-amber-900/25 shadow-amber-950/20',
    cardHeaderBg: 'bg-zinc-900/20 border-b border-amber-900/20',
    cardHeaderBorder: 'border-amber-900/20',
    textPrimary: 'text-zinc-100',
    textSecondary: 'text-zinc-300',
    textMuted: 'text-zinc-400',
    accentText: 'text-amber-400',
    accentBg: 'bg-amber-500/15',
    accentBorder: 'border-amber-500/30',
    inputBg: 'bg-zinc-950/20',
    inputBorder: 'border-amber-900/20',
    tableHeadBg: 'bg-zinc-950/20',
    tableHeadText: 'text-amber-400/80',
    tableRowBg: 'bg-amber-950/15',
    tableBorder: 'border-amber-900/20',
    badgeGov: 'bg-amber-950/30 text-amber-300 border-amber-500/50',
  },
  'emerald-matrix': {
    id: 'emerald-matrix',
    name: '重工矩阵绿',
    subtitle: '工业调度控制中心 (沉浸矩阵)',
    previewColorBg: 'bg-[#051410]',
    previewColorCard: 'bg-emerald-950/40',
    previewAccent: 'bg-emerald-400',
    description: '深邃墨绿重工界面，搭配极光绿与薄荷冷色数据项，再现电力调度中枢控制面板风格。',
    appBg: 'bg-[#05110e] text-emerald-50',
    headerBg: 'bg-emerald-950/20 backdrop-blur-2xl',
    headerBorder: 'border-emerald-800/25',
    panelBg: 'bg-emerald-950/20 backdrop-blur-2xl',
    panelBorder: 'border-emerald-800/25 shadow-emerald-950/20',
    cardHeaderBg: 'bg-emerald-900/20 border-b border-emerald-800/25',
    cardHeaderBorder: 'border-emerald-800/25',
    textPrimary: 'text-emerald-50',
    textSecondary: 'text-emerald-200',
    textMuted: 'text-emerald-400/70',
    accentText: 'text-emerald-400',
    accentBg: 'bg-emerald-500/15',
    accentBorder: 'border-emerald-500/30',
    inputBg: 'bg-emerald-950/20',
    inputBorder: 'border-emerald-800/30',
    tableHeadBg: 'bg-emerald-950/20',
    tableHeadText: 'text-emerald-400/80',
    tableRowBg: 'bg-emerald-900/15',
    tableBorder: 'border-emerald-800/20',
    badgeGov: 'bg-sky-950/30 text-sky-300 border-sky-500/30',
  },
};
