-- Add optional default team preference for login resolution
ALTER TABLE User ADD COLUMN defaultTeamId TEXT;
