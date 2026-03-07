-- Add 'calendar' to source_type enum for email calendar events
ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'calendar';
