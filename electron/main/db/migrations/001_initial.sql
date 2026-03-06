PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS project_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS label_classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL,
  shortcut    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id              TEXT PRIMARY KEY,
  filename        TEXT NOT NULL,
  file_path       TEXT NOT NULL UNIQUE,
  thumbnail_path  TEXT,
  width           INTEGER NOT NULL,
  height          INTEGER NOT NULL,
  file_size       INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'unlabeled',
  split           TEXT NOT NULL DEFAULT 'unassigned',
  imported_at     INTEGER NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS annotations (
  id              TEXT PRIMARY KEY,
  image_id        TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  label_class_id  TEXT REFERENCES label_classes(id) ON DELETE SET NULL,
  annotation_type TEXT NOT NULL,
  geometry        TEXT NOT NULL,
  confidence      REAL,
  source          TEXT NOT NULL DEFAULT 'manual',
  is_crowd        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_annotations_image_id      ON annotations(image_id);
CREATE INDEX IF NOT EXISTS idx_annotations_label_class_id ON annotations(label_class_id);
CREATE INDEX IF NOT EXISTS idx_images_status             ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_split              ON images(split);
