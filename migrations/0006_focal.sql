-- Focal point for each image (0 to 1 from the left and top), so crops keep faces and subjects in frame
ALTER TABLE media ADD COLUMN focal_x REAL;
ALTER TABLE media ADD COLUMN focal_y REAL;
ALTER TABLE media ADD COLUMN focal_source TEXT;
ALTER TABLE media ADD COLUMN width INTEGER;
ALTER TABLE media ADD COLUMN height INTEGER;
