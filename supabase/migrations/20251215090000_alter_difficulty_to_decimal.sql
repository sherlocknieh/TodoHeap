-- 将 difficulty 字段类型从 INT 修改为 DECIMAL(5,2)
ALTER TABLE todos 
ALTER COLUMN difficulty TYPE DECIMAL(5,2) USING difficulty::DECIMAL(5,2);
