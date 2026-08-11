import os
import time
import subprocess
import colorsys
import numpy as np
import laspy
import tkinter as tk
from tkinter import filedialog

def open_in_qtmodeler(las_path):
    """自动将分类好的 LAS 点云导入运行中的 QTModeler.exe"""
    print("-> 正在将分类好的 LAS 点云自动导入正在运行的 QTModeler.exe...")
    qt_path = None
    try:
        cmd = 'powershell -Command "Get-Process QTModeler -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path"'
        output = subprocess.check_output(cmd, shell=True, text=True).strip()
        if output and os.path.exists(output):
            qt_path = output
    except Exception:
        pass
        
    if not qt_path:
        possible_paths = [
            r"C:\Program Files\QTModeler_820_UX_TRIAL\QTModeler.exe",
            r"C:\Program Files\Applied Imagery\QT Modeler\QTModeler.exe",
            r"C:\QTModeler_840_UX\QTModeler.exe",
            r"D:\Program Files\QTModeler_820_UX_TRIAL\QTModeler.exe",
            r"D:\Program Files\Applied Imagery\QT Modeler\QTModeler.exe",
            r"D:\QTModeler_840_UX\QTModeler.exe",
            r"E:\Program Files\Applied Imagery\QT Modeler\QTModeler.exe",
            r"E:\QTModeler_840_UX\QTModeler.exe"
        ]
        for p in possible_paths:
            if os.path.exists(p):
                qt_path = p
                break

    if qt_path and os.path.exists(qt_path):
        try:
            abs_las = os.path.abspath(las_path)
            subprocess.Popen([qt_path, abs_las])
            print(f"[Done] 成功将 '{os.path.basename(abs_las)}' 推送加载至 QTModeler 软件！")
        except Exception as e:
            print(f"推送到 QTModeler 失败: {e}")
    else:
        try:
            os.startfile(os.path.abspath(las_path))
            print("[Done] 已通过 Windows 默认查看器打开成果文件。")
        except Exception as e:
            print(f"无法自动打开文件: {e}")

def close_qtmodeler():
    """自动关闭任务管理器中运行的 QTModeler 线程以释放文件占用"""
    print("-> 正在自动关闭任务管理器中所有运行的 QTModeler 线程，释放文件占用...")
    try:
        cmd = 'taskkill /F /IM QTModeler.exe /T'
        subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.5)
    except Exception as e:
        print(f"关闭 QTModeler 线程时发生异常: {e}")

def select_file_gui():
    """打开文件选择 GUI 对话框"""
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    file_path = filedialog.askopenfilename(
        title="选择要分类处理的点云文件 (LAS/LAZ)",
        filetypes=[("点云文件", "*.las *.laz"), ("所有文件", "*.*")]
    )
    root.destroy()
    return file_path

def export_colored_las(las_input_path: str,
                       las_output_path: str,
                       las_raw_data,
                       ground_idx: np.ndarray,
                       cable_pts_idx: np.ndarray,
                       tower_pts_idx: np.ndarray,
                       tower_arm_pts_idx: np.ndarray,
                       all_confirmed: list,
                       point_line_id: np.ndarray,
                       suspect_line_ids: set,
                       find_line_func):
    """
    组装色彩与分类属性，写回带 RGB 的 LAS 文件 (Point Format 3)
    """
    close_qtmodeler()
    print("-> 正在写入色彩与分类标记至新的 LAS 文件...")
    
    las = las_raw_data
    num_points = len(las.x)
    
    # 杆塔优先级高于导线：剔除导线点集中重叠的杆塔点，确保铁塔结构完整呈蓝色/黄色
    if len(cable_pts_idx) > 0 and len(tower_pts_idx) > 0:
        cable_pts_idx = np.setdiff1d(cable_pts_idx, tower_pts_idx)
        
    classifications = np.full(num_points, 3, dtype=np.uint8)  # 默认 3 = 植被
    classifications[ground_idx] = 2                            # 2 = 地面
    if len(cable_pts_idx) > 0:
        classifications[cable_pts_idx] = 14                    # 14 = 导线
    if len(tower_pts_idx) > 0:
        classifications[tower_pts_idx] = 15                    # 15 = 杆塔

    if hasattr(las, 'red') and hasattr(las, 'green') and hasattr(las, 'blue'):
        raw_max = max(np.max(las.red), np.max(las.green), np.max(las.blue))
        if raw_max <= 255:
            red = (las.red.astype(np.float32) * 257.0).clip(0, 65535).astype(np.uint16)
            green = (las.green.astype(np.float32) * 257.0).clip(0, 65535).astype(np.uint16)
            blue = (las.blue.astype(np.float32) * 257.0).clip(0, 65535).astype(np.uint16)
        else:
            red = np.array(las.red, dtype=np.uint16)
            green = np.array(las.green, dtype=np.uint16)
            blue = np.array(las.blue, dtype=np.uint16)
        
        if len(cable_pts_idx) > 0 and len(all_confirmed) > 0:
            num_lines = len(all_confirmed)
            line_color_map = {}
            for line_i in range(1, num_lines + 1):
                if line_i in suspect_line_ids:
                    line_color_map[line_i] = (65535, 0, 0)
                else:
                    h_raw = (line_i * 0.618033988749895) % 1.0
                    h_avail = h_raw * 0.67
                    h = h_avail if h_avail < 0.45 else h_avail + 0.33
                    r, g, b = colorsys.hsv_to_rgb(h, 0.95, 1.0)
                    line_color_map[line_i] = (int(r * 65535), int(g * 65535), int(b * 65535))
                
            for pt_idx in cable_pts_idx:
                l_id = point_line_id[pt_idx]
                if l_id in line_color_map:
                    cr, cg, cb = line_color_map[l_id]
                    red[pt_idx] = cr
                    green[pt_idx] = cg
                    blue[pt_idx] = cb
                else:
                    red[pt_idx] = 65535
                    green[pt_idx] = 45000
                    blue[pt_idx] = 0
        elif len(cable_pts_idx) > 0:
            red[cable_pts_idx] = 65535
            green[cable_pts_idx] = 45000
            blue[cable_pts_idx] = 0

        if len(tower_pts_idx) > 0:
            red[tower_pts_idx] = 0
            green[tower_pts_idx] = 0
            blue[tower_pts_idx] = 65535

        # 杆塔横担点染色为与塔身同色 (蓝色)
        if len(tower_arm_pts_idx) > 0:
            red[tower_arm_pts_idx] = 0
            green[tower_arm_pts_idx] = 0
            blue[tower_arm_pts_idx] = 65535
    else:
        red = np.full(num_points, 8738, dtype=np.uint16)      # 植被绿 R
        green = np.full(num_points, 46260, dtype=np.uint16)   # 植被绿 G
        blue = np.full(num_points, 8738, dtype=np.uint16)     # 植被绿 B
        
        red[ground_idx] = 41120
        green[ground_idx] = 41120
        blue[ground_idx] = 41120
        
        if len(cable_pts_idx) > 0 and len(all_confirmed) > 0:
            num_lines = len(all_confirmed)
            line_color_map = {}
            for line_i in range(1, num_lines + 1):
                if line_i in suspect_line_ids:
                    line_color_map[line_i] = (65535, 0, 0)
                else:
                    h_raw = (line_i * 0.618033988749895) % 1.0
                    h_avail = h_raw * 0.67
                    h = h_avail if h_avail < 0.45 else h_avail + 0.33
                    r, g, b = colorsys.hsv_to_rgb(h, 0.95, 1.0)
                    line_color_map[line_i] = (int(r * 65535), int(g * 65535), int(b * 65535))
                
            for pt_idx in cable_pts_idx:
                raw_id = point_line_id[pt_idx]
                l_id = find_line_func(raw_id) if raw_id > 0 else raw_id
                if l_id in line_color_map:
                    cr, cg, cb = line_color_map[l_id]
                    red[pt_idx] = cr
                    green[pt_idx] = cg
                    blue[pt_idx] = cb
                else:
                    red[pt_idx] = 65535
                    green[pt_idx] = 45000
                    blue[pt_idx] = 0
        elif len(cable_pts_idx) > 0:
            red[cable_pts_idx] = 65535
            green[cable_pts_idx] = 45000
            blue[cable_pts_idx] = 0
            
        if len(tower_pts_idx) > 0:
            red[tower_pts_idx] = 0
            green[tower_pts_idx] = 0
            blue[tower_pts_idx] = 65535

        # 杆塔横担点染色为与塔身同色 (蓝色)
        if len(tower_arm_pts_idx) > 0:
            red[tower_arm_pts_idx] = 0
            green[tower_arm_pts_idx] = 0
            blue[tower_arm_pts_idx] = 65535

    new_header = laspy.LasHeader(point_format=3, version="1.2")
    new_header.scales = las.header.scales
    new_header.offsets = las.header.offsets
    
    new_las = laspy.LasData(new_header)
    new_las.x, new_las.y, new_las.z = las.x, las.y, las.z
    new_las.classification = classifications
    
    new_las.red = red
    new_las.green = green
    new_las.blue = blue
    if os.path.exists(las_output_path):
        try:
            os.remove(las_output_path)
        except OSError as e:
            print(f"无法覆盖现有文件 (可能正被其他软件占用): {e}")
            
    new_las.write(las_output_path)
    print(f"   输出成果: '{las_output_path}'")

