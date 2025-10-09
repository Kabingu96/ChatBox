-- Create rooms table for custom room management
CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    creator VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255), -- NULL for public rooms
    is_private BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default rooms
INSERT INTO rooms (name, description, creator, is_private) VALUES 
('general', 'General discussion for everyone', 'system', FALSE),
('random', 'Random topics and casual chat', 'system', FALSE),
('tech', 'Technology and programming discussions', 'system', FALSE),
('gaming', 'Gaming discussions and events', 'system', FALSE)
ON CONFLICT (name) DO NOTHING;