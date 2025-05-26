DROP TABLE IF EXISTS urls;

-- Table for URL shortener service
CREATE TABLE IF NOT EXISTS urls (
    short_code TEXT PRIMARY KEY,           -- Random string for the short URL (unique)
    original_url TEXT NOT NULL,            -- Original long URL
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index on original_url for efficient lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_original_url ON urls(original_url);
