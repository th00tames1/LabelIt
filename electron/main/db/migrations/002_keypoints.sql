CREATE TABLE IF NOT EXISTS keypoint_definitions (
  id              TEXT PRIMARY KEY,
  label_class_id  TEXT NOT NULL REFERENCES label_classes(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL,
  color           TEXT NOT NULL DEFAULT '#FFFFFF'
);

CREATE TABLE IF NOT EXISTS keypoint_skeleton (
  label_class_id  TEXT NOT NULL REFERENCES label_classes(id) ON DELETE CASCADE,
  from_kp_id      TEXT NOT NULL REFERENCES keypoint_definitions(id) ON DELETE CASCADE,
  to_kp_id        TEXT NOT NULL REFERENCES keypoint_definitions(id) ON DELETE CASCADE,
  PRIMARY KEY (label_class_id, from_kp_id, to_kp_id)
);

CREATE INDEX IF NOT EXISTS idx_kp_defs_label_class ON keypoint_definitions(label_class_id);
