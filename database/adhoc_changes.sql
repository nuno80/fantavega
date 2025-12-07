-- Fix: Resetta i locked_credits negativi a 0
-- Eseguire questo SQL sul database Turso

UPDATE league_participants
SET locked_credits = 0
WHERE locked_credits < 0;
