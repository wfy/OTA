import { Conductor, Insulator } from '../types';

export const PRESET_CONDUCTORS: Conductor[] = [
  {
    id: 'lgj-185-30',
    name: 'LGJ-185/30 钢芯铝绞线',
    type: 'ACSR',
    totalArea: 216.31,
    aluminumArea: 185.83,
    steelArea: 30.48,
    outerDiameter: 18.88,
    unitMass: 0.7617,
    ratedStrength: 61400, // N
    elasticModulus: 73000, // N/mm²
    thermalExpansion: 19.2e-6, // 1/°C
    maxAllowableTemp: 70,
  },
  {
    id: 'lgj-240-30',
    name: 'LGJ-240/30 钢芯铝绞线',
    type: 'ACSR',
    totalArea: 275.96,
    aluminumArea: 243.43,
    steelArea: 32.53,
    outerDiameter: 21.60,
    unitMass: 0.9222,
    ratedStrength: 75000, // N
    elasticModulus: 73000, // N/mm²
    thermalExpansion: 19.2e-6, // 1/°C
    maxAllowableTemp: 70,
  },
  {
    id: 'lgj-300-40',
    name: 'LGJ-300/40 钢芯铝绞线',
    type: 'ACSR',
    totalArea: 338.99,
    aluminumArea: 298.11,
    steelArea: 40.88,
    outerDiameter: 23.94,
    unitMass: 1.1328,
    ratedStrength: 92220, // N
    elasticModulus: 73000, // N/mm²
    thermalExpansion: 19.2e-6, // 1/°C
    maxAllowableTemp: 70,
  },
  {
    id: 'lgj-400-35',
    name: 'LGJ-400/35 钢芯铝绞线',
    type: 'ACSR',
    totalArea: 425.24,
    aluminumArea: 389.28,
    steelArea: 35.96,
    outerDiameter: 26.82,
    unitMass: 1.3487,
    ratedStrength: 103900, // N
    elasticModulus: 65000, // N/mm²
    thermalExpansion: 20.5e-6, // 1/°C
    maxAllowableTemp: 70,
  },
  {
    id: 'jl-g1a-400-35',
    name: 'JL/G1A-400/35 钢芯铝绞线',
    type: 'JL/G1A',
    totalArea: 433.11,
    aluminumArea: 397.38,
    steelArea: 35.73,
    outerDiameter: 26.82,
    unitMass: 1.3780,
    ratedStrength: 104900, // N
    elasticModulus: 65000, // N/mm²
    thermalExpansion: 20.5e-6, // 1/°C
    maxAllowableTemp: 80,
  },
  {
    id: 'jl-g1a-630-45',
    name: 'JL/G1A-630/45 钢芯铝绞线',
    type: 'JL/G1A',
    totalArea: 678.89,
    aluminumArea: 633.82,
    steelArea: 45.07,
    outerDiameter: 33.80,
    unitMass: 2.0800,
    ratedStrength: 158800, // N
    elasticModulus: 65000, // N/mm²
    thermalExpansion: 20.5e-6, // 1/°C
    maxAllowableTemp: 80,
  },
  {
    id: 'jl-g3a-1000-45',
    name: 'JL/G3A-1000/45 钢芯高导电率铝绞线',
    type: 'JL/G3A',
    totalArea: 1021.40,
    aluminumArea: 976.30,
    steelArea: 45.10,
    outerDiameter: 41.60,
    unitMass: 3.1900,
    ratedStrength: 225000, // N
    elasticModulus: 62000, // N/mm²
    thermalExpansion: 20.9e-6, // 1/°C
    maxAllowableTemp: 80,
  },
];

export const PRESET_INSULATORS: Insulator[] = [
  {
    id: 'xp-70',
    name: 'XP-70 盘形瓷绝缘子',
    material: 'porcelain',
    structureHeight: 146,
    creepageDistance: 295,
    unitMass: 4.6,
    ratedLoad: 70,
    discDiameter: 255,
    characteristicIndexM1: 0.65,
  },
  {
    id: 'xp-160',
    name: 'XP-160 盘形瓷绝缘子',
    material: 'porcelain',
    structureHeight: 146,
    creepageDistance: 295,
    unitMass: 7.0,
    ratedLoad: 160,
    discDiameter: 255,
    characteristicIndexM1: 0.65,
  },
  {
    id: 'xwp-160',
    name: 'XWP-160 防污型盘形瓷绝缘子',
    material: 'porcelain',
    structureHeight: 146,
    creepageDistance: 435,
    unitMass: 7.8,
    ratedLoad: 160,
    discDiameter: 255,
    characteristicIndexM1: 0.38,
  },
  {
    id: 'lxy-160',
    name: 'LXY-160 钢化玻璃绝缘子',
    material: 'glass',
    structureHeight: 146,
    creepageDistance: 320,
    unitMass: 6.8,
    ratedLoad: 160,
    discDiameter: 255,
    characteristicIndexM1: 0.45,
  },
  {
    id: 'fxbw4-110-100',
    name: 'FXBW4-110/100 棒形悬垂复合绝缘子',
    material: 'composite',
    structureHeight: 1200,
    creepageDistance: 3150,
    unitMass: 8.5,
    ratedLoad: 100,
    characteristicIndexM1: 0.30,
  },
  {
    id: 'fxbw4-220-160',
    name: 'FXBW4-220/160 棒形悬垂复合绝缘子',
    material: 'composite',
    structureHeight: 2300,
    creepageDistance: 6800,
    unitMass: 14.5,
    ratedLoad: 160,
    characteristicIndexM1: 0.30,
  },
  {
    id: 'fxbw4-500-210',
    name: 'FXBW4-500/210 棒形悬垂复合绝缘子',
    material: 'composite',
    structureHeight: 4600,
    creepageDistance: 15500,
    unitMass: 28.0,
    ratedLoad: 210,
    characteristicIndexM1: 0.30,
  },
];
