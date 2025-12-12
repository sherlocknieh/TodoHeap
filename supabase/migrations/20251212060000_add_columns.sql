-- 给 todos 表新增"开始日期"属性
ALTER TABLE todos 
ADD COLUMN start_date TIMESTAMPTZ DEFAULT NULL;

-- 为 todos 表新增"难度"属性, 单位为工时
ALTER TABLE todos 
ADD COLUMN difficulty INT DEFAULT NULL;