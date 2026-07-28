-- Safe to apply to existing databases. Replaces the broken trigger that referenced OLD.id.
DROP TRIGGER IF EXISTS update_user_league_compliance_status_updated_at;
CREATE TRIGGER IF NOT EXISTS update_user_league_compliance_status_updated_at
AFTER UPDATE ON user_league_compliance_status
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at OR NEW.updated_at IS NULL
BEGIN
  UPDATE user_league_compliance_status
  SET updated_at = strftime('%s', 'now')
  WHERE league_id = OLD.league_id
    AND user_id = OLD.user_id
    AND phase_identifier = OLD.phase_identifier;
END;
