import numpy as np
from scipy.spatial import cKDTree

def validate_tower_topology(points: np.ndarray,
                            off_ground_idx: np.ndarray,
                            rel_z: np.ndarray,
                            tower_infos: list,
                            cable_pts_idx: np.ndarray):
    """
    步骤四：导线依附拓扑校验 (Topology Validation)
    基于导线依附关系剔除伪装树木假塔
    
    Parameters:
    -----------
    points : np.ndarray
        (N, 3) 全局空间点云坐标
    off_ground_idx : np.ndarray
        非地面点全局索引
    rel_z : np.ndarray
        非地面点相对高度
    tower_infos : list
        候选铁塔信息列表
    cable_pts_idx : np.ndarray
        提取的导线点全局索引
        
    Returns:
    --------
    tower_pts_idx : np.ndarray
        拓扑校验通过的铁塔点全局索引
    valid_tower_count : int
        校验通过的铁塔数量
    demoted_pts_idx : np.ndarray
        未通过拓扑校验、降级为非塔(植被/杂波)的点全局索引
    """
    final_tower_pts_idx = []
    demoted_tower_pts_idx = []
    valid_tower_count = 0
    
    if len(cable_pts_idx) > 0 and len(tower_infos) > 0:
        anchor_cable_indices = np.array(cable_pts_idx, dtype=int)
        cable_tree_3d = cKDTree(points[anchor_cable_indices])
        
        for info in tower_infos:
            t_idx_local = info['pts_idx']
            if len(t_idx_local) == 0: continue
            
            global_t_idx = off_ground_idx[t_idx_local]
            tower_pts_3d = points[global_t_idx]
            
            local_rel_z = rel_z[t_idx_local]
            top_mask = local_rel_z >= (info['max_z'] - 6.0)
            top_pts_3d = tower_pts_3d[top_mask]
            
            if len(top_pts_3d) < 5:
                demoted_tower_pts_idx.extend(global_t_idx.tolist())
                continue
                
            # 校验塔顶是否真实挂载/支撑导线 (< 2.5m 且近邻点数 >= 5)
            dists, _ = cable_tree_3d.query(top_pts_3d)
            near_top_cable_count = np.sum(dists < 2.5)
            if near_top_cable_count >= 5:
                final_tower_pts_idx.extend(global_t_idx.tolist())
                valid_tower_count += 1
            else:
                demoted_tower_pts_idx.extend(global_t_idx.tolist())
                
        tower_pts_idx = np.array(final_tower_pts_idx, dtype=int)
        demoted_pts_idx = np.array(demoted_tower_pts_idx, dtype=int)
    else:
        # 若无可校验杆塔或导线，则全部降级
        if len(tower_infos) > 0:
            all_candidate = []
            for info in tower_infos:
                t_idx_local = info['pts_idx']
                if len(t_idx_local) > 0:
                    all_candidate.extend(off_ground_idx[t_idx_local].tolist())
            demoted_pts_idx = np.array(all_candidate, dtype=int)
            tower_pts_idx = np.array([], dtype=int)
        else:
            tower_pts_idx = np.array([], dtype=int)
            demoted_pts_idx = np.array([], dtype=int)

    return tower_pts_idx, valid_tower_count, demoted_pts_idx
