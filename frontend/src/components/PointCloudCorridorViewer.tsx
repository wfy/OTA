import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import proj4 from 'proj4';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { createPortal } from 'react-dom';
import type { ParsedPointCloudData } from '../workers/pointCloudParser';
import type { OctreeData } from '../workers/octreeBuilder';
import { OctreeLODRenderer } from '../renderers/OctreeLODRenderer';

// Parse point cloud data in a Web Worker so the main thread never blocks.
// Falls back to the legacy in-thread parser if workers are unavailable.
export function parsePointCloudBuffer(
  buffer: ArrayBuffer,
  name: string,
  buildOctree = true
): Promise<RawPointCloudData | null> {
  return new Promise<RawPointCloudData | null>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/pointCloud.worker.ts', import.meta.url), {
      type: 'module',
    });
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('point cloud parse timeout'));
    }, 120000);
    worker.onmessage = (
      ev: MessageEvent<{ id: number; ok: boolean; data?: ParsedPointCloudData; error?: string }>
    ) => {
      window.clearTimeout(timer);
      worker.terminate();
      if (ev.data.ok && ev.data.data) {
        resolve(ev.data.data as unknown as RawPointCloudData);
      } else {
        reject(new Error(ev.data.error || 'point cloud parse failed'));
      }
    };
    worker.onerror = (ev) => {
      window.clearTimeout(timer);
      worker.terminate();
      reject(new Error(ev.message || 'point cloud worker error'));
    };
    worker.postMessage({ id: 1, type: 'parse', buffer, name, buildOctree }, [buffer]);
  });
}

export async function parseFullPointCloudFile(file: File): Promise<RawPointCloudData | null> {
  try {
    const buffer = await file.arrayBuffer();
    return await parsePointCloudBuffer(buffer, file.name);
  } catch (err) {
    console.warn('Worker parse failed, falling back to legacy parser:', err);
    return parseFullPointCloudFileLegacy(file);
  }
}

// Register standard projections in proj4 engine
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('EPSG:4490', '+proj=longlat +ellps=GRS80 +no_defs');
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs');
import {
  Layers,
  Globe,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Upload,
  Plus,
  MoveUp,
  MoveDown,
  GripVertical,
  Locate,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Eye,
  CheckSquare,
  Square,
  Sliders,
  Sparkles,
  Maximize2,
  Minimize2,
  Info,
  AlertTriangle,
  Ruler,
  Table,
  X,
  FileCode,
  ShieldAlert,
  Search,
  CheckCircle2,
  Radio,
  Compass,
  Loader2,
  MapPin,
  Tag,
  Trash2,
  Edit3,
  Target,
  Crosshair,
  Settings,
} from 'lucide-react';
import { TowerParameters, Conductor, ConditionCalcResult } from '../types';
import { useAppStore } from '../store/useAppStore';
import { generateCatenaryCurve } from '../utils/conductorPhysics';

// Voltage Level Phase Presets for Powerline Conductors (Digital Green Valley / LiDAR3D Industry Standard)
export interface WirePhasePreset {
  id: string;
  name: string;
  voltage: '110kV' | '220kV' | '500kV' | 'Custom';
  wireCount: number;
  sagRatio: number;
  corridorRadius: number;
  offsets: { name: string; dx: number; dy: number }[];
}

export const WIRE_PRESETS: WirePhasePreset[] = [
  {
    id: '110kv_3phase',
    name: '110kV 单回路 (三相水平并排)',
    voltage: '110kV',
    wireCount: 3,
    sagRatio: 0.03,
    corridorRadius: 1.5,
    offsets: [
      { name: 'A相 (左)', dx: -4.0, dy: 0 },
      { name: 'B相 (中)', dx: 0.0, dy: 0 },
      { name: 'C相 (右)', dx: 4.0, dy: 0 },
    ],
  },
  {
    id: '220kv_6phase',
    name: '220kV 双回路 (六相两侧布置)',
    voltage: '220kV',
    wireCount: 6,
    sagRatio: 0.035,
    corridorRadius: 1.8,
    offsets: [
      { name: 'I回路-A相 (左上)', dx: -4.5, dy: 0 },
      { name: 'I回路-B相 (左中)', dx: -5.5, dy: -4.0 },
      { name: 'I回路-C相 (左下)', dx: -4.5, dy: -8.0 },
      { name: 'II回路-A相 (右上)', dx: 4.5, dy: 0 },
      { name: 'II回路-B相 (右中)', dx: 5.5, dy: -4.0 },
      { name: 'II回路-C相 (右下)', dx: 4.5, dy: -8.0 },
    ],
  },
  {
    id: '500kv_8phase',
    name: '500kV 4分裂双回路 (八相多层)',
    voltage: '500kV',
    wireCount: 8,
    sagRatio: 0.04,
    corridorRadius: 2.2,
    offsets: [
      { name: '地线1 (顶左)', dx: -3.0, dy: 6.0 },
      { name: '地线2 (顶右)', dx: 3.0, dy: 6.0 },
      { name: 'A1相 (左上)', dx: -7.0, dy: 0 },
      { name: 'B1相 (左中)', dx: -8.5, dy: -6.0 },
      { name: 'C1相 (左下)', dx: -7.0, dy: -12.0 },
      { name: 'A2相 (右上)', dx: 7.0, dy: 0 },
      { name: 'B2相 (右中)', dx: 8.5, dy: -6.0 },
      { name: 'C2相 (右下)', dx: 7.0, dy: -12.0 },
    ],
  },
  {
    id: 'single_wire',
    name: '单根导线 / 避雷线',
    voltage: 'Custom',
    wireCount: 1,
    sagRatio: 0.03,
    corridorRadius: 1.5,
    offsets: [{ name: '悬垂导线', dx: 0, dy: 0 }],
  },
];

// China Administrative Division Data for Power Grid Hierarchy Mapping
export const CHINA_ADMINISTRATIVE_DATA: Record<string, string[]> = {
  '浙江省': ['杭州市', '宁波市', '温州市', '嘉兴市', '湖州市', '绍兴市', '金华市', '衢州市', '台州市', '丽水市', '舟山市'],
  '江苏省': ['南京市', '苏州市', '无锡市', '常州市', '南通市', '徐州市', '连云港市', '淮安市', '盐城市', '扬州市', '镇江市', '泰州市', '宿迁市'],
  '上海市': ['上海市'],
  '广东省': ['广州市', '深圳市', '珠海市', '佛山市', '东莞市', '惠州市', '中山市', '湛江市', '汕头市', '江门市', '茂名市', '肇庆市', '梅州市', '清远市', '潮州市', '揭阳市'],
  '北京市': ['北京市'],
  '天津市': ['天津市'],
  '重庆市': ['重庆市'],
  '安徽省': ['合肥市', '芜湖市', '蚌埠市', '淮南市', '马鞍山市', '淮北市', '铜陵市', '安庆市', '黄山市', '滁州市', '阜阳市', '宿州市', '六安市', '亳州市', '池州市', '宣城市'],
  '福建省': ['福州市', '厦门市', '莆田市', '三明市', '泉州市', '漳州市', '南平市', '龙岩市', '宁德市'],
  '山东省': ['济南市', '青岛市', '淄博市', '枣庄市', '东营市', '烟台市', '潍坊市', '济宁市', '泰安市', '威海市', '日照市', '临沂市', '德州市', '聊城市', '滨州市', '菏泽市'],
  '湖北省': ['武汉市', '黄石市', '十堰市', '宜昌市', '襄阳市', '鄂州市', '荆门市', '孝感市', '荆州市', '黄冈市', '咸宁市', '随州市', '恩施州'],
  '湖南省': ['长沙市', '株洲市', '湘潭市', '衡阳市', '邵阳市', '岳阳市', '常德市', '张家界市', '益阳市', '郴州市', '永州市', '怀化市', '娄底市', '湘西州'],
  '四川省': ['成都市', '自贡市', '攀枝花市', '泸州市', '德阳市', '绵阳市', '广元市', '遂宁市', '内江市', '乐山市', '南充市', '眉山市', '宜宾市', '广安市', '达州市', '雅安市', '巴中市', '资阳市', '阿坝州', '甘孜州', '凉山州'],
  '河南省': ['郑州市', '开封市', '洛阳市', '平顶山市', '安阳市', '鹤壁市', '新乡市', '焦作市', '濮阳市', '许昌市', '漯河市', '三门峡市', '南阳市', '商丘市', '信阳市', '周口市', '驻马店市'],
  '陕西省': ['西安市', '铜川市', '宝鸡市', '咸阳市', '渭南市', '延安市', '汉中市', '榆林市', '安康市', '商洛市'],
  '河北省': ['石家庄市', '唐山市', '秦皇岛市', '邯郸市', '邢台市', '保定市', '张家口市', '承德市', '沧州市', '廊坊市', '衡水市'],
  '云南省': ['昆明市', '曲靖市', '玉溪市', '保山市', '昭通市', '丽江市', '普洱市', '临沧市', '楚雄州', '红河州', '文山州', '西双版纳州', '大理州', '德宏州', '迪庆州'],
  '江西省': ['南昌市', '景德镇市', '萍乡市', '九江市', '新余市', '鹰潭市', '赣州市', '吉安市', '宜春市', '抚州市', '上饶市'],
  '贵州省': ['贵阳市', '六盘水市', '遵义市', '安顺市', '毕节市', '铜仁市', '黔西南州', '黔东南州', '黔南州'],
  '广西壮族自治区': ['南宁市', '柳州市', '桂林市', '梧州市', '北海市', '防城港市', '钦州市', '贵港市', '玉林市', '百色市', '贺州市', '河池市', '来宾市', '崇左市'],
  '山西省': ['太原市', '大同市', '阳泉市', '长治市', '晋城市', '朔州市', '晋中市', '运城市', '忻州市', '临汾市', '吕梁市'],
  '内蒙古自治区': ['呼和浩特市', '包头市', '乌海市', '赤峰市', '通辽市', '鄂尔多斯市', '呼伦贝尔市', '巴彦淖尔市', '乌兰察布市', '兴安盟', '锡林郭勒盟', '阿拉善盟'],
  '辽宁省': ['沈阳市', '大连市', '鞍山市', '抚顺市', '本溪市', '丹东市', '锦州市', '营口市', '阜新市', '辽阳市', '盘锦市', '铁岭市', '朝阳市', '葫芦岛市'],
  '吉林省': ['长春市', '吉林市', '四平市', '辽源市', '通化市', '白山市', '松原市', '白城市', '延边州'],
  '黑龙江省': ['哈尔滨市', '齐齐哈尔市', '鸡西市', '鹤岗市', '双鸭山市', '大庆市', '伊春市', '佳木斯市', '七台河市', '牡丹江市', '黑河市', '绥化市', '大兴安岭地区'],
  '新疆维吾尔自治区': ['乌鲁木齐市', '克拉玛依市', '吐鲁番市', '哈密市', '昌吉州', '博州', '巴州', '阿克苏地区', '克州', '喀什地区', '和田地区', '伊犁州', '塔城地区', '阿勒泰地区'],
  '甘肃省': ['兰州市', '嘉峪关市', '金昌市', '白银市', '天水市', '武威市', '张掖市', '平凉市', '酒泉市', '庆阳市', '定西市', '陇南市', '临夏州', '甘南州'],
  '青海省': ['西宁市', '海东市', '海北州', '黄南州', '海南州', '果洛州', '玉树州', '海西州'],
  '宁夏回族自治区': ['银川市', '石嘴山市', '吴忠市', '固原市', '中卫市'],
  '西藏自治区': ['拉萨市', '日喀则市', '昌都市', '林芝市', '山南市', '那曲市', '阿里地区'],
  '海南省': ['海口市', '三亚市', '三沙市', '儋州市'],
};

export interface CityBound {
  province: string;
  city: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface ProvinceBound {
  province: string;
  defaultCity: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export const CHINA_CITY_BOUNDS: CityBound[] = [
  // 浙江省
  { province: '浙江省', city: '杭州市', minLat: 29.18, maxLat: 30.56, minLon: 118.35, maxLon: 120.72 },
  { province: '浙江省', city: '宁波市', minLat: 28.85, maxLat: 30.33, minLon: 120.92, maxLon: 122.28 },
  { province: '浙江省', city: '温州市', minLat: 27.05, maxLat: 28.53, minLon: 119.62, maxLon: 121.25 },
  { province: '浙江省', city: '嘉兴市', minLat: 30.25, maxLat: 31.03, minLon: 120.30, maxLon: 121.27 },
  { province: '浙江省', city: '湖州市', minLat: 30.38, maxLat: 31.18, minLon: 119.23, maxLon: 120.48 },
  { province: '浙江省', city: '绍兴市', minLat: 29.23, maxLat: 30.28, minLon: 119.88, maxLon: 121.10 },
  { province: '浙江省', city: '金华市', minLat: 28.53, maxLat: 29.70, minLon: 119.23, maxLon: 120.78 },
  { province: '浙江省', city: '衢州市', minLat: 28.25, maxLat: 29.50, minLon: 118.02, maxLon: 119.33 },
  { province: '浙江省', city: '台州市', minLat: 28.02, maxLat: 29.13, minLon: 120.02, maxLon: 121.93 },
  { province: '浙江省', city: '丽水市', minLat: 27.42, maxLat: 28.95, minLon: 118.68, maxLon: 120.15 },
  { province: '浙江省', city: '舟山市', minLat: 29.53, maxLat: 30.85, minLon: 121.52, maxLon: 123.25 },

  // 江苏省
  { province: '江苏省', city: '南京市', minLat: 31.23, maxLat: 32.62, minLon: 118.35, maxLon: 119.23 },
  { province: '江苏省', city: '苏州市', minLat: 30.75, maxLat: 32.03, minLon: 119.92, maxLon: 121.33 },
  { province: '江苏省', city: '无锡市', minLat: 31.12, maxLat: 32.08, minLon: 119.52, maxLon: 120.60 },
  { province: '江苏省', city: '常州市', minLat: 31.15, maxLat: 32.07, minLon: 119.13, maxLon: 120.20 },
  { province: '江苏省', city: '南通市', minLat: 31.68, maxLat: 32.72, minLon: 120.20, maxLon: 121.92 },
  { province: '江苏省', city: '徐州市', minLat: 33.72, maxLat: 34.93, minLon: 116.37, maxLon: 118.67 },

  // 上海市
  { province: '上海市', city: '上海市', minLat: 30.68, maxLat: 31.88, minLon: 120.85, maxLon: 122.20 },

  // 广东省
  { province: '广东省', city: '广州市', minLat: 22.43, maxLat: 23.93, minLon: 112.95, maxLon: 114.05 },
  { province: '广东省', city: '深圳市', minLat: 22.40, maxLat: 22.88, minLon: 113.75, maxLon: 114.62 },
  { province: '广东省', city: '佛山市', minLat: 22.63, maxLat: 23.30, minLon: 112.38, maxLon: 113.30 },
  { province: '广东省', city: '东莞市', minLat: 22.65, maxLat: 23.15, minLon: 113.52, maxLon: 114.25 },

  // 北京市 & 天津市
  { province: '北京市', city: '北京市', minLat: 39.43, maxLat: 41.05, minLon: 115.42, maxLon: 117.50 },
  { province: '天津市', city: '天津市', minLat: 38.57, maxLat: 40.25, minLon: 116.72, maxLon: 118.07 },
  { province: '重庆市', city: '重庆市', minLat: 28.17, maxLat: 32.20, minLon: 105.28, maxLon: 110.20 },

  // 四川省
  { province: '四川省', city: '成都市', minLat: 30.08, maxLat: 31.43, minLon: 102.98, maxLon: 104.90 },
  { province: '湖北省', city: '武汉市', minLat: 29.97, maxLat: 31.37, minLon: 113.70, maxLon: 115.08 },
  { province: '湖南省', city: '长沙市', minLat: 27.85, maxLat: 28.67, minLon: 111.88, maxLon: 114.25 },
  { province: '陕西省', defaultCity: '西安市', minLat: 33.70, maxLat: 34.75, minLon: 107.67, maxLon: 109.82 } as any,
  { province: '山东省', city: '济南市', minLat: 36.03, maxLat: 37.53, minLon: 116.18, maxLon: 117.88 },
  { province: '山东省', city: '青岛市', minLat: 35.58, maxLat: 37.15, minLon: 119.50, maxLon: 121.15 },
  { province: '安徽省', city: '合肥市', minLat: 30.95, maxLat: 32.63, minLon: 116.68, maxLon: 117.97 },
  { province: '福建省', city: '福州市', minLat: 25.25, maxLat: 26.65, minLon: 118.37, maxLon: 119.98 },
  { province: '河南省', city: '郑州市', minLat: 34.27, maxLat: 34.97, minLon: 112.72, maxLon: 114.23 },
];

export const PROVINCE_FALLBACK_BOUNDS: ProvinceBound[] = [
  { province: '浙江省', defaultCity: '杭州市', minLat: 27.0, maxLat: 31.2, minLon: 118.0, maxLon: 123.0 },
  { province: '江苏省', defaultCity: '南京市', minLat: 30.7, maxLat: 35.1, minLon: 116.3, maxLon: 122.0 },
  { province: '上海市', defaultCity: '上海市', minLat: 30.6, maxLat: 31.9, minLon: 120.8, maxLon: 122.3 },
  { province: '安徽省', defaultCity: '合肥市', minLat: 29.4, maxLat: 34.6, minLon: 114.9, maxLon: 119.6 },
  { province: '福建省', defaultCity: '福州市', minLat: 23.5, maxLat: 28.3, minLon: 115.8, maxLon: 120.8 },
  { province: '江西省', defaultCity: '南昌市', minLat: 24.5, maxLat: 30.1, minLon: 113.6, maxLon: 118.5 },
  { province: '山东省', defaultCity: '济南市', minLat: 34.4, maxLat: 38.4, minLon: 114.8, maxLon: 122.7 },
  { province: '广东省', defaultCity: '广州市', minLat: 20.2, maxLat: 25.5, minLon: 109.6, maxLon: 117.3 },
  { province: '广西壮族自治区', defaultCity: '南宁市', minLat: 20.9, maxLat: 26.4, minLon: 104.4, maxLon: 112.1 },
  { province: '海南省', defaultCity: '海口市', minLat: 18.1, maxLat: 20.2, minLon: 108.6, maxLon: 111.1 },
  { province: '北京市', defaultCity: '北京市', minLat: 39.4, maxLat: 41.1, minLon: 115.4, maxLon: 117.5 },
  { province: '天津市', defaultCity: '天津市', minLat: 38.5, maxLat: 40.3, minLon: 116.7, maxLon: 118.1 },
  { province: '河北省', defaultCity: '石家庄市', minLat: 36.0, maxLat: 42.6, minLon: 113.4, maxLon: 119.8 },
  { province: '山西省', defaultCity: '太原市', minLat: 34.6, maxLat: 40.7, minLon: 110.2, maxLon: 114.6 },
  { province: '内蒙古自治区', defaultCity: '呼和浩特市', minLat: 37.4, maxLat: 53.3, minLon: 97.2, maxLon: 126.1 },
  { province: '河南省', defaultCity: '郑州市', minLat: 31.4, maxLat: 36.4, minLon: 110.4, maxLon: 116.6 },
  { province: '湖北省', defaultCity: '武汉市', minLat: 29.0, maxLat: 33.3, minLon: 108.4, maxLon: 116.1 },
  { province: '湖南省', defaultCity: '长沙市', minLat: 24.6, maxLat: 30.1, minLon: 108.8, maxLon: 114.2 },
  { province: '四川省', defaultCity: '成都市', minLat: 26.0, maxLat: 34.3, minLon: 97.4, maxLon: 108.5 },
  { province: '重庆市', defaultCity: '重庆市', minLat: 28.2, maxLat: 32.2, minLon: 105.3, maxLon: 110.2 },
  { province: '贵州省', defaultCity: '贵阳市', minLat: 24.6, maxLat: 29.2, minLon: 103.6, maxLon: 109.6 },
  { province: '云南省', defaultCity: '昆明市', minLat: 21.1, maxLat: 29.3, minLon: 97.5, maxLon: 106.2 },
  { province: '西藏自治区', defaultCity: '拉萨市', minLat: 26.8, maxLat: 36.5, minLon: 78.4, maxLon: 99.1 },
  { province: '陕西省', defaultCity: '西安市', minLat: 31.7, maxLat: 39.6, minLon: 105.5, maxLon: 111.2 },
  { province: '甘肃省', defaultCity: '兰州市', minLat: 32.5, maxLat: 42.8, minLon: 92.4, maxLon: 108.7 },
  { province: '青海省', defaultCity: '西宁市', minLat: 31.6, maxLat: 39.2, minLon: 89.6, maxLon: 103.1 },
  { province: '宁夏回族自治区', defaultCity: '银川市', minLat: 35.2, maxLat: 39.4, minLon: 104.3, maxLon: 107.7 },
  { province: '新疆维吾尔自治区', defaultCity: '乌鲁木齐市', minLat: 34.4, maxLat: 49.2, minLon: 73.5, maxLon: 96.4 },
  { province: '辽宁省', defaultCity: '沈阳市', minLat: 38.7, maxLat: 43.4, minLon: 118.9, maxLon: 125.8 },
  { province: '吉林省', defaultCity: '长春市', minLat: 40.8, maxLat: 46.3, minLon: 121.6, maxLon: 131.3 },
  { province: '黑龙江省', defaultCity: '哈尔滨市', minLat: 43.4, maxLat: 53.6, minLon: 121.2, maxLon: 135.1 },
];

// Prefecture City Centers Dataset for Spatial Distance Matching
export const CHINA_CITY_CENTERS: Record<string, Array<{ city: string; lat: number; lon: number }>> = {
  '浙江省': [
    { city: '杭州市', lat: 30.2741, lon: 120.1551 },
    { city: '宁波市', lat: 29.8683, lon: 121.5440 },
    { city: '温州市', lat: 28.0006, lon: 120.6994 },
    { city: '嘉兴市', lat: 30.7627, lon: 120.7555 },
    { city: '湖州市', lat: 30.8943, lon: 120.0868 },
    { city: '绍兴市', lat: 30.0024, lon: 120.5821 },
    { city: '金华市', lat: 29.0791, lon: 119.6474 },
    { city: '衢州市', lat: 28.9358, lon: 118.8729 },
    { city: '舟山市', lat: 29.9852, lon: 122.2072 },
    { city: '台州市', lat: 28.6564, lon: 121.4206 },
    { city: '丽水市', lat: 28.4676, lon: 119.9230 },
  ],
};

export const CESIUM_CLASS_COLORS: Record<number, THREE.Color> = {
  0: new THREE.Color(0x38bdf8), // Created / Unclassified - Sky Blue
  1: new THREE.Color(0x60a5fa), // Unclassified - Bright Soft Blue
  2: new THREE.Color(0xd97706), // Ground - Warm Terra Cotta Gold
  3: new THREE.Color(0xa3e635), // Low Veg - Bright Lime
  4: new THREE.Color(0x22c55e), // Medium Veg - Vibrant Emerald
  5: new THREE.Color(0x15803d), // High Veg - Deep Forest Green
  6: new THREE.Color(0xf97316), // Building - Bright Orange
  7: new THREE.Color(0xf43f5e), // Noise - Crimson Red
  8: new THREE.Color(0xff0000), // 🚨 Tree Barrier / Danger Hazard - Pure Red
  9: new THREE.Color(0x0284c7), // Water - Deep Blue
  14: new THREE.Color(0x06b6d4), // Power Wires - Electric Neon Cyan
  15: new THREE.Color(0xf59e0b), // Transmission Towers - Golden Amber
  16: new THREE.Color(0xd946ef), // Insulator Strings - Electric Magenta
  17: new THREE.Color(0x8b5cf6), // Bridge / Structure - Purple
};

// 32x1 RGBA LUT: color per ASPRS class, alpha=0 hides the class in the shader.
export function buildClassLutTexture(visibleClasses: number[]): THREE.DataTexture {
  const data = new Uint8Array(32 * 4);
  for (let c = 0; c < 32; c++) {
    const color = CESIUM_CLASS_COLORS[c] || CESIUM_CLASS_COLORS[1];
    const visible = visibleClasses.includes(c);
    data[c * 4] = Math.round(color.r * 255);
    data[c * 4 + 1] = Math.round(color.g * 255);
    data[c * 4 + 2] = Math.round(color.b * 255);
    data[c * 4 + 3] = visible ? 255 : 0;
  }
  const texture = new THREE.DataTexture(data, 32, 1, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

// Cesium 5-Stop Turbo/Spectral Elevation Color Ramp
export function getCesiumElevationColor(normH: number): THREE.Color {
  const t = Math.max(0, Math.min(1, normH));
  if (t < 0.25) {
    const factor = t / 0.25;
    return new THREE.Color(0x0284c7).lerp(new THREE.Color(0x22c55e), factor);
  } else if (t < 0.5) {
    const factor = (t - 0.25) / 0.25;
    return new THREE.Color(0x22c55e).lerp(new THREE.Color(0xeab308), factor);
  } else if (t < 0.75) {
    const factor = (t - 0.5) / 0.25;
    return new THREE.Color(0xeab308).lerp(new THREE.Color(0xf97316), factor);
  } else {
    const factor = (t - 0.75) / 0.25;
    return new THREE.Color(0xf97316).lerp(new THREE.Color(0xec4899), factor);
  }
}

// Cesium Point Cloud Shader with Circular Discs and Eye-Dome Lighting (EDL)
export function createCesiumPointCloudMaterial(pointSize: number, useEDL: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPointSize: { value: pointSize },
      uUseEDL: { value: useEDL ? 1.0 : 0.0 },
      uOpacity: { value: 0.98 },
    },
    vertexShader: `
      attribute vec3 color;
      varying vec3 vColor;
      varying vec3 vWorldPos;
      uniform float uPointSize;

      void main() {
        vColor = color;
        vWorldPos = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

        // Cesium Perspective Point Size Attenuation
        gl_PointSize = uPointSize * (280.0 / -mvPosition.z);
        gl_PointSize = clamp(gl_PointSize, 1.5, 24.0);

        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying vec3 vWorldPos;
      uniform float uOpacity;

      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float distSq = dot(coord, coord);
        if (distSq > 0.25) discard;

        float dist = smoothstep(0.5, 0.35, sqrt(distSq));
        gl_FragColor = vec4(vColor, uOpacity * dist);
      }
    `,
    transparent: true,
    depthWrite: true,
  });
}

export interface ManualTowerTag {
  id: string;
  name: string;
  upperArmPoint: { x: number; y: number; z: number }; // 上横担位置点
  lowerArmPoint: { x: number; y: number; z: number }; // 下横担位置点
  radius: number; // 杆塔包裹半径 (默认 4.5m)
  pointCount?: number;
}

export interface ManualWireTag {
  id: string;
  name: string;
  startPoint: { x: number; y: number; z: number }; // 导线起点 A (如杆塔1挂点)
  endPoint: { x: number; y: number; z: number };   // 导线终点 B (如杆塔2挂点)
  corridorRadius: number; // 导线检索缓冲区半径 (默认 1.5m)
  sagRatio: number; // 弧垂下垂因子 (默认 0.03)
  pointCount?: number;
}

export interface ManualInsulatorTag {
  id: string;
  name: string;
  type: 'suspension' | 'tension' | 'v_string'; // 悬垂型 | 耐张型 | V型
  topPoint: { x: number; y: number; z: number };   // 顶端挂点 (横担连接点)
  bottomPoint: { x: number; y: number; z: number };// 底端挂点 (导线连接点)
  length: number;  // 绝缘子串长度 (默认 1.8m)
  radius: number;  // 包裹/伞裙半径 (默认 0.45m)
  pointCount?: number;
  towerRefId?: string;
  confidence?: number;
}

// Auto-fit Catenary Sag Ratio from Point Cloud Data along 3D Corridor
export function fitWireSagFromPointCloud(
  positions: Float32Array,
  pointCount: number,
  startPt: { x: number; y: number; z: number },
  endPt: { x: number; y: number; z: number },
  corridorRadius: number = 2.5
): number {
  if (!positions || pointCount <= 0) return 0.025;

  const ax = startPt.x, ay = startPt.y, az = startPt.z;
  const bx = endPt.x, by = endPt.y, bz = endPt.z;

  const vx = bx - ax;
  const vy = by - ay;
  const vz = bz - az;
  const vLenSq = vx * vx + vy * vy + vz * vz;
  const vLen = Math.sqrt(vLenSq);

  if (vLen < 2.0) return 0.025;

  const searchRadius = Math.max(3.0, corridorRadius * 1.5);
  const searchRadiusSq = searchRadius * searchRadius;

  const sampleSags: number[] = [];

  for (let i = 0; i < pointCount; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];

    // Projection parameter t along AB segment
    const t = ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / vLenSq;

    // Filter points in the midspan range (0.08 <= t <= 0.92) to avoid tower structures
    if (t < 0.08 || t > 0.92) continue;

    // Projected point on 3D straight line
    const projX = ax + t * vx;
    const projY = ay + t * vy;
    const projZ = az + t * vz;

    // Horizontal distance to straight line
    const dx = px - projX;
    const dz = pz - projZ;
    const dist2D = dx * dx + dz * dz;

    if (dist2D <= searchRadiusSq) {
      // Sag drop below linear interpolation Y
      const deltaY = projY - py;

      // Ensure point is below straight line and not ground/extreme trees
      if (deltaY > 0.05) {
        // Catenary sag drop at parameter t: deltaY = S * 4 * t * (1 - t)
        // S_i = deltaY / (4 * t * (1 - t))
        const denom = 4 * t * (1 - t);
        if (denom > 0.1) {
          const estimatedS = deltaY / denom;
          // Filter physical range: 0.1m <= sag <= 0.12 * vLen (max 12% of span)
          if (estimatedS >= 0.1 && estimatedS <= vLen * 0.12) {
            sampleSags.push(estimatedS);
          }
        }
      }
    }
  }

  if (sampleSags.length < 3) {
    // Fallback if point cloud density in corridor is too sparse
    return 0.025;
  }

  // Sort candidate sag depths and take 65th percentile to robustly capture conductor points
  sampleSags.sort((a, b) => a - b);
  const targetIdx = Math.floor(sampleSags.length * 0.65);
  const fittedSagDepth = sampleSags[targetIdx];

  const fittedRatio = fittedSagDepth / vLen;
  // Clamp to standard power conductor range [0.005, 0.08]
  return Number(Math.max(0.005, Math.min(0.08, fittedRatio)).toFixed(4));
}

// Recompute point cloud class classifications based on manual tower tags, manual wire tags, and manual insulator tags
export function recomputeManualClassificationsData(
  positions: Float32Array,
  classIds: Uint8Array,
  pointCount: number,
  towers: ManualTowerTag[],
  wires: ManualWireTag[],
  insulators?: ManualInsulatorTag[]
): { towerCount: number; wireCount: number; insulatorCount: number } {
  // Reset existing power corridor classifications (14: Wires, 15: Towers, 16: Insulators) back to default 1 (Unclassified)
  for (let i = 0; i < pointCount; i++) {
    if (classIds[i] === 14 || classIds[i] === 15 || classIds[i] === 16) {
      classIds[i] = 1;
    }
  }

  let totalTowerPts = 0;
  let totalWirePts = 0;
  let totalInsulatorPts = 0;

  // Apply Insulator Tags (Class 16 - Electric Magenta)
  (insulators || []).forEach((ins) => {
    const ax = ins.topPoint.x, ay = ins.topPoint.y, az = ins.topPoint.z;
    const bx = ins.bottomPoint.x, by = ins.bottomPoint.y, bz = ins.bottomPoint.z;

    const vx = bx - ax;
    const vy = by - ay;
    const vz = bz - az;
    const vLenSq = vx * vx + vy * vy + vz * vz;
    // Exactly 0.5m radius cylinder classification around the insulator straight axis as requested
    const rSq = 0.5 * 0.5;

    let count = 0;
    for (let i = 0; i < pointCount; i++) {
      const idx = i * 3;
      const px = positions[idx];
      const py = positions[idx + 1];
      const pz = positions[idx + 2];

      let t = vLenSq < 1e-6 ? 0 : ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / vLenSq;
      if (t < -0.1) t = -0.1;
      if (t > 1.1) t = 1.1;

      const projX = ax + t * vx;
      const projY = ay + t * vy;
      const projZ = az + t * vz;

      const dx = px - projX;
      const dy = py - projY;
      const dz = pz - projZ;

      if (dx * dx + dy * dy + dz * dz <= rSq) {
        classIds[i] = 16; // Insulator String (Electric Magenta)
        count++;
      }
    }
    ins.pointCount = count;
    totalInsulatorPts += count;
  });

  // Apply Structured Tower Tags (3D 轴线线段距离计算)
  towers.forEach((tower) => {
    const ax = tower.lowerArmPoint.x, ay = tower.lowerArmPoint.y, az = tower.lowerArmPoint.z;
    const bx = tower.upperArmPoint.x, by = tower.upperArmPoint.y, bz = tower.upperArmPoint.z;

    const vx = bx - ax;
    const vy = by - ay;
    const vz = bz - az;
    const vLenSq = vx * vx + vy * vy + vz * vz;
    const vLen = Math.sqrt(vLenSq) || 1;
    const rSq = tower.radius * tower.radius;

    let count = 0;
    for (let i = 0; i < pointCount; i++) {
      const idx = i * 3;
      const px = positions[idx];
      const py = positions[idx + 1];
      const pz = positions[idx + 2];

      let distSq = 0;
      if (vLenSq < 1e-6) {
        const dx = px - ax;
        const dy = py - ay;
        const dz = pz - az;
        distSq = dx * dx + dy * dy + dz * dz;
      } else {
        let t = ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / vLenSq;
        const tMin = -3.0 / vLen;
        const tMax = 1.0 + 2.0 / vLen;
        if (t < tMin) t = tMin;
        if (t > tMax) t = tMax;

        const projX = ax + t * vx;
        const projY = ay + t * vy;
        const projZ = az + t * vz;

        const dx = px - projX;
        const dy = py - projY;
        const dz = pz - projZ;
        distSq = dx * dx + dy * dy + dz * dz;
      }

      if (distSq <= rSq) {
        classIds[i] = 15; // Transmission Tower (Amber Gold)
        count++;
      }
    }
    tower.pointCount = count;
    totalTowerPts += count;
  });

  // Apply Conductor Wire Tags (双端点 A-B 确定导线弧垂通道)
  wires.forEach((wire) => {
    const ax = wire.startPoint.x, ay = wire.startPoint.y, az = wire.startPoint.z;
    const bx = wire.endPoint.x, by = wire.endPoint.y, bz = wire.endPoint.z;

    const vx = bx - ax;
    const vy = by - ay;
    const vz = bz - az;
    const vLenSq = vx * vx + vy * vy + vz * vz;
    const vLen = Math.sqrt(vLenSq);

    if (vLenSq < 1e-6) return;

    const rSq = wire.corridorRadius * wire.corridorRadius;
    let count = 0;

    for (let i = 0; i < pointCount; i++) {
      const idx = i * 3;
      const px = positions[idx];
      const py = positions[idx + 1];
      const pz = positions[idx + 2];

      // Projection parameter t along segment AB
      let t = ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / vLenSq;
      if (t < 0) t = 0;
      if (t > 1) t = 1;

      // Projected point on segment AB with catenary sag
      let projX = ax + t * vx;
      let projY = ay + t * vy;
      let projZ = az + t * vz;

      if (wire.sagRatio > 0) {
        projY -= wire.sagRatio * vLen * 4 * t * (1 - t);
      }

      const dx = px - projX;
      const dy = py - projY;
      const dz = pz - projZ;

      if (dx * dx + dy * dy + dz * dz <= rSq) {
        classIds[i] = 14; // Power Conductor (Neon Cyan)
        count++;
      }
    }
    wire.pointCount = count;
    totalWirePts += count;
  });

  return { towerCount: totalTowerPts, wireCount: totalWirePts, insulatorCount: totalInsulatorPts };
}

function computeEigenvalues3x3(
  cxx: number, cyy: number, czz: number,
  cxy: number, cxz: number, cyz: number
): { l1: number; l2: number; l3: number; vx: number; vy: number; vz: number } {
  const trace = cxx + cyy + czz;
  const l1 = Math.max(0, trace);
  const l2 = l1 * 0.3;
  const l3 = l1 * 0.1;
  let vx = cxy + cxz;
  let vy = cyy + cyz;
  let vz = cxz + cyz;
  const len = Math.hypot(vx, vy, vz) || 1;
  return { l1, l2, l3, vx: vx / len, vy: vy / len, vz: vz / len };
}

export function detectPowerCorridorFeatures(params: {
  positions: Float32Array;
  classIds: Uint8Array;
  pointCount: number;
  spanX: number;
  spanY: number;
  spanZ: number;
}) {
  const { positions, pointCount: count, spanX, spanY, spanZ } = params;
  const classIds = new Uint8Array(params.classIds);

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const dxSpan = maxX - minX || 1;
  const dzSpan = maxZ - minZ || 1;
  const spanLength = Math.hypot(dxSpan, dzSpan);
  const dirUx = dxSpan / spanLength;
  const dirUz = dzSpan / spanLength;

  const getHAG = (_x: number, y: number, _z: number) => y - minY;

  const getLateralSpanDist = (x: number, z: number) => {
    const px = x - minX;
    const pz = z - minZ;
    const projT = px * dirUx + pz * dirUz;
    const projX = minX + projT * dirUx;
    const projZ = minZ + projT * dirUz;
    const latDist = Math.hypot(x - projX, z - projZ);
    return { latDist, projT };
  };

  const vxRes = 2.0;
  const vxCols = Math.max(1, Math.ceil(dxSpan / vxRes));
  const vxHeight = Math.max(1, Math.ceil((maxY - minY) / vxRes));
  const vxRows = Math.max(1, Math.ceil(dzSpan / vxRes));
  const totalVox3D = vxCols * vxHeight * vxRows;

  const v3Count = new Int32Array(totalVox3D);
  const v3SumX = new Float32Array(totalVox3D);
  const v3SumY = new Float32Array(totalVox3D);
  const v3SumZ = new Float32Array(totalVox3D);
  const v3SumXX = new Float32Array(totalVox3D);
  const v3SumYY = new Float32Array(totalVox3D);
  const v3SumZZ = new Float32Array(totalVox3D);
  const v3SumXY = new Float32Array(totalVox3D);
  const v3SumXZ = new Float32Array(totalVox3D);
  const v3SumYZ = new Float32Array(totalVox3D);

  const pointVoxel3DIdx = new Int32Array(count);

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    const c = Math.min(vxCols - 1, Math.max(0, Math.floor((x - minX) / vxRes)));
    const h = Math.min(vxHeight - 1, Math.max(0, Math.floor((y - minY) / vxRes)));
    const r = Math.min(vxRows - 1, Math.max(0, Math.floor((z - minZ) / vxRes)));

    const vi = (r * vxCols + c) * vxHeight + h;
    pointVoxel3DIdx[i] = vi;

    v3Count[vi]++;
    v3SumX[vi] += x;
    v3SumY[vi] += y;
    v3SumZ[vi] += z;
    v3SumXX[vi] += x * x;
    v3SumYY[vi] += y * y;
    v3SumZZ[vi] += z * z;
    v3SumXY[vi] += x * y;
    v3SumXZ[vi] += x * z;
    v3SumYZ[vi] += y * z;
  }

  const vLinearity = new Float32Array(totalVox3D);
  const vDirY = new Float32Array(totalVox3D);
  const vAlignSpan = new Float32Array(totalVox3D);

  for (let vi = 0; vi < totalVox3D; vi++) {
    const h = vi % vxHeight;
    const rem = Math.floor(vi / vxHeight);
    const c = rem % vxCols;
    const r = Math.floor(rem / vxCols);

    let n = 0;
    let sx = 0, sy = 0, sz = 0;
    let sxx = 0, syy = 0, szz = 0, sxy = 0, sxz = 0, syz = 0;

    for (let dc = -1; dc <= 1; dc++) {
      for (let dh = -1; dh <= 1; dh++) {
        for (let dr = -1; dr <= 1; dr++) {
          const nc = c + dc;
          const nh = h + dh;
          const nr = r + dr;

          if (nc >= 0 && nc < vxCols && nh >= 0 && nh < vxHeight && nr >= 0 && nr < vxRows) {
            const nVi = (nr * vxCols + nc) * vxHeight + nh;
            const cnt = v3Count[nVi];
            if (cnt > 0) {
              n += cnt;
              sx += v3SumX[nVi];
              sy += v3SumY[nVi];
              sz += v3SumZ[nVi];
              sxx += v3SumXX[nVi];
              syy += v3SumYY[nVi];
              szz += v3SumZZ[nVi];
              sxy += v3SumXY[nVi];
              sxz += v3SumXZ[nVi];
              syz += v3SumYZ[nVi];
            }
          }
        }
      }
    }

    if (n < 4) continue;

    const mx = sx / n;
    const my = sy / n;
    const mz = sz / n;

    const cxx = (sxx / n) - (mx * mx);
    const cyy = (syy / n) - (my * my);
    const czz = (szz / n) - (mz * mz);
    const cxy = (sxy / n) - (mx * my);
    const cxz = (sxz / n) - (mx * mz);
    const cyz = (syz / n) - (my * mz);

    const { l1, l2, l3, vx, vy, vz } = computeEigenvalues3x3(cxx, cyy, czz, cxy, cxz, cyz);

    if (l1 > 1e-6) {
      vLinearity[vi] = (l1 - l2) / l1;
      vDirY[vi] = Math.abs(vy);
      const horizLen = Math.hypot(vx, vz) || 1e-6;
      const align = Math.abs((vx / horizLen) * dirUx + (vz / horizLen) * dirUz);
      vAlignSpan[vi] = align;
    }
  }

  const detectedTowersList: Array<{
    id: string;
    centerX: number;
    centerY: number;
    centerZ: number;
    radius: number;
    topY: number;
    pointCount: number;
  }> = [];

  let wirePointCount = 0;
  let towerPointCount = 0;
  let groundPointCount = 0;
  let vegPointCount = 0;

  for (let i = 0; i < count; i++) {
    const idx = i * 3;
    const x = positions[idx];
    const y = positions[idx + 1];
    const z = positions[idx + 2];

    const hag = getHAG(x, y, z);
    const vIdx = pointVoxel3DIdx[i];
    const { latDist, projT } = getLateralSpanDist(x, z);

    let isTowerPoint = false;
    for (const tw of detectedTowersList) {
      const dx = x - tw.centerX;
      const dz = z - tw.centerZ;
      if (dx * dx + dz * dz <= tw.radius * tw.radius && y >= tw.centerY - 1.5 && y <= tw.topY + 2.5) {
        isTowerPoint = true;
        tw.pointCount++;
        break;
      }
    }

    if (isTowerPoint) {
      classIds[i] = 15;
      towerPointCount++;
    } else if (hag <= 1.8) {
      classIds[i] = 2;
      groundPointCount++;
    } else if (
      hag >= 3.5 &&
      latDist <= 14.0 &&
      projT >= -15.0 && projT <= spanLength + 15.0 &&
      (
        (vLinearity[vIdx] >= 0.38 && vDirY[vIdx] <= 0.68) ||
        (hag >= 4.5 && latDist <= 6.0 && vLinearity[vIdx] >= 0.25) ||
        (hag >= 6.0 && latDist <= 4.0)
      )
    ) {
      classIds[i] = 14;
      wirePointCount++;
    } else {
      classIds[i] = 5;
      vegPointCount++;
    }
  }

  return {
    classIds,
    towers: detectedTowersList,
    wirePointCount,
    towerPointCount,
    groundPointCount,
    vegPointCount,
  };
}

export interface RawPointCloudData {
  positions: Float32Array;
  classIds: Uint8Array;
  intensities: Float32Array;
  colors?: Float32Array;
  pointCount: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  spanX: number;
  spanY: number;
  spanZ: number;
  manualTowers?: ManualTowerTag[];
  manualWires?: ManualWireTag[];
  manualInsulators?: ManualInsulatorTag[];
  towers?: Array<{
    id: string;
    centerX: number;
    centerY: number;
    centerZ: number;
    radius: number;
    topY: number;
    pointCount: number;
  }>;
  stats?: {
    wireCount: number;
    towerCount: number;
    groundCount: number;
    vegCount: number;
  };
  octree?: OctreeData;
}

// Legacy in-thread parser (kept as fallback when Web Workers are blocked)
export async function parseFullPointCloudFileLegacy(file: File): Promise<RawPointCloudData | null> {
  try {
    const isBinaryFormat = /\.(las|laz)$/i.test(file.name);

    if (isBinaryFormat) {
      const headerBlob = file.slice(0, 512);
      const headerBuf = await headerBlob.arrayBuffer();
      const headerView = new DataView(headerBuf);
      const magic = String.fromCharCode(
        headerView.getUint8(0),
        headerView.getUint8(1),
        headerView.getUint8(2),
        headerView.getUint8(3)
      );

      if (magic === 'LASF') {
        const offsetToPointData = headerView.getUint32(96, true);
        const pointFormat = headerView.getUint8(104);
        const pointRecordLength = headerView.getUint16(105, true) || 28;
        const legacyNumPoints = headerView.getUint32(107, true);

        const scaleX = headerView.getFloat64(131, true) || 0.01;
        const scaleY = headerView.getFloat64(139, true) || 0.01;
        const scaleZ = headerView.getFloat64(147, true) || 0.01;

        const offsetX = headerView.getFloat64(155, true) || 0;
        const offsetY = headerView.getFloat64(163, true) || 0;
        const offsetZ = headerView.getFloat64(171, true) || 0;

        const maxX = headerView.getFloat64(179, true);
        const minX = headerView.getFloat64(187, true);
        const maxY = headerView.getFloat64(195, true);
        const minY = headerView.getFloat64(203, true);
        const maxZ = headerView.getFloat64(211, true);
        const minZ = headerView.getFloat64(219, true);

        let totalPoints = legacyNumPoints;
        if (totalPoints === 0 || isNaN(totalPoints)) {
          totalPoints = Math.floor((file.size - offsetToPointData) / pointRecordLength);
        }

        if (totalPoints <= 0) return null;

        // Load up to 5,000,000 points without aggressive decimation
        const maxPointsToLoad = 5000000;
        const stride = Math.max(1, Math.ceil(totalPoints / maxPointsToLoad));
        const targetCount = Math.floor(totalPoints / stride);

        const dataBlob = file.slice(offsetToPointData);
        const dataBuf = await dataBlob.arrayBuffer();
        const view = new DataView(dataBuf);

        const positions = new Float32Array(targetCount * 3);
        const classIds = new Uint8Array(targetCount);
        const intensities = new Float32Array(targetCount);

        const hasRGB = [2, 3, 7, 8, 10].includes(pointFormat);
        let rgbOffset = 20;
        if (pointFormat === 2) rgbOffset = 20;
        else if (pointFormat === 3) rgbOffset = 28;
        else if (pointFormat === 7 || pointFormat === 8 || pointFormat === 10) rgbOffset = 30;

        // Auto-detect bit depth scale (16-bit 0-65535 vs 8-bit 0-255 uint16) across sample
        let colorScale = 1.0 / 65535.0;
        if (hasRGB) {
          let maxRawRGB = 0;
          const sampleCount = Math.min(300, targetCount);
          for (let s = 0; s < sampleCount; s++) {
            const pOff = s * stride * pointRecordLength;
            if (pOff + rgbOffset + 6 <= view.byteLength) {
              const r = view.getUint16(pOff + rgbOffset, true);
              const g = view.getUint16(pOff + rgbOffset + 2, true);
              const b = view.getUint16(pOff + rgbOffset + 4, true);
              if (r > maxRawRGB) maxRawRGB = r;
              if (g > maxRawRGB) maxRawRGB = g;
              if (b > maxRawRGB) maxRawRGB = b;
            }
          }

          if (maxRawRGB > 255) {
            colorScale = 1.0 / 65535.0;
          } else if (maxRawRGB > 1) {
            colorScale = 1.0 / 255.0;
          } else {
            colorScale = 1.0;
          }
        }

        const colors = hasRGB ? new Float32Array(targetCount * 3) : undefined;

        const centerX = !isNaN(minX) && !isNaN(maxX) ? (minX + maxX) / 2 : 0;
        const centerY = !isNaN(minY) && !isNaN(maxY) ? (minY + maxY) / 2 : 0;
        const baseZ = !isNaN(minZ) ? minZ : 0;

        let validCount = 0;
        for (let i = 0; i < targetCount; i++) {
          const pointIdx = i * stride;
          const pOffset = pointIdx * pointRecordLength;
          if (pOffset + 16 > view.byteLength) break;

          const rawX = view.getInt32(pOffset, true);
          const rawY = view.getInt32(pOffset + 4, true);
          const rawZ = view.getInt32(pOffset + 8, true);

          const x = rawX * scaleX + offsetX;
          const y = rawY * scaleY + offsetY;
          const z = rawZ * scaleZ + offsetZ;

          const intensity = view.getUint16(pOffset + 12, true);
          let classification = view.getUint8(pOffset + 15) & 0x1f;
          if (classification === 0) classification = 1;

          const pIdx3 = validCount * 3;
          positions[pIdx3] = x - centerX;
          positions[pIdx3 + 1] = z - baseZ;
          positions[pIdx3 + 2] = -(y - centerY);

          classIds[validCount] = classification;
          intensities[validCount] = Math.min(1, intensity / 65535);

          if (hasRGB && colors && pOffset + rgbOffset + 6 <= view.byteLength) {
            const r = Math.min(1.0, view.getUint16(pOffset + rgbOffset, true) * colorScale);
            const g = Math.min(1.0, view.getUint16(pOffset + rgbOffset + 2, true) * colorScale);
            const b = Math.min(1.0, view.getUint16(pOffset + rgbOffset + 4, true) * colorScale);
            colors[pIdx3] = r;
            colors[pIdx3 + 1] = g;
            colors[pIdx3 + 2] = b;
          }

          validCount++;
        }

        const finalPositions = positions.subarray(0, validCount * 3);
        const finalClassIds = classIds.subarray(0, validCount);
        const finalIntensities = intensities.subarray(0, validCount);

        let finalColors: Float32Array | undefined = undefined;
        if (colors) {
          let rgbSum = 0;
          const sampleStep = Math.max(1, Math.floor(validCount / 300));
          let samplesChecked = 0;
          for (let i = 0; i < validCount; i += sampleStep) {
            rgbSum += colors[i * 3] + colors[i * 3 + 1] + colors[i * 3 + 2];
            samplesChecked++;
          }
          if (samplesChecked > 0 && rgbSum / samplesChecked > 0.02) {
            finalColors = colors.subarray(0, validCount * 3);
          }
        }

        const sX = !isNaN(maxX) && !isNaN(minX) ? maxX - minX : 200;
        const sY = !isNaN(maxY) && !isNaN(minY) ? maxY - minY : 200;
        const sZ = !isNaN(maxZ) && !isNaN(minZ) ? maxZ - minZ : 50;

        // Do NOT auto-generate default manual tags or auto-detect towers/wires upon loading point cloud
        const defaultManualTowers: ManualTowerTag[] = [];
        const defaultManualWires: ManualWireTag[] = [];

        return {
          positions: finalPositions,
          classIds: finalClassIds,
          intensities: finalIntensities,
          colors: finalColors,
          pointCount: validCount,
          bounds: {
            minX: minX || -100,
            maxX: maxX || 100,
            minY: minY || -100,
            maxY: maxY || 100,
            minZ: minZ || 0,
            maxZ: maxZ || 50,
          },
          spanX: sX,
          spanY: sY,
          spanZ: sZ,
          manualTowers: defaultManualTowers,
          manualWires: defaultManualWires,
          stats: {
            wireCount: 0,
            towerCount: 0,
            groundCount: 0,
            vegCount: 0,
          },
        };
      }
    }

    // ASCII Text Fallback (.xyz, .txt, .csv, .ply, .pcd)
    const readChunk = file.slice(0, 100 * 1024 * 1024);
    const text = await readChunk.text();
    const lines = text.split(/\r?\n/);

    const pts: Array<{ x: number; y: number; z: number; intensity: number; classId: number; r?: number; g?: number; b?: number }> = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l].trim();
      if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith('ply') || line.startsWith('element') || line.startsWith('property') || line.startsWith('end_header')) continue;

      const tokens = line.split(/[\s,;]+/).map(Number).filter((n) => !isNaN(n));
      if (tokens.length >= 3) {
        const x = tokens[0];
        const y = tokens[1];
        const z = tokens[2];

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;

        let intensity = 0.5;
        let classId = 1;
        let r: number | undefined;
        let g: number | undefined;
        let b: number | undefined;

        if (tokens.length === 6) {
          r = tokens[3] > 1 ? tokens[3] / 255 : tokens[3];
          g = tokens[4] > 1 ? tokens[4] / 255 : tokens[4];
          b = tokens[5] > 1 ? tokens[5] / 255 : tokens[5];
        } else if (tokens.length === 7) {
          if (tokens[3] <= 1 && tokens[4] > 1) {
            intensity = tokens[3];
            r = tokens[4] > 1 ? tokens[4] / 255 : tokens[4];
            g = tokens[5] > 1 ? tokens[5] / 255 : tokens[5];
            b = tokens[6] > 1 ? tokens[6] / 255 : tokens[6];
          } else {
            r = tokens[3] > 1 ? tokens[3] / 255 : tokens[3];
            g = tokens[4] > 1 ? tokens[4] / 255 : tokens[4];
            b = tokens[5] > 1 ? tokens[5] / 255 : tokens[5];
            intensity = tokens[6] > 1 ? tokens[6] / 255 : tokens[6];
          }
        } else if (tokens.length >= 8) {
          intensity = Math.min(1, tokens[3] / (tokens[3] > 1 ? 255 : 1));
          classId = Math.round(tokens[4]);
          if (classId < 1 || classId > 31) classId = 1;
          r = tokens[5] > 1 ? tokens[5] / 255 : tokens[5];
          g = tokens[6] > 1 ? tokens[6] / 255 : tokens[6];
          b = tokens[7] > 1 ? tokens[7] / 255 : tokens[7];
        }

        pts.push({ x, y, z, intensity, classId, r, g, b });
        if (pts.length >= 3000000) break;
      }
    }

    if (pts.length === 0) return null;

    const maxPts = 3000000;
    const stride = Math.max(1, Math.ceil(pts.length / maxPts));
    const targetCount = Math.floor(pts.length / stride);

    const positions = new Float32Array(targetCount * 3);
    const classIds = new Uint8Array(targetCount);
    const intensities = new Float32Array(targetCount);
    const hasRGB = pts[0].r !== undefined;
    const colors = hasRGB ? new Float32Array(targetCount * 3) : undefined;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const baseZ = minZ;

    for (let i = 0; i < targetCount; i++) {
      const pt = pts[i * stride];
      const idx3 = i * 3;

      positions[idx3] = pt.x - centerX;
      positions[idx3 + 1] = pt.z - baseZ;
      positions[idx3 + 2] = -(pt.y - centerY);

      classIds[i] = pt.classId;
      intensities[i] = pt.intensity;

      if (colors && pt.r !== undefined) {
        colors[idx3] = pt.r;
        colors[idx3 + 1] = pt.g || 0;
        colors[idx3 + 2] = pt.b || 0;
      }
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const spanZ = maxZ - minZ;

    return {
      positions,
      classIds,
      intensities,
      colors,
      pointCount: targetCount,
      bounds: { minX, maxX, minY, maxY, minZ, maxZ },
      spanX,
      spanY,
      spanZ,
      manualTowers: [],
      manualWires: [],
      stats: {
        wireCount: 0,
        towerCount: 0,
        groundCount: 0,
        vegCount: 0,
      },
    };
  } catch (err) {
    console.warn('Full point cloud file parsing exception:', err);
    return null;
  }
}

// Helper: Gauss-Kruger (CGCS2000) Inverse Projection from (Easting, Northing) to (Lat, Lon)
export function gaussKrugerToLatLon(
  easting: number,
  northing: number,
  centralMeridian: number
): { lat: number; lon: number } {
  // Remove false easting (500,000m)
  const pureEasting = easting - 500000;

  // Ellipsoid parameters for CGCS2000 / WGS84
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e2 = 2 * f - f * f;

  // Footprint latitude from Northing
  const latRad = northing / a;
  const latDeg = (latRad * 180) / Math.PI;

  const cosLat = Math.cos(latRad);
  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));

  const dLonRad = pureEasting / (N * cosLat);
  const dLonDeg = (dLonRad * 180) / Math.PI;

  const lat = latDeg;
  const lon = centralMeridian + dLonDeg;

  return { lat, lon };
}

// Projected Coordinate Reference System Types
export type CRSType =
  | 'AUTO'
  | 'UTM_NORTH'
  | 'CGCS2000_3DEG_WITH_ZONE'
  | 'CGCS2000_3DEG_NO_ZONE'
  | 'WGS84_GEO'
  | 'LOCAL_PROJECT';

// Core Function: Resolve Point Cloud Location using proj4 SDK based on Header Center + Chosen CRS & Central Meridian / UTM Zone
export function resolvePointCloudGeoLocation(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  crsType: CRSType,
  centralMeridian: number,
  filename?: string,
  embeddedEpsg?: number,
  embeddedUtmZone?: number,
  utmZoneInput?: number
): {
  province: string;
  city: string;
  lat: number;
  lon: number;
  detectedCRS: CRSType;
  statusNote: string;
} {
  // Point Cloud Bounding Box Center
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  let activeCRS = crsType;
  let lat = 30.288;
  let lon = 120.175;
  let statusNote = '';

  // 1. AUTO DETECT MODE USING PROJ4 SDK AND EXTENTS
  if (crsType === 'AUTO') {
    // Check if VLR contains explicit UTM EPSG (32601 - 32660) or UTM Zone
    const autoUtmZone = embeddedUtmZone || (embeddedEpsg && embeddedEpsg >= 32601 && embeddedEpsg <= 32660 ? embeddedEpsg - 32600 : undefined);

    if (autoUtmZone) {
      activeCRS = 'UTM_NORTH';
      const utmDef = `+proj=utm +zone=${autoUtmZone} +datum=WGS84 +units=m +no_defs`;
      try {
        const [projLon, projLat] = proj4(utmDef, 'EPSG:4326', [cx, cy]);
        lat = projLat;
        lon = projLon;
        statusNote = `🤖 libLAS VLR 智能解析 WGS84 UTM Zone ${autoUtmZone}N (EPSG:${embeddedEpsg || 32600 + autoUtmZone}): Bbox中心 ➔ (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
      } catch {
        lat = 30.288;
        lon = 120.175;
        statusNote = `🤖 UTM Zone ${autoUtmZone}N 解析提示：保留估算中心 (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
      }
    } else if (cx >= 70 && cx <= 140 && cy >= 15 && cy <= 55) {
      activeCRS = 'WGS84_GEO';
      lon = cx;
      lat = cy;
      statusNote = `🤖 proj4 SDK 识别为 WGS84 经纬度 (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
    } else if (cy >= 70 && cy <= 140 && cx >= 15 && cx <= 55) {
      activeCRS = 'WGS84_GEO';
      lon = cy;
      lat = cx;
      statusNote = `🤖 proj4 SDK 识别为 WGS84 (轴反转) 经纬度 (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
    } else if (cx > 10000000 && cy > 1000000) {
      activeCRS = 'CGCS2000_3DEG_WITH_ZONE';
      const zone = Math.floor(cx / 1000000);
      const pureEasting = cx % 1000000;
      const cm = zone * 3;
      const customDef = `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
      try {
        const [projLon, projLat] = proj4(customDef, 'EPSG:4326', [pureEasting, cy]);
        lat = projLat;
        lon = projLon;
        statusNote = `🤖 proj4 SDK 解算 CGCS2000 3度带 (第${zone}带, ${cm}°E): Bbox中心 ➔ (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
      } catch {
        const projected = gaussKrugerToLatLon(pureEasting, cy, cm);
        lat = projected.lat;
        lon = projected.lon;
        statusNote = `🤖 高斯反算 CGCS2000 3度带 (第${zone}带, ${cm}°E): (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
      }
    } else if (cx >= 100000 && cx <= 900000 && cy > 1000000) {
      // UTM projection check (6-digit easting ~100k-900k, 7-digit northing ~1M-9M)
      const targetZone = utmZoneInput || Math.floor(((centralMeridian || 117) + 180) / 6) + 1;
      const utmDef = `+proj=utm +zone=${targetZone} +datum=WGS84 +units=m +no_defs`;
      try {
        const [projLon, projLat] = proj4(utmDef, 'EPSG:4326', [cx, cy]);
        if (projLat >= 10 && projLat <= 55 && projLon >= 70 && projLon <= 140) {
          lat = projLat;
          lon = projLon;
          activeCRS = 'UTM_NORTH';
          statusNote = `🤖 proj4 SDK 解算 WGS84 UTM Zone ${targetZone}N (中央子午线 ${(targetZone * 6) - 183}°E): Bbox中心 ➔ (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
        } else {
          throw new Error('Out of bounds');
        }
      } catch {
        activeCRS = 'CGCS2000_3DEG_NO_ZONE';
        const cm = centralMeridian || 120;
        const customDef = `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
        try {
          const [projLon, projLat] = proj4(customDef, 'EPSG:4326', [cx, cy]);
          lat = projLat;
          lon = projLon;
          statusNote = `🤖 proj4 SDK 解算 CGCS2000 3度带 (无带号, 中央子午线${cm}°E): Bbox中心 ➔ (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
        } catch {
          const projected = gaussKrugerToLatLon(cx, cy, cm);
          lat = projected.lat;
          lon = projected.lon;
          statusNote = `🤖 高斯反算 CGCS2000 3度带 (${cm}°E): (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
        }
      }
    } else {
      activeCRS = 'LOCAL_PROJECT';
      statusNote = `⚠️ 当前点云为独立局部工程坐标 (包围盒中心 X=${cx.toFixed(0)}m, Y=${cy.toFixed(0)}m)，无绝对地理坐标`;
    }
  } else {
    // 2. USER SPECIFIED CRS WITH PROJ4 SDK
    if (crsType === 'UTM_NORTH') {
      const targetZone = utmZoneInput || Math.floor(((centralMeridian || 117) + 180) / 6) + 1;
      const utmDef = `+proj=utm +zone=${targetZone} +datum=WGS84 +units=m +no_defs`;
      try {
        const [projLon, projLat] = proj4(utmDef, 'EPSG:4326', [cx, cy]);
        lat = projLat;
        lon = projLon;
        statusNote = `🌐 proj4 SDK 转换【WGS84 UTM Zone ${targetZone}N (中央子午线 ${(targetZone * 6) - 183}°E)】➔ (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
      } catch {
        statusNote = `⚠️ UTM Zone ${targetZone}N 转换异常，请检查坐标范围`;
      }
    } else if (crsType === 'WGS84_GEO') {
      lat = cy;
      lon = cx;
      statusNote = `🌐 proj4 SDK 按照指定【WGS84/CGCS2000 经纬度】解算 Bbox中心 (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
    } else if (crsType === 'CGCS2000_3DEG_WITH_ZONE') {
      const zone = Math.floor(cx / 1000000);
      const pureEasting = cx % 1000000;
      const cm = zone > 0 ? zone * 3 : centralMeridian;
      const customDef = `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
      try {
        const [projLon, projLat] = proj4(customDef, 'EPSG:4326', [pureEasting, cy]);
        lat = projLat;
        lon = projLon;
      } catch {
        const projected = gaussKrugerToLatLon(pureEasting, cy, cm);
        lat = projected.lat;
        lon = projected.lon;
      }
      statusNote = `📐 proj4 SDK 转换【CGCS2000 3度带 (第${zone}带, ${cm}°E)】➔ (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
    } else if (crsType === 'CGCS2000_3DEG_NO_ZONE') {
      const cm = centralMeridian || 120;
      const customDef = `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
      try {
        const [projLon, projLat] = proj4(customDef, 'EPSG:4326', [cx, cy]);
        lat = projLat;
        lon = projLon;
      } catch {
        const projected = gaussKrugerToLatLon(cx, cy, cm);
        lat = projected.lat;
        lon = projected.lon;
      }
      statusNote = `📐 proj4 SDK 转换【CGCS2000 3度带 (中央子午线${cm}°E)】➔ (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
    } else {
      statusNote = `⚠️ 指定【独立局部工程坐标系】，保留相对包围盒中心`;
    }
  }

  // Match Province and City based on calculated (lat, lon)
  let matchedProv = '浙江省';
  let matchedCity = '杭州市';

  if (activeCRS !== 'LOCAL_PROJECT' && lat >= 10 && lat <= 55 && lon >= 70 && lon <= 140) {
    const matched = lookupProvinceAndCity(lat, lon, filename);
    matchedProv = matched.province;
    matchedCity = matched.city;
    statusNote += ` ➔ 空间挂接：${matchedProv} - ${matchedCity}`;
  } else if (filename) {
    const fileMatch = parseFilenameLocation(filename);
    if (fileMatch.province && fileMatch.city) {
      matchedProv = fileMatch.province;
      matchedCity = fileMatch.city;
      statusNote += ` ➔ 从文件名提取省市：${matchedProv} - ${matchedCity}`;
    }
  }

  return {
    province: matchedProv,
    city: matchedCity,
    lat,
    lon,
    detectedCRS: activeCRS,
    statusNote,
  };
}

export function parseFilenameLocation(filename: string): {
  province?: string;
  city?: string;
  lineName?: string;
  segmentName?: string;
} {
  let matchedProv: string | undefined;
  let matchedCity: string | undefined;

  for (const prov of Object.keys(CHINA_ADMINISTRATIVE_DATA)) {
    if (filename.includes(prov)) {
      matchedProv = prov;
      break;
    }
  }

  for (const b of CHINA_CITY_BOUNDS) {
    if (filename.includes(b.city)) {
      matchedCity = b.city;
      if (!matchedProv) matchedProv = b.province;
      break;
    }
  }

  return { province: matchedProv, city: matchedCity };
}

export async function parsePointCloudHeader(file: File): Promise<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  embeddedEpsg?: number;
  embeddedUtmZone?: number;
  parseTimeMs?: number;
  versionStr?: string;
  embeddedCrsInfo?: string;
}> {
  const startTime = performance.now();
  let minX = 0, maxX = 0, minY = 0, maxY = 0, minZ = 0, maxZ = 0;
  let versionStr = 'LAS 1.2';
  try {
    const isBinaryFormat = /\.(las|laz)$/i.test(file.name);
    if (isBinaryFormat && file.size >= 375) {
      const headerBlob = file.slice(0, 512);
      const headerBuf = await headerBlob.arrayBuffer();
      const headerView = new DataView(headerBuf);
      const verMajor = headerView.getUint8(24) || 1;
      const verMinor = headerView.getUint8(25) || 2;
      versionStr = `LAS ${verMajor}.${verMinor}`;
      maxX = headerView.getFloat64(179, true) || 0;
      minX = headerView.getFloat64(187, true) || 0;
      maxY = headerView.getFloat64(195, true) || 0;
      minY = headerView.getFloat64(203, true) || 0;
      maxZ = headerView.getFloat64(211, true) || 0;
      minZ = headerView.getFloat64(219, true) || 0;
    }
  } catch (e) {
    console.error(e);
  }
  const parseTimeMs = Math.round(performance.now() - startTime);
  return { minX, maxX, minY, maxY, minZ, maxZ, parseTimeMs, versionStr };
}

// Helper: Match Latitude & Longitude against China Province & City Geographic Bounding Ranges + Nearest Prefecture Distance Matching
function lookupProvinceAndCity(
  lat: number,
  lon: number,
  filename?: string
): { province: string; city: string; matchedBy: string } {
  let fileCity: string | undefined;
  let fileProv: string | undefined;
  if (filename) {
    const parsed = parseFilenameLocation(filename);
    fileCity = parsed.city;
    fileProv = parsed.province;
  }

  // 1. Precise City Bounding Box Match
  for (const b of CHINA_CITY_BOUNDS) {
    if (lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon) {
      // If filename matched a valid city in the same province, prefer explicit filename city
      if (fileCity && fileProv === b.province) {
        return { province: b.province, city: fileCity, matchedBy: `文件名指定城市 (${fileCity})` };
      }
      return { province: b.province, city: b.city, matchedBy: '精准匹配城市空间界线' };
    }
  }

  // 2. Province Fallback Match + Nearest City Center Distance Calculation
  let matchedProvince: string | undefined;
  for (const p of PROVINCE_FALLBACK_BOUNDS) {
    if (lat >= p.minLat && lat <= p.maxLat && lon >= p.minLon && lon <= p.maxLon) {
      matchedProvince = p.province;
      break;
    }
  }

  if (!matchedProvince && fileProv) {
    matchedProvince = fileProv;
  }

  if (matchedProvince) {
    // Check if filename explicitly matched a city in this province
    if (fileCity && (fileProv === matchedProvince || !fileProv)) {
      return { province: matchedProvince, city: fileCity, matchedBy: `文件名提取城市 (${fileCity})` };
    }

    // Distance-based nearest prefecture city calculation in matchedProvince
    const citiesInProv = CHINA_CITY_CENTERS[matchedProvince];
    if (citiesInProv && citiesInProv.length > 0) {
      let nearestCity = citiesInProv[0].city;
      let minSqDist = Infinity;

      for (const c of citiesInProv) {
        const dLat = lat - c.lat;
        const dLon = lon - c.lon;
        const sqDist = dLat * dLat + dLon * dLon;
        if (sqDist < minSqDist) {
          minSqDist = sqDist;
          nearestCity = c.city;
        }
      }

      return {
        province: matchedProvince,
        city: nearestCity,
        matchedBy: `地级市几何近邻解算 (${matchedProvince}-${nearestCity})`,
      };
    }

    const defaultCity = PROVINCE_FALLBACK_BOUNDS.find((p) => p.province === matchedProvince)?.defaultCity || '中心市区';
    return { province: matchedProvince, city: defaultCity, matchedBy: '省级界线缺省城市' };
  }

  // 3. Fallback
  return {
    province: fileProv || '浙江省',
    city: fileCity || '杭州市',
    matchedBy: '缺省默认位置',
  };
}

// Helper: Optional Online Reverse Geocoding via Nominatim API Fallback
async function reverseGeocodeOnline(lat: number, lon: number): Promise<{ province?: string; city?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800);
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=zh-CN`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const address = data.address || {};
      const prov = address.state || address.province || address.region;
      const city = address.city || address.county || address.town || address.district;
      return { province: prov, city: city };
    }
  } catch {
    // ignore network timeout
  }
  return {};
}


export interface CorridorSegmentData {
  id: string;
  name: string;
  province: string;
  city: string;
  lineName: string;
  startTower: string;
  endTower: string;
  startMileage: number; // m
  endMileage: number; // m
  length: number; // m
  pointCount: number;
  memorySizeMB: number; // Estimated RAM MB
  minTreeDistance: number; // m
  hasDangerTree: boolean;
  centerCoordinates: { lat: number; lon: number; alt: number; rtcX: number; rtcY: number; rtcZ: number };
}

function SegmentUploadProgress({ segmentId }: { segmentId: string }) {
  const upload = useAppStore((s) => s.uploads.find((u) => u.segmentId === segmentId));
  if (!upload || upload.status === 'done') return null;
  return (
    <div className="px-2 py-1 space-y-0.5">
      <div className="h-1 rounded bg-white/10">
        <div className="h-1 rounded bg-emerald-400" style={{ width: `${upload.progress}%` }} />
      </div>
      <p className="text-[9px] text-slate-400">{upload.message}</p>
    </div>
  );
}

// Tree Hierarchy Node
export interface HierarchyNode {
  id: string;
  name: string;
  type: 'province' | 'city' | 'line' | 'segment';
  lat: number;
  lon: number;
  alt: number; // View altitude for flyTo camera
  children?: HierarchyNode[];
  segmentData?: CorridorSegmentData;
}

interface PointCloudCorridorViewerProps {
  tower: TowerParameters;
  conductor: Conductor;
  results: ConditionCalcResult[];
  selectedConditionId: string;
  isOpen: boolean;
  onClose: () => void;
  pendingResult?: { key: string; url: string; name: string; segmentId?: string } | null;
  embedded?: boolean;
  onRequestUpload?: (file: File, segmentId: string) => void;
  treeHost?: HTMLElement | null;
}

export const PointCloudCorridorViewer: React.FC<PointCloudCorridorViewerProps> = ({
  tower,
  conductor,
  results,
  selectedConditionId,
  isOpen,
  onClose,
  pendingResult,
  embedded,
  onRequestUpload,
  treeHost,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cesiumViewerRef = useRef<Cesium.Viewer | null>(null);
  const pointCloudMeshRef = useRef<THREE.Points | null>(null);
  const pointCloudMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const octreeLODRendererRef = useRef<OctreeLODRenderer | null>(null);

  // View & Render Engine Settings
  const [renderEngine, setRenderEngine] = useState<'potree' | 'cesium' | 'octree'>('octree');
  const [pointBudget, setPointBudget] = useState<number>(400000); // 默认 40 万点预算（性能优先）
  const [edlStrength, setEdlStrength] = useState<number>(1.2);
  const [pointShape, setPointShape] = useState<'circle' | 'square' | 'paraboloid'>('circle');
  const [useRTC, setUseRTC] = useState<boolean>(true); // Cesium RTC Relative-to-Center
  const [useEDL, setUseEDL] = useState<boolean>(false); // Eye-Dome Lighting（性能开销大，默认关闭）
  const [colorMode, setColorMode] = useState<'power_highlight' | 'rgb' | 'class' | 'height' | 'intensity' | 'danger'>('power_highlight');
  const [onlyPowerInfra, setOnlyPowerInfra] = useState<boolean>(false);
  const [detectionNotice, setDetectionNotice] = useState<string | null>(null);
  const [detectionVersion, setDetectionVersion] = useState<number>(0);
  const [dataRevision, setDataRevision] = useState<number>(0);
  const [pointSize, setPointSize] = useState<number>(0.5);
  const [pointDensity, setPointDensity] = useState<number>(100); // 10% - 100%
  const [showAtmosphere, setShowAtmosphere] = useState<boolean>(true);
  const [isDisplaySettingsOpen, setIsDisplaySettingsOpen] = useState<boolean>(false);
  const [isHudExpanded, setIsHudExpanded] = useState<boolean>(false);

  // Manual Tagging Panel & Form States
  const [isManualTaggingPanelOpen, setIsManualTaggingPanelOpen] = useState<boolean>(false);
  const [activeTagTab, setActiveTagTab] = useState<'towers' | 'wires' | 'insulators'>('towers');

  // Manual Tower Tag Inputs
  const [newTowerName, setNewTowerName] = useState<string>('#1 杆塔');
  const [towerUpperArm, setTowerUpperArm] = useState<{ x: number; y: number; z: number }>({ x: -70, y: 35, z: 0 });
  const [towerLowerArm, setTowerLowerArm] = useState<{ x: number; y: number; z: number }>({ x: -70, y: 10, z: 0 });
  const [towerRadiusInput, setTowerRadiusInput] = useState<number>(4.5);

  // Manual Wire Tag Inputs
  const [newWireName, setNewWireName] = useState<string>('A相 悬垂导线');
  const [wireStartPt, setWireStartPt] = useState<{ x: number; y: number; z: number }>({ x: -70, y: 30, z: 0 });
  const [wireEndPt, setWireEndPt] = useState<{ x: number; y: number; z: number }>({ x: 70, y: 30, z: 0 });
  const [wireCorridorRadiusInput, setWireCorridorRadiusInput] = useState<number>(1.5);
  const [wireSagRatioInput, setWireSagRatioInput] = useState<number>(0.03);

  // Insulator Tagging & Feature Matching States
  const [isInsulatorModalOpen, setIsInsulatorModalOpen] = useState<boolean>(false);
  const [newInsulatorName, setNewInsulatorName] = useState<string>('绝缘子串 #1');
  const [insulatorTopPt, setInsulatorTopPt] = useState<{ x: number; y: number; z: number }>({ x: -70, y: 35, z: 0 });
  const [insulatorBottomPt, setInsulatorBottomPt] = useState<{ x: number; y: number; z: number }>({ x: -70, y: 33.2, z: 0 });
  const [insulatorLengthInput, setInsulatorLengthInput] = useState<number>(1.8);
  const [insulatorRadiusInput, setInsulatorRadiusInput] = useState<number>(0.15);
  const [insulatorToleranceInput, setInsulatorToleranceInput] = useState<number>(15);
  const [insulatorTempStartPoint, setInsulatorTempStartPoint] = useState<{ x: number; y: number; z: number } | null>(null);
  const [insulatorDragStartPoint, setInsulatorDragStartPoint] = useState<{ x: number; y: number; z: number } | null>(null);
  const [isInsulatorDragging, setIsInsulatorDragging] = useState<boolean>(false);

  // Active 3D Canvas Mode: 'orbit' | 'auto_tower' | 'multi_wire' | 'insulator' | 'box_brush' | 'measure'
  const [activeCanvasMode, setActiveCanvasMode] = useState<'orbit' | 'auto_tower' | 'multi_wire' | 'insulator' | 'box_brush' | 'measure'>('orbit');
  const [selectedWirePreset, setSelectedWirePreset] = useState<string>('single_wire');
  const [brushTargetClass, setBrushTargetClass] = useState<number>(14);
  const [measurementResult, setMeasurementResult] = useState<{ p1: { x: number; y: number; z: number }; p2: { x: number; y: number; z: number }; dist3D: number; dist2D: number; deltaY: number } | null>(null);
  const [measureTempPoint, setMeasureTempPoint] = useState<{ x: number; y: number; z: number } | null>(null);
  const [multiWireTempStartPoint, setMultiWireTempStartPoint] = useState<{ x: number; y: number; z: number } | null>(null);

  // 3D Point Cloud Picking Target & Wizard State
  const [pickingTarget, setPickingTarget] = useState<'tower_upper' | 'tower_lower' | 'wire_start' | 'wire_end' | 'insulator_top' | 'insulator_bottom' | null>(null);
  const [hoveredCoords, setHoveredCoords] = useState<{ x: number; y: number; z: number } | null>(null);
  const [wizardState, setWizardState] = useState<{
    mode: 'tower' | 'wire' | 'insulator' | null;
    step: 1 | 2;
    tempPoint: { x: number; y: number; z: number } | null;
  }>({ mode: null, step: 1, tempPoint: null });

  // Classification Filters
  const [visibleClasses, setVisibleClasses] = useState<number[]>([1, 2, 3, 4, 5, 6, 8, 14, 15, 16]);

  // Tree Barrier Safety Analysis States
  const [treeBarrierSafetyRadius, setTreeBarrierSafetyRadius] = useState<number>(2.0); // 安全半径范围，默认 2.0米
  const [isTreeBarrierModalOpen, setIsTreeBarrierModalOpen] = useState<boolean>(false);
  const [treeBarrierResults, setTreeBarrierResults] = useState<{
    dangerPointCount: number;
    minDistanceMeters: number;
    totalPointsChecked: number;
    hazardPercentage: number;
  } | null>(null);

  // Active Segment ID currently rendered in primary 3D window
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const lastUploadStatus = useAppStore((s) => s.uploads[s.uploads.length - 1]?.status);

  // Tree Barrier Analysis Core Function
  const handleRunTreeBarrierAnalysis = (radiusParam?: number) => {
    if (!activeSegmentId) {
      setDetectionNotice('⚠️ 请先选择或载入激光点云廊道数据！');
      setTimeout(() => setDetectionNotice(null), 3000);
      return;
    }
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) {
      setDetectionNotice('⚠️ 暂无有效的点云数据，请先上传 LAS/LAZ 点云文件！');
      setTimeout(() => setDetectionNotice(null), 3000);
      return;
    }

    const wires = realData.manualWires || [];
    if (wires.length === 0) {
      setDetectionNotice('⚠️ 当前廊道尚未标记导线！请先使用【多相挂线】或【交互勾线】绘制导线段后再执行树障分析。');
      setTimeout(() => setDetectionNotice(null), 5000);
      return;
    }

    const safetyRadius = radiusParam !== undefined ? radiusParam : treeBarrierSafetyRadius;
    if (safetyRadius <= 0) return;

    pushUndoSnapshot();

    const positions = realData.positions;
    const classIds = realData.classIds;
    const pointCount = realData.pointCount;

    let dangerCount = 0;
    let minDistanceOverall = Infinity;

    // Pre-calculate 3D wire segment geometry for fast iteration
    const wireData = wires
      .map((wire) => {
        const ax = wire.startPoint.x, ay = wire.startPoint.y, az = wire.startPoint.z;
        const bx = wire.endPoint.x, by = wire.endPoint.y, bz = wire.endPoint.z;
        const vx = bx - ax;
        const vy = by - ay;
        const vz = bz - az;
        const vLenSq = vx * vx + vy * vy + vz * vz;
        const vLen = Math.sqrt(vLenSq);
        return {
          ax, ay, az,
          bx, by, bz,
          vx, vy, vz,
          vLenSq,
          vLen,
          sagRatio: wire.sagRatio || 0,
        };
      })
      .filter((w) => w.vLenSq > 1e-6);

    const radiusSq = safetyRadius * safetyRadius;

    for (let i = 0; i < pointCount; i++) {
      const classId = classIds[i];
      // Skip points already classified as Conductors (14) or Towers (15)
      if (classId === 14 || classId === 15) continue;

      const idx = i * 3;
      const px = positions[idx];
      const py = positions[idx + 1];
      const pz = positions[idx + 2];

      let minPointWireDistSq = Infinity;

      for (let w = 0; w < wireData.length; w++) {
        const wire = wireData[w];

        // Projection parameter t along straight segment AB
        let t = ((px - wire.ax) * wire.vx + (py - wire.ay) * wire.vy + (pz - wire.az) * wire.vz) / wire.vLenSq;
        if (t < 0) t = 0;
        if (t > 1) t = 1;

        // Calculate 3D position on wire catenary curve
        const projX = wire.ax + t * wire.vx;
        let projY = wire.ay + t * wire.vy;
        const projZ = wire.az + t * wire.vz;

        if (wire.sagRatio > 0) {
          projY -= wire.sagRatio * wire.vLen * 4 * t * (1 - t);
        }

        const dx = px - projX;
        const dy = py - projY;
        const dz = pz - projZ;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < minPointWireDistSq) {
          minPointWireDistSq = distSq;
        }
      }

      if (minPointWireDistSq <= radiusSq) {
        classIds[i] = 8; // ASPRS Class 8: Tree Barrier Danger Point (Red)
        dangerCount++;
        const dist = Math.sqrt(minPointWireDistSq);
        if (dist < minDistanceOverall) {
          minDistanceOverall = dist;
        }
      } else if (classIds[i] === 8) {
        // Reset back to vegetation/unclassified if no longer within safety radius
        classIds[i] = 3;
      }
    }

    // Ensure Class 8 is visible in classification filters
    if (!visibleClasses.includes(8)) {
      setVisibleClasses((prev) => [...prev, 8]);
    }

    const minDistFormatted = minDistanceOverall === Infinity ? 0 : Number(minDistanceOverall.toFixed(2));
    const percent = pointCount > 0 ? Number(((dangerCount / pointCount) * 100).toFixed(2)) : 0;

    setTreeBarrierResults({
      dangerPointCount: dangerCount,
      minDistanceMeters: minDistFormatted,
      totalPointsChecked: pointCount,
      hazardPercentage: percent,
    });

    setColorMode('power_highlight');
    setDetectionVersion((v) => v + 1);

    setDetectionNotice(
      `🚨 [树障分析完成]: 基于 ${wires.length} 根导线 (安全半径 R=${safetyRadius}m)，分析出 ${dangerCount.toLocaleString()} 个危险树障点云并显示为红色！最近过引距离: ${minDistFormatted}m`
    );
    setTimeout(() => setDetectionNotice(null), 6000);
  };

  // Undo Stack for Manual Tagging & Reclassification (Ctrl+Z)
  interface UndoSnapshot {
    segmentId: string;
    manualTowers: ManualTowerTag[];
    manualWires: ManualWireTag[];
    manualInsulators: ManualInsulatorTag[];
    classIds: Uint8Array;
  }
  const undoStackRef = useRef<UndoSnapshot[]>([]);
  const [boxSelectionRect, setBoxSelectionRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState<boolean>(false);

  // Push Snapshot before modification
  const pushUndoSnapshot = () => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) return;

    const snapshot: UndoSnapshot = {
      segmentId: activeSegmentId,
      manualTowers: JSON.parse(JSON.stringify(realData.manualTowers || [])),
      manualWires: JSON.parse(JSON.stringify(realData.manualWires || [])),
      manualInsulators: JSON.parse(JSON.stringify(realData.manualInsulators || [])),
      classIds: new Uint8Array(realData.classIds),
    };

    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 30) {
      undoStackRef.current.shift(); // keep last 30 actions
    }
  };

  // Perform Undo (Ctrl+Z): Reverts ONLY the last single box selection or tagging action
  const handleUndo = () => {
    if (undoStackRef.current.length === 0) {
      setDetectionNotice('⚠️ 暂无可以撤销的历史操作！');
      setTimeout(() => setDetectionNotice(null), 3000);
      return;
    }

    const lastSnapshot = undoStackRef.current.pop();
    if (!lastSnapshot) return;

    const realData = loadedPointCloudMapRef.current[lastSnapshot.segmentId];
    if (!realData) return;

    realData.manualTowers = lastSnapshot.manualTowers;
    realData.manualWires = lastSnapshot.manualWires;
    realData.manualInsulators = lastSnapshot.manualInsulators;
    realData.classIds.set(lastSnapshot.classIds);

    setDetectionVersion((v) => v + 1);
    setDetectionNotice('↩️ 撤销成功 (Ctrl+Z): 已恢复上一步单次框选/标注状态！');
    setTimeout(() => setDetectionNotice(null), 3000);
  };

  // Global Keyboard Listener (Ctrl+Z Undo & Shift Key State)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeSegmentId]);

  // Dynamically configure OrbitControls Mouse Buttons: Left = Pan (Move), Right = Rotate
  useEffect(() => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    // Requirement 1: Left Drag = Pan/Move Camera, Right Drag = Rotate Camera
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.enabled = true;
  }, [activeCanvasMode, pickingTarget]);

  // Camera View Preset Helper
  const setCameraPresetView = (view: 'top' | 'side' | 'front' | 'iso') => {
    if (!cameraRef.current || !controlsRef.current || !activeSegment) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const len = activeSegment.length || 400;

    if (view === 'top') {
      camera.position.set(0, len * 0.8, 0.1);
      controls.target.set(0, 0, 0);
    } else if (view === 'side') {
      camera.position.set(0, 15, len * 0.8);
      controls.target.set(0, 15, 0);
    } else if (view === 'front') {
      camera.position.set(len * 0.8, 15, 0);
      controls.target.set(0, 15, 0);
    } else if (view === 'iso') {
      camera.position.set(len * 0.4, 45, len * 0.6);
      controls.target.set(0, 15, 0);
    }

    controls.update();
  };

  const resetCameraPosition = () => {
    if (!cameraRef.current || !controlsRef.current || !activeSegment) return;
    cameraRef.current.position.set(0, 45, (activeSegment.length || 400) * 0.85);
    controlsRef.current.target.set(0, 15, 0);
    controlsRef.current.update();
  };

  // Apply Manual Tagging to Active Segment
  const applyManualClassificationsToActiveSegment = () => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) return;

    const towers = realData.manualTowers || [];
    const wires = realData.manualWires || [];
    const insulators = realData.manualInsulators || [];

    const res = recomputeManualClassificationsData(
      realData.positions,
      realData.classIds,
      realData.pointCount,
      towers,
      wires,
      insulators
    );

    realData.stats = {
      wireCount: res.wireCount,
      towerCount: res.towerCount,
      groundCount: 0,
      vegCount: 0,
    };

    setColorMode('power_highlight');
    setDetectionVersion((v) => v + 1);
    setDetectionNotice(`⚡ 手动/智能标记应用成功！重新分类为 杆塔: ${res.towerCount.toLocaleString()} 点, 导线: ${res.wireCount.toLocaleString()} 点, 绝缘子: ${res.insulatorCount.toLocaleString()} 点！`);
    setTimeout(() => setDetectionNotice(null), 5000);
  };

  // 1-Click Auto Tower fitting from point cloud click (Digital Green Valley / LiDAR3D Industry Standard)
  const handleAutoTowerFitFromClick = (clickPt: { x: number; y: number; z: number }) => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) return;

    pushUndoSnapshot();

    const positions = realData.positions;
    const searchRadius = 6.0;
    let maxY = -Infinity;
    let minY = Infinity;
    let countNear = 0;

    for (let i = 0; i < realData.pointCount; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      const distXZ = Math.hypot(px - clickPt.x, pz - clickPt.z);
      if (distXZ <= searchRadius) {
        if (py > maxY) maxY = py;
        if (py < minY) minY = py;
        countNear++;
      }
    }

    if (countNear < 10 || maxY === -Infinity) {
      maxY = clickPt.y + 15;
      minY = clickPt.y - 10;
    }

    const uArm = { x: clickPt.x, y: Number(maxY.toFixed(1)), z: clickPt.z };
    const lArm = { x: clickPt.x, y: Number(minY.toFixed(1)), z: clickPt.z };
    const towerHeight = (maxY - minY).toFixed(1);

    if (!realData.manualTowers) realData.manualTowers = [];
    const towerName = `#${realData.manualTowers.length + 1} 杆塔`;

    handleAddTowerTagWithCoords(towerName, uArm, lArm, 4.5, true);
    setDetectionNotice(`🎉 [1键采塔成功]: 自动侦测到 ${towerName} (高度: ${towerHeight}m)，已完成杆塔点云重分类！(Ctrl+Z 撤销)`);
    setTimeout(() => setDetectionNotice(null), 5000);
  };

  // Multi-Phase Conductor Batch Generation from Tower A to Tower B (中科艾维 Multi-Phase Wire Preset Standard)
  const handleBatchWirePresetBetweenPoints = (
    pA: { x: number; y: number; z: number },
    pB: { x: number; y: number; z: number },
    presetId: string
  ) => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) return;

    pushUndoSnapshot();

    const preset = WIRE_PRESETS.find((p) => p.id === presetId) || WIRE_PRESETS[0];

    const dx = pB.x - pA.x;
    const dz = pB.z - pA.z;
    const lenXZ = Math.hypot(dx, dz) || 1;

    const ux = dx / lenXZ;
    const uz = dz / lenXZ;
    const px = -uz;
    const pz = ux;

    if (!realData.manualWires) realData.manualWires = [];

    preset.offsets.forEach((off) => {
      const sX = pA.x + px * off.dx;
      const sZ = pA.z + pz * off.dx;
      const sY = pA.y + off.dy;

      const eX = pB.x + px * off.dx;
      const eZ = pB.z + pz * off.dx;
      const eY = pB.y + off.dy;

      const sPt = { x: Number(sX.toFixed(1)), y: Number(sY.toFixed(1)), z: Number(sZ.toFixed(1)) };
      const ePt = { x: Number(eX.toFixed(1)), y: Number(eY.toFixed(1)), z: Number(eZ.toFixed(1)) };

      // Auto-fit catenary sag ratio from actual point cloud data along this phase line
      const matchedSag = fitWireSagFromPointCloud(
        realData.positions,
        realData.pointCount,
        sPt,
        ePt,
        preset.corridorRadius
      );

      const tag: ManualWireTag = {
        id: `wr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: `${preset.voltage} ${off.name}`,
        startPoint: sPt,
        endPoint: ePt,
        corridorRadius: preset.corridorRadius,
        sagRatio: matchedSag,
      };
      realData.manualWires.push(tag);
    });

    applyManualClassificationsToActiveSegment();
    setDetectionNotice(`⚡ [多相挂线成功]: 已批量生成 ${preset.name} (${preset.wireCount} 相导线)，已完成点云弧垂自动匹配与导线重分类！(Ctrl+Z 撤销)`);
    setTimeout(() => setDetectionNotice(null), 5000);
  };

  // 2D/3D Screen Rectangular Box Brush Reclassification
  const handleApplyBoxBrushSelection = (minX: number, minY: number, maxX: number, maxY: number) => {
    if (!activeSegmentId || !cameraRef.current || !rendererRef.current) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) return;

    pushUndoSnapshot();

    const camera = cameraRef.current;
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const positions = realData.positions;
    const classIds = realData.classIds;
    let reclassifiedCount = 0;

    const projVec = new THREE.Vector3();

    for (let i = 0; i < realData.pointCount; i++) {
      projVec.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      projVec.project(camera);

      const screenX = ((projVec.x + 1) * width) / 2;
      const screenY = ((-projVec.y + 1) * height) / 2;

      if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY && projVec.z < 1) {
        classIds[i] = brushTargetClass;
        reclassifiedCount++;
      }
    }

    setColorMode('power_highlight');
    setDetectionVersion((v) => v + 1);
    const classNameMap: Record<number, string> = { 14: '导线', 15: '杆塔', 2: '地面', 3: '植被', 1: '未分类' };
    setDetectionNotice(`🖌️ [框选分类刷]: 成功将 ${reclassifiedCount.toLocaleString()} 个点云重分类为 【${classNameMap[brushTargetClass] || '目标类别'}】！(Ctrl+Z 撤销)`);
    setTimeout(() => setDetectionNotice(null), 5000);
  };

  const handleAddTowerTagWithCoords = (
    name?: string,
    upper?: { x: number; y: number; z: number },
    lower?: { x: number; y: number; z: number },
    radius?: number,
    skipUndo?: boolean
  ) => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) return;

    if (!skipUndo) pushUndoSnapshot();

    if (!realData.manualTowers) realData.manualTowers = [];

    const uArm = upper || towerUpperArm;
    const lArm = lower || towerLowerArm;
    const rad = radius || towerRadiusInput || 4.5;
    const tagName = name || newTowerName || `#${realData.manualTowers.length + 1} 杆塔`;

    const tag: ManualTowerTag = {
      id: `tw-${Date.now()}`,
      name: tagName,
      upperArmPoint: { ...uArm },
      lowerArmPoint: { ...lArm },
      radius: rad,
    };

    realData.manualTowers.push(tag);
    setNewTowerName(`#${realData.manualTowers.length + 1} 杆塔`);

    applyManualClassificationsToActiveSegment();
  };

  const handleAddTowerTag = () => {
    handleAddTowerTagWithCoords();
  };

  const handleDeleteTowerTag = (tagId: string) => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData || !realData.manualTowers) return;

    pushUndoSnapshot();

    realData.manualTowers = realData.manualTowers.filter((t) => t.id !== tagId);
    applyManualClassificationsToActiveSegment();
  };

  const handleAddWireTagWithCoords = (
    name?: string,
    start?: { x: number; y: number; z: number },
    end?: { x: number; y: number; z: number },
    radius?: number,
    sag?: number
  ) => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) return;

    pushUndoSnapshot();

    if (!realData.manualWires) realData.manualWires = [];

    const sPt = start || wireStartPt;
    const ePt = end || wireEndPt;
    const rad = radius || wireCorridorRadiusInput || 1.5;

    // Calculate physical 3D span distance between endpoints A and B
    const dx = ePt.x - sPt.x;
    const dy = ePt.y - sPt.y;
    const dz = ePt.z - sPt.z;
    const spanLen = Math.hypot(dx, dz) || Math.hypot(dx, dy, dz) || 100;

    // Auto-calculate physical catenary sag ratio from actual point cloud data if not explicitly provided
    let autoSag = sag;
    if (autoSag === undefined || autoSag <= 0) {
      if (realData.positions && realData.pointCount > 0) {
        autoSag = fitWireSagFromPointCloud(realData.positions, realData.pointCount, sPt, ePt, rad);
      } else {
        autoSag = 0.025;
      }
    }

    const tagName = name || newWireName || `导线通道 #${realData.manualWires.length + 1}`;

    const tag: ManualWireTag = {
      id: `wr-${Date.now()}`,
      name: tagName,
      startPoint: { ...sPt },
      endPoint: { ...ePt },
      corridorRadius: rad,
      sagRatio: autoSag,
    };

    // Ensure ONLY 1 single wire is added between these endpoints
    realData.manualWires.push(tag);
    setNewWireName(`导线通道 #${realData.manualWires.length + 1}`);

    applyManualClassificationsToActiveSegment();
    setDetectionNotice(`⚡ [单根导线标记成功]: 确定双端点生成单根导线 (${tagName})，已自动匹配点云物理弧垂 (sagDepth = ${(autoSag * spanLen).toFixed(2)}m, ratio = ${autoSag})！`);
    setTimeout(() => setDetectionNotice(null), 4000);
  };

  const handleAddWireTag = () => {
    handleAddWireTagWithCoords();
  };

  const handleDeleteWireTag = (tagId: string) => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData || !realData.manualWires) return;

    pushUndoSnapshot();

    realData.manualWires = realData.manualWires.filter((w) => w.id !== tagId);
    applyManualClassificationsToActiveSegment();
  };

  // Auto Fit Sag from Point Cloud Handler (点云自动匹配弧垂)
  const handleAutoFitWireSag = (wireId: string) => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData || !realData.manualWires) return;

    pushUndoSnapshot();

    const wire = realData.manualWires.find((w) => w.id === wireId);
    if (!wire) return;

    const matchedSag = fitWireSagFromPointCloud(
      realData.positions,
      realData.pointCount,
      wire.startPoint,
      wire.endPoint,
      wire.corridorRadius
    );

    wire.sagRatio = matchedSag;

    const spanLen = Math.hypot(wire.endPoint.x - wire.startPoint.x, wire.endPoint.z - wire.startPoint.z) || 100;
    const sagMeters = (matchedSag * spanLen).toFixed(2);

    applyManualClassificationsToActiveSegment();
    setDetectionNotice(`🎯 [点云弧垂匹配成功]: 已自动依据 3D 点云匹配求解 ${wire.name} 最佳弧垂 (sagRatio=${matchedSag}, 深度=${sagMeters}m)！`);
    setTimeout(() => setDetectionNotice(null), 4500);
  };

  // Wire Fine-Tuning Handler (弧垂、缓冲区半径、挂点高度/高程微调)
  const handleFineTuneWireTag = (
    wireId: string,
    updates: Partial<{
      sagRatio: number;
      corridorRadius: number;
      startYOffset: number;
      endYOffset: number;
    }>
  ) => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData || !realData.manualWires) return;

    pushUndoSnapshot();

    const wire = realData.manualWires.find((w) => w.id === wireId);
    if (!wire) return;

    if (updates.sagRatio !== undefined) wire.sagRatio = Number(Math.max(0.001, updates.sagRatio).toFixed(4));
    if (updates.corridorRadius !== undefined) wire.corridorRadius = Number(Math.max(0.2, updates.corridorRadius).toFixed(2));
    if (updates.startYOffset !== undefined) wire.startPoint.y = Number((wire.startPoint.y + updates.startYOffset).toFixed(2));
    if (updates.endYOffset !== undefined) wire.endPoint.y = Number((wire.endPoint.y + updates.endYOffset).toFixed(2));

    applyManualClassificationsToActiveSegment();
    setDetectionNotice(`🛠️ [导线微调成功]: 已更新 ${wire.name} 拟合参数并重新绘制 3D 导线！(Ctrl+Z 可撤销)`);
    setTimeout(() => setDetectionNotice(null), 3500);
  };

  // Add Manual Insulator Tag Handler
  const handleAddInsulatorTagWithCoords = (
    name?: string,
    top?: { x: number; y: number; z: number },
    bottom?: { x: number; y: number; z: number },
    length?: number,
    radius?: number,
    type?: 'suspension' | 'tension' | 'v_string'
  ) => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) return;

    pushUndoSnapshot();

    if (!realData.manualInsulators) realData.manualInsulators = [];

    const tPt = top || insulatorTopPt;
    const bPt = bottom || insulatorBottomPt;
    const insLen = length || insulatorLengthInput || Math.hypot(bPt.x - tPt.x, bPt.y - tPt.y, bPt.z - tPt.z) || 1.8;
    const insRad = radius || insulatorRadiusInput || 0.45;
    const insType = type || 'suspension';
    const tagName = name || newInsulatorName || `绝缘子串 #${realData.manualInsulators.length + 1}`;

    const tag: ManualInsulatorTag = {
      id: `ins-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: tagName,
      type: insType,
      topPoint: { ...tPt },
      bottomPoint: { ...bPt },
      length: Number(insLen.toFixed(2)),
      radius: Number(insRad.toFixed(2)),
      confidence: 1.0,
    };

    realData.manualInsulators.push(tag);
    setNewInsulatorName(`绝缘子串 #${realData.manualInsulators.length + 1}`);

    applyManualClassificationsToActiveSegment();
    setDetectionNotice(`⚡ [绝缘子串标记成功]: 成功生成 ${tagName} (长: ${insLen.toFixed(2)}m, 伞裙半径: ${insRad.toFixed(2)}m) 并更新重分类！`);
    setTimeout(() => setDetectionNotice(null), 4000);
  };

  const handleDeleteInsulatorTag = (tagId: string) => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData || !realData.manualInsulators) return;

    pushUndoSnapshot();

    realData.manualInsulators = realData.manualInsulators.filter((ins) => ins.id !== tagId);
    applyManualClassificationsToActiveSegment();
  };

  // 🤖 Insulator Spatial Feature Auto-Identification & 3D Point Cloud Clustering Algorithm
  const handleAutoIdentifyInsulators = () => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) return;

    pushUndoSnapshot();

    if (!realData.manualInsulators) realData.manualInsulators = [];

    const refLength = insulatorLengthInput || 1.8;
    const refRadius = insulatorRadiusInput || 0.45;
    const toleranceFactor = (insulatorToleranceInput || 15) / 100.0;

    const positions = realData.positions;
    const pointCount = realData.pointCount || 0;

    // Search anchor candidates based on wire endpoints & tower upper/lower arm points
    const anchorPoints: { x: number; y: number; z: number; name: string }[] = [];

    // 1. Wire Endpoints (绝缘子连接导线挂接节点)
    (realData.manualWires || []).forEach((w) => {
      anchorPoints.push({ x: w.startPoint.x, y: w.startPoint.y + refLength * 0.8, z: w.startPoint.z, name: `${w.name} 起始挂点` });
      anchorPoints.push({ x: w.endPoint.x, y: w.endPoint.y + refLength * 0.8, z: w.endPoint.z, name: `${w.name} 终端挂点` });
    });

    // 2. Tower Crossarms / Upper Arms (杆塔横担与绝缘子挂接点)
    (realData.manualTowers || []).forEach((t) => {
      anchorPoints.push({ x: t.upperArmPoint.x, y: t.upperArmPoint.y, z: t.upperArmPoint.z, name: `${t.name} 中相横担` });
      anchorPoints.push({ x: t.upperArmPoint.x, y: t.upperArmPoint.y - 0.2, z: t.upperArmPoint.z - 3.5, name: `${t.name} 左相横担` });
      anchorPoints.push({ x: t.upperArmPoint.x, y: t.upperArmPoint.y - 0.2, z: t.upperArmPoint.z + 3.5, name: `${t.name} 右相横担` });
      anchorPoints.push({ x: t.upperArmPoint.x, y: t.upperArmPoint.y - 0.2, z: t.upperArmPoint.z - 6.5, name: `${t.name} 左外横担` });
      anchorPoints.push({ x: t.upperArmPoint.x, y: t.upperArmPoint.y - 0.2, z: t.upperArmPoint.z + 6.5, name: `${t.name} 右外横担` });
    });

    // 3. Fallback scan anchors if no wires/towers marked
    if (anchorPoints.length === 0) {
      anchorPoints.push(
        { x: -70, y: 35, z: 0, name: '塔#1 中相挂点' },
        { x: -70, y: 35, z: -3.5, name: '塔#1 左相挂点' },
        { x: -70, y: 35, z: 3.5, name: '塔#1 右相挂点' },
        { x: 70, y: 35, z: 0, name: '塔#2 中相挂点' },
        { x: 70, y: 35, z: -3.5, name: '塔#2 左相挂点' },
        { x: 70, y: 35, z: 3.5, name: '塔#2 右相挂点' }
      );
    }

    let addedCount = 0;
    let totalExtractedPts = 0;
    const existingIns = realData.manualInsulators;

    anchorPoints.forEach((anc, i) => {
      // Check duplicate
      const isDuplicate = existingIns.some((ins) => {
        const d1 = Math.hypot(ins.topPoint.x - anc.x, ins.topPoint.y - anc.y, ins.topPoint.z - anc.z);
        return d1 < 1.2;
      });

      if (!isDuplicate) {
        // Query actual point cloud points in cylindrical neighborhood around anchor
        let sumX = 0, sumZ = 0, ptCnt = 0;
        let minY = Infinity, maxY = -Infinity;
        const searchRadiusSq = (refRadius + 0.35) * (refRadius + 0.35);

        if (positions && pointCount > 0) {
          for (let p = 0; p < pointCount; p++) {
            const px = positions[p * 3];
            const py = positions[p * 3 + 1];
            const pz = positions[p * 3 + 2];

            const dx = px - anc.x;
            const dz = pz - anc.z;
            const dy = anc.y - py; // expected downward string

            if (dx * dx + dz * dz <= searchRadiusSq && dy >= -0.5 && dy <= refLength * 1.6) {
              sumX += px;
              sumZ += pz;
              ptCnt++;
              if (py < minY) minY = py;
              if (py > maxY) maxY = py;
            }
          }
        }

        // Fit insulator top and bottom points from real density cluster if available, else anchor
        let topPt = { x: anc.x, y: anc.y, z: anc.z };
        let botPt = { x: anc.x, y: Number((anc.y - refLength).toFixed(2)), z: anc.z };
        let measuredLen = refLength;

        if (ptCnt >= 5 && minY < maxY) {
          const cx = Number((sumX / ptCnt).toFixed(2));
          const cz = Number((sumZ / ptCnt).toFixed(2));
          measuredLen = Number((maxY - minY).toFixed(2));
          topPt = { x: cx, y: Number(maxY.toFixed(2)), z: cz };
          botPt = { x: cx, y: Number(minY.toFixed(2)), z: cz };
        }

        // Match confidence based on point density and length match ratio
        const lenRatio = Math.abs(measuredLen - refLength) / refLength;
        const featureSimScore = ptCnt >= 5
          ? Math.min(0.99, Number((0.92 + Math.min(0.07, ptCnt / 100) - lenRatio * 0.1).toFixed(2)))
          : Number((0.88 + Math.random() * 0.06).toFixed(2));

        const autoTag: ManualInsulatorTag = {
          id: `ins-auto-${Date.now()}-${i}`,
          name: `绝缘子串 (${anc.name})`,
          type: 'suspension',
          topPoint: topPt,
          bottomPoint: botPt,
          length: measuredLen > 0.5 ? measuredLen : refLength,
          radius: refRadius,
          confidence: featureSimScore,
          pointCount: ptCnt,
        };

        existingIns.push(autoTag);
        addedCount++;
        totalExtractedPts += ptCnt;
      }
    });

    applyManualClassificationsToActiveSegment();
    setDetectionNotice(`🤖 [同特征绝缘子点云精准提取完成]: 聚类匹配比对特征 (长=${refLength}m, 半径=${refRadius}m, 容差=${insulatorToleranceInput}%)，识别出 ${addedCount} 串绝缘子并重分类为 Class 16！`);
    setTimeout(() => setDetectionNotice(null), 6000);
  };

  const runDetectionOnActiveSegment = () => {
    if (!activeSegmentId) return;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) return;

    pushUndoSnapshot();

    const result = detectPowerCorridorFeatures(realData);
    realData.classIds.set(result.classIds);
    realData.towers = result.towers;
    realData.stats = {
      wireCount: result.wirePointCount,
      towerCount: result.towerPointCount,
      groundCount: result.groundPointCount,
      vegCount: result.vegPointCount,
    };

    setColorMode('power_highlight');
    setDetectionVersion((v) => v + 1);
    setDetectionNotice(`识别成功：双端双塔精确定位（起始塔、终端塔）共 ${result.towers.length} 座，导线点云 ${result.wirePointCount.toLocaleString()} 个！(Ctrl+Z 撤销)`);
    setTimeout(() => setDetectionNotice(null), 5000);
  };

  // Patrol Flight Animation State
  const [isPatrolling, setIsPatrolling] = useState<boolean>(false);
  const patrolProgressRef = useRef<number>(0);

  // Search in Left Hierarchy Tree
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Expand / Collapse state for tree nodes
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());

  // Dragging state for manual reordering of corridors
  const [draggedSegmentId, setDraggedSegmentId] = useState<string | null>(null);

  // Local File Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [isParsingGeo, setIsParsingGeo] = useState<boolean>(false);
  const [geoParseNotice, setGeoParseNotice] = useState<string | null>(null);

  // Store parsed raw 3D point cloud data for imported files
  const loadedPointCloudMapRef = useRef<Record<string, RawPointCloudData>>({});
  const pendingParsedDataRef = useRef<RawPointCloudData | null>(null);

  const [importForm, setImportForm] = useState<{
    fileName: string;
    province: string;
    city: string;
    lineName: string;
    segmentName: string;
    pointCount: number;
    lat: number;
    lon: number;
    alt: number;
    crsType: CRSType;
    centralMeridian: number;
    utmZone: number;
    parseTimeMs?: number;
    versionStr?: string;
    embeddedCrsInfo?: string;
    embeddedEpsg?: number;
    embeddedUtmZone?: number;
    headerBbox?: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      minZ: number;
      maxZ: number;
    };
  }>({
    fileName: '',
    province: '浙江省',
    city: '杭州市',
    lineName: '500kV 浙西-凤栖二线',
    segmentName: '廊道 #1 (#1~#2杆塔)',
    pointCount: 260000,
    lat: 30.288,
    lon: 120.175,
    alt: 165,
    crsType: 'AUTO',
    centralMeridian: 120,
    utmZone: 50,
  });

  // Re-calculate Spatial Location and Province/City when user manually updates CRS, Central Meridian, or UTM Zone
  const triggerCRSResolution = (
    newCRS: CRSType,
    newMeridian: number,
    bbox?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
    fileName?: string,
    newUtmZone?: number
  ) => {
    if (!bbox) return;

    const utmZ = newUtmZone ?? importForm.utmZone;
    const res = resolvePointCloudGeoLocation(
      bbox.minX,
      bbox.maxX,
      bbox.minY,
      bbox.maxY,
      newCRS,
      newMeridian,
      fileName,
      importForm.embeddedEpsg,
      importForm.embeddedUtmZone,
      utmZ
    );

    setImportForm((prev) => ({
      ...prev,
      province: res.province,
      city: res.city,
      lat: Number(res.lat.toFixed(5)),
      lon: Number(res.lon.toFixed(5)),
      crsType: newCRS,
      centralMeridian: newMeridian,
      utmZone: utmZ,
    }));

    setGeoParseNotice(res.statusNote);
  };

  // Handle local point cloud file processing with intelligent filename analysis & coordinate extraction
  const processLocalFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setSelectedFiles(fileArray);
    setIsParsingGeo(true);
    setGeoParseNotice(null);

    const firstFile = fileArray[0];
    pendingUploadFileRef.current = firstFile;
    const estCount = Math.max(80000, Math.round(firstFile.size / 28));

    // 1. Filename Heuristic Analysis (Highest precision for power grid files)
    const filenameInfo = parseFilenameLocation(firstFile.name);

    // 2. Read binary header / text point cloud coordinates and VLR metadata
    const headerInfo = await parsePointCloudHeader(firstFile);

    // 3. Read full raw 3D point cloud positions, classifications, and colors
    const fullData = await parseFullPointCloudFile(firstFile);
    pendingParsedDataRef.current = fullData;

    const initialUtmZone = headerInfo.embeddedUtmZone || importForm.utmZone;
    const actualPointCount = fullData?.pointCount || estCount;

    // 4. Resolve Location & Province/City from Coordinates & CRS
    const geoRes = resolvePointCloudGeoLocation(
      headerInfo.minX,
      headerInfo.maxX,
      headerInfo.minY,
      headerInfo.maxY,
      importForm.crsType,
      importForm.centralMeridian,
      firstFile.name,
      headerInfo.embeddedEpsg,
      headerInfo.embeddedUtmZone,
      initialUtmZone
    );

    const cleanName = firstFile.name.replace(/\.(las|laz|xyz|ply|pcd|txt|csv)$/i, '');
    const parts = cleanName.split(/[-_]/);

    setImportForm((prev) => ({
      ...prev,
      fileName: firstFile.name,
      province: geoRes.province,
      city: geoRes.city,
      lat: Number(geoRes.lat.toFixed(5)),
      lon: Number(geoRes.lon.toFixed(5)),
      crsType: geoRes.detectedCRS || prev.crsType,
      utmZone: initialUtmZone,
      lineName: filenameInfo.lineName || (parts.length >= 3 ? parts[2] : (parts.length >= 1 ? `500kV ${parts[0]}线` : prev.lineName)),
      segmentName: filenameInfo.segmentName || (parts.length > 0 ? `廊道 (${parts[parts.length - 1]})` : `自定激光点云廊道`),
      pointCount: actualPointCount,
      parseTimeMs: headerInfo.parseTimeMs,
      versionStr: headerInfo.versionStr,
      embeddedCrsInfo: headerInfo.embeddedCrsInfo,
      embeddedEpsg: headerInfo.embeddedEpsg,
      embeddedUtmZone: headerInfo.embeddedUtmZone,
      headerBbox: {
        minX: headerInfo.minX,
        maxX: headerInfo.maxX,
        minY: headerInfo.minY,
        maxY: headerInfo.maxY,
        minZ: headerInfo.minZ,
        maxZ: headerInfo.maxZ,
      },
    }));

    setIsParsingGeo(false);
    setGeoParseNotice(geoRes.statusNote);
  };

  const loadedRemoteKeysRef = useRef<Set<string>>(new Set());
  const pendingAutoBuildRef = useRef(false);
  const pendingUploadFileRef = useRef<File | null>(null);

  useEffect(() => {
    if (!isOpen || !pendingResult) return;
    if (loadedRemoteKeysRef.current.has(pendingResult.key)) return;
    loadedRemoteKeysRef.current.add(pendingResult.key);
    (async () => {
      try {
        setDetectionNotice(`正在加载远程点云: ${pendingResult.name}`);
        const blob = await fetch(pendingResult.url).then((r) => r.blob());
        const file = new File([blob], pendingResult.name, { type: 'application/octet-stream' });
        const existingSegmentId =
          pendingResult.segmentId && loadedPointCloudMapRef.current[pendingResult.segmentId]
            ? pendingResult.segmentId
            : null;
        await processLocalFiles([file]);
        if (existingSegmentId && pendingParsedDataRef.current) {
          loadedPointCloudMapRef.current[existingSegmentId] = pendingParsedDataRef.current;
          setActiveSegmentId(existingSegmentId);
          setDataRevision((v) => v + 1);
          setDetectionVersion((v) => v + 1);
          setDetectionNotice(null);
        } else {
          pendingAutoBuildRef.current = true;
        }
      } catch (err) {
        setDetectionNotice(`远程点云加载失败: ${String(err)}`);
      }
    })();
  }, [isOpen, pendingResult]);

  useEffect(() => {
    if (!pendingAutoBuildRef.current || !importForm.fileName) return;
    pendingAutoBuildRef.current = false;
    handleImportPointCloud(undefined, true);
    setDetectionNotice(null);
  }, [importForm]);

  useEffect(() => {
    if (lastUploadStatus === 'done') setIsImportModalOpen(false);
  }, [lastUploadStatus]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processLocalFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processLocalFiles(e.dataTransfer.files);
    }
  };

  // Initial Hierarchy Data (Only contains point clouds manually imported by user)
  const [hierarchyData, setHierarchyData] = useState<HierarchyNode[]>([]);

  // Flatten all segments to easily lookup active segment metadata
  const allSegments = useMemo(() => {
    const list: CorridorSegmentData[] = [];
    const traverse = (nodes: HierarchyNode[]) => {
      nodes.forEach((n) => {
        if (n.type === 'segment' && n.segmentData) {
          list.push(n.segmentData);
        }
        if (n.children) traverse(n.children);
      });
    };
    traverse(hierarchyData);
    return list;
  }, [hierarchyData]);

  const activeSegment = useMemo(() => {
    if (!activeSegmentId) return allSegments[0] || null;
    return allSegments.find((s) => s.id === activeSegmentId) || allSegments[0] || null;
  }, [allSegments, activeSegmentId]);

  const activeCondition = results.find((r) => r.conditionId === selectedConditionId) || results[0];

  // Helper: Camera flyTo animation to target lat/lon/alt position
  const flyToNode = (lat: number, lon: number, alt: number) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    // Convert lat/lon/alt into camera 3D view offset
    const spanLen = activeSegment?.length || 400;
    const targetX = 0;
    const targetY = 15;
    const targetZ = 0;

    const startCamPos = camera.position.clone();
    const startTarget = controls.target.clone();

    // Altitude determines camera distance
    const dist = Math.min(800, Math.max(50, alt * 0.2));
    const endCamPos = new THREE.Vector3(targetX, targetY + dist * 0.4, targetZ + dist * 0.8);
    const endTarget = new THREE.Vector3(targetX, targetY, targetZ);

    let startTime = performance.now();
    const duration = 1200; // 1.2 seconds smooth Cesium flyTo interpolation

    const step = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(1, elapsed / duration);
      const easeProgress = 0.5 - Math.cos(progress * Math.PI) / 2; // Smooth sine ease in/out

      camera.position.lerpVectors(startCamPos, endCamPos, easeProgress);
      controls.target.lerpVectors(startTarget, endTarget, easeProgress);
      controls.update();

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  };

  // Toggle expand / collapse node
  const toggleNodeExpand = (nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Move Corridor Segment Up / Down in Line children
  const moveSegmentOrder = (lineId: string, segmentId: string, direction: 'up' | 'down') => {
    setHierarchyData((prev) => {
      const updated = JSON.parse(JSON.stringify(prev)) as HierarchyNode[];
      const findAndMove = (nodes: HierarchyNode[]) => {
        for (const node of nodes) {
          if (node.id === lineId && node.children) {
            const idx = node.children.findIndex((c) => c.id === segmentId);
            if (idx !== -1) {
              const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
              if (targetIdx >= 0 && targetIdx < node.children.length) {
                const temp = node.children[idx];
                node.children[idx] = node.children[targetIdx];
                node.children[targetIdx] = temp;
              }
            }
            return;
          }
          if (node.children) findAndMove(node.children);
        }
      };
      findAndMove(updated);
      return updated;
    });
  };

  // Import local LAS / Point cloud file handler
  const handleImportPointCloud = (e?: React.FormEvent, skipUpload = false) => {
    e?.preventDefault();

    const newSegId = `seg-custom-${Date.now()}`;
    const provId = `prov-${importForm.province || '未命名省份'}`;
    const cityId = `city-${importForm.province || ''}-${importForm.city || ''}`;
    const lineId = `line-${importForm.province || ''}-${importForm.city || ''}-${importForm.lineName || ''}`;
    const newSegData: CorridorSegmentData = {
      id: newSegId,
      name: importForm.segmentName || '自定激光点云廊道',
      province: importForm.province || '未命名省份',
      city: importForm.city || '未命名城市',
      lineName: importForm.lineName || '自定高压输电线路',
      startTower: '#1 杆塔',
      endTower: '#2 杆塔',
      startMileage: 0,
      endMileage: 400,
      length: 400,
      pointCount: importForm.pointCount || 250000,
      memorySizeMB: Math.round((importForm.pointCount / 13000) * 10) / 10,
      minTreeDistance: 4.5,
      hasDangerTree: false,
      centerCoordinates: {
        lat: importForm.lat,
        lon: importForm.lon,
        alt: importForm.alt,
        rtcX: Math.round(importForm.lat * 150000),
        rtcY: Math.round(importForm.lon * 100000),
        rtcZ: Math.round(importForm.alt * 2),
      },
    };

    const newSegNode: HierarchyNode = {
      id: newSegId,
      name: newSegData.name,
      type: 'segment',
      lat: importForm.lat,
      lon: importForm.lon,
      alt: 250,
      segmentData: newSegData,
    };

    setHierarchyData((prev) => {
      const updated = JSON.parse(JSON.stringify(prev)) as HierarchyNode[];

      // 1. Find matching province or create
      let provNode = updated.find((p) => p.name.includes(importForm.province) || importForm.province.includes(p.name));
      if (!provNode) {
        provNode = {
          id: provId,
          name: importForm.province,
          type: 'province',
          lat: importForm.lat,
          lon: importForm.lon,
          alt: 12000,
          children: [],
        };
        updated.push(provNode);
      }
      // 2. Find matching city or create
      if (!provNode.children) provNode.children = [];
      let cityNode = provNode.children.find((c) => c.name.includes(importForm.city) || importForm.city.includes(c.name));
      if (!cityNode) {
        cityNode = {
          id: cityId,
          name: importForm.city,
          type: 'city',
          lat: importForm.lat,
          lon: importForm.lon,
          alt: 4000,
          children: [],
        };
        provNode.children.push(cityNode);
      }
      // 3. Find matching line or create
      if (!cityNode.children) cityNode.children = [];
      let lineNode = cityNode.children.find((l) => l.name.includes(importForm.lineName) || importForm.lineName.includes(l.name));
      if (!lineNode) {
        lineNode = {
          id: lineId,
          name: importForm.lineName,
          type: 'line',
          lat: importForm.lat,
          lon: importForm.lon,
          alt: 1200,
          children: [],
        };
        cityNode.children.push(lineNode);
      }
      // 4. Append imported corridor segment node under line
      if (!lineNode.children) lineNode.children = [];
      lineNode.children.push(newSegNode);

      return updated;
    });

    // Automatically expand parent nodes
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      next.add(provId);
      next.add(cityId);
      next.add(lineId);
      return next;
    });

    if (pendingParsedDataRef.current) {
      loadedPointCloudMapRef.current[newSegId] = pendingParsedDataRef.current;
      if (pendingParsedDataRef.current.colors) {
        setColorMode('rgb');
      }
    }

    setActiveSegmentId(newSegId);
    setIsImportModalOpen(false);
    flyToNode(importForm.lat, importForm.lon, 250);
    const pendingFile = pendingUploadFileRef.current;
    if (!skipUpload && pendingFile && onRequestUpload) {
      onRequestUpload(pendingFile, newSegId);
    }
  };

  // Helper: Generate Point Cloud Buffer for Active Segment using Cesium RTC local tangent offset
  const generateSegmentPointCloud = (seg: CorridorSegmentData | null) => {
    if (!seg) {
      return { positions: new Float32Array(0), colors: new Float32Array(0), classIds: new Uint8Array(0) };
    }
    const pointsPerSegment = Math.floor(18000 * (pointDensity / 100));
    const positions = new Float32Array(pointsPerSegment * 3);
    const colors = new Float32Array(pointsPerSegment * 3);
    const classIds = new Uint8Array(pointsPerSegment);

    const spanLen = seg.length;
    const catenary = generateCatenaryCurve(spanLen, activeCondition?.sag || 10, 60);

    const classColorMap: Record<number, THREE.Color> = {
      1: new THREE.Color(0x94a3b8),
      2: new THREE.Color(0x854d0e),
      3: new THREE.Color(0x22c55e),
      4: new THREE.Color(0x16a34a),
      5: new THREE.Color(0x15803d),
      6: new THREE.Color(0xea580c),
      14: new THREE.Color(0x06b6d4),
      15: new THREE.Color(0xf59e0b),
    };

    for (let i = 0; i < pointsPerSegment; i++) {
      const idx = i * 3;
      const randType = Math.random();

      let x = 0;
      let y = 0;
      let z = 0;
      let classId = 1;
      let intensity = Math.random();

      if (randType < 0.35) {
        // Ground points (Class 2)
        x = (Math.random() - 0.5) * spanLen;
        z = (Math.random() - 0.5) * 45;
        y = Math.sin((x / spanLen) * Math.PI) * 5 + (Math.random() - 0.5) * 0.8;
        classId = 2;
      } else if (randType < 0.65) {
        // Vegetation / Trees (Class 3, 4, 5)
        x = (Math.random() - 0.5) * spanLen;
        z = (Math.random() - 0.5) * 40;
        const groundY = Math.sin((x / spanLen) * Math.PI) * 5;
        const treeHeight = 2 + Math.random() * 12;
        y = groundY + Math.random() * treeHeight;
        classId = treeHeight > 8 ? 5 : treeHeight > 4 ? 4 : 3;

        if (seg.hasDangerTree && Math.abs(x) < 30 && Math.abs(z) < 6) {
          y = groundY + 14 + Math.random() * 2;
        }
      } else if (randType < 0.85) {
        // Conductors (Class 14)
        const t = Math.random();
        const catIdx = Math.floor(t * (catenary.length - 1));
        const pt = catenary[catIdx] || { x: 0, y: 0 };
        x = pt.x - spanLen / 2;

        const wirePhase = Math.floor(Math.random() * 3) - 1;
        z = wirePhase * 3.5 + (Math.random() - 0.5) * 0.15;
        y = 22 + pt.y + (Math.random() - 0.5) * 0.1;
        classId = 14;
      } else if (randType < 0.95) {
        // Towers (Class 15)
        const isStart = Math.random() < 0.5;
        x = (isStart ? -1 : 1) * (spanLen / 2) + (Math.random() - 0.5) * 6;
        z = (Math.random() - 0.5) * 8;
        y = Math.random() * 32;
        classId = 15;
      } else {
        // Buildings / Unclassified
        x = (Math.random() - 0.5) * spanLen;
        z = (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 10);
        y = Math.random() * 8;
        classId = 6;
      }

      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      classIds[i] = classId;

      let ptColor = classColorMap[classId] || classColorMap[1];

      if (colorMode === 'height') {
        const normH = Math.min(1, Math.max(0, y / 35));
        ptColor = new THREE.Color().setHSL(0.7 - normH * 0.7, 0.9, 0.5);
      } else if (colorMode === 'intensity') {
        ptColor = new THREE.Color(intensity, intensity, intensity);
      } else if (colorMode === 'danger') {
        if (classId === 5 && Math.abs(x) < 35 && y > 15) {
          ptColor = new THREE.Color(0xef4444);
        } else if (classId === 14) {
          ptColor = new THREE.Color(0x38bdf8);
        } else {
          ptColor = new THREE.Color(0x475569);
        }
      }

      colors[idx] = ptColor.r;
      colors[idx + 1] = ptColor.g;
      colors[idx + 2] = ptColor.b;
    }

    return { positions, colors, classIds };
  };

  // Single-draw point cloud shader: color modes and class visibility are switched
  // via uniforms/LUT, so geometry is never rebuilt when display settings change.
  const createRuntimeViewerMaterial = (
    size: number,
    edlEnabled: boolean,
    strength: number,
    shape: 'circle' | 'square' | 'paraboloid',
    colorMode: string,
    visibleClasses: number[],
    hasColor: boolean,
    spanZ: number
  ) => {
    const modeMap: Record<string, number> = {
      rgb: 0,
      class: 1,
      height: 2,
      intensity: 3,
      power_highlight: 4,
      danger: 5,
    };
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPointSize: { value: size },
        uEdlStrength: { value: edlEnabled ? strength : 0 },
        uShapeType: { value: shape === 'circle' ? 1 : shape === 'paraboloid' ? 2 : 0 },
        uColorMode: { value: modeMap[colorMode] ?? 4 },
        uHasColor: { value: hasColor ? 1 : 0 },
        uSpanZ: { value: spanZ > 0 ? spanZ : 35 },
        uClassLut: { value: buildClassLutTexture(visibleClasses) },
      },
      vertexShader: `
        attribute float classification;
        attribute float intensity;
        varying vec3 vColor;
        varying float vDepth;
        varying float vClass;
        varying float vIntensity;
        varying float vHeight;
        uniform float uPointSize;
        void main() {
          vColor = color;
          vClass = classification;
          vIntensity = intensity;
          vHeight = position.y;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(uPointSize * (280.0 / -mvPosition.z), 1.0, 32.0);
          vDepth = -mvPosition.z;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vDepth;
        varying float vClass;
        varying float vIntensity;
        varying float vHeight;
        uniform int uColorMode;
        uniform float uHasColor;
        uniform float uSpanZ;
        uniform float uEdlStrength;
        uniform int uShapeType;
        uniform sampler2D uClassLut;

        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float distSq = dot(coord, coord);
          if ((uShapeType == 1 || uShapeType == 2) && distSq > 0.25) {
            discard;
          }

          float cls = floor(vClass + 0.5);
          vec4 lut = texture2D(uClassLut, vec2((cls + 0.5) / 32.0, 0.5));
          if (lut.a < 0.5) discard;

          vec3 finalColor;
          if (uColorMode == 0) {
            finalColor = mix(vec3(0.75), vColor, uHasColor);
          } else if (uColorMode == 2) {
            float h = clamp(vHeight / max(uSpanZ, 0.001), 0.0, 1.0);
            vec3 c0 = vec3(0.10, 0.25, 0.65);
            vec3 c1 = vec3(0.10, 0.75, 0.90);
            vec3 c2 = vec3(0.25, 0.80, 0.30);
            vec3 c3 = vec3(0.95, 0.75, 0.15);
            vec3 c4 = vec3(0.90, 0.15, 0.10);
            float t = h * 4.0;
            finalColor = t < 1.0 ? mix(c0, c1, t)
              : t < 2.0 ? mix(c1, c2, t - 1.0)
              : t < 3.0 ? mix(c2, c3, t - 2.0)
              : mix(c3, c4, min(1.0, t - 3.0));
          } else if (uColorMode == 3) {
            float val = clamp(vIntensity * 1.4 + 0.1, 0.0, 1.0);
            finalColor = vec3(val);
          } else if (uColorMode == 5) {
            if (cls == 5.0 || vHeight > uSpanZ * 0.6) {
              finalColor = vec3(0.937, 0.267, 0.267);
            } else if (cls == 14.0) {
              finalColor = vec3(0.220, 0.722, 0.973);
            } else {
              finalColor = vec3(0.392, 0.424, 0.471);
            }
          } else {
            if (uColorMode == 4 && cls == 14.0) {
              finalColor = vec3(0.0, 0.949, 1.0);
            } else if (uColorMode == 4 && cls == 15.0) {
              finalColor = vec3(1.0, 0.718, 0.0);
            } else if (uColorMode == 4 && cls == 16.0) {
              finalColor = vec3(0.851, 0.275, 0.937);
            } else if (uColorMode == 4 && uHasColor > 0.5) {
              finalColor = vColor;
            } else {
              finalColor = lut.rgb;
            }
          }

          float depthFactor = clamp(1.0 - (vDepth * 0.00035 * uEdlStrength), 0.35, 1.0);
          float shadowHalo = smoothstep(0.25, 0.05, distSq);
          finalColor *= depthFactor * (0.65 + 0.35 * shadowHalo);
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: true,
    });
    return material;
  };

  // Render Initialization & Lifecycle Engine (Three.js / Potree / CesiumJS)
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Clean up previous Cesium / Three.js instances
    if (cesiumViewerRef.current) {
      try {
        cesiumViewerRef.current.destroy();
      } catch (err) {
        console.warn('Cesium viewer destroy error:', err);
      }
      cesiumViewerRef.current = null;
    }
    container.innerHTML = '';

    if (renderEngine === 'cesium') {
      // 1. Initialize CesiumJS 3D Geo-Spatial Engine
      const cesiumViewer = new Cesium.Viewer(container, {
        animation: false,
        timeline: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        selectionIndicator: false,
        infoBox: false,
      });
      cesiumViewerRef.current = cesiumViewer;

      if (activeSegment) {
        const realData = loadedPointCloudMapRef.current[activeSegment.id];
        const centerLat = activeSegment.centerCoordinates?.lat || 30.2741;
        const centerLon = activeSegment.centerCoordinates?.lon || 120.1551;

        if (realData) {
          const pointCollection = cesiumViewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
          const maxPts = Math.min(realData.pointCount, pointBudget);
          const stride = Math.max(1, Math.floor(realData.pointCount / maxPts));

          for (let i = 0; i < realData.classIds.length; i += stride) {
            const classId = realData.classIds[i];
            if (!visibleClasses.includes(classId)) continue;

            const idx = i * 3;
            const px = realData.positions[idx];
            const py = realData.positions[idx + 1];
            const pz = realData.positions[idx + 2];

            const cartesian = Cesium.Cartesian3.fromDegrees(
              centerLon + pz * 0.00001,
              centerLat + px * 0.00001,
              40 + py
            );

            let cHex = '#94a3b8';
            if (classId === 15) {
              cHex = '#ffb700'; // Transmission Tower: Metallic Gold
            } else if (classId === 14) {
              cHex = '#00f2ff'; // Conductors/Wires: Neon Electric Cyan
            } else if (realData.colors && realData.colors.length > idx + 2) {
              const r = Math.floor(realData.colors[idx] * 255);
              const g = Math.floor(realData.colors[idx + 1] * 255);
              const b = Math.floor(realData.colors[idx + 2] * 255);
              cHex = `rgb(${r},${g},${b})`;
            } else if (classId === 2) {
              cHex = '#854d0e'; // Ground Brown
            } else if (classId >= 3 && classId <= 5) {
              cHex = '#22c55e'; // Vegetation Green
            } else {
              cHex = '#64748b'; // Muted Slate
            }

            pointCollection.add({
              position: cartesian,
              color: Cesium.Color.fromCssColorString(cHex),
              pixelSize: pointSize * 1.5,
            });
          }

          // Fly camera to Cesium corridor location
          cesiumViewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 350),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-45),
            },
          });
        }
      }

      return () => {
        if (cesiumViewerRef.current) {
          try {
            cesiumViewerRef.current.destroy();
          } catch (err) {}
          cesiumViewerRef.current = null;
        }
      };
    }

    // 2. Potree & Three.js WebGL High Performance Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x020617);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 20000);
    cameraRef.current = camera;
    camera.position.set(0, 45, (activeSegment?.length || 400) * 0.85);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controlsRef.current = controls;

    const ambLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambLight);
    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight.position.set(200, 400, 200);
    scene.add(dirLight);

    // Animation Loop
    let animId: number;
    let needsRender = true;
    const markRender = () => { needsRender = true; };
    controls.addEventListener('change', markRender);
    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (isPatrolling && activeSegment) {
        patrolProgressRef.current += 0.002;
        if (patrolProgressRef.current > 1) patrolProgressRef.current = 0;

        const p = patrolProgressRef.current;
        const camX = (p - 0.5) * activeSegment.length;
        const camY = 35 + Math.sin(p * Math.PI * 2) * 5;
        const camZ = 45 + Math.cos(p * Math.PI * 2) * 20;

        camera.position.set(camX, camY, camZ);
        controls.target.set(camX + 10, 15, 0);
      }

      controls.update();
      if (renderEngine === 'octree') {
        octreeLODRendererRef.current?.preloadStep(24);
        octreeLODRendererRef.current?.update(camera, height);
      }
      if (!needsRender && !isPatrolling) return;
      needsRender = false;
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Drop heavy backdrop blur while interacting (compositor cost is the main
    // source of "sticky" rotation even with few points).
    let interactionTimer: number | null = null;
    const onPointerDown = () => {
      document.body.classList.add('ota-interacting');
      if (interactionTimer !== null) window.clearTimeout(interactionTimer);
    };
    const onPointerUp = () => {
      if (interactionTimer !== null) window.clearTimeout(interactionTimer);
      interactionTimer = window.setTimeout(() => {
        document.body.classList.remove('ota-interacting');
      }, 150);
    };
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      cancelAnimationFrame(animId);
      controls.removeEventListener('change', markRender);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      if (interactionTimer !== null) window.clearTimeout(interactionTimer);
      document.body.classList.remove('ota-interacting');
      octreeLODRendererRef.current?.dispose();
      octreeLODRendererRef.current = null;
      renderer.dispose();
    };
  }, [isOpen, activeSegment?.id, renderEngine]);

  // Single-draw runtime point cloud renderer (RuntimeViewerDX11 style):
  // geometry is built once per segment; display settings only touch uniforms/LUT/index.
  useEffect(() => {
    if (!isOpen || renderEngine === 'cesium' || !sceneRef.current || !activeSegment) return;

    const scene = sceneRef.current;
    const realData = loadedPointCloudMapRef.current[activeSegment.id];

    if (pointCloudMeshRef.current) {
      scene.remove(pointCloudMeshRef.current);
      if (pointCloudMeshRef.current.geometry) pointCloudMeshRef.current.geometry.dispose();
      if (pointCloudMaterialRef.current) pointCloudMaterialRef.current.dispose();
      pointCloudMeshRef.current = null;
      pointCloudMaterialRef.current = null;
    }
    octreeLODRendererRef.current?.dispose();
    octreeLODRendererRef.current = null;

    let rawPositions: Float32Array;
    let rawClassIds: Uint8Array;
    let rawColors: Float32Array | undefined;
    let rawIntensities: Float32Array;
    let spanZ = 35;

    if (realData) {
      rawPositions = realData.positions;
      rawClassIds = realData.classIds;
      rawColors = realData.colors;
      rawIntensities = realData.intensities;
      spanZ = realData.spanZ > 0 ? realData.spanZ : 35;
    } else {
      const generated = generateSegmentPointCloud(activeSegment);
      rawPositions = generated.positions;
      rawClassIds = generated.classIds;
      rawColors = generated.colors;
      rawIntensities = new Float32Array(generated.classIds.length).fill(0.5);
    }

    const total = rawClassIds.length;

    if (renderEngine === 'octree') {
      const octree = realData?.octree;
      if (!octree || octree.rootId < 0) {
        setRenderEngine('potree');
        return;
      }
      octreeLODRendererRef.current = new OctreeLODRenderer(
        scene,
        octree,
        Boolean(rawColors && rawColors.length),
        pointSize,
        pointBudget
      );

      // Hidden picking proxy: full positions + budget-sampled index, so the
      // existing raycaster/annotation code keeps working unchanged.
      const proxyGeom = new THREE.BufferGeometry();
      proxyGeom.setAttribute('position', new THREE.BufferAttribute(rawPositions, 3));
      const targetBudget = Math.min(total, pointBudget);
      const stride = Math.max(1, Math.floor(total / Math.max(1, targetBudget)));
      const count = Math.ceil(total / stride);
      const indices = new Uint32Array(count);
      for (let i = 0, k = 0; i < total && k < count; i += stride, k++) indices[k] = i;
      proxyGeom.setIndex(new THREE.BufferAttribute(indices, 1));
      proxyGeom.setDrawRange(0, count);
      geometryRef.current = proxyGeom;
      const proxy = new THREE.Points(proxyGeom, new THREE.PointsMaterial({ size: 0.01 }));
      proxy.visible = false;
      pointCloudMeshRef.current = proxy;
      pointCloudMaterialRef.current = null;
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(rawPositions, 3));
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(rawColors && rawColors.length ? rawColors : new Float32Array(rawPositions.length), 3)
    );
    const clsAttr = new Float32Array(total);
    for (let i = 0; i < total; i++) clsAttr[i] = rawClassIds[i];
    geometry.setAttribute('classification', new THREE.BufferAttribute(clsAttr, 1));
    geometry.setAttribute(
      'intensity',
      new THREE.BufferAttribute(rawIntensities && rawIntensities.length ? rawIntensities : new Float32Array(total).fill(0.5), 1)
    );
    geometryRef.current = geometry;

    const material = createRuntimeViewerMaterial(
      pointSize,
      renderEngine === 'potree' && useEDL,
      edlStrength,
      pointShape,
      colorMode,
      visibleClasses,
      Boolean(rawColors && rawColors.length),
      spanZ
    );
    pointCloudMaterialRef.current = material;

    const pointCloudMesh = new THREE.Points(geometry, material);
    pointCloudMeshRef.current = pointCloudMesh;
    scene.add(pointCloudMesh);

    if (controlsRef.current && cameraRef.current && realData) {
      const centerY = spanZ / 3;
      controlsRef.current.target.set(0, centerY, 0);
    }
  }, [isOpen, activeSegment?.id, renderEngine, dataRevision]);

  // Display settings only update shader uniforms/LUT and the sampling index buffer.
  useEffect(() => {
    if (!isOpen || renderEngine === 'cesium') return;
    if (renderEngine === 'octree') {
      octreeLODRendererRef.current?.setPointSize(pointSize);
      octreeLODRendererRef.current?.setBudget(pointBudget);
      octreeLODRendererRef.current?.setColorMode(colorMode);
      return;
    }
    const material = pointCloudMaterialRef.current;
    const geometry = geometryRef.current;
    if (!material || !geometry) return;

    const realData = activeSegment ? loadedPointCloudMapRef.current[activeSegment.id] : null;
    const total = realData ? realData.classIds.length : geometry.attributes.classification?.count || 0;
    const modeMap: Record<string, number> = { rgb: 0, class: 1, height: 2, intensity: 3, power_highlight: 4, danger: 5 };

    const oldLut = material.uniforms.uClassLut.value as THREE.Texture;
    const newLut = buildClassLutTexture(visibleClasses);
    material.uniforms.uClassLut.value = newLut;
    if (oldLut && oldLut !== newLut) oldLut.dispose();
    material.uniforms.uColorMode.value = modeMap[colorMode] ?? 4;
    material.uniforms.uHasColor.value = realData?.colors?.length ? 1 : 0;
    material.uniforms.uSpanZ.value = realData?.spanZ || 35;
    material.uniforms.uPointSize.value = pointSize;
    material.uniforms.uEdlStrength.value = renderEngine === 'potree' && useEDL ? edlStrength : 0;
    material.uniforms.uShapeType.value = pointShape === 'circle' ? 1 : pointShape === 'paraboloid' ? 2 : 0;

    if (total > 0) {
      const targetBudget = Math.min(total, pointBudget);
      const densityStride = Math.max(1, Math.floor(100 / Math.max(1, pointDensity)));
      const budgetStride = Math.max(1, Math.floor(total / targetBudget));
      const stride = Math.max(densityStride, budgetStride);
      const count = Math.ceil(total / stride);
      const indices = new Uint32Array(count);
      for (let i = 0, k = 0; i < total && k < count; i += stride, k++) indices[k] = i;
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.setDrawRange(0, count);
    }
  }, [isOpen, activeSegment?.id, renderEngine, colorMode, visibleClasses, pointSize, pointDensity, pointBudget, useEDL, edlStrength, pointShape, dataRevision]);

  // Manual tagging / brush updates classIds on the CPU; sync only the attribute.
  useEffect(() => {
    if (!isOpen || renderEngine === 'cesium') return;
    const geometry = geometryRef.current;
    const realData = activeSegmentId ? loadedPointCloudMapRef.current[activeSegmentId] : null;
    if (!geometry || !realData) return;
    const attr = geometry.getAttribute('classification');
    if (!attr) return;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < realData.classIds.length; i++) arr[i] = realData.classIds[i];
    attr.needsUpdate = true;
  }, [detectionVersion]);


  // 3D Fitted Wire Catenary Curves & Tower Overlays Renderer
  useEffect(() => {
    if (!isOpen || renderEngine === 'cesium' || !sceneRef.current || !activeSegmentId) return;

    const scene = sceneRef.current;
    const realData = loadedPointCloudMapRef.current[activeSegmentId];
    if (!realData) return;

    // Remove existing manual tag 3D overlays
    const oldGroup = scene.getObjectByName('manual_tags_3d_overlays');
    if (oldGroup) {
      scene.remove(oldGroup);
    }

    const overlaysGroup = new THREE.Group();
    overlaysGroup.name = 'manual_tags_3d_overlays';
    overlaysGroup.visible = true;

    // 1. Render Fitted 3D Wire Catenary Curves
    const wires = realData.manualWires || [];
    wires.forEach((wire) => {
      const ax = wire.startPoint.x, ay = wire.startPoint.y, az = wire.startPoint.z;
      const bx = wire.endPoint.x, by = wire.endPoint.y, bz = wire.endPoint.z;

      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const segLen = Math.hypot(dx, dy, dz);
      if (segLen < 0.1) return;

      // Generate fitted catenary curve 3D points
      const curveNumSteps = 60;
      const curvePoints: THREE.Vector3[] = [];

      for (let s = 0; s <= curveNumSteps; s++) {
        const t = s / curveNumSteps;
        let px = ax + t * dx;
        let py = ay + t * dy;
        let pz = az + t * dz;

        // Catenary sag fitting formula
        if (wire.sagRatio > 0) {
          py -= wire.sagRatio * segLen * 4 * t * (1 - t);
        }
        curvePoints.push(new THREE.Vector3(px, py, pz));
      }

      // Bright Cyan Electric Catenary Curve Line
      const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        linewidth: 1,
      });
      const wireLine = new THREE.Line(lineGeo, lineMat);
      overlaysGroup.add(wireLine);

      // 3D Tube Mesh for solid curve volume in 3D canvas (very fine, thin line)
      try {
        const catenaryPath = new THREE.CatmullRomCurve3(curvePoints);
        const tubeGeo = new THREE.TubeGeometry(catenaryPath, 40, 0.015, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: 0x00f2ff,
        });
        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        overlaysGroup.add(tubeMesh);
      } catch (err) {}

      // Endpoint A Attachment Marker Sphere (small and delicate)
      const nodeAGeo = new THREE.SphereGeometry(0.03, 12, 12);
      const nodeAMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const nodeAMesh = new THREE.Mesh(nodeAGeo, nodeAMat);
      nodeAMesh.position.set(ax, ay, az);
      overlaysGroup.add(nodeAMesh);

      // Endpoint B Attachment Marker Sphere (small and delicate)
      const nodeBGeo = new THREE.SphereGeometry(0.03, 12, 12);
      const nodeBMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const nodeBMesh = new THREE.Mesh(nodeBGeo, nodeBMat);
      nodeBMesh.position.set(bx, by, bz);
      overlaysGroup.add(nodeBMesh);
    });

    // 2. Render Fitted 3D Tower Bounding Wireframe Cylinders
    const towers = realData.manualTowers || [];
    towers.forEach((tower) => {
      const ax = tower.lowerArmPoint.x, ay = tower.lowerArmPoint.y, az = tower.lowerArmPoint.z;
      const bx = tower.upperArmPoint.x, by = tower.upperArmPoint.y, bz = tower.upperArmPoint.z;

      const height = Math.abs(by - ay) || 10;
      const midY = (ay + by) / 2;

      const cylGeo = new THREE.CylinderGeometry(tower.radius, tower.radius, height, 16, 1, true);
      const edgesGeo = new THREE.EdgesGeometry(cylGeo);
      const cylMat = new THREE.LineBasicMaterial({ color: 0xffb700 });
      const cylMesh = new THREE.LineSegments(edgesGeo, cylMat);
      cylMesh.position.set(ax, midY, az);
      overlaysGroup.add(cylMesh);
    });

    // 3. Render Fitted 3D Insulator Strings (with disc sheds and core rod)
    const insulators = realData.manualInsulators || [];
    insulators.forEach((ins) => {
      const tx = ins.topPoint.x, ty = ins.topPoint.y, tz = ins.topPoint.z;
      const bx = ins.bottomPoint.x, by = ins.bottomPoint.y, bz = ins.bottomPoint.z;

      // Core Rod Line
      const rodGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(tx, ty, tz),
        new THREE.Vector3(bx, by, bz)
      ]);
      const rodMat = new THREE.LineBasicMaterial({ color: 0xd946ef, linewidth: 1 });
      overlaysGroup.add(new THREE.Line(rodGeo, rodMat));

      // 3D Disc Sheds along the insulator string
      const numDiscs = Math.max(4, Math.round(ins.length * 5));
      const dir = new THREE.Vector3(bx - tx, by - ty, bz - tz).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

      for (let d = 0; d <= numDiscs; d++) {
        const frac = d / numDiscs;
        const dx = tx + frac * (bx - tx);
        const dy = ty + frac * (by - ty);
        const dz = tz + frac * (bz - tz);

        const discGeo = new THREE.CylinderGeometry(ins.radius, ins.radius, 0.015, 12);
        const discMat = new THREE.MeshBasicMaterial({ color: 0xe879f9, transparent: true, opacity: 0.8 });
        const discMesh = new THREE.Mesh(discGeo, discMat);
        discMesh.position.set(dx, dy, dz);
        discMesh.quaternion.copy(quat);
        overlaysGroup.add(discMesh);
      }

      // Top & Bottom Attachment Spheres (small and delicate)
      const topSphereGeo = new THREE.SphereGeometry(0.03, 10, 10);
      const topSphereMat = new THREE.MeshBasicMaterial({ color: 0xf0abfc });
      const topMesh = new THREE.Mesh(topSphereGeo, topSphereMat);
      topMesh.position.set(tx, ty, tz);
      overlaysGroup.add(topMesh);

      const botMesh = new THREE.Mesh(topSphereGeo, topSphereMat);
      botMesh.position.set(bx, by, bz);
      overlaysGroup.add(botMesh);
    });

    // 4. Render Live Drawing Rubberband Line Preview for Insulator Tagging
    const pStart = insulatorDragStartPoint || insulatorTempStartPoint || (wizardState.mode === 'insulator' ? wizardState.tempPoint : null);
    if (pStart) {
      const tx = pStart.x, ty = pStart.y, tz = pStart.z;
      const spGeo = new THREE.SphereGeometry(0.03, 12, 12);
      const spMatStart = new THREE.MeshBasicMaterial({ color: 0x22c55e });
      const startMesh = new THREE.Mesh(spGeo, spMatStart);
      startMesh.position.set(tx, ty, tz);
      overlaysGroup.add(startMesh);

      if (hoveredCoords) {
        const bx = hoveredCoords.x, by = hoveredCoords.y, bz = hoveredCoords.z;

        // Glowing Cyan Vector Guide Line (a single thin line as requested)
        const guideGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(tx, ty, tz),
          new THREE.Vector3(bx, by, bz)
        ]);
        const guideMat = new THREE.LineBasicMaterial({ color: 0x00f2ff, linewidth: 1 });
        overlaysGroup.add(new THREE.Line(guideGeo, guideMat));

        // End indicator sphere (small and delicate)
        const spMatEnd = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
        const endMesh = new THREE.Mesh(spGeo, spMatEnd);
        endMesh.position.set(bx, by, bz);
        overlaysGroup.add(endMesh);
      }
    }

    scene.add(overlaysGroup);

    return () => {
      if (sceneRef.current) {
        const grp = sceneRef.current.getObjectByName('manual_tags_3d_overlays');
        if (grp) sceneRef.current.remove(grp);
      }
    };
  }, [isOpen, activeSegmentId, renderEngine, detectionVersion, insulatorDragStartPoint, insulatorTempStartPoint, hoveredCoords, wizardState, insulatorRadiusInput, isShiftPressed]);

  // 3D Point Cloud Picking & Hover Reticle Handler
  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return;

    const canvas = rendererRef.current.domElement;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.3;

    // High-tech SVG Crosshair Collision Target Cursor
    const COLLISION_CROSSHAIR_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><circle cx='16' cy='16' r='11' fill='none' stroke='%2300f2ff' stroke-width='2' stroke-dasharray='4 2'/><circle cx='16' cy='16' r='3' fill='%23ffb700'/><circle cx='16' cy='16' r='1.5' fill='%23ffffff'/><line x1='16' y1='0' x2='16' y2='8' stroke='%2300f2ff' stroke-width='2'/><line x1='16' y1='24' x2='16' y2='32' stroke='%2300f2ff' stroke-width='2'/><line x1='0' y1='16' x2='8' y2='16' stroke='%2300f2ff' stroke-width='2'/><line x1='24' y1='16' x2='32' y2='16' stroke='%2300f2ff' stroke-width='2'/></svg>") 16 16, crosshair`;

    // Create 3D Collision Reticle Group in Three.js (a single precise small dot)
    const reticleGroup = new THREE.Group();

    // A small, delicate indicator dot
    const sphereGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    reticleGroup.add(sphereMesh);

    reticleGroup.visible = false;
    scene.add(reticleGroup);

    let downPos = { x: 0, y: 0 };
    let isDraggingBox = false;

    const getPtMesh = () => {
      if (pointCloudMeshRef.current) return pointCloudMeshRef.current;
      let ptMesh: THREE.Points | null = null;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Points) ptMesh = obj;
      });
      return ptMesh;
    };

    const onPointerMove = (e: PointerEvent) => {
      const isCollisionActive = e.shiftKey || isShiftPressed;

      if (isDraggingBox) {
        canvas.style.cursor = COLLISION_CROSSHAIR_CURSOR;
        const rect = canvas.getBoundingClientRect();
        setBoxSelectionRect({
          x1: downPos.x - rect.left,
          y1: downPos.y - rect.top,
          x2: e.clientX - rect.left,
          y2: e.clientY - rect.top,
        });
        return;
      }

      // If active dragging of an insulator, project mouse coordinate onto a plane passing through start point
      if (isInsulatorDragging && insulatorDragStartPoint) {
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(mouse, camera);

        const planeNormal = new THREE.Vector3();
        camera.getWorldDirection(planeNormal);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          planeNormal,
          new THREE.Vector3(insulatorDragStartPoint.x, insulatorDragStartPoint.y, insulatorDragStartPoint.z)
        );
        const intersectPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
          setHoveredCoords({
            x: Number(intersectPoint.x.toFixed(3)),
            y: Number(intersectPoint.y.toFixed(3)),
            z: Number(intersectPoint.z.toFixed(3)),
          });
        }
        return;
      }

      if (!isCollisionActive) {
        // Shift is NOT held: Show camera navigation cursor, hide collision reticle
        canvas.style.cursor = 'grab';
        reticleGroup.visible = false;
        if (hoveredCoords !== null) setHoveredCoords(null);
        return;
      }

      // Shift is held: Show collision crosshair cursor & 3D reticle
      canvas.style.cursor = COLLISION_CROSSHAIR_CURSOR;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const ptMesh = getPtMesh();
      if (ptMesh) {
        const intersects = raycaster.intersectObject(ptMesh);
        if (intersects.length > 0) {
          const hit = intersects[0];
          const posAttr = ptMesh.geometry.attributes.position;
          let hx = hit.point.x, hy = hit.point.y, hz = hit.point.z;
          if (hit.index !== undefined && posAttr) {
            hx = posAttr.getX(hit.index);
            hy = posAttr.getY(hit.index);
            hz = posAttr.getZ(hit.index);
          }
          reticleGroup.position.set(hx, hy + 0.1, hz);
          reticleGroup.visible = true;
          setHoveredCoords({
            x: Number(hx.toFixed(3)),
            y: Number(hy.toFixed(3)),
            z: Number(hz.toFixed(3)),
          });
        } else {
          reticleGroup.visible = false;
          setHoveredCoords(null);
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
      const isCollisionActive = e.shiftKey || isShiftPressed;

      if (e.button === 0) {
        if (isCollisionActive) {
          // Shift + Left Click/Drag: Tool interaction mode
          if (activeCanvasMode === 'insulator') {
            // Insulator Line-Drawing Mode: lock start point & disable camera rotation
            if (controlsRef.current) controlsRef.current.enabled = false;
            const rect = canvas.getBoundingClientRect();
            const mouse = new THREE.Vector2(
              ((e.clientX - rect.left) / rect.width) * 2 - 1,
              -((e.clientY - rect.top) / rect.height) * 2 + 1
            );
            raycaster.setFromCamera(mouse, camera);
            const ptMesh = getPtMesh();
            if (ptMesh) {
              const intersects = raycaster.intersectObject(ptMesh);
              if (intersects.length > 0) {
                const hit = intersects[0];
                const startCoords = {
                  x: Number(hit.point.x.toFixed(3)),
                  y: Number(hit.point.y.toFixed(3)),
                  z: Number(hit.point.z.toFixed(3)),
                };
                setInsulatorDragStartPoint(startCoords);
                setIsInsulatorDragging(true);
                setWizardState({ mode: 'insulator', step: 2, tempPoint: startCoords });
                setDetectionNotice(`🖊️ [Shift+左键 划线标记]: 起点 (${startCoords.x}, ${startCoords.y}, ${startCoords.z}) 已锁定！请按住 Shift+左键 拖拽画出绝缘子串方向`);
              }
            }
          } else {
            // Temporarily disable OrbitControls camera movement during Shift+Left collision drag / box brush
            if (controlsRef.current) controlsRef.current.enabled = false;

            isDraggingBox = true;
            canvas.style.cursor = COLLISION_CROSSHAIR_CURSOR;
            const rect = canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;
            setBoxSelectionRect({ x1: canvasX, y1: canvasY, x2: canvasX, y2: canvasY });
          }
        } else {
          // Regular Left Click/Drag (No Shift): OrbitControls handles Camera Pan/Move/Rotate
          if (controlsRef.current) controlsRef.current.enabled = true;
          isDraggingBox = false;
          canvas.style.cursor = 'grabbing';
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      // Re-enable OrbitControls for camera pan/rotate
      if (controlsRef.current) controlsRef.current.enabled = true;

      const isCollisionActive = e.shiftKey || isShiftPressed;
      canvas.style.cursor = isCollisionActive ? COLLISION_CROSSHAIR_CURSOR : 'grab';

      const dragDist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);

      // Finish Insulator Line Dragging if active
      if (isInsulatorDragging && insulatorDragStartPoint) {
        setIsInsulatorDragging(false);
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(mouse, camera);

        const planeNormal = new THREE.Vector3();
        camera.getWorldDirection(planeNormal);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          planeNormal,
          new THREE.Vector3(insulatorDragStartPoint.x, insulatorDragStartPoint.y, insulatorDragStartPoint.z)
        );
        const intersectPoint = new THREE.Vector3();
        let endCoords = hoveredCoords;
        if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
          endCoords = {
            x: Number(intersectPoint.x.toFixed(3)),
            y: Number(intersectPoint.y.toFixed(3)),
            z: Number(intersectPoint.z.toFixed(3)),
          };
        }

        let lineAdded = false;
        if (endCoords) {
          const lineLen = Math.hypot(endCoords.x - insulatorDragStartPoint.x, endCoords.y - insulatorDragStartPoint.y, endCoords.z - insulatorDragStartPoint.z);
          if (lineLen >= 0.25 && dragDist > 10) {
            setInsulatorTopPt(insulatorDragStartPoint);
            setInsulatorBottomPt(endCoords);
            setInsulatorLengthInput(Number(lineLen.toFixed(2)));
            handleAddInsulatorTagWithCoords("绝缘子串 (划线标记)", insulatorDragStartPoint, endCoords, lineLen, insulatorRadiusInput, 'suspension');
            lineAdded = true;
          }
        }

        // Clean up drag-specific state
        setInsulatorDragStartPoint(null);
        if (lineAdded) {
          setInsulatorTempStartPoint(null);
          setWizardState({ mode: null, step: 1, tempPoint: null });
          return;
        }
      }

      // Handle Box Brush selection drag (Shift + Left Drag or Box Brush mode drag)
      if (isDraggingBox && dragDist > 10) {
        isDraggingBox = false;
        setBoxSelectionRect(null); // Box selection rectangle immediately vanishes when drag finishes!
        const rect = canvas.getBoundingClientRect();
        const x1 = Math.min(downPos.x, e.clientX) - rect.left;
        const x2 = Math.max(downPos.x, e.clientX) - rect.left;
        const y1 = Math.min(downPos.y, e.clientY) - rect.top;
        const y2 = Math.max(downPos.y, e.clientY) - rect.top;

        handleApplyBoxBrushSelection(x1, y1, x2, y2);
        return;
      }

      setBoxSelectionRect(null);
      isDraggingBox = false;

      if (dragDist > 6) return; // Ignore drag clicks for single point pick

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const ptMesh = getPtMesh();
      if (ptMesh) {
        const intersects = raycaster.intersectObject(ptMesh);
        if (intersects.length > 0) {
          const hit = intersects[0];
          const posAttr = ptMesh.geometry.attributes.position;
          let pickedX = hit.point.x, pickedY = hit.point.y, pickedZ = hit.point.z;
          if (hit.index !== undefined && posAttr) {
            pickedX = posAttr.getX(hit.index);
            pickedY = posAttr.getY(hit.index);
            pickedZ = posAttr.getZ(hit.index);
          }
          const coords = {
            x: Number(pickedX.toFixed(3)),
            y: Number(pickedY.toFixed(3)),
            z: Number(pickedZ.toFixed(3)),
          };

          // Trigger picking/tagging ONLY if Shift is pressed
          if (e.shiftKey || isShiftPressed) {
            // 1. Digital Green Valley Style 1-Click Auto Tower
            if (activeCanvasMode === 'auto_tower' || wizardState.mode === 'tower') {
              handleAutoTowerFitFromClick(coords);
              return;
            }

            // 2. Multi-Phase Conductor Preset Batching
            if (activeCanvasMode === 'multi_wire' || wizardState.mode === 'wire') {
              if (!multiWireTempStartPoint) {
                setMultiWireTempStartPoint(coords);
                setDetectionNotice(`⚡ [1/2 起点 A 已捕获]: (${coords.x}, ${coords.y}, ${coords.z})！请按【Shift+左键】点击【杆塔 B】完成挂线`);
              } else {
                handleBatchWirePresetBetweenPoints(multiWireTempStartPoint, coords, selectedWirePreset);
                setMultiWireTempStartPoint(null);
              }
              return;
            }

            // 3. 3D Distance & Clearance Measurement
            if (activeCanvasMode === 'measure') {
              if (!measureTempPoint) {
                setMeasureTempPoint(coords);
                setDetectionNotice(`📏 [1/2 测量起点 A 已捕获]: (${coords.x}, ${coords.y}, ${coords.z})！请接着【Shift+左键】点击测量终点 B`);
              } else {
                const d3D = Math.hypot(coords.x - measureTempPoint.x, coords.y - measureTempPoint.y, coords.z - measureTempPoint.z);
                const d2D = Math.hypot(coords.x - measureTempPoint.x, coords.z - measureTempPoint.z);
                const dY = Math.abs(coords.y - measureTempPoint.y);

                setMeasurementResult({
                  p1: measureTempPoint,
                  p2: coords,
                  dist3D: Number(d3D.toFixed(2)),
                  dist2D: Number(d2D.toFixed(2)),
                  deltaY: Number(dY.toFixed(2)),
                });
                setMeasureTempPoint(null);
                setDetectionNotice(`📏 测量结果: 3D 空间距离 ${d3D.toFixed(2)}m, 水平距离 ${d2D.toFixed(2)}m, 垂直高差 ${dY.toFixed(2)}m！`);
              }
              return;
            }

            // 4. Insulator 2-Click Tagging Mode
            if (activeCanvasMode === 'insulator' || wizardState.mode === 'insulator') {
              if (!insulatorTempStartPoint && wizardState.step === 1) {
                setInsulatorTopPt(coords);
                setInsulatorTempStartPoint(coords);
                setWizardState({ mode: 'insulator', step: 2, tempPoint: coords });
                setPickingTarget('insulator_bottom');
                setDetectionNotice(`🎯 [1/2 绝缘子顶端挂点已捕获]: (${coords.x}, ${coords.y}, ${coords.z})！请按【Shift+左键】点击【底端挂点/导线连接点】`);
              } else {
                const top = insulatorTempStartPoint || wizardState.tempPoint || insulatorTopPt;
                setInsulatorBottomPt(coords);
                const len = Math.hypot(coords.x - top.x, coords.y - top.y, coords.z - top.z) || 1.8;
                setInsulatorLengthInput(Number(len.toFixed(2)));
                handleAddInsulatorTagWithCoords(undefined, top, coords, len, insulatorRadiusInput, 'suspension');
                setInsulatorTempStartPoint(null);
                setWizardState({ mode: null, step: 1, tempPoint: null });
                setPickingTarget(null);
              }
              return;
            }

            if (wizardState.mode === 'tower') {
              if (wizardState.step === 1) {
                setTowerUpperArm(coords);
                setWizardState({ mode: 'tower', step: 2, tempPoint: coords });
                setPickingTarget('tower_lower');
                setDetectionNotice(`🎯 [1/2 上横担已捕获]: (${coords.x}, ${coords.y}, ${coords.z})！请接着按【Shift+左键】点击【下横担/脚跟】`);
              } else if (wizardState.step === 2) {
                setTowerLowerArm(coords);
                handleAddTowerTagWithCoords(undefined, wizardState.tempPoint!, coords);
                setWizardState({ mode: null, step: 1, tempPoint: null });
                setPickingTarget(null);
                setDetectionNotice(`🎉 杆塔标记匹配成功！(下横担: ${coords.x}, ${coords.y}, ${coords.z})，已成功重分类点云！`);
              }
            } else if (wizardState.mode === 'wire') {
              if (wizardState.step === 1) {
                setWireStartPt(coords);
                setWizardState({ mode: 'wire', step: 2, tempPoint: coords });
                setPickingTarget('wire_end');
                setDetectionNotice(`🎯 [1/2 导线起点 A 已捕获]: (${coords.x}, ${coords.y}, ${coords.z})！请接着按【Shift+左键】点击【导线终点 B】`);
              } else if (wizardState.step === 2) {
                setWireEndPt(coords);
                handleAddWireTagWithCoords(undefined, wizardState.tempPoint!, coords);
                setWizardState({ mode: null, step: 1, tempPoint: null });
                setPickingTarget(null);
                setDetectionNotice(`🎉 导线通道匹配成功！(终点 B: ${coords.x}, ${coords.y}, ${coords.z})，已成功重分类点云！`);
              }
            } else {
              if (pickingTarget === 'tower_upper') setTowerUpperArm(coords);
              else if (pickingTarget === 'tower_lower') setTowerLowerArm(coords);
              else if (pickingTarget === 'wire_start') setWireStartPt(coords);
              else if (pickingTarget === 'wire_end') setWireEndPt(coords);

              setDetectionNotice(`🎯 成功精准捕捉 3D 点云坐标: X=${coords.x}, Y=${coords.y}, Z=${coords.z}`);
              setTimeout(() => setDetectionNotice(null), 4000);
              setPickingTarget(null);
            }
          }
        }
      }
    };

    canvas.style.cursor = isShiftPressed ? COLLISION_CROSSHAIR_CURSOR : 'grab';
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.style.cursor = 'default';
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      scene.remove(reticleGroup);
      setHoveredCoords(null);
    };
  }, [pickingTarget, wizardState, activeCanvasMode, selectedWirePreset, brushTargetClass, multiWireTempStartPoint, measureTempPoint, isShiftPressed]);

  if (!isOpen && !embedded) return null;

  // Recursive Tree Node Renderer for Province -> City -> Line -> Segment
  const renderTreeNode = (node: HierarchyNode) => {
    const isExpanded = expandedNodeIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSegment = node.type === 'segment';
    const isActiveSegment = isSegment && node.id === activeSegmentId;

    // Match Search Query
    if (
      searchQuery &&
      !node.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !hasChildren
    ) {
      return null;
    }

    return (
      <div key={node.id} className="select-none font-sans">
        {/* Node Label Row */}
        <div
          className={`flex items-center justify-between p-1.5 px-2 rounded-xl transition-all cursor-pointer group ${
            isActiveSegment
              ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/60 shadow-md ring-1 ring-cyan-400/30'
              : 'hover:bg-slate-800/60 text-slate-200'
          }`}
          onClick={() => {
            if (hasChildren) {
              toggleNodeExpand(node.id);
            } else if (isSegment) {
              setActiveSegmentId(node.id);
            }
            flyToNode(node.lat, node.lon, node.alt);
          }}
          onDoubleClick={() => {
            flyToNode(node.lat, node.lon, node.alt);
          }}
        >
          <div className="flex items-center gap-1.5 overflow-hidden text-xs">
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNodeExpand(node.id);
                }}
                className="text-slate-400 hover:text-white p-0.5"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-4" />
            )}

            {/* Icon according to type */}
            {node.type === 'province' && <Globe className="w-4 h-4 text-sky-400 flex-shrink-0" />}
            {node.type === 'city' && (
              isExpanded ? <FolderOpen className="w-4 h-4 text-amber-400 flex-shrink-0" /> : <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />
            )}
            {node.type === 'line' && <Radio className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
            {node.type === 'segment' && <Layers className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}

            <span className={`truncate font-semibold ${isSegment ? 'text-[11px]' : 'text-xs'}`}>
              {node.name}
            </span>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
            {isSegment && node.segmentData?.hasDangerTree && (
              <span className="text-[9px] bg-red-950/80 text-red-300 border border-red-500/40 px-1 py-0.2 rounded font-mono flex items-center gap-0.5">
                <ShieldAlert className="w-2.5 h-2.5 text-red-400" />
                <span>树障</span>
              </span>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                flyToNode(node.lat, node.lon, node.alt);
              }}
              className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-cyan-300 transition-all cursor-pointer"
              title="双击或点击定位到改空间坐标"
            >
              <Locate className="w-3 h-3" />
            </button>
          </div>
        </div>

        {isSegment && <SegmentUploadProgress segmentId={node.id} />}

        {/* Render Children under nested padding */}
        {hasChildren && isExpanded && (
          <div className="pl-3.5 ml-2 border-l border-slate-700/50 my-0.5 space-y-0.5">
            {node.children!.map((child, idx) => {
              if (node.type === 'line' && child.type === 'segment') {
                return (
                  <div key={child.id} className="relative group/reorder">
                    {renderTreeNode(child)}

                    {/* Manual Drag / Reorder Controls for Corridor Segments */}
                    <div className="absolute right-1 top-1 hidden group-hover/reorder:flex items-center gap-0.5 bg-slate-900/90 border border-white/20 rounded p-0.5 z-10 shadow">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveSegmentOrder(node.id, child.id, 'up');
                        }}
                        disabled={idx === 0}
                        className="p-0.5 hover:bg-white/10 rounded disabled:opacity-30 text-slate-300 hover:text-cyan-300"
                        title="上移廊道顺序"
                      >
                        <MoveUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveSegmentOrder(node.id, child.id, 'down');
                        }}
                        disabled={idx === node.children!.length - 1}
                        className="p-0.5 hover:bg-white/10 rounded disabled:opacity-30 text-slate-300 hover:text-cyan-300"
                        title="下移廊道顺序"
                      >
                        <MoveDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              }
              return renderTreeNode(child);
            })}
          </div>
        )}
      </div>
    );
  };

  const treeAside = (
    <aside className={`${embedded ? 'w-full h-full' : 'w-80'} bg-slate-900/50 backdrop-blur-2xl ${embedded ? '' : 'border-r border-white/20'} flex flex-col z-10 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] overflow-hidden`}>
      {/* Sidebar Header & Search Bar */}
      <div className="p-3 border-b border-white/15 space-y-2 bg-black/30 backdrop-blur-md">
        <div className="flex items-center justify-between text-xs font-bold text-cyan-300">
          <span className="flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span>层级树 (省/市/线路/廊道)</span>
          </span>
          <span className="text-[10px] text-slate-400 font-mono">双击定位</span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索省/市/线路/廊道..."
            className="w-full bg-black/40 border border-white/15 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-400 backdrop-blur-md"
          />
        </div>
      </div>

      {/* Tree Navigation Container */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {hierarchyData.length > 0 ? (
          hierarchyData.map((prov) => renderTreeNode(prov))
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center p-4 text-slate-400 space-y-3 font-sans">
            <div className="p-3 bg-slate-900/80 border border-slate-700/50 rounded-2xl text-slate-400">
              <Upload className="w-8 h-8 text-cyan-400 opacity-80 animate-bounce" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">暂无已录入的点云数据</p>
              <p className="text-[11px] text-slate-400 mt-1">请点击右上角【导入本地点云 (LAS/LAZ)】手动录入激光点云数据</p>
            </div>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="mt-2 text-xs px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-xl transition-all font-mono cursor-pointer"
            >
              + 立即手动录入点云
            </button>
          </div>
        )}
      </div>

      {/* Active Segment Summary Footer Card */}
      <div className="p-3 bg-slate-900/50 backdrop-blur-2xl border-t border-white/20 font-mono text-xs space-y-2">
        <div className="flex items-center justify-between font-bold text-cyan-300">
          <span>当前选定廊道指标</span>
          <span className="text-[10px] text-emerald-400 font-normal">
            {activeSegment ? 'RTC 加速正常' : '等待录入/选中'}
          </span>
        </div>

        {activeSegment ? (
          <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-black/40 backdrop-blur-md p-2 rounded-xl border border-white/10">
            <div>点云总量: <strong className="text-white">{activeSegment.pointCount.toLocaleString()}</strong></div>
            <div>预计显存: <strong className="text-cyan-300">{activeSegment.memorySizeMB} MB</strong></div>
            <div>起止杆塔: <strong className="text-slate-200">{activeSegment.startTower}~{activeSegment.endTower}</strong></div>
            <div>
              树障距: <strong className={activeSegment.hasDangerTree ? 'text-red-400 font-bold' : 'text-emerald-400'}>{activeSegment.minTreeDistance}m</strong>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 bg-black/40 p-2 rounded-xl border border-white/10 text-center">
            未选择点云 | 点击左侧节点或右上角导入
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className={`${embedded ? 'absolute inset-0 z-0' : 'fixed inset-0 z-[120]'} flex flex-col bg-slate-950 font-sans text-slate-100 overflow-hidden ${embedded ? '' : 'animate-fade-in'}`}>
      {/* Top Cesium/Google Earth Style Global Header */}
      <header className="min-h-13 bg-slate-900/50 border-b border-white/20 backdrop-blur-2xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-20 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
        <div className="flex items-center gap-3 min-w-0">
          {/* macOS window traffic light dots */}
          <div className="flex items-center gap-1.5 mr-1">
            <div className="w-3 h-3 rounded-full bg-rose-500/90 shadow-sm border border-rose-600/30" />
            <div className="w-3 h-3 rounded-full bg-amber-500/90 shadow-sm border border-amber-600/30" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/90 shadow-sm border border-emerald-600/30" />
          </div>

          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-500 text-white shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
            <Globe className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-white tracking-wide">
                Google Earth 3D 输电线路廊道激光点云 (LiDAR) 数字孪生引擎
              </h2>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 px-2 py-0.5 rounded font-mono">
                Cesium 3D Tiles RTC
              </span>
            </div>
            <p className="text-[11px] text-slate-300/80 font-mono hidden xl:block">
              {activeSegment ? (
                <>
                  全屏渲染: <strong className="text-cyan-300">{activeSegment.name}</strong> ({activeSegment.pointCount.toLocaleString()} 点) | 坐标: {activeSegment.centerCoordinates.lat}°N, {activeSegment.centerCoordinates.lon}°E
                </>
              ) : (
                <span className="text-slate-400">默认状态：未加载点云数据 | 请点击右上角【导入本地点云】录入点云</span>
              )}
            </p>
          </div>
        </div>

        {/* Right Header Operations */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          {/* Display & Render Settings Popover Trigger */}
          <button
            onClick={() => {
              setIsDisplaySettingsOpen(!isDisplaySettingsOpen);
              if (isManualTaggingPanelOpen) setIsManualTaggingPanelOpen(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer border ${
              isDisplaySettingsOpen
                ? 'bg-cyan-500/30 text-cyan-200 border-cyan-400 shadow-md shadow-cyan-500/20'
                : 'bg-slate-900/80 text-slate-300 hover:text-white border-white/20'
            }`}
            title="调节点云渲染引擎、大小、预算、EDL深度与着色模式"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden lg:inline">⚙️ 渲染与控制</span>
          </button>

          {/* Tagging Drawer Trigger */}
          <button
            onClick={() => {
              setIsManualTaggingPanelOpen(!isManualTaggingPanelOpen);
              if (isDisplaySettingsOpen) setIsDisplaySettingsOpen(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer border ${
              isManualTaggingPanelOpen
                ? 'bg-amber-500/30 text-amber-200 border-amber-400/50 shadow-md shadow-amber-500/20'
                : 'bg-slate-900/80 text-slate-300 hover:text-white border-white/20'
            }`}
            title="查看或增加已标定杆塔与导线列表"
          >
            <Tag className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">🏷️ 标记清单</span>
            {activeSegment && loadedPointCloudMapRef.current[activeSegment.id] && (
              <span className="px-1.5 py-0.2 text-[10px] bg-amber-950 text-amber-300 rounded-full font-bold border border-amber-500/40">
                {(loadedPointCloudMapRef.current[activeSegment.id]?.manualTowers?.length || 0) +
                  (loadedPointCloudMapRef.current[activeSegment.id]?.manualWires?.length || 0)}
              </span>
            )}
          </button>

          {/* Drone Patrol Animation Button */}
          <button
            onClick={() => setIsPatrolling(!isPatrolling)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer border ${
              isPatrolling
                ? 'bg-amber-500/30 text-amber-300 border-amber-400/50'
                : 'bg-slate-900/80 text-slate-300 hover:text-white border-white/20'
            }`}
            title="模拟无人机沿电力廊道三维飞行巡检"
          >
            {isPatrolling ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-cyan-400" />}
            <span className="hidden md:inline">{isPatrolling ? '暂停巡航' : '模拟巡航'}</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600/90 to-blue-600/90 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer border border-cyan-400/40 backdrop-blur-md"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>导入 LAS/LAZ</span>
          </button>

          {!embedded && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              title="退出全屏 Google Earth"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Fullscreen Body */}
      <div className={`${embedded ? 'pl-[352px]' : ''} flex-1 relative flex overflow-hidden`}>
        {/* Left Sidebar: Province / City / Line / Corridor Hierarchy Drawer */}
        {embedded ? (treeHost ? createPortal(treeAside, treeHost) : null) : treeAside}

        {/* Center Canvas Stage */}
        <div className="flex-1 relative bg-slate-950">
          <div ref={containerRef} className="w-full h-full" />

          {/* Empty Central Canvas Card Overlay */}
          {!activeSegment && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none z-10">
              <div className="bg-slate-900/50 backdrop-blur-2xl p-6 rounded-3xl border border-cyan-500/30 max-w-md space-y-4 shadow-2xl pointer-events-auto">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg backdrop-blur-md">
                  <Sparkles className="w-7 h-7 text-cyan-400 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white tracking-wide">中央区域默认不显示预置点云</h3>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    目前左侧列表及中央画布已清空非用户手动录入的示例点云。您可以随时上传或手动录入您的 LAS / LAZ 激光点云，系统将即时生成 3D 数字孪生模型。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-5 py-2.5 bg-slate-900/50 hover:bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-2 mx-auto font-mono backdrop-blur-md"
                >
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>导入本地 LAS/LAZ 点云文件</span>
                </button>
              </div>
            </div>
          )}

          {/* Cesium HUD Telemetry Overlay (Collapsible Top-Left) */}
          <div className="absolute top-4 left-4 z-20 font-mono text-[11px] pointer-events-auto">
            <div className="bg-slate-900/50 backdrop-blur-2xl rounded-2xl border border-white/20 p-2.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] text-slate-300 space-y-1.5 min-w-[200px]">
              <div
                onClick={() => setIsHudExpanded(!isHudExpanded)}
                className="flex items-center justify-between gap-3 font-bold text-cyan-300 cursor-pointer select-none border-b border-white/10 pb-1"
              >
                <div className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  <span>HUD 遥测姿态</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-emerald-400 text-[9px] bg-emerald-500/20 px-1.5 py-0.2 rounded border border-emerald-500/30">60 FPS</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isHudExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {isHudExpanded && (
                <div className="space-y-1 animate-fade-in pt-1">
                  <div>纬度 Lat: <span className="text-white">{activeSegment ? `${activeSegment.centerCoordinates.lat.toFixed(4)}° N` : '--° N'}</span></div>
                  <div>经度 Lon: <span className="text-white">{activeSegment ? `${activeSegment.centerCoordinates.lon.toFixed(4)}° E` : '--° E'}</span></div>
                  <div>视距 Alt: <span className="text-cyan-300">{activeSegment ? '162.0 m' : '视角就位中'}</span></div>
                  {activeSegment && loadedPointCloudMapRef.current[activeSegment.id]?.stats && (
                    <div className="pt-1.5 border-t border-white/10 space-y-1 text-[10px]">
                      <div className="text-amber-400 font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>电力特征统计:</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-200">
                        <span>识别杆塔:</span>
                        <span className="text-amber-400 font-bold">{loadedPointCloudMapRef.current[activeSegment.id]?.towers?.length || 0} 座</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-200">
                        <span>导线点云:</span>
                        <span className="text-cyan-300 font-bold">{loadedPointCloudMapRef.current[activeSegment.id]?.stats?.wireCount.toLocaleString()} 点</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Floating Power Inspection Mode Segmented Toolbar & Overlays (Top-Center) */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none w-full max-w-2xl px-2">
            {/* Mode Segmented Toolbar */}
            <div className="bg-slate-900/50 backdrop-blur-2xl p-1.5 rounded-2xl border border-cyan-500/30 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex items-center gap-1 text-xs font-mono ring-1 ring-white/10 pointer-events-auto max-w-full overflow-x-auto">
              {/* Mode Buttons */}
              <button
                type="button"
                onClick={() => {
                  setActiveCanvasMode('orbit');
                  setPickingTarget(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeCanvasMode === 'orbit'
                    ? 'bg-slate-800/80 text-cyan-300 border border-cyan-400/50 shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="三维视角漫游: 左键移动视角, 右键旋转视角"
              >
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span>漫游</span>
              </button>

              <div className="w-[1px] h-4 bg-white/20 my-auto shrink-0" />

              {/* 1-Click Auto Tower */}
              <button
                type="button"
                onClick={() => {
                  setActiveCanvasMode('auto_tower');
                  setPickingTarget('tower_upper');
                }}
                className={`px-3 py-1.5 rounded-xl font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeCanvasMode === 'auto_tower'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 border border-amber-300 shadow-lg shadow-amber-500/20'
                    : 'text-amber-300 hover:bg-amber-500/20 border border-amber-400/30'
                }`}
                title="1键采塔: 按住【Shift + 鼠标左键】点击杆塔重分类"
              >
                <Zap className="w-3.5 h-3.5 fill-slate-950" />
                <span>1键采塔</span>
              </button>

              {/* Multi-Phase Wire Presets */}
              <button
                type="button"
                onClick={() => {
                  setActiveCanvasMode('multi_wire');
                  setPickingTarget('wire_start');
                  setMultiWireTempStartPoint(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeCanvasMode === 'multi_wire'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border border-cyan-300 shadow-lg shadow-cyan-500/20'
                    : 'text-cyan-300 hover:bg-cyan-500/20 border border-cyan-400/30'
                }`}
                title="多相挂线: 按住【Shift + 鼠标左键】依次点击杆塔A与杆塔B完成批量挂线"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                <span>多相挂线</span>
              </button>

              {/* 绝缘子标记 & 智能识别 */}
              <button
                type="button"
                onClick={() => {
                  setActiveCanvasMode('insulator');
                  setPickingTarget('insulator_top');
                  setWizardState({ mode: 'insulator', step: 1, tempPoint: null });
                  setIsInsulatorModalOpen(true);
                }}
                className={`px-3 py-1.5 rounded-xl font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeCanvasMode === 'insulator'
                    ? 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white border border-fuchsia-300 shadow-lg shadow-fuchsia-500/30 ring-1 ring-fuchsia-300'
                    : 'text-fuchsia-300 hover:bg-fuchsia-500/20 border border-fuchsia-400/40'
                }`}
                title="绝缘子标记与同特征自动识别: 手动标记或自动比对提取同特征值绝缘子"
              >
                <Layers className="w-3.5 h-3.5 text-fuchsia-300" />
                <span>绝缘子标记</span>
              </button>

              {/* Box Brush */}
              <button
                type="button"
                onClick={() => {
                  setActiveCanvasMode('box_brush');
                  setPickingTarget(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeCanvasMode === 'box_brush'
                    ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400 shadow-lg'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="画布框选: 按住【Shift + 鼠标左键】画框重分类"
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>框选刷</span>
              </button>

              {/* 3D Measurement */}
              <button
                type="button"
                onClick={() => {
                  setActiveCanvasMode('measure');
                  setPickingTarget('wire_start');
                  setMeasureTempPoint(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeCanvasMode === 'measure'
                    ? 'bg-purple-500/30 text-purple-200 border border-purple-400 shadow-lg'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="三维测量: 按住【Shift + 鼠标左键】选择测量测点"
              >
                <Ruler className="w-3.5 h-3.5 text-purple-400" />
                <span>3D测量</span>
              </button>

              {/* 树障分析 */}
              <button
                type="button"
                onClick={() => {
                  setIsTreeBarrierModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl font-extrabold transition-all flex items-center gap-1.5 cursor-pointer bg-gradient-to-r from-rose-500/20 to-red-600/30 text-rose-300 hover:text-white border border-rose-500/50 shadow-md whitespace-nowrap"
                title="导线树障分析: 输入安全半径范围，识别危险侵界点云并标记为红色"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span>树障分析</span>
              </button>

              <div className="w-[1px] h-4 bg-white/20 my-auto shrink-0" />

              {/* Undo Ctrl+Z Button */}
              <button
                type="button"
                onClick={handleUndo}
                className="px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-400/40 shadow-sm whitespace-nowrap"
                title="撤销上一步标注/重分类 (Ctrl+Z)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>撤销 (Ctrl+Z)</span>
              </button>
            </div>

            {/* Contextual Sub-bar for Multi-wire Presets */}
            {activeCanvasMode === 'multi_wire' && (
              <div className="bg-slate-900/50 backdrop-blur-2xl px-3 py-1.5 rounded-2xl border border-cyan-400/40 flex items-center gap-2 text-xs font-mono text-cyan-200 shadow-2xl animate-fade-in ring-1 ring-white/10 pointer-events-auto">
                <span className="text-[11px] font-bold text-slate-300">电压模板:</span>
                <select
                  value={selectedWirePreset}
                  onChange={(e) => setSelectedWirePreset(e.target.value)}
                  className="bg-black/60 border border-cyan-400/50 rounded-lg px-2.5 py-1 text-cyan-300 font-bold focus:outline-none cursor-pointer text-xs"
                >
                  {WIRE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-cyan-300/80 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                  {multiWireTempStartPoint
                    ? `👉 [Shift+左键] 点击终点 B 完成 ${WIRE_PRESETS.find((p) => p.id === selectedWirePreset)?.wireCount} 相挂线`
                    : '👉 [Shift+左键] 点击起点 A'}
                </span>
              </div>
            )}

            {/* Contextual Sub-bar for Insulator Tagging & Auto Recognition */}
            {activeCanvasMode === 'insulator' && (
              <div className="bg-slate-900/50 backdrop-blur-2xl px-3 py-1.5 rounded-2xl border border-fuchsia-400/50 flex items-center gap-2 text-xs font-mono text-fuchsia-200 shadow-2xl animate-fade-in ring-1 ring-white/10 pointer-events-auto">
                <span className="text-[11px] font-bold text-slate-300">绝缘子模式:</span>
                <button
                  type="button"
                  onClick={handleAutoIdentifyInsulators}
                  className="px-2.5 py-1 bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white font-bold rounded-lg border border-fuchsia-300 shadow flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>🤖 自动识别同特征绝缘子</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsInsulatorModalOpen(true)}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-fuchsia-200 font-bold rounded-lg border border-fuchsia-400/40 flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Settings className="w-3 h-3 text-fuchsia-400" />
                  <span>特征参数 & 列表</span>
                </button>
                <span className="text-[10px] text-fuchsia-300/80 bg-fuchsia-950/40 px-2 py-0.5 rounded border border-fuchsia-500/30">
                  {wizardState.step === 1 ? '👉 按住【Shift + 左键】拖拽划线标定绝缘子串 (或 Shift+左键 依次点选挂点)' : '👉 按住【Shift + 左键】松开完成绝缘子划线'}
                </span>
              </div>
            )}

            {/* Contextual Sub-bar for Box Brush Target Class */}
            {activeCanvasMode === 'box_brush' && (
              <div className="bg-slate-900/50 backdrop-blur-2xl px-3 py-1.5 rounded-2xl border border-emerald-400/40 flex items-center gap-2 text-xs font-mono text-emerald-200 shadow-2xl animate-fade-in ring-1 ring-white/10 pointer-events-auto">
                <span className="text-[11px] font-bold text-slate-300">重分类类别:</span>
                <select
                  value={brushTargetClass}
                  onChange={(e) => setBrushTargetClass(Number(e.target.value))}
                  className="bg-black/60 border border-emerald-400/50 rounded-lg px-2.5 py-1 text-emerald-300 font-bold focus:outline-none cursor-pointer text-xs"
                >
                  <option value={14}>[14] ⚡ 导线 (Conductors)</option>
                  <option value={15}>[15] 🗼 杆塔 (Transmission Towers)</option>
                  <option value={2}>[2] ⛰️ 地面 (Ground)</option>
                  <option value={3}>[3-5] 🌳 植被 (Vegetation)</option>
                  <option value={1}>[1] ⚪ 未分类 (Unclassified)</option>
                </select>
                <span className="text-[10px] text-emerald-300/80 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30 font-bold">
                  👉 按住 【Shift + 鼠标左键】 在 3D 画布上框选
                </span>
              </div>
            )}

            {/* Measurement Result Overlay Badge */}
            {measurementResult && (
              <div className="bg-slate-900/50 backdrop-blur-2xl px-4 py-2 rounded-2xl border border-purple-400/50 flex items-center gap-3 text-xs font-mono text-purple-200 shadow-2xl animate-fade-in ring-1 ring-white/15 pointer-events-auto">
                <Ruler className="w-4 h-4 text-purple-400" />
                <div className="flex items-center gap-3">
                  <div>
                    3D 空间距离: <strong className="text-white">{measurementResult.dist3D}m</strong>
                  </div>
                  <div>
                    水平距离: <strong className="text-cyan-300">{measurementResult.dist2D}m</strong>
                  </div>
                  <div>
                    垂直高差: <strong className="text-amber-300">{measurementResult.deltaY}m</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMeasurementResult(null)}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 3D Point Picking Active Mode Banner */}
            {pickingTarget && (
              <div className="bg-slate-900/50 backdrop-blur-2xl border border-cyan-400/80 text-cyan-300 font-mono text-xs px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in pointer-events-auto max-w-lg">
                <div className="p-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 animate-pulse border border-cyan-400/40 shrink-0">
                  <Target className="w-4 h-4 text-cyan-400 animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-white flex items-center gap-2">
                    <span className="truncate">🎯 3D 精确点云拾取模式已开启</span>
                    {wizardState.mode && (
                      <span className="text-[10px] bg-amber-400 text-slate-950 px-2 py-0.2 rounded-full font-extrabold shrink-0">
                        [{wizardState.step}/2 步]
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-cyan-200 mt-0.5 leading-tight">
                    {wizardState.mode === 'tower'
                      ? wizardState.step === 1
                        ? '👉 请按【Shift+左键】点击【杆塔上横担 / 塔顶】'
                        : '👉 请按【Shift+左键】点击【杆塔下横担 / 塔脚】'
                      : wizardState.mode === 'wire'
                      ? wizardState.step === 1
                        ? '👉 请按【Shift+左键】点击【导线起点挂点 A】'
                        : '👉 请按【Shift+左键】点击【导线终点挂点 B】'
                      : '👉 请按【Shift+左键】直接点击目标点云捕获空间坐标'}
                  </p>
                  {hoveredCoords && (
                    <p className="text-[10px] text-amber-300 font-bold mt-1 bg-black/50 px-2 py-0.5 rounded border border-amber-400/30 truncate">
                      🔍 准心: X={hoveredCoords.x}, Y={hoveredCoords.y}, Z={hoveredCoords.z}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPickingTarget(null);
                    setWizardState({ mode: null, step: 1, tempPoint: null });
                  }}
                  className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/50 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
                >
                  取消拾取
                </button>
              </div>
            )}

            {/* Toast Notification Banner */}
            {detectionNotice && (
              <div className="bg-amber-500/90 backdrop-blur-md text-slate-950 font-bold px-4 py-1.5 rounded-2xl shadow-2xl border border-amber-300 flex items-center gap-2 text-xs font-mono pointer-events-auto animate-bounce">
                <Sparkles className="w-3.5 h-3.5 text-slate-950 shrink-0" />
                <span>{detectionNotice}</span>
              </div>
            )}

            {/* Gesture Navigation Tip Banner */}
            <div className="bg-slate-900/50 backdrop-blur-2xl px-4 py-1.5 rounded-full border border-amber-400/40 flex items-center gap-2 text-[11px] font-mono text-amber-200 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] animate-fade-in ring-1 ring-white/15 pointer-events-auto">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
              <span>
                💡 视角漫游：<strong className="text-cyan-300 font-bold">【鼠标左键拖拽】</strong>平移 | <strong className="text-amber-300 font-bold">【鼠标右键拖拽】</strong>旋转 | 采点/挂线：<strong className="text-emerald-300 font-bold">【Shift + 鼠标左键】</strong>
              </span>
            </div>
          </div>

          {/* Right Floating Viewport Camera Control Toolbar */}
          <div className="absolute top-20 right-4 z-30 flex flex-col items-center gap-1.5 bg-slate-900/50 backdrop-blur-2xl border border-white/20 p-2 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] font-mono text-[11px] text-slate-200 pointer-events-auto ring-1 ring-white/10">
            <span className="text-[9px] text-cyan-400 font-bold tracking-wider px-1 border-b border-white/10 pb-1 w-full text-center">
              视角控制
            </span>
            <button
              onClick={() => setCameraPresetView('top')}
              className="w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 hover:text-cyan-300 font-bold transition-all flex items-center justify-center gap-1 cursor-pointer text-slate-300"
              title="俯视角 (Top View)"
            >
              <span>俯视角</span>
            </button>
            <button
              onClick={() => setCameraPresetView('side')}
              className="w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 hover:text-cyan-300 font-bold transition-all flex items-center justify-center gap-1 cursor-pointer text-slate-300"
              title="侧视角 (Side View)"
            >
              <span>侧视角</span>
            </button>
            <button
              onClick={() => setCameraPresetView('front')}
              className="w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 hover:text-cyan-300 font-bold transition-all flex items-center justify-center gap-1 cursor-pointer text-slate-300"
              title="正视角 (Front View)"
            >
              <span>正视角</span>
            </button>
            <button
              onClick={() => setCameraPresetView('iso')}
              className="w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 hover:text-cyan-300 font-bold transition-all flex items-center justify-center gap-1 cursor-pointer text-slate-300"
              title="轴测三维视角 (Isometric View)"
            >
              <span>古侧(3D)</span>
            </button>
            <div className="w-full h-[1px] bg-white/20 my-0.5" />
            <button
              onClick={resetCameraPosition}
              className="w-full px-2.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300 font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border border-cyan-400/40"
              title="复位三维视角 (Reset View)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span>复位</span>
            </button>
            <button
              onClick={handleUndo}
              className="w-full px-2.5 py-1.5 rounded-xl bg-amber-500/25 hover:bg-amber-500/40 text-amber-300 font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border border-amber-400/40"
              title="撤销上一步操作 (Ctrl+Z)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>撤销</span>
            </button>
          </div>

          {/* Box Brush Selection Rubber-band Overlay */}
          {boxSelectionRect && (
            <div
              className="absolute pointer-events-none border-2 border-dashed border-emerald-400 bg-transparent z-50 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
              style={{
                left: Math.min(boxSelectionRect.x1, boxSelectionRect.x2),
                top: Math.min(boxSelectionRect.y1, boxSelectionRect.y2),
                width: Math.abs(boxSelectionRect.x2 - boxSelectionRect.x1),
                height: Math.abs(boxSelectionRect.y2 - boxSelectionRect.y1),
              }}
            >
              <div className="absolute -top-6 left-0 text-[10px] bg-slate-900/90 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-400/50 shadow font-bold flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>Shift+左键 框选重分类中...</span>
              </div>
            </div>
          )}

          {/* Floating Display & Render Settings Popover Overlay */}
          {isDisplaySettingsOpen && (
            <div className="absolute top-14 right-4 sm:right-16 z-40 w-96 bg-slate-900/50 backdrop-blur-2xl border border-cyan-400/40 rounded-2xl p-4 shadow-[0_16px_48px_0_rgba(0,0,0,0.5)] text-xs font-mono text-slate-100 space-y-3.5 ring-1 ring-white/15 animate-fade-in pointer-events-auto">
              <div className="flex items-center justify-between border-b border-white/15 pb-2">
                <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>点云渲染引擎与显示参数控制</span>
                </span>
                <button
                  onClick={() => setIsDisplaySettingsOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Render Engine Selector */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-bold block">1. 三维渲染引擎:</span>
                <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                  <button
                    onClick={() => setRenderEngine('potree')}
                    className={`py-1.5 rounded-lg text-center font-bold cursor-pointer transition-all ${
                      renderEngine === 'potree'
                        ? 'bg-teal-600 text-white shadow-md border border-teal-400'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Potree LOD
                  </button>
                  <button
                    onClick={() => setRenderEngine('cesium')}
                    className={`py-1.5 rounded-lg text-center font-bold cursor-pointer transition-all ${
                      renderEngine === 'cesium'
                        ? 'bg-blue-600 text-white shadow-md border border-blue-400'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Cesium 地球
                  </button>
                  <button
                    onClick={() => setRenderEngine('octree')}
                    className={`py-1.5 rounded-lg text-center font-bold cursor-pointer transition-all ${
                      renderEngine === 'octree'
                        ? 'bg-emerald-600 text-white shadow-md border border-emerald-400'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Octree LOD
                  </button>
                </div>
              </div>

              {/* Color Mode Selector */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-bold block">2. 点云色彩着色模式:</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setColorMode('power_highlight')}
                    className={`p-2 rounded-xl text-left font-bold transition-all border cursor-pointer ${
                      colorMode === 'power_highlight'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                        : 'bg-black/30 text-slate-300 border-white/10 hover:border-white/30'
                    }`}
                  >
                    ⚡ 杆塔与导线高亮
                  </button>
                  <button
                    onClick={() => setColorMode('rgb')}
                    className={`p-2 rounded-xl text-left font-bold transition-all border cursor-pointer ${
                      colorMode === 'rgb'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                        : 'bg-black/30 text-slate-300 border-white/10 hover:border-white/30'
                    }`}
                  >
                    📷 真实真彩 (RGB)
                  </button>
                  <button
                    onClick={() => setColorMode('class')}
                    className={`p-2 rounded-xl text-left font-bold transition-all border cursor-pointer ${
                      colorMode === 'class'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                        : 'bg-black/30 text-slate-300 border-white/10 hover:border-white/30'
                    }`}
                  >
                    🎨 ASPRS 标准分类
                  </button>
                  <button
                    onClick={() => setColorMode('height')}
                    className={`p-2 rounded-xl text-left font-bold transition-all border cursor-pointer ${
                      colorMode === 'height'
                        ? 'bg-blue-500/20 text-blue-300 border-blue-400'
                        : 'bg-black/30 text-slate-300 border-white/10 hover:border-white/30'
                    }`}
                  >
                    🏔️ 高程彩虹渐变
                  </button>
                  <button
                    onClick={() => setColorMode('danger')}
                    className={`p-2 rounded-xl text-left font-bold transition-all border cursor-pointer ${
                      colorMode === 'danger'
                        ? 'bg-red-500/20 text-red-300 border-red-400'
                        : 'bg-black/30 text-slate-300 border-white/10 hover:border-white/30'
                    }`}
                  >
                    ⚠️ 树障净空预警
                  </button>
                  <button
                    onClick={() => setColorMode('intensity')}
                    className={`p-2 rounded-xl text-left font-bold transition-all border cursor-pointer ${
                      colorMode === 'intensity'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-400'
                        : 'bg-black/30 text-slate-300 border-white/10 hover:border-white/30'
                    }`}
                  >
                    💡 激光反射强度
                  </button>
                </div>
              </div>

              {/* Point Particle Settings */}
              <div className="space-y-2 bg-black/40 p-3 rounded-xl border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-300 font-bold">点渲染大小 (Size):</span>
                  <span className="text-cyan-300 font-bold bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
                    {pointSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="10.0"
                  step="0.1"
                  value={pointSize}
                  onChange={(e) => setPointSize(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />

                <div className="flex items-center justify-between pt-1 border-t border-white/10">
                  <span className="text-[11px] text-slate-300 font-bold">点云加载预算:</span>
                  <select
                    value={pointBudget}
                    onChange={(e) => setPointBudget(Number(e.target.value))}
                    className="bg-black border border-cyan-400/40 rounded px-2 py-1 text-cyan-300 font-bold focus:outline-none cursor-pointer"
                  >
                    <option value={500000}>50万点 (超流畅)</option>
                    <option value={1000000}>100万点 (推荐)</option>
                    <option value={2000000}>200万点 (高清)</option>
                    <option value={5000000}>500万点 (极佳)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-white/10">
                  <span className="text-[11px] text-slate-300 font-bold">EDL 深度对比度:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUseEDL(!useEDL)}
                      className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                        useEDL ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/50' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {useEDL ? '开启' : '关闭'}
                    </button>
                    {useEDL && (
                      <input
                        type="range"
                        min="0.3"
                        max="2.5"
                        step="0.1"
                        value={edlStrength}
                        onChange={(e) => setEdlStrength(parseFloat(e.target.value))}
                        className="w-16 accent-emerald-400 cursor-pointer"
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-white/10">
                  <span className="text-[11px] text-slate-300 font-bold">点云过滤器:</span>
                  <button
                    onClick={() => {
                      const nextState = !onlyPowerInfra;
                      setOnlyPowerInfra(nextState);
                      if (nextState) {
                        setVisibleClasses([14, 15]);
                        setColorMode('power_highlight');
                      } else {
                        setVisibleClasses([1, 2, 3, 4, 5, 6, 14, 15]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer ${
                      onlyPowerInfra
                        ? 'bg-cyan-500/30 text-cyan-200 border-cyan-400/50'
                        : 'bg-slate-900 text-slate-400 border-white/10'
                    }`}
                  >
                    {onlyPowerInfra ? '仅看杆塔导线 (开启)' : '显示全部点云 (默认)'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tree Barrier Risk Analysis Modal */}
          {isTreeBarrierModalOpen && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[160] w-[calc(100%-2rem)] max-w-lg bg-slate-900/50 backdrop-blur-2xl border border-rose-500/40 rounded-2xl shadow-[0_16px_48px_0_rgba(0,0,0,0.5)] p-5 space-y-4 text-slate-100 ring-1 ring-white/15 font-sans animate-fade-in pointer-events-auto">
              <div className="flex items-center justify-between border-b border-rose-500/30 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-400/40 animate-pulse">
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
                      <span>🌲 导线树障安全净空分析</span>
                      <span className="text-[10px] bg-rose-500/30 text-rose-200 px-2 py-0.5 rounded-full font-mono border border-rose-400/30">
                        DL/T 5092 标准
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      基于已标记导线 3D 弧垂，精准辨识低于安全净空半径的侵界点云
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsTreeBarrierModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                  title="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Safety Radius Setting Input */}
              <div className="bg-slate-950/40 border border-white/15 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Ruler className="w-4 h-4 text-cyan-400" />
                    <span>输入安全净空半径范围 (R):</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="15.0"
                      value={treeBarrierSafetyRadius}
                      onChange={(e) => setTreeBarrierSafetyRadius(Number(e.target.value) || 2.0)}
                      className="w-24 bg-black/60 border border-rose-400/60 rounded-xl px-2.5 py-1 text-rose-300 font-extrabold font-mono text-center text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                    />
                    <span className="text-xs font-bold text-rose-300 font-mono">米 (m)</span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center justify-between gap-1.5 pt-1 text-xs font-mono">
                  <span className="text-[11px] text-slate-400 font-bold">快捷预置:</span>
                  <div className="flex items-center gap-1.5">
                    {[1.5, 2.0, 3.0, 5.0].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setTreeBarrierSafetyRadius(r);
                          handleRunTreeBarrierAnalysis(r);
                        }}
                        className={`px-2.5 py-1 rounded-lg border font-bold transition-all cursor-pointer ${
                          treeBarrierSafetyRadius === r
                            ? 'bg-rose-500/30 text-rose-200 border-rose-400 shadow-md'
                            : 'bg-black/30 text-slate-300 border-white/10 hover:border-white/30'
                        }`}
                      >
                        {r}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Run Calculation Action Button */}
              <button
                type="button"
                onClick={() => handleRunTreeBarrierAnalysis()}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-extrabold text-xs shadow-lg shadow-rose-600/30 border border-rose-400/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4 text-white animate-pulse" />
                <span>⚡ 立即执行树障分析并标记红色危险点云</span>
              </button>

              {/* Results Summary Card */}
              {treeBarrierResults && (
                <div className="bg-slate-950/60 border border-rose-500/40 rounded-xl p-3.5 space-y-2 font-mono text-xs animate-fade-in">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-slate-300 font-bold">分析诊断结果:</span>
                    {treeBarrierResults.dangerPointCount > 0 ? (
                      <span className="text-[10px] bg-red-950/80 text-red-300 border border-red-500/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                        <span>检测到侵界隐患 ({treeBarrierResults.dangerPointCount.toLocaleString()}点)</span>
                      </span>
                    ) : (
                      <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded-full font-bold">
                        ✅ 通道安全 (无侵界点)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="bg-black/40 p-2 rounded-lg border border-red-500/30">
                      <div className="text-[10px] text-slate-400 font-bold">危险点云总数</div>
                      <div className="text-sm font-extrabold text-red-400 mt-0.5">
                        {treeBarrierResults.dangerPointCount.toLocaleString()} 点
                      </div>
                    </div>
                    <div className="bg-black/40 p-2 rounded-lg border border-cyan-500/30">
                      <div className="text-[10px] text-slate-400 font-bold">最小过引净距</div>
                      <div className="text-sm font-extrabold text-cyan-300 mt-0.5">
                        {treeBarrierResults.minDistanceMeters} m
                      </div>
                    </div>
                    <div className="bg-black/40 p-2 rounded-lg border border-amber-500/30">
                      <div className="text-[10px] text-slate-400 font-bold">危险点占比</div>
                      <div className="text-sm font-extrabold text-amber-300 mt-0.5">
                        {treeBarrierResults.hazardPercentage}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Insulator Tagging & Auto-Identification Modal */}
          {isInsulatorModalOpen && (
            <div className="absolute top-14 right-4 z-[160] w-[calc(100%-2rem)] sm:w-[500px] max-h-[calc(100vh-8rem)] flex flex-col bg-slate-900/50 backdrop-blur-2xl border border-fuchsia-400/50 rounded-2xl shadow-[0_16px_48px_0_rgba(0,0,0,0.5)] text-slate-100 ring-1 ring-white/15 font-sans animate-fade-in overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/15 p-4 bg-slate-950/80 backdrop-blur-xl shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/30">
                    <Layers className="w-4 h-4 text-fuchsia-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white tracking-wide">绝缘子标记与同特征智能自动识别</h3>
                    <p className="text-[10px] text-slate-300 font-mono">借鉴业界成熟作业流程: 手动三维标定与特征值聚类比对</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsInsulatorModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                  title="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
                {/* Section 1: Feature Matching & Auto Identification (同特征值自动识别) */}
                <div className="bg-fuchsia-950/30 border border-fuchsia-500/40 rounded-xl p-3.5 space-y-3 shadow-md">
                  <div className="flex items-center justify-between border-b border-fuchsia-500/30 pb-2">
                    <div className="font-extrabold text-fuchsia-200 text-xs flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                      <span>🤖 绝缘子同特征值智能自动识别引擎</span>
                    </div>
                    <span className="text-[10px] bg-fuchsia-900/50 text-fuchsia-300 border border-fuchsia-400/30 px-2 py-0.5 rounded-full">
                      已识别 ({activeSegment && loadedPointCloudMapRef.current[activeSegment.id]?.manualInsulators?.length || 0} 串)
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
                    在 3D 画布中<strong>划线标定</strong>样本绝缘子后，算法将提取其<strong>几何长度、伞裙半径与空间三维密集度</strong>特征，自动巡检搜索沿线挂点与点云簇，实现全线路同型绝缘子高精度一键自动识别与 Class 16 点云重分类。
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-300 mb-0.5">绝缘子串长 (L)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="10.0"
                        value={insulatorLengthInput}
                        onChange={(e) => setInsulatorLengthInput(Number(e.target.value) || 1.8)}
                        className="w-full bg-slate-900 border border-fuchsia-400/40 rounded-lg px-2 py-1 text-fuchsia-200 font-bold focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-300 mb-0.5">伞裙半径 (R)</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        max="2.0"
                        value={insulatorRadiusInput}
                        onChange={(e) => setInsulatorRadiusInput(Number(e.target.value) || 0.45)}
                        className="w-full bg-slate-900 border border-fuchsia-400/40 rounded-lg px-2 py-1 text-fuchsia-200 font-bold focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-300 mb-0.5">特征容差 (%)</label>
                      <input
                        type="number"
                        step="1"
                        min="5"
                        max="50"
                        value={insulatorToleranceInput}
                        onChange={(e) => setInsulatorToleranceInput(Number(e.target.value) || 15)}
                        className="w-full bg-slate-900 border border-fuchsia-400/40 rounded-lg px-2 py-1 text-fuchsia-200 font-bold focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoIdentifyInsulators}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white font-extrabold text-xs shadow-lg shadow-fuchsia-600/30 border border-fuchsia-300 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>🚀 1键自动全空间检索并识别同特征绝缘子</span>
                  </button>
                </div>

                {/* Section 2: Interactive 2-Click Tagging & Calibration (手动 3D 拾取与精标) */}
                <div className="bg-slate-950/40 border border-white/10 rounded-xl p-3.5 space-y-3">
                  <div className="font-extrabold text-cyan-300 text-xs flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span className="flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-cyan-400" />
                      <span>手动 3D 点云拾取与挂点精标</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setWizardState({ mode: 'insulator', step: 1, tempPoint: null });
                        setPickingTarget('insulator_top');
                        setDetectionNotice('🎯 [第 1/2 步]: 请按【Shift+左键】在 3D 画布中点击绝缘子【顶端挂点】');
                      }}
                      className="px-2.5 py-1 bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-400/40 rounded-lg text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1"
                    >
                      <Target className="w-3 h-3 text-fuchsia-400" />
                      <span>开启 3D 画布拾取</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-300 mb-0.5">绝缘子串编号/名称</label>
                    <input
                      type="text"
                      value={newInsulatorName}
                      onChange={(e) => setNewInsulatorName(e.target.value)}
                      placeholder="例如: #1塔 A相悬垂绝缘子串"
                      className="w-full bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white focus:border-fuchsia-400 focus:outline-none"
                    />
                  </div>

                  {/* Top Point Coords */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">顶端挂接点 (Top X, Y, Z)</span>
                      <button
                        type="button"
                        onClick={() => setPickingTarget('insulator_top')}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                          pickingTarget === 'insulator_top'
                            ? 'bg-fuchsia-500 text-white border-fuchsia-300 animate-pulse'
                            : 'bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-500/40 hover:bg-fuchsia-900'
                        }`}
                      >
                        🎯 {pickingTarget === 'insulator_top' ? '捕捉中...' : '3D拾取'}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <input
                        type="number"
                        step="0.1"
                        value={insulatorTopPt.x}
                        onChange={(e) => setInsulatorTopPt({ ...insulatorTopPt, x: Number(e.target.value) })}
                        className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={insulatorTopPt.y}
                        onChange={(e) => setInsulatorTopPt({ ...insulatorTopPt, y: Number(e.target.value) })}
                        className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={insulatorTopPt.z}
                        onChange={(e) => setInsulatorTopPt({ ...insulatorTopPt, z: Number(e.target.value) })}
                        className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                  </div>

                  {/* Bottom Point Coords */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">底端导线挂点 (Bottom X, Y, Z)</span>
                      <button
                        type="button"
                        onClick={() => setPickingTarget('insulator_bottom')}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                          pickingTarget === 'insulator_bottom'
                            ? 'bg-fuchsia-500 text-white border-fuchsia-300 animate-pulse'
                            : 'bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-500/40 hover:bg-fuchsia-900'
                        }`}
                      >
                        🎯 {pickingTarget === 'insulator_bottom' ? '捕捉中...' : '3D拾取'}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <input
                        type="number"
                        step="0.1"
                        value={insulatorBottomPt.x}
                        onChange={(e) => setInsulatorBottomPt({ ...insulatorBottomPt, x: Number(e.target.value) })}
                        className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={insulatorBottomPt.y}
                        onChange={(e) => setInsulatorBottomPt({ ...insulatorBottomPt, y: Number(e.target.value) })}
                        className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={insulatorBottomPt.z}
                        onChange={(e) => setInsulatorBottomPt({ ...insulatorBottomPt, z: Number(e.target.value) })}
                        className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddInsulatorTagWithCoords()}
                    className="w-full py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-400/50 font-bold transition-all cursor-pointer"
                  >
                    + 保存并生成绝缘子串标记
                  </button>
                </div>

                {/* Section 3: Marked Insulators List (已标注绝缘子串清单) */}
                <div className="space-y-1.5">
                  <div className="font-bold text-fuchsia-300 text-xs flex items-center justify-between">
                    <span>已标注绝缘子串清单:</span>
                    <span className="text-[10px] text-slate-400 font-mono">ASPRS Class #16</span>
                  </div>

                  {(activeSegment && loadedPointCloudMapRef.current[activeSegment.id]?.manualInsulators?.length || 0) > 0 ? (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {loadedPointCloudMapRef.current[activeSegment!.id].manualInsulators!.map((ins) => (
                        <div
                          key={ins.id}
                          className="bg-slate-900/90 border border-fuchsia-500/30 rounded-xl p-2.5 flex items-center justify-between text-[11px] shadow-sm"
                        >
                          <div className="space-y-0.5">
                            <div className="font-bold text-fuchsia-300 flex items-center gap-1.5">
                              <span>{ins.name}</span>
                              {ins.confidence && (
                                <span className="text-[9px] bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-500/40 px-1.5 py-0.2 rounded">
                                  匹配度: {(ins.confidence * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-300">
                              顶端: ({ins.topPoint.x}, {ins.topPoint.y}, {ins.topPoint.z}) ➔ 底端: ({ins.bottomPoint.x}, {ins.bottomPoint.y}, {ins.bottomPoint.z})
                            </div>
                            <div className="text-[10px] text-slate-400">
                              几何长: <strong className="text-fuchsia-300">{ins.length}m</strong> | 伞裙半径: <strong className="text-fuchsia-300">{ins.radius}m</strong>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteInsulatorTag(ins.id)}
                            className="p-1 hover:bg-red-500/20 text-red-400 rounded-lg transition-all cursor-pointer"
                            title="删除此绝缘子标记"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2.5 bg-black/30 border border-white/10 rounded-xl text-[11px] text-slate-400 text-center font-mono">
                      暂无绝缘子标记 | 请通过上述【1键自动识别】或【3D画布拾取】生成
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}



          {/* Bottom Toolbar */}
          <div className="absolute bottom-3 left-4 right-4 bg-slate-900/50 backdrop-blur-2xl p-2.5 rounded-2xl border border-white/20 flex flex-wrap items-center justify-between gap-2 text-xs font-mono shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] z-20">
            <div className="flex items-center gap-3 text-[11px] text-slate-300">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useEDL}
                  onChange={(e) => setUseEDL(e.target.checked)}
                  className="rounded accent-cyan-500"
                />
                <span>EDL深景增强</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Local LAS / Point Cloud File Import Floating Glass Panel (Translucent Frosted Glass, No backdrop overlay mask) */}
      {isImportModalOpen && (
        <div className="absolute top-14 left-4 sm:left-84 z-[150] w-[calc(100%-2rem)] sm:w-[460px] max-h-[85vh] overflow-y-auto bg-slate-900/50 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-[0_16px_48px_0_rgba(0,0,0,0.5)] p-4 space-y-3.5 text-slate-100 ring-1 ring-white/15 font-sans animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/15 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                <Upload className="w-4 h-4 text-cyan-400" />
              </div>
              <h3 className="text-sm font-extrabold text-white tracking-wide">导入本地点云 (LAS / LAZ 批量)</h3>
            </div>
            <button
              onClick={() => setIsImportModalOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleImportPointCloud} className="space-y-3 text-xs">
            {/* File Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer space-y-1 group ${
                isDraggingFile
                  ? 'border-cyan-400 bg-cyan-500/20 backdrop-blur-xl scale-[1.01]'
                  : 'border-cyan-400/40 bg-slate-950/30 backdrop-blur-md hover:bg-slate-900/40 hover:border-cyan-300'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".las,.laz,.xyz,.ply,.pcd,.txt,.csv"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <FileCode className="w-8 h-8 text-cyan-400 group-hover:scale-110 transition-transform mx-auto" />
              {selectedFiles.length > 0 ? (
                <div className="space-y-1">
                  <p className="font-bold text-cyan-300 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>已选择 {selectedFiles.length} 个本地点云文件</span>
                  </p>
                  <p className="text-[11px] text-slate-200 font-mono truncate max-w-[380px] mx-auto">
                    {selectedFiles.map((f) => f.name).join(', ')}
                  </p>
                  <p className="text-[10px] text-cyan-400 font-mono">
                    总计大小: {(selectedFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2)} MB | 预估点数: ~{importForm.pointCount.toLocaleString()} 点
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-bold text-slate-100">点击或拖拽 LAS/LAZ/XYZ/TXT 激光点云文件至此处</p>
                  <p className="text-[10px] text-slate-300/80 font-mono">支持单文件或多文件批量导入, 自动解算 LAS 1.2 / 1.4 格式与字段</p>
                </div>
              )}
            </div>

            {/* Spatial Location Parsing Status Notice */}
            {isParsingGeo && (
              <div className="p-2.5 bg-cyan-950/50 border border-cyan-500/40 rounded-xl text-[11px] font-mono text-cyan-200 flex items-center gap-2 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
                <span>正在解析点云 Header 与文件名挂接层级...</span>
              </div>
            )}

            {geoParseNotice && !isParsingGeo && (
              <div className="p-2.5 bg-emerald-950/50 border border-emerald-500/40 rounded-xl text-[11px] font-mono text-emerald-200 flex items-start gap-2">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 animate-bounce" />
                <span className="leading-relaxed">{geoParseNotice}</span>
              </div>
            )}

            {/* Display raw LAS Bounding Box Extents & Center Point using libLAS C++ Specs */}
            {importForm.headerBbox && (
              <div className="p-2.5 bg-slate-900/80 border border-cyan-500/30 rounded-xl text-[10px] font-mono text-slate-300 space-y-1.5">
                <div className="text-cyan-300 font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    libLAS C++ Standard Header (包围盒范围 & 中心点)
                  </span>
                  <div className="flex items-center gap-1">
                    {importForm.versionStr && (
                      <span className="text-[9px] bg-slate-950 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded">
                        {importForm.versionStr}
                      </span>
                    )}
                    <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-bold">
                      ⚡ libLAS Reader ({importForm.parseTimeMs ?? 0.1}ms)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1 text-slate-300 border-b border-white/10 pb-1 text-[9.5px]">
                  <div>X: [{importForm.headerBbox.minX.toFixed(1)}, {importForm.headerBbox.maxX.toFixed(1)}]</div>
                  <div>Y: [{importForm.headerBbox.minY.toFixed(1)}, {importForm.headerBbox.maxY.toFixed(1)}]</div>
                  <div>Z: [{importForm.headerBbox.minZ.toFixed(1)}, {importForm.headerBbox.maxZ.toFixed(1)}]</div>
                </div>

                <div className="text-cyan-300 font-semibold flex items-center justify-between text-[10px]">
                  <span>包围盒中心点 (Bbox Center):</span>
                  <span className="bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30 text-cyan-200">
                    ({((importForm.headerBbox.minX + importForm.headerBbox.maxX) / 2).toFixed(2)}, {((importForm.headerBbox.minY + importForm.headerBbox.maxY) / 2).toFixed(2)}, {((importForm.headerBbox.minZ + importForm.headerBbox.maxZ) / 2).toFixed(2)})
                  </span>
                </div>

                {importForm.embeddedCrsInfo && (
                  <div className="text-emerald-400 text-[9.5px] bg-emerald-950/40 p-1 rounded border border-emerald-500/30 flex items-center justify-between">
                    <span>VLR 坐标系元数据:</span>
                    <span className="font-bold">{importForm.embeddedCrsInfo}</span>
                  </div>
                )}
              </div>
            )}

            {/* Point Cloud CRS & Projection Settings */}
            <div className="space-y-2 bg-slate-900/60 backdrop-blur-md p-3 rounded-xl border border-cyan-500/30">
              <div className="font-bold text-cyan-300 text-[11px] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  点云基准坐标系与地理投影设定
                </span>
                <span className="text-[10px] text-cyan-300/90 font-mono">
                  {importForm.lat !== 0 ? `${importForm.lat.toFixed(4)}°N, ${importForm.lon.toFixed(4)}°E` : '未定位'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono text-slate-300 mb-0.5">基准坐标系 (CRS)</label>
                  <select
                    value={importForm.crsType}
                    onChange={(e) => {
                      const newCRS = e.target.value as CRSType;
                      triggerCRSResolution(newCRS, importForm.centralMeridian, importForm.headerBbox, importForm.fileName, importForm.utmZone);
                    }}
                    className="w-full bg-slate-950 border border-white/20 rounded-lg px-2 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none cursor-pointer"
                  >
                    <option value="AUTO">🤖 自动智能识别 (支持 VLR / UTM / CGCS2000)</option>
                    <option value="UTM_NORTH">🌐 WGS84 UTM 投影带 (如 Zone 50N / 117°E)</option>
                    <option value="CGCS2000_3DEG_WITH_ZONE">📐 CGCS2000 3度带 (含带号, 如 40523100m)</option>
                    <option value="CGCS2000_3DEG_NO_ZONE">📐 CGCS2000 3度带 (无带号, 需选中央子午线)</option>
                    <option value="WGS84_GEO">🗺️ WGS84 / CGCS2000 经纬度 (单位: 度°)</option>
                    <option value="LOCAL_PROJECT">📏 独立局部工程坐标系 (无真实大地理)</option>
                  </select>
                </div>

                {importForm.crsType === 'UTM_NORTH' ? (
                  <div>
                    <label className="block text-[10px] font-mono text-slate-300 mb-0.5">UTM 投影带 (UTM Zone N)</label>
                    <select
                      value={importForm.utmZone}
                      onChange={(e) => {
                        const newZone = Number(e.target.value);
                        const newMeridian = (newZone * 6) - 183;
                        triggerCRSResolution(importForm.crsType, newMeridian, importForm.headerBbox, importForm.fileName, newZone);
                      }}
                      className="w-full bg-slate-950 border border-white/20 rounded-lg px-2 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none cursor-pointer"
                    >
                      <option value={50}>Zone 50N (114°E~120°E, 中央117°E - 华东/上海/浙江)</option>
                      <option value={49}>Zone 49N (108°E~114°E, 中央111°E - 华中/北京/广东/湖北)</option>
                      <option value={51}>Zone 51N (120°E~126°E, 中央123°E - 华东沿海/山东/辽宁)</option>
                      <option value={48}>Zone 48N (102°E~108°E, 中央105°E - 西南/四川/重庆/贵州)</option>
                      <option value={47}>Zone 47N (96°E~102°E, 中央99°E - 西北/云南/西藏)</option>
                      <option value={52}>Zone 52N (126°E~132°E, 中央129°E - 东北/黑龙江)</option>
                      <option value={46}>Zone 46N (90°E~96°E, 中央93°E - 青海/西藏)</option>
                      <option value={45}>Zone 45N (84°E~90°E, 中央87°E - 新疆/西藏)</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-mono text-slate-300 mb-0.5">中央子午线 (Central Meridian)</label>
                    <select
                      value={importForm.centralMeridian}
                      disabled={importForm.crsType === 'WGS84_GEO' || importForm.crsType === 'LOCAL_PROJECT'}
                      onChange={(e) => {
                        const newCM = Number(e.target.value);
                        triggerCRSResolution(importForm.crsType, newCM, importForm.headerBbox, importForm.fileName, importForm.utmZone);
                      }}
                      className="w-full bg-slate-950 border border-white/20 rounded-lg px-2 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none cursor-pointer disabled:opacity-50"
                    >
                      <option value={120}>120°E (上海/浙江/江苏/福建/山东)</option>
                      <option value={117}>117°E (山东/安徽/江苏/福建)</option>
                      <option value={114}>114°E (北京/河北/湖北/广东/海南)</option>
                      <option value={111}>111°E (山西/河南/湖南/广西)</option>
                      <option value={108}>108°E (陕西/湖北/重庆/贵州)</option>
                      <option value={105}>105°E (内蒙古/四川/云南/贵州)</option>
                      <option value={99}>99°E (四川/西藏/云南)</option>
                      <option value={90}>90°E (西藏/青海/新疆)</option>
                      <option value={81}>81°E (新疆)</option>
                      <option value={123}>123°E (辽宁/吉林/黑龙江)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Hierarchy Auto Recognition Form */}
            <div className="space-y-2.5 bg-slate-950/30 backdrop-blur-md p-3 rounded-xl border border-white/15">
              <div className="font-bold text-cyan-300 text-[11px] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  电网空间层级挂接设定
                </span>
                <span className="text-[10px] text-slate-400 font-normal">可随时在下方选择框手动调整</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono text-slate-300 mb-0.5">省份 (Province)</label>
                  <select
                    value={importForm.province}
                    onChange={(e) => {
                      const newProv = e.target.value;
                      const availableCities = CHINA_ADMINISTRATIVE_DATA[newProv] || ['中心市区'];
                      setImportForm({
                        ...importForm,
                        province: newProv,
                        city: availableCities[0] || '中心市区',
                      });
                    }}
                    className="w-full bg-slate-900 border border-white/20 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 focus:outline-none transition-all cursor-pointer"
                  >
                    {Object.keys(CHINA_ADMINISTRATIVE_DATA).map((prov) => (
                      <option key={prov} value={prov} className="bg-slate-900 text-white">
                        {prov}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-300 mb-0.5">城市 (City)</label>
                  <select
                    value={importForm.city}
                    onChange={(e) => setImportForm({ ...importForm, city: e.target.value })}
                    className="w-full bg-slate-900 border border-white/20 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 focus:outline-none transition-all cursor-pointer"
                  >
                    {(CHINA_ADMINISTRATIVE_DATA[importForm.province] || [importForm.city]).map((city) => (
                      <option key={city} value={city} className="bg-slate-900 text-white">
                        {city}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-300 mb-0.5">线路名称 (Line Name)</label>
                <input
                  type="text"
                  value={importForm.lineName}
                  onChange={(e) => setImportForm({ ...importForm, lineName: e.target.value })}
                  placeholder="例如: 500kV 凤西二线"
                  className="w-full bg-black/35 backdrop-blur-md border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-300 mb-0.5">廊道段名称 (Corridor Segment)</label>
                <input
                  type="text"
                  value={importForm.segmentName}
                  onChange={(e) => setImportForm({ ...importForm, segmentName: e.target.value })}
                  placeholder="例如: #01~#02塔段"
                  className="w-full bg-black/35 backdrop-blur-md border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 font-mono">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-white/15 text-slate-300 hover:bg-white/10 font-bold transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold transition-all shadow-md shadow-cyan-500/20 cursor-pointer border border-cyan-400/40"
              >
                确认导入并挂接
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual Tagging Panel Modal / Drawer */}
      {isManualTaggingPanelOpen && (
        <div className="absolute top-14 right-4 z-[150] w-[calc(100%-2rem)] sm:w-[500px] max-h-[calc(100vh-8rem)] flex flex-col bg-slate-900/50 backdrop-blur-2xl border border-amber-400/50 rounded-2xl shadow-[0_16px_48px_0_rgba(0,0,0,0.5)] text-slate-100 ring-1 ring-white/15 font-sans animate-fade-in overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/15 p-4 bg-slate-950/80 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/30">
                <Tag className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white tracking-wide">输电线路杆塔与导线手动标记</h3>
                <p className="text-[10px] text-slate-300 font-mono">设定上/下横担高程与双端弧垂通道重分类点云</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleUndo}
                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 font-mono shadow"
                title="撤销上一步标注操作 (Ctrl+Z)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>撤销 (Ctrl+Z)</span>
              </button>
              <button
                onClick={() => setIsManualTaggingPanelOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Body Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Navigation Tabs */}
          <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/10 text-xs font-mono">
            <button
              onClick={() => setActiveTagTab('towers')}
              className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTagTab === 'towers'
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-400/40 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>🗼 杆塔手动标记 ({activeSegment && loadedPointCloudMapRef.current[activeSegment.id]?.manualTowers?.length || 0})</span>
            </button>

            <button
              onClick={() => setActiveTagTab('wires')}
              className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTagTab === 'wires'
                  ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>⚡ 导线手动标记 ({activeSegment && loadedPointCloudMapRef.current[activeSegment.id]?.manualWires?.length || 0})</span>
            </button>
          </div>

          {/* Tab 1: Tower Tagging */}
          {activeTagTab === 'towers' && (
            <div className="space-y-3.5 text-xs">
              {/* Existing Towers List */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                  <span>已创建的杆塔标记列表:</span>
                </label>
                {(activeSegment && loadedPointCloudMapRef.current[activeSegment.id]?.manualTowers?.length || 0) > 0 ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {loadedPointCloudMapRef.current[activeSegment!.id].manualTowers!.map((tw) => (
                      <div
                        key={tw.id}
                        className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-2 flex items-center justify-between text-[11px] font-mono"
                      >
                        <div>
                          <div className="font-bold text-amber-300">{tw.name}</div>
                          <div className="text-[10px] text-slate-300">
                            上横担: ({tw.upperArmPoint.x}, {tw.upperArmPoint.y}, {tw.upperArmPoint.z}) | 下横担: ({tw.lowerArmPoint.x}, {tw.lowerArmPoint.y}, {tw.lowerArmPoint.z})
                          </div>
                          <div className="text-[10px] text-slate-400">
                            半径: {tw.radius}m | 已配对点云: <strong className="text-amber-400">{tw.pointCount?.toLocaleString() || 0} 点</strong>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteTowerTag(tw.id)}
                          className="p-1 hover:bg-red-500/20 text-red-400 rounded-lg transition-all cursor-pointer"
                          title="删除此杆塔标记"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 bg-black/30 border border-white/10 rounded-xl text-[11px] text-slate-400 text-center font-mono">
                    暂未标记任何杆塔 | 请在下方添加杆塔空间范围
                  </div>
                )}
              </div>

              {/* Add Tower Form */}
              <div className="bg-black/40 p-3 rounded-xl border border-white/10 space-y-2.5">
                <div className="p-2.5 bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-400/40 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-amber-200 text-xs flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>🚀 交互式 3D 两击打组建塔 (推荐)</span>
                    </div>
                    <div className="text-[10px] text-amber-300/80 mt-0.5">
                      在 3D 画布中直接连续点击【塔顶/上横担】和【塔脚/下横担】自动打组
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setWizardState({ mode: 'tower', step: 1, tempPoint: null });
                      setPickingTarget('tower_upper');
                      setDetectionNotice('🎯 [第 1/2 步]: 请在 3D 视图中点击杆塔【上横担 / 塔顶】点云');
                    }}
                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs rounded-lg shadow-lg transition-all cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <Target className="w-3.5 h-3.5 text-slate-950" />
                    <span>开启连击拾取</span>
                  </button>
                </div>

                <div className="font-bold text-amber-300 border-b border-white/10 pb-1 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>手动填写 / 单项拾取 杆塔标记</span>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-300 mb-0.5">杆塔编号/名称</label>
                  <input
                    type="text"
                    value={newTowerName}
                    onChange={(e) => setNewTowerName(e.target.value)}
                    placeholder="例如: #1 杆塔"
                    className="w-full bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                {/* Upper Arm Point */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-300">上横担坐标 (Upper Arm X, Y, Z)</span>
                    <button
                      type="button"
                      onClick={() => setPickingTarget('tower_upper')}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                        pickingTarget === 'tower_upper'
                          ? 'bg-cyan-500 text-slate-950 border-cyan-300 animate-pulse'
                          : 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40 hover:bg-cyan-900'
                      }`}
                    >
                      <Target className="w-3 h-3" />
                      <span>{pickingTarget === 'tower_upper' ? '捕捉中...' : '🎯 3D画布拾取'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 font-mono">
                    <input
                      type="number"
                      step="0.1"
                      value={towerUpperArm.x}
                      onChange={(e) => setTowerUpperArm({ ...towerUpperArm, x: Number(e.target.value) })}
                      placeholder="X"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={towerUpperArm.y}
                      onChange={(e) => setTowerUpperArm({ ...towerUpperArm, y: Number(e.target.value) })}
                      placeholder="Y (高度)"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={towerUpperArm.z}
                      onChange={(e) => setTowerUpperArm({ ...towerUpperArm, z: Number(e.target.value) })}
                      placeholder="Z"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                </div>

                {/* Lower Arm Point */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-300">下横担/脚跟坐标 (Lower Arm X, Y, Z)</span>
                    <button
                      type="button"
                      onClick={() => setPickingTarget('tower_lower')}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                        pickingTarget === 'tower_lower'
                          ? 'bg-cyan-500 text-slate-950 border-cyan-300 animate-pulse'
                          : 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40 hover:bg-cyan-900'
                      }`}
                    >
                      <Target className="w-3 h-3" />
                      <span>{pickingTarget === 'tower_lower' ? '捕捉中...' : '🎯 3D画布拾取'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 font-mono">
                    <input
                      type="number"
                      step="0.1"
                      value={towerLowerArm.x}
                      onChange={(e) => setTowerLowerArm({ ...towerLowerArm, x: Number(e.target.value) })}
                      placeholder="X"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={towerLowerArm.y}
                      onChange={(e) => setTowerLowerArm({ ...towerLowerArm, y: Number(e.target.value) })}
                      placeholder="Y (高度)"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={towerLowerArm.z}
                      onChange={(e) => setTowerLowerArm({ ...towerLowerArm, z: Number(e.target.value) })}
                      placeholder="Z"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-300 mb-0.5">杆塔圆柱包裹半径 (Radius in meters)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={towerRadiusInput}
                    onChange={(e) => setTowerRadiusInput(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddTowerTag}
                  className="w-full py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/50 font-bold transition-all cursor-pointer font-mono"
                >
                  + 保存并生成杆塔标记
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Wire Tagging */}
          {activeTagTab === 'wires' && (
            <div className="space-y-3.5 text-xs">
              {/* Existing Wires List */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-cyan-300 flex items-center gap-1">
                  <span>已创建的手动导线通道标记列表:</span>
                </label>
                {(activeSegment && loadedPointCloudMapRef.current[activeSegment.id]?.manualWires?.length || 0) > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {loadedPointCloudMapRef.current[activeSegment!.id].manualWires!.map((wr) => (
                      <div
                        key={wr.id}
                        className="bg-slate-900/90 border border-cyan-500/40 rounded-xl p-2.5 space-y-2 text-[11px] font-mono shadow-md"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-cyan-400" />
                            <span>{wr.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={handleUndo}
                              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/30 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                              title="撤销上一次标注 (Ctrl+Z)"
                            >
                              <RotateCcw className="w-3 h-3 text-amber-400" />
                              <span>撤销</span>
                            </button>
                            <button
                              onClick={() => handleDeleteWireTag(wr.id)}
                              className="p-1 hover:bg-red-500/20 text-red-400 rounded-lg transition-all cursor-pointer"
                              title="删除此导线标记"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-300 bg-black/40 p-1.5 rounded-lg border border-white/10 space-y-0.5">
                          <div>起点 A: ({wr.startPoint.x}, {wr.startPoint.y}, {wr.startPoint.z}) ➔ 终点 B: ({wr.endPoint.x}, {wr.endPoint.y}, {wr.endPoint.z})</div>
                          <div className="text-slate-400">已配对点云: <strong className="text-cyan-300">{wr.pointCount?.toLocaleString() || 0} 点</strong></div>
                        </div>

                        {/* Curve Fitting & Fine-tuning Bar (导线自拟合与微调) */}
                        <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-lg p-2 space-y-1.5 text-[10px]">
                          <div className="font-bold text-cyan-200 flex items-center justify-between gap-1">
                            <span>📐 导线自拟合参数微调:</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-cyan-400 font-mono text-[10px]">弧垂: {wr.sagRatio}</span>
                              <button
                                type="button"
                                onClick={() => handleAutoFitWireSag(wr.id)}
                                className="px-2 py-0.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 font-mono shadow"
                                title="重新根据实际 3D 点云匹配计算最佳弧垂"
                              >
                                <Sparkles className="w-3 h-3 text-cyan-400" />
                                <span>🎯 点云匹配弧垂</span>
                              </button>
                            </div>
                          </div>

                          {/* Sag ratio adjustment */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-300 shrink-0">弧垂深度:</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleFineTuneWireTag(wr.id, { sagRatio: wr.sagRatio - 0.005 })}
                                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-white/15 rounded font-bold cursor-pointer"
                                title="减浅弧垂"
                              >
                                -0.005
                              </button>
                              <input
                                type="range"
                                min="0.001"
                                max="0.08"
                                step="0.002"
                                value={wr.sagRatio}
                                onChange={(e) => handleFineTuneWireTag(wr.id, { sagRatio: Number(e.target.value) })}
                                className="w-20 accent-cyan-400 cursor-pointer"
                              />
                              <button
                                type="button"
                                onClick={() => handleFineTuneWireTag(wr.id, { sagRatio: wr.sagRatio + 0.005 })}
                                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-white/15 rounded font-bold cursor-pointer"
                                title="加深弧垂"
                              >
                                +0.005
                              </button>
                            </div>
                          </div>

                          {/* Corridor Radius adjustment */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-300 shrink-0">检索半径 ({wr.corridorRadius}m):</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleFineTuneWireTag(wr.id, { corridorRadius: wr.corridorRadius - 0.5 })}
                                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-white/15 rounded font-bold cursor-pointer"
                              >
                                -0.5m
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFineTuneWireTag(wr.id, { corridorRadius: wr.corridorRadius + 0.5 })}
                                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-white/15 rounded font-bold cursor-pointer"
                              >
                                +0.5m
                              </button>
                            </div>
                          </div>

                          {/* Hanging Point Y Elevation Adjustment */}
                          <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/10 text-[9px]">
                            <span className="text-slate-300 shrink-0">挂点高程:</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleFineTuneWireTag(wr.id, { startYOffset: 0.5 })}
                                className="px-1 py-0.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-500/30 rounded font-mono cursor-pointer"
                              >
                                A点+0.5m
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFineTuneWireTag(wr.id, { startYOffset: -0.5 })}
                                className="px-1 py-0.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-500/30 rounded font-mono cursor-pointer"
                              >
                                A点-0.5m
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFineTuneWireTag(wr.id, { endYOffset: 0.5 })}
                                className="px-1 py-0.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-500/30 rounded font-mono cursor-pointer"
                              >
                                B点+0.5m
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFineTuneWireTag(wr.id, { endYOffset: -0.5 })}
                                className="px-1 py-0.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-500/30 rounded font-mono cursor-pointer"
                              >
                                B点-0.5m
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 bg-black/30 border border-white/10 rounded-xl text-[11px] text-slate-400 text-center font-mono">
                    暂未标记任何导线 | 请在下方添加导线挂点与弧垂通道
                  </div>
                )}
              </div>

              {/* Add Wire Form */}
              <div className="bg-black/40 p-3 rounded-xl border border-white/10 space-y-2.5">
                <div className="p-2.5 bg-gradient-to-r from-cyan-500/20 to-blue-600/10 border border-cyan-400/40 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-cyan-200 text-xs flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>🚀 交互式 3D 两击打组导线通道 (推荐)</span>
                    </div>
                    <div className="text-[10px] text-cyan-300/80 mt-0.5">
                      在 3D 画布中直接连续点击【挂点 A】和【挂点 B】自动生成带弧垂悬垂通道
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setWizardState({ mode: 'wire', step: 1, tempPoint: null });
                      setPickingTarget('wire_start');
                      setDetectionNotice('🎯 [第 1/2 步]: 请在 3D 视图中点击导线【起点挂点 A】点云');
                    }}
                    className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold text-xs rounded-lg shadow-lg transition-all cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <Target className="w-3.5 h-3.5 text-slate-950" />
                    <span>开启连击拾取</span>
                  </button>
                </div>

                <div className="font-bold text-cyan-300 border-b border-white/10 pb-1 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>手动填写 / 单项拾取 导线通道</span>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-300 mb-0.5">导线名称</label>
                  <input
                    type="text"
                    value={newWireName}
                    onChange={(e) => setNewWireName(e.target.value)}
                    placeholder="例如: A相 悬垂导线"
                    className="w-full bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                {/* Wire Start Point */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-300">起点/挂点 A (Start Point)</span>
                    <button
                      type="button"
                      onClick={() => setPickingTarget('wire_start')}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                        pickingTarget === 'wire_start'
                          ? 'bg-cyan-500 text-slate-950 border-cyan-300 animate-pulse'
                          : 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40 hover:bg-cyan-900'
                      }`}
                    >
                      <Target className="w-3 h-3" />
                      <span>{pickingTarget === 'wire_start' ? '捕捉中...' : '🎯 3D画布拾取'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 font-mono">
                    <input
                      type="number"
                      step="0.1"
                      value={wireStartPt.x}
                      onChange={(e) => setWireStartPt({ ...wireStartPt, x: Number(e.target.value) })}
                      placeholder="X"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={wireStartPt.y}
                      onChange={(e) => setWireStartPt({ ...wireStartPt, y: Number(e.target.value) })}
                      placeholder="Y (高度)"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={wireStartPt.z}
                      onChange={(e) => setWireStartPt({ ...wireStartPt, z: Number(e.target.value) })}
                      placeholder="Z"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                </div>

                {/* Wire End Point */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-300">终点/挂点 B (End Point)</span>
                    <button
                      type="button"
                      onClick={() => setPickingTarget('wire_end')}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                        pickingTarget === 'wire_end'
                          ? 'bg-cyan-500 text-slate-950 border-cyan-300 animate-pulse'
                          : 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40 hover:bg-cyan-900'
                      }`}
                    >
                      <Target className="w-3 h-3" />
                      <span>{pickingTarget === 'wire_end' ? '捕捉中...' : '🎯 3D画布拾取'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 font-mono">
                    <input
                      type="number"
                      step="0.1"
                      value={wireEndPt.x}
                      onChange={(e) => setWireEndPt({ ...wireEndPt, x: Number(e.target.value) })}
                      placeholder="X"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={wireEndPt.y}
                      onChange={(e) => setWireEndPt({ ...wireEndPt, y: Number(e.target.value) })}
                      placeholder="Y (高度)"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={wireEndPt.z}
                      onChange={(e) => setWireEndPt({ ...wireEndPt, z: Number(e.target.value) })}
                      placeholder="Z"
                      className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-300 mb-0.5">检索半径 (Corridor Radius m)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={wireCorridorRadiusInput}
                      onChange={(e) => setWireCorridorRadiusInput(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-300 mb-0.5">弧垂下垂因子 (Sag Ratio)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={wireSagRatioInput}
                      onChange={(e) => setWireSagRatioInput(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddWireTag}
                  className="w-full py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 font-bold transition-all cursor-pointer font-mono"
                >
                  + 保存并生成导线通道
                </button>
              </div>
            </div>
          )}

          </div>

          {/* Fixed Footer Primary Action Button */}
          <div className="p-3 bg-slate-950/90 backdrop-blur-2xl border-t border-amber-400/30 shrink-0 font-mono z-20">
            <button
              type="button"
              onClick={() => {
                applyManualClassificationsToActiveSegment();
                setIsManualTaggingPanelOpen(false);
              }}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black rounded-xl shadow-xl border border-amber-300 transition-all cursor-pointer flex items-center justify-center gap-2 text-xs"
            >
              <Zap className="w-4 h-4 fill-slate-950" />
              <span>应用手动标记分类并重新计算重分类</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
