import numpy as np
from scipy.spatial import cKDTree

def refine_insulators_near_towers(off_ground_pts: np.ndarray,
                                 off_ground_idx: np.ndarray,
                                 rel_z: np.ndarray,
                                 is_tower: np.ndarray,
                                 tower_infos: list):
    """
    基于塔心局部坐标系 (p_v1, p_v2, Z) 和 2D/3D 挂点聚集与垂直跨度特征，
    精准剥离附着在横担下方的绝缘子串，更新并返回 is_tower 掩膜。
    """
    if len(tower_infos) == 0 or not np.any(is_tower):
        return is_tower
        
    for info in tower_infos:
        cx, cy = info['cx'], info['cy']
        v1, v2 = info['v1'], info['v2']
        max_z = info['max_z']
        z_lowest_arm = info.get('z_lowest_arm', max_z * 0.40)
        w_trunk0 = info.get('w_trunk0', 1.8)
        half_l1 = info.get('half_l1', 10.0)
        half_l2 = info.get('half_l2', 2.5)
        
        # 绝缘子在相对 Z 上的受搜区间: 横担最下缘向下 4.5m 到 向上 0.5m
        z_ins_min = z_lowest_arm - 4.5
        z_ins_max = z_lowest_arm + 0.5
        
        # 提取被标记为 is_tower 的非地面点
        tower_local_idx = np.where(is_tower)[0]
        if len(tower_local_idx) == 0:
            continue
            
        t_pts = off_ground_pts[tower_local_idx]
        t_rel_z = rel_z[tower_local_idx]
        
        # 投影到塔心 2D 局部坐标系
        diff_2d = t_pts[:, :2] - np.array([cx, cy])
        pv1 = diff_2d @ v1
        pv2 = diff_2d @ v2
        
        # 候选点条件：高度在 z_ins 范围，且位于主躯干四棱柱之外，但处于横担翼展范围内
        cand_mask = (t_rel_z >= z_ins_min) & (t_rel_z <= z_ins_max) & \
                    (np.abs(pv1) <= half_l1 + 1.5) & (np.abs(pv2) <= half_l2 + 1.0) & \
                    ((np.abs(pv1) > w_trunk0) | (np.abs(pv2) > w_trunk0))
                    
        cand_indices_in_t = np.where(cand_mask)[0]
        if len(cand_indices_in_t) < 4:
            continue
            
        cand_pv1 = pv1[cand_indices_in_t]
        cand_pv2 = pv2[cand_indices_in_t]
        cand_rel_z = t_rel_z[cand_indices_in_t]
        
        # 2D 微体素网格 (0.4m x 0.4m) 离散挂点聚类
        grid_size = 0.4
        g1 = (cand_pv1 / grid_size).astype(np.int32)
        g2 = (cand_pv2 / grid_size).astype(np.int32)
        g_coords = np.column_stack((g1, g2))
        
        unique_g, inv_g = np.unique(g_coords, axis=0, return_inverse=True)
        for g_idx in range(len(unique_g)):
            member_mask = inv_g == g_idx
            if np.sum(member_mask) >= 4:
                cluster_z = cand_rel_z[member_mask]
                delta_z = np.max(cluster_z) - np.min(cluster_z)
                # 绝缘子判定条件：高度跨度 >= 0.9m
                if delta_z >= 0.9:
                    ins_local_t_idx = cand_indices_in_t[member_mask]
                    ins_off_ground_idx = tower_local_idx[ins_local_t_idx]
                    is_tower[ins_off_ground_idx] = False

    return is_tower

def extract_and_track_powerlines(points: np.ndarray,
                                 off_ground_pts: np.ndarray,
                                 off_ground_idx: np.ndarray,
                                 rel_z: np.ndarray,
                                 is_tower: np.ndarray,
                                 is_near_tower_high_arm: np.ndarray,
                                 tower_infos: list):
    """
    步骤三：PCA 特征姿态分析 + 绝缘子二次剥离 + 极速体素化聚类 + 自适应悬链线 3D 追踪缝合
    """
    # 0. 精致剥离杆塔横担下方的绝缘子串，更新 is_tower 掩膜
    is_tower = refine_insulators_near_towers(
        off_ground_pts=off_ground_pts,
        off_ground_idx=off_ground_idx,
        rel_z=rel_z,
        is_tower=is_tower,
        tower_infos=tower_infos
    )

    num_points = len(points)
    high_mask = rel_z >= 6.0
    high_pts = off_ground_pts[high_mask]
    high_indices = off_ground_idx[high_mask]
    high_is_near_arm = is_near_tower_high_arm[high_mask]
    high_is_tower = is_tower[high_mask]
    
    cable_seed_indices = []
    tower_centers = np.array([[t['cx'], t['cy']] for t in tower_infos]) if len(tower_infos) > 0 else None
    
    if len(high_pts) > 0:
        # 使用 0.8m 体素网格进行候选种子点降采样预筛选 (消除 95%+ 冗余 PCA 运算)
        seed_grid_size = 0.8
        sgx = (high_pts[:, 0] / seed_grid_size).astype(np.int32)
        sgy = (high_pts[:, 1] / seed_grid_size).astype(np.int32)
        sgz = (high_pts[:, 2] / seed_grid_size).astype(np.int32)
        s_coords = np.column_stack((sgx, sgy, sgz))
        
        _, sample_indices = np.unique(s_coords, axis=0, return_index=True)
        sample_high_pts = high_pts[sample_indices]
        
        high_tree = cKDTree(high_pts.astype(np.float32))
        # Memory guard: first count neighbors only, then materialize lists for
        # samples that pass the threshold. query_ball_point without return_length
        # builds Python lists for every query point, which explodes on dense
        # vegetation (300w+ points).
        sample_counts = high_tree.query_ball_point(sample_high_pts, r=2.0, return_length=True)
        keep_sample = sample_counts >= 4
        sample_high_pts_keep = sample_high_pts[keep_sample]
        sample_indices_keep = sample_indices[keep_sample]
        sample_neighbors_list = high_tree.query_ball_point(sample_high_pts_keep, r=2.0)
        
        for idx_in_sample, neighbors in enumerate(sample_neighbors_list):
            if len(neighbors) >= 4:
                pts_local = high_pts[neighbors]
                cov = np.cov(pts_local.T)
                evals, evecs = np.linalg.eigh(cov)
                l1, l2 = evals[2], evals[1]
                if l1 > 0:
                    linearity = (l1 - l2) / l1
                    v1 = evecs[:, 2]
                    orig_high_idx = sample_indices_keep[idx_in_sample]
                    is_arm = high_is_near_arm[orig_high_idx]
                    
                    if not high_is_tower[orig_high_idx]:
                        pass_dir_check = True
                        if tower_centers is not None:
                            pt_xy = high_pts[orig_high_idx, :2]
                            dists_to_towers = np.hypot(tower_centers[:, 0] - pt_xy[0], tower_centers[:, 1] - pt_xy[1])
                            min_t_idx = np.argmin(dists_to_towers)
                            if dists_to_towers[min_t_idx] <= 40.0:
                                t_v2 = tower_infos[min_t_idx]['v2']
                                v_dir_2d = v1[:2]
                                norm_dir = np.linalg.norm(v_dir_2d)
                                if norm_dir > 1e-3:
                                    v_dir_2d_unit = v_dir_2d / norm_dir
                                    cos_theta = abs(np.dot(v_dir_2d_unit, t_v2))
                                    if cos_theta < 0.906:  # cos(25 deg) 过滤非线路方向噪声
                                        pass_dir_check = False
                        
                        if pass_dir_check:
                            if (linearity > 0.82 and abs(v1[2]) < 0.85) or (is_arm and linearity > 0.65):
                                cable_seed_indices.append(high_indices[orig_high_idx])
                        
    cable_seed_indices = np.array(cable_seed_indices)

    suspect_line_ids = set()
    all_confirmed = []
    
    if len(cable_seed_indices) > 0:
        seed_pts = points[cable_seed_indices]
        seed_tree = cKDTree(seed_pts.astype(np.float32))
        
        dists, _ = seed_tree.query(high_pts, distance_upper_bound=2.5)
        in_range_mask = dists <= 2.5
        
        candidate_cable_indices = high_indices[in_range_mask]
        cand_pts = points[candidate_cable_indices]
        cand_tree = cKDTree(cand_pts.astype(np.float32))
        dense_counts = cand_tree.query_ball_point(cand_pts, r=2.5, return_length=True)
        valid_cable_mask = dense_counts >= 3
        
        cable_pts_idx = candidate_cable_indices[valid_cable_mask]
        
        if len(cable_pts_idx) > 0:
            final_cable_pts = points[cable_pts_idx]
            
            c_voxel_size = 0.5
            cvx = (final_cable_pts[:, 0] / c_voxel_size).astype(np.int32)
            cvy = (final_cable_pts[:, 1] / c_voxel_size).astype(np.int32)
            cvz = (final_cable_pts[:, 2] / c_voxel_size).astype(np.int32)
            c_coords = np.column_stack((cvx, cvy, cvz))
            
            unique_cvoxels, inv_c = np.unique(c_coords, axis=0, return_inverse=True)
            cvoxel_centers = unique_cvoxels * c_voxel_size + c_voxel_size / 2.0
            
            c_tree = cKDTree(cvoxel_centers.astype(np.float32))
            c_pairs = c_tree.query_pairs(r=2.0) 
            
            parent_c = list(range(len(unique_cvoxels)))
            def find_c(i):
                root = i
                while parent_c[root] != root:
                    root = parent_c[root]
                curr = i
                while curr != root:
                    nxt = parent_c[curr]
                    parent_c[curr] = root
                    curr = nxt
                return root
            def union_c(i, j):
                ri, rj = find_c(i), find_c(j)
                if ri != rj: parent_c[ri] = rj
                
            for i, j in c_pairs:
                union_c(i, j)
                
            c_clusters = {}
            for i in range(len(final_cable_pts)):
                voxel_idx = inv_c[i]
                r = find_c(voxel_idx)
                c_clusters.setdefault(r, []).append(i)
                
            sure_wire_clusters = []
            candidate_clusters = []
            
            for r, members in c_clusters.items():
                if len(members) < 10:
                    continue
                c_pts = final_cable_pts[members]
                ptp = np.ptp(c_pts, axis=0)
                diag_span = np.linalg.norm(ptp)
                
                cov = np.cov(c_pts.T)
                evals, evecs = np.linalg.eigh(cov)
                linearity = 0
                if evals[-1] > 0:
                    linearity = (evals[2] - evals[1]) / (evals[2] + 1e-6)
                
                min_var = evals[0]
                cluster_info = {
                    'members': members,
                    'center': np.mean(c_pts, axis=0),
                    'dir': evecs[:, 2] if evals[-1] > 0 else np.array([1.0, 0.0, 0.0]),
                    'span': diag_span,
                    'linearity': linearity,
                    'min_var': min_var
                }
                
                if diag_span > 30.0 and linearity > 0.8:
                    sure_wire_clusters.append(cluster_info)
                elif diag_span > 15.0 and linearity > 0.75 and min_var < 1.5:
                    sure_wire_clusters.append(cluster_info)
                elif diag_span > 8.0 and linearity > 0.85 and min_var < 1.0:
                    sure_wire_clusters.append(cluster_info)
                elif diag_span > 3.0 and linearity > 0.6 and min_var < 3.0:
                    candidate_clusters.append(cluster_info)
                    
            refined_cable_idx_local = []
            validated_cands = []
            for sure in sure_wire_clusters:
                refined_cable_idx_local.extend(sure['members'])
                
            for cand in candidate_clusters:
                is_valid = False
                for sure in sure_wire_clusters:
                    dir_xy_cand = cand['dir'][:2]
                    dir_xy_sure = sure['dir'][:2]
                    
                    norm_cand = np.linalg.norm(dir_xy_cand)
                    norm_sure = np.linalg.norm(dir_xy_sure)
                    
                    if norm_cand > 0 and norm_sure > 0:
                        cos_theta_xy = abs(np.dot(dir_xy_cand, dir_xy_sure) / (norm_cand * norm_sure))
                    else:
                        cos_theta_xy = 0.0
                        
                    v_xy = cand['center'][:2] - sure['center'][:2]
                    n_xy = np.array([-dir_xy_sure[1], dir_xy_sure[0]])
                    if np.linalg.norm(n_xy) > 0:
                        n_xy = n_xy / np.linalg.norm(n_xy)
                    dist_to_line_xy = abs(np.dot(v_xy, n_xy))
                    
                    dist_along = np.linalg.norm(cand['center'][:2] - sure['center'][:2])
                    allowed_dist_xy = 3.0 + dist_along * 0.04
                    
                    v = cand['center'] - sure['center']
                    cross = np.cross(v, sure['dir'])
                    dist_to_line_3d = np.linalg.norm(cross)
                    
                    if dist_to_line_xy < allowed_dist_xy and cos_theta_xy > 0.92 and dist_to_line_3d < 25.0:
                        is_valid = True
                        break
                if is_valid:
                    refined_cable_idx_local.extend(cand['members'])
                    validated_cands.append(cand)
                    
            extra_cable_indices = []
            point_line_id = np.zeros(num_points, dtype=int)
            all_confirmed = sure_wire_clusters + validated_cands
            
            parent_line = list(range(len(all_confirmed) + 1))
            def find_line(i):
                if i <= 0 or i >= len(parent_line): return i
                root = i
                while parent_line[root] != root:
                    root = parent_line[root]
                curr = i
                while curr != root:
                    nxt = parent_line[curr]
                    parent_line[curr] = root
                    curr = nxt
                return root
            def union_line(i, j):
                if i <= 0 or j <= 0 or i >= len(parent_line) or j >= len(parent_line): return
                ri, rj = find_line(i), find_line(j)
                if ri != rj: parent_line[ri] = rj
            
            # 等份点 3D 垂直下探树冠连续性检测与硬核过滤 (Vectorized Batch Query 优化)
            if len(all_confirmed) > 0:
                off_tree = cKDTree(off_ground_pts.astype(np.float32))
                for cluster_idx, cluster in enumerate(all_confirmed):
                    l_id = cluster_idx + 1
                    c_pts = final_cable_pts[cluster['members']]
                    if len(c_pts) < 10:
                        continue
                        
                    # 规则 0：顶层地线绝对防误杀特权保护
                    is_topmost_ground_wire = False
                    if len(tower_infos) > 0:
                        max_tower_abs_z = max(t['abs_max_z'] for t in tower_infos)
                        if np.max(c_pts[:, 2]) >= max_tower_abs_z - 3.5:
                            is_topmost_ground_wire = True
                    if is_topmost_ground_wire:
                        continue
                        
                    # 规则 1：塔底斜坡/塔身下部树木绝对排除区
                    is_under_tower_veg = False
                    if len(tower_infos) > 0:
                        for t_info in tower_infos:
                            d_xy = np.hypot(cluster['center'][0] - t_info['cx'], cluster['center'][1] - t_info['cy'])
                            if d_xy < 22.0 and cluster['center'][2] < t_info['abs_max_z'] - 22.0:
                                is_under_tower_veg = True
                                break
                    if is_under_tower_veg:
                        suspect_line_ids.add(l_id)
                        continue
                        
                    proj = np.dot(c_pts - cluster['center'], cluster['dir'])
                    p_min, p_max = np.min(proj), np.max(proj)
                    span_len = p_max - p_min
                    if span_len < 3.0 or span_len > 30.0:
                        continue
                        
                    sample_fractions = np.linspace(0.1, 0.9, 9)
                    sample_positions = cluster['center'] + np.outer(p_min + sample_fractions * span_len, cluster['dir'])
                    
                    # 构建 (9, 12, 3) 下探探针阵列
                    steps = np.arange(1, 13)[:, None]
                    probe_offsets = np.zeros((12, 3))
                    probe_offsets[:, 2] = -steps[:, 0] * 1.0
                    
                    all_probe_centers = (sample_positions[:, None, :] + probe_offsets[None, :, :]).reshape(-1, 3)
                    probe_neighbor_lists = off_tree.query_ball_point(all_probe_centers.astype(np.float32), r=1.5)
                    
                    deep_probe_count = 0
                    for f_idx in range(9):
                        sample_pos = sample_positions[f_idx]
                        consecutive_steps = 0
                        max_consecutive = 0
                        
                        for step_idx in range(12):
                            probe_flat_idx = f_idx * 12 + step_idx
                            near_idx = probe_neighbor_lists[probe_flat_idx]
                            
                            if len(near_idx) > 0:
                                near_pts = off_ground_pts[near_idx]
                                xy_dists = np.linalg.norm(near_pts[:, :2] - sample_pos[:2], axis=1)
                                below_mask = (xy_dists <= 1.5) & (near_pts[:, 2] <= sample_pos[2] - 0.8)
                                
                                if np.any(below_mask):
                                    consecutive_steps += 1
                                    if consecutive_steps > max_consecutive:
                                        max_consecutive = consecutive_steps
                                else:
                                    consecutive_steps = 0
                            else:
                                consecutive_steps = 0
                                
                        if max_consecutive >= 3:
                            deep_probe_count += 1
                            
                    if deep_probe_count >= 4:
                        suspect_line_ids.add(l_id)

            valid_refined_cable_idx_local = []
            for cluster_idx, cluster in enumerate(all_confirmed):
                l_id = cluster_idx + 1
                if l_id not in suspect_line_ids:
                    valid_refined_cable_idx_local.extend(cluster['members'])
                    
            refined_cable_idx_local = valid_refined_cable_idx_local

            if len(refined_cable_idx_local) > 0:
                all_high_tree = cKDTree(high_pts)
                
                for cluster_idx, cluster in enumerate(all_confirmed):
                    line_id = cluster_idx + 1
                    if line_id in suspect_line_ids:
                        continue
                        
                    member_local = cluster['members']
                    member_global = cable_pts_idx[member_local]
                    point_line_id[member_global] = line_id
                    
                    pts = final_cable_pts[cluster['members']]
                    if len(pts) < 2: continue
                    proj = np.dot(pts - cluster['center'], cluster['dir'])
                    end1 = pts[np.argmin(proj)]
                    end2 = pts[np.argmax(proj)]
                    
                    for start_pt, init_dir in [(end1, -cluster['dir']), (end2, cluster['dir'])]:
                        curr_pt = start_pt
                        curr_dir = init_dir
                        jumped_towers = set()
                        
                        for step in range(60):
                            probe_pos = curr_pt + 3.0 * curr_dir
                            max_proj_limit = 14.0
                            z_diff_limit = 2.5
                            dists_limit = 1.2
                            
                            if len(tower_infos) > 0:
                                d2d_towers = [np.hypot(probe_pos[0] - t['cx'], probe_pos[1] - t['cy']) for t in tower_infos]
                                min_t_idx = np.argmin(d2d_towers)
                                min_t_dist = d2d_towers[min_t_idx]
                                t_info = tower_infos[min_t_idx]
                                
                                if min_t_dist < 8.0:
                                    curr_t_dist = np.hypot(curr_pt[0] - t_info['cx'], curr_pt[1] - t_info['cy'])
                                    probe_t_dist = np.hypot(probe_pos[0] - t_info['cx'], probe_pos[1] - t_info['cy'])
                                    is_moving_towards_tower = probe_t_dist < curr_t_dist
                                    
                                    if is_moving_towards_tower:
                                        if min_t_idx not in jumped_towers:
                                            if curr_pt[2] >= t_info['abs_max_z'] - 25.0:
                                                cx, cy = t_info['cx'], t_info['cy']
                                                half_d = t_info.get('d_diag', 12.0) / 2.0
                                                r_search_max = max(half_d + 4.0, 8.0)
                                                
                                                near_t_indices = all_high_tree.query_ball_point([cx, cy, curr_pt[2]], r=r_search_max)
                                                if len(near_t_indices) > 0:
                                                    near_t_pts = high_pts[near_t_indices]
                                                    
                                                    z_diffs_cyl = np.abs(near_t_pts[:, 2] - curr_pt[2])
                                                    vec_from_cxcy = near_t_pts[:, :2] - np.array([cx, cy])
                                                    r_2d = np.linalg.norm(vec_from_cxcy, axis=1)
                                                    
                                                    dir_2d = curr_dir[:2]
                                                    norm_dir = np.linalg.norm(dir_2d)
                                                    if norm_dir > 1e-3: dir_2d = dir_2d / norm_dir
                                                    dot_proj = np.dot(vec_from_cxcy, dir_2d)
                                                    
                                                    side_vec = np.array([-dir_2d[1], dir_2d[0]])
                                                    curr_side = np.dot(curr_pt[:2] - np.array([cx, cy]), side_vec)
                                                    cand_sides = np.dot(vec_from_cxcy, side_vec)
                                                    side_diffs = np.abs(cand_sides - curr_side)
                                                    
                                                    out_mask = (z_diffs_cyl <= 2.0) & (r_2d >= 1.5) & (r_2d <= r_search_max) & \
                                                               (dot_proj > 0.3) & (side_diffs <= 2.5)
                                                    valid_out_idx = np.array(near_t_indices)[out_mask]
                                                    
                                                    if len(valid_out_idx) > 0:
                                                        valid_out_pts = high_pts[valid_out_idx]
                                                        best_out_sub_idx = np.argmax(dot_proj[out_mask])
                                                        next_pt = valid_out_pts[best_out_sub_idx]
                                                        
                                                        new_dir = next_pt - curr_pt
                                                        norm_new = np.linalg.norm(new_dir)
                                                        if norm_new > 1e-3:
                                                            curr_dir = 0.5 * curr_dir + 0.5 * (new_dir / norm_new)
                                                            curr_dir /= np.linalg.norm(curr_dir)
                                                        curr_pt = next_pt
                                                        
                                                        extra_cable_indices.extend(valid_out_idx.tolist())
                                                        extra_global_pts = high_indices[valid_out_idx]
                                                        
                                                        for g_pt in extra_global_pts:
                                                            old_id = point_line_id[g_pt]
                                                            if old_id > 0 and old_id != line_id:
                                                                union_line(line_id, old_id)
                                                            point_line_id[g_pt] = line_id
                                                            
                                                        jumped_towers.add(min_t_idx)
                                                        continue
                                                
                                                probe_pos = curr_pt + (half_d * 2.0 + 2.0) * curr_dir
                                                max_proj_limit = half_d * 2.0 + 5.0
                                                z_diff_limit = 4.5
                                                dists_limit = 3.0
                                                jumped_towers.add(min_t_idx)
                                            else:
                                                break
                                      
                            search_r = 6.0 if dists_limit > 2.0 else 4.5
                            idx_near = all_high_tree.query_ball_point(probe_pos, r=search_r)
                            
                            if len(idx_near) > 0:
                                near_pts = high_pts[idx_near]
                                vecs = near_pts - curr_pt
                                proj_len = np.dot(vecs, curr_dir)
                                dists = np.linalg.norm(vecs - np.outer(proj_len, curr_dir), axis=1)
                                z_diffs = np.abs(near_pts[:, 2] - curr_pt[2])
                                
                                valid_mask = (dists < dists_limit) & (proj_len > 0.1) & (proj_len < max_proj_limit) & (z_diffs <= z_diff_limit)
                                valid_idx = np.array(idx_near)[valid_mask]
                                
                                if len(valid_idx) > 0:
                                    if len(valid_idx) >= 4:
                                        std_dist = np.std(dists[valid_mask])
                                        if std_dist > 1.0:
                                            break
                                            
                                    extra_cable_indices.extend(valid_idx.tolist())
                                    extra_global_pts = high_indices[valid_idx]
                                    point_line_id[extra_global_pts] = line_id
                                    
                                    valid_pts = high_pts[valid_idx]
                                    max_proj_idx = np.argmax(proj_len[valid_mask])
                                    next_pt = valid_pts[max_proj_idx]
                                    
                                    new_dir = next_pt - curr_pt
                                    norm_new = np.linalg.norm(new_dir)
                                    if norm_new > 1e-3:
                                        new_dir /= norm_new
                                        curr_dir = 0.5 * curr_dir + 0.5 * new_dir
                                        curr_dir /= np.linalg.norm(curr_dir)
                                    
                                    curr_pt = next_pt
                                else:
                                    break
                            else:
                                break
                                
            final_cable_indices = cable_pts_idx[refined_cable_idx_local].tolist()
            if len(extra_cable_indices) > 0:
                extra_global = high_indices[extra_cable_indices]
                final_cable_indices.extend(extra_global.tolist())
                
            cable_pts_idx = np.unique(final_cable_indices)
        else:
            cable_pts_idx = np.array([], dtype=int)
            point_line_id = np.zeros(num_points, dtype=int)
            all_confirmed = []
            parent_line = list(range(1))
            def find_line(i): return i
    else:
        cable_pts_idx = np.array([], dtype=int)
        point_line_id = np.zeros(num_points, dtype=int)
        all_confirmed = []
        parent_line = list(range(1))
        def find_line(i): return i

    return cable_pts_idx, point_line_id, all_confirmed, suspect_line_ids, find_line
