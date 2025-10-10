-- Add additional message features and room support
-- This migration adds room support to messages and other enhancements

-- Add room column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS room VARCHAR(50) DEFAULT 'general';

-- Add file sharing columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_type VARCHAR(100);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);

-- Add reactions support (JSON column for storing reactions)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';

-- Add reply support
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;

-- Create index for room-based message queries
CREATE INDEX IF NOT EXISTS messages_room_timestamp_idx ON messages (room, timestamp DESC);

-- Create index for reply relationships
CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON messages (reply_to_id);