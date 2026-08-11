import numpy as np
from scipy.spatial import cKDTree

def fit_arm_ransac_2d(pts_2d, max_trials=100, inlier_thresh=0.5):
    """
    基于 2D RANSAC 拟合铁塔刚性金属角钢横担直线
    """
    n_pts = len(pts_2d)
    if n_pts < 5:
        return None, 0
        
    best_inliers_count = 0
    best_direction = None
    
    for _ in range(max_trials):
        idx = np.random.choice(n_pts, 2, replace=False)
        p1, p2 = pts_2d[idx[0]], pts_2d[idx[1]]
        v = p2 - p1
        dist = np.hypot(v[0], v[1])
        if dist < 1e-3:
            continue
        v_unit = v / dist
        
        # 测算所有点到该直线的垂直距离
        normal = np.array([-v_unit[1], v_unit[0]])
        diff = pts_2d - p1
        per_dists = np.abs(diff @ normal)
        
        inliers_count = np.sum(per_dists <= inlier_thresh)
        if inliers_count > best_inliers_count:
            best_inliers_count = inliers_count
            best_direction = v_unit
            
    return best_direction, best_inliers_count

def refine_tower_geometry_topdown(tower_pts: np.ndarray, tower_rel_z: np.ndarray, 
                                  cx: float, cy: float, max_z: float, 
                                  v1: np.ndarray, v2: np.ndarray):
    """
    自顶向下动态塔架轮廓包络过滤算法 (两段式自适应包络):
    1. 第一段：先提取并更新当前高度层硬核点在 v1 (横担) 与 v2 (塔厚) 方向的最新物理包络
    2. 第二段：使用当前高度层更新后的最新包络 Envelope_v1 与 Envelope_v2 校验并过滤点云
    """
    num_pts = len(tower_pts)
    if num_pts < 15:
        return np.ones(num_pts, dtype=bool)
        
    keep_mask = np.ones(num_pts, dtype=bool)
    
    # 2D 相对塔心投影
    diff_2d = tower_pts[:, :2] - np.array([cx, cy])
    proj_v1 = diff_2d @ v1  # 横担方向投影
    proj_v2 = diff_2d @ v2  # 线路/塔侧厚度方向投影
    
    z_top = np.max(tower_rel_z)
    z_min = np.min(tower_rel_z)
    
    # 1. 顶层锚点层 (z_top - 1.0m 至 z_top) 初始包络半宽
    top_mask = tower_rel_z >= (z_top - 1.0)
    if np.sum(top_mask) >= 5:
        top_pv2 = np.abs(proj_v2[top_mask])
        half_v2_top = min(max(np.percentile(top_pv2, 95) + 0.3, 0.8), 1.3)
    else:
        half_v2_top = 1.0
        
    # 构建 3D KDTree 用于局部特征计算 (过滤孤立悬空串)
    tree = cKDTree(tower_pts)
    neighbors_list = tree.query_ball_point(tower_pts, r=0.8)
    
    step_z = 1.0
    curr_z = z_top
    
    # 动态跟踪的横担最大半长 v1
    tracked_max_v1 = 3.5
    
    # 2. 自顶向下按 Δz 逐步向下推进扫描 (两段式处理)
    while curr_z > z_min:
        layer_mask = (tower_rel_z >= (curr_z - step_z)) & (tower_rel_z < curr_z)
        layer_indices = np.where(layer_mask)[0]
        
        if len(layer_indices) == 0:
            curr_z -= step_z
            continue
            
        d_z = z_top - curr_z  # 距塔顶深度
        
        # 物理限制：塔侧厚度 v2 随高度下降缓慢扩散 (每下降 1m 厚度增加 0.05m)
        max_half_v2 = min(half_v2_top + d_z * 0.05 + 0.4, 2.2 if d_z <= 9.0 else 3.8)
        
        # -------------------------------------------------------------
        # 第一段：先提取/更新当前高度层的自适应横担长度包络 tracked_max_v1
        # -------------------------------------------------------------
        layer_pv1 = np.abs(proj_v1[layer_indices])
        layer_pv2 = np.abs(proj_v2[layer_indices])
        
        # 找出当前高度层在合法塔厚范畴 (layer_pv2 <= max_half_v2) 内的点
        in_tower_thick_mask = layer_pv2 <= max_half_v2
        if np.sum(in_tower_thick_mask) >= 5:
            valid_arm_pv1 = layer_pv1[in_tower_thick_mask]
            curr_layer_max_v1 = np.percentile(valid_arm_pv1, 98) + 0.3
            if curr_layer_max_v1 <= 12.0:
                tracked_max_v1 = max(tracked_max_v1, curr_layer_max_v1)
                
        # -------------------------------------------------------------
        # 第二段：使用当前高度层更新后的最新包络线（tracked_max_v1, max_half_v2）过滤该层点
        # -------------------------------------------------------------
        for idx in layer_indices:
            pv1 = proj_v1[idx]
            pv2 = proj_v2[idx]
            abs_pv1 = abs(pv1)
            abs_pv2 = abs(pv2)
            
            # --- 判据 A: 线路走向 v2 方向突出包络线截断 (过滤导线形态点) ---
            if abs_pv2 > max_half_v2:
                nbs = neighbors_list[idx]
                if len(nbs) >= 4:
                    nb_pts = tower_pts[nbs]
                    cov = np.cov(nb_pts.T)
                    evals = np.linalg.eigvalsh(cov)
                    l1, l2 = evals[2], evals[1]
                    linearity = (l1 - l2) / max(l1, 1e-6)
                    if linearity > 0.55:
                        keep_mask[idx] = False
                else:
                    keep_mask[idx] = False
                continue
                
            # --- 判据 B: 横担 v1 端点外侧及下挂区 (过滤绝缘子串/耐张串/跳线弧) ---
            if d_z >= 1.5 and d_z <= 9.0:
                # 超过当前层最新横担最大端点包络
                if abs_pv1 > (tracked_max_v1 + 0.3):
                    keep_mask[idx] = False
                    continue
                # 横担下方的悬空绝缘子/跳线弧特征 (偏离塔侧且局部点云密度极小)
                if abs_pv1 > 1.5 and abs_pv2 > 1.2:
                    nbs = neighbors_list[idx]
                    if len(nbs) <= 12:  # 悬空细串点密度低于角钢
                        keep_mask[idx] = False
                        continue

        curr_z -= step_z
        
    return keep_mask


def detect_towers(off_ground_pts: np.ndarray, rel_z: np.ndarray, off_ground_idx: np.ndarray, t_grid_size: float = 2.0):
    """
    步骤二：3D 体素垂直连续性 + 2D 连通域聚类锁定铁塔 (Tower Detection & Filtering)
    
    Parameters:
    -----------
    off_ground_pts : np.ndarray
        非地面点坐标 (N_off, 3)
    rel_z : np.ndarray
        非地面点相对地面的相对高程
    off_ground_idx : np.ndarray
        非地面点全局索引
    t_grid_size : float
        网格大小 (m)，默认 2.0m
        
    Returns:
    --------
    is_tower : np.ndarray (bool)
        非地面点索引下的铁塔标记
    is_near_tower_high_arm : np.ndarray (bool)
        杆塔近邻高空横担敏化区标记
    tower_infos : list[dict]
        检测到的有效铁塔信息列表
    """
    tgx = (off_ground_pts[:, 0] / t_grid_size).astype(np.int32)
    tgy = (off_ground_pts[:, 1] / t_grid_size).astype(np.int32)
    tgz = (rel_z / 2.0).astype(np.int32)
    tgz = np.maximum(tgz, 0)
    
    coords_3d = np.column_stack((tgx, tgy, tgz))
    unique_voxels, inv_3d = np.unique(coords_3d, axis=0, return_inverse=True)
    coords_2d = unique_voxels[:, :2]
    unique_2d, inv_2d = np.unique(coords_2d, axis=0, return_inverse=True)
    
    # 使用向量化操作消除 O(N^2) 瓶颈
    sort_idx = np.lexsort((unique_voxels[:, 2], inv_2d))
    sorted_inv_2d = inv_2d[sort_idx]
    sorted_z = unique_voxels[sort_idx, 2]
    
    _, start_indices = np.unique(sorted_inv_2d, return_index=True)
    z_voxels_per_grid = np.split(sorted_z, start_indices[1:])
    
    grid_heights = [z[-1] for z in z_voxels_per_grid]
    grid_counts = [len(z) for z in z_voxels_per_grid]
    
    pts_counts = np.bincount(inv_3d)
    grid_pts_counts = np.bincount(inv_2d, weights=pts_counts).astype(np.int32)
    pt_inv_2d = inv_2d[inv_3d]  # 将 2D 网格映射至点级索引 (N_off,)
    
    candidate_tower_indices = []
    for i in range(len(unique_2d)):
        z_voxels = z_voxels_per_grid[i]
        h_idx = grid_heights[i]
        c_idx = grid_counts[i]
        pt_c = grid_pts_counts[i]
        
        # 杆塔门槛：高度 >= 22m, 点数 >= 500
        if h_idx >= 11 and pt_c >= 500 and (c_idx / (h_idx + 1)) >= 0.65:
            candidate_tower_indices.append(i)
            
    tower_infos = []
    if len(candidate_tower_indices) > 0:
        cand_arr = unique_2d[candidate_tower_indices]
        cand_tree = cKDTree(cand_arr)
        pairs = cand_tree.query_pairs(r=1.5)  # 8-邻域连通
        
        parent = list(range(len(cand_arr)))
        def find(i):
            if parent[i] == i: return i
            parent[i] = find(parent[i])
            return parent[i]
        def union(i, j):
            ri, rj = find(i), find(j)
            if ri != rj: parent[ri] = rj
            
        for i, j in pairs:
            union(i, j)
            
        clusters = {}
        for i in range(len(cand_arr)):
            r = find(i)
            clusters.setdefault(r, []).append(i)
            
        for r, members in clusters.items():
            if len(members) >= 2:  # 允许占地仅 2 个网格的小型配电塔
                pts_2d = cand_arr[members]
                
                # 寻找整个聚类网格中的最高塔顶标高 max_z
                max_z = 0.0
                for m in members:
                    orig_idx = candidate_tower_indices[m]
                    mz = grid_heights[orig_idx] * 2.0
                    if mz > max_z:
                        max_z = mz
                        
                # 仅使用塔顶 4m 范围内的最高网格计算精确塔心 (cx, cy)
                peak_members = []
                for m in members:
                    orig_idx = candidate_tower_indices[m]
                    mz = grid_heights[orig_idx] * 2.0
                    if mz >= (max_z - 4.0):
                        peak_members.append(m)
                        
                if len(peak_members) > 0:
                    peak_pts_2d = cand_arr[peak_members]
                    cx, cy = np.mean(peak_pts_2d, axis=0) * t_grid_size + t_grid_size / 2.0
                else:
                    cx, cy = np.mean(pts_2d, axis=0) * t_grid_size + t_grid_size / 2.0
                    
                tower_infos.append({
                    'cx': cx, 'cy': cy, 'max_z': max_z, 'pts_idx': []
                })
                
        # 杆塔最小档距合并 NMS (2D 距离 < 25.0m 的候选塔判定为同一座铁塔强制合并)
        raw_tower_infos = tower_infos
        tower_infos = []
        if len(raw_tower_infos) > 0:
            centers_2d = np.array([[t['cx'], t['cy']] for t in raw_tower_infos])
            tree_nms = cKDTree(centers_2d)
            nms_pairs = tree_nms.query_pairs(r=25.0)
            
            parent_nms = list(range(len(raw_tower_infos)))
            def find_nms(i):
                if parent_nms[i] == i: return i
                parent_nms[i] = find_nms(parent_nms[i])
                return parent_nms[i]
            def union_nms(i, j):
                ri, rj = find_nms(i), find_nms(j)
                if ri != rj: parent_nms[ri] = rj
                
            for i, j in nms_pairs:
                union_nms(i, j)
                
            nms_clusters = {}
            for i in range(len(raw_tower_infos)):
                r_id = find_nms(i)
                nms_clusters.setdefault(r_id, []).append(i)
            for r_id, members in nms_clusters.items():
                best_member = max(members, key=lambda m: raw_tower_infos[m]['max_z'])
                tower_infos.append(raw_tower_infos[best_member])

    is_tower = np.zeros(len(off_ground_pts), dtype=bool)
    is_tower_arm = np.zeros(len(off_ground_pts), dtype=bool)
    is_near_tower_high_arm = np.zeros(len(off_ground_pts), dtype=bool)
    valid_tower_infos = []
    
    if len(tower_infos) > 0:
        off_ground_tree = cKDTree(off_ground_pts[:, :2])
        for info in tower_infos:
            cx, cy, max_z = info['cx'], info['cy'], info['max_z']
            
            # 1. 彻底解封初始搜索半径 (上限提升至 25.0m, 支持长达 30m 的超大横担全量框选)
            r_search = min(max(max_z * 0.45, 12.0), 25.0)
            indices = off_ground_tree.query_ball_point([cx, cy], r=r_search)
            
            local_pts = off_ground_pts[indices]
            local_rel_z = rel_z[indices]
            valid_mask = local_rel_z <= (max_z + 2.0)
            valid_indices = np.array(indices)[valid_mask]
            tower_z = local_rel_z[valid_mask]
            tower_pts = local_pts[valid_mask]
            
            if len(tower_z) < 200:
                continue
                
            # 全高度 3D 垂直空间连续性与结构完整性校验
            v_step = 2.0
            layer_indices = (tower_z / v_step).astype(np.int32)
            max_layer = int(np.max(tower_z) / v_step)
            min_layer = int(np.min(tower_z) / v_step)
            
            total_layers = max(max_layer - min_layer + 1, 1)
            occupied_layers = len(np.unique(layer_indices))
            vertical_continuity = occupied_layers / total_layers
            
            has_bottom = np.any(tower_z <= 6.0)
            has_top = np.any(tower_z >= (max_z - 6.0))
            
            if vertical_continuity >= 0.60 and has_bottom and has_top:
                # --- 真实高压主塔高度与突兀高差双重校验 (Dual High-Voltage Tower Prominence Filter) ---
                outer_ring_indices = off_ground_tree.query_ball_point([cx, cy], r=25.0)
                if len(outer_ring_indices) >= 20:
                    outer_pts_2d = off_ground_pts[outer_ring_indices, :2]
                    outer_dist = np.hypot(outer_pts_2d[:, 0] - cx, outer_pts_2d[:, 1] - cy)
                    ring_mask_25 = (outer_dist >= 12.0) & (outer_dist <= 25.0)
                    
                    if np.sum(ring_mask_25) >= 15:
                        ring_z = rel_z[np.array(outer_ring_indices)[ring_mask_25]]
                        h_outer_canopy = np.percentile(ring_z, 90)
                        delta_h_relief = max_z - h_outer_canopy
                        
                        # 真实高压主塔 max_z >= 28.0m 且突兀高差 >= 8.0m
                        if max_z < 28.0 or delta_h_relief < 8.0:
                            continue

                # 0. 杆塔受力与结构力学比例硬约束 (Structural Arm Cap: L_half <= max_z * 0.28)
                half_arm_max = min(max(max_z * 0.28, 4.5), 14.0)

                # 1. 塔心纯角钢区 RANSAC 采样 (r <= half_arm_max * 0.65, 100% 隔离外围导线与地线)
                steel_z_min = max_z * 0.75
                steel_z_max = max_z * 0.98
                r_steel_search = min(half_arm_max * 0.65, 8.5)

                diff_all_tower = tower_pts[:, :2] - np.array([cx, cy])
                dist_all_tower = np.hypot(diff_all_tower[:, 0], diff_all_tower[:, 1])

                lattice_arm_mask = (tower_z >= steel_z_min) & (tower_z <= steel_z_max) & (dist_all_tower <= r_steel_search)
                lattice_arm_pts = tower_pts[lattice_arm_mask]

                # 2. 2D RANSAC 拟合角钢横担主轴 (纯角钢输入，极高精度 0.1°)
                v_arm, inlier_count = fit_arm_ransac_2d(lattice_arm_pts[:, :2] - np.array([cx, cy]))
                
                if v_arm is not None and inlier_count >= 8:
                    v1 = v_arm  # 蓝色矢量 (横担主轴 100% 刚性锁定!)
                    v2 = np.array([-v1[1], v1[0]])  # 线路厚度轴
                else:
                    high_arm_zone_temp = tower_z >= (max_z * 0.40)
                    arm_pts_temp = tower_pts[high_arm_zone_temp]
                    if len(arm_pts_temp) >= 10:
                        cov_arm = np.cov(arm_pts_temp[:, :2].T)
                        evals_a, evecs_a = np.linalg.eigh(cov_arm)
                        v1 = evecs_a[:, 0]
                        v2 = evecs_a[:, 1]
                    else:
                        v1, v2 = np.array([1.0, 0.0]), np.array([0.0, 1.0])
                        
                # 3. 稳健解算最下方横担/导线所在高度 z_lowest_arm
                d_v1 = np.abs(diff_all_tower @ v1)
                d_v2 = np.abs(diff_all_tower @ v2)

                # 约束 z_lowest_arm 在合理高度区间内 (max_z * 0.35 ~ max_z * 0.85)，防止杂波/低垂导线拉低至近地面
                arm_outer_mask = (d_v1 >= 4.0) & (tower_z >= max_z * 0.35) & (tower_z <= max_z * 0.85)
                if np.sum(arm_outer_mask) >= 10:
                    z_lowest_arm = max(np.percentile(tower_z[arm_outer_mask], 5) - 0.8, max_z * 0.35)
                else:
                    z_lowest_arm = max_z * 0.40

                high_arm_zone = tower_z >= z_lowest_arm
                arm_pts = tower_pts[high_arm_zone]

                if len(arm_pts) >= 5:
                    diff_arm = arm_pts[:, :2] - np.array([cx, cy])
                    proj1 = diff_arm @ v1
                    proj2 = diff_arm @ v2
                    half_arm_w = min(max(np.percentile(np.abs(proj1), 99.5) + 2.0, 5.0), half_arm_max)
                    half_line_t = min(max(np.percentile(np.abs(proj2), 98) + 0.6, 1.8), 2.8)
                else:
                    half_arm_w = half_arm_max
                    half_line_t = 2.8

                # 全层横担保护区 (Z >= z_lowest_arm): 受 half_arm_max 封顶，覆盖从最上层到最下层横担
                mask_high = high_arm_zone & (d_v1 <= half_arm_w) & (d_v2 <= half_line_t)

                # 4. 塔身塔脚区 (Z < z_lowest_arm): 测算最下方横担处的塔身初始厚度，构建正方形梯形四棱台向地面平滑外扩
                # 在 z_lowest_arm 附近测算塔身厚度半宽 w_trunk0 (即正方形初始半宽)
                near_lowest_mask = (tower_z >= (z_lowest_arm - 1.5)) & (tower_z <= (z_lowest_arm + 1.0))
                if np.sum(near_lowest_mask) >= 5:
                    w_trunk0 = min(max(np.percentile(d_v2[near_lowest_mask], 95), 1.2), 2.5)
                else:
                    w_trunk0 = min(max(half_line_t * 0.75, 1.2), 2.2)

                depth_z = np.maximum(z_lowest_arm - tower_z, 0.0)
                # 正方形梯形四棱台：v1 与 v2 从初始半宽 w_trunk0 开始，以相同斜率 (0.14) 各向同性向外扩展，上限放宽至 7.5m
                low_allowed_half_w = np.minimum(w_trunk0 + depth_z * 0.14, 7.5)
                mask_low = (~high_arm_zone) & (d_v1 <= low_allowed_half_w) & (d_v2 <= low_allowed_half_w)

                obb_mask = mask_high | mask_low
                info['v1'] = v1
                info['v2'] = v2
                info['half_l1'] = half_arm_w
                info['half_l2'] = half_line_t
                info['d_diag'] = 2.0 * np.hypot(half_arm_w, half_line_t)
                info['z_lowest_arm'] = z_lowest_arm
                info['w_trunk0'] = w_trunk0
                
                taper_valid_indices = valid_indices[obb_mask]
                taper_tower_pts = tower_pts[obb_mask]
                taper_tower_z = tower_z[obb_mask]
                
                # 区分中央塔身主躯干柱 (蓝色) 与 伸出横担翼区 (黄色)
                trunk_column_mask = high_arm_zone & (d_v1 <= w_trunk0) & (d_v2 <= w_trunk0)
                arm_wing_mask = mask_high & (~trunk_column_mask)

                final_valid_indices = taper_valid_indices

                is_tower[final_valid_indices] = True
                is_tower_arm[valid_indices[arm_wing_mask]] = True
                info['pts_idx'] = final_valid_indices
                if len(final_valid_indices) > 0:
                    info['abs_max_z'] = np.max(off_ground_pts[final_valid_indices, 2])
                    valid_tower_infos.append(info)
                
                # 横担敏化区：针对检测到的真实杆塔，高度门槛统一下调至 10.0m
                near_indices = off_ground_tree.query_ball_point([cx, cy], r=20.0)
                high_mask_zone = rel_z[near_indices] >= 10.0
                valid_near_indices = np.array(near_indices)[high_mask_zone]
                is_near_tower_high_arm[valid_near_indices] = True
                
        tower_infos = valid_tower_infos
        
    return is_tower, is_tower_arm, is_near_tower_high_arm, tower_infos

