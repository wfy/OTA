# Unity 资产抽取清单（M0）

## 已完成（JSON 参数）
- [x] uav.temp → backend/app/config/uav_models.json（机型/镜头）
- [x] OTASetting.json → ota_settings.json（电压等级安全距离）
- [x] WireSetting.json → wire_settings.json（导线库）
- [x] guidelines.json → guidelines.json（导则/部件命名）

## 待抽取（M4 航迹规划前）
- [ ] 塔型模板与部件标注逻辑（TowerKmlLoader / TowerPlanManager / InsulatorSign）
- [ ] 航点生成与导则校验算法（RouteGroupManager / GuidelineVerification）
- [ ] KMZ/KML/Excel 导出逻辑（KMLExporter / ProjectExporter）
- [ ] Aspose 报告逻辑 → python-docx/openpyxl
