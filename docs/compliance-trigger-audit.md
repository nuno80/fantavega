# Compliance trigger audit

The schema trigger `update_user_league_compliance_status_updated_at` previously referenced `OLD.id`, but `user_league_compliance_status` has a composite primary key and no `id` column. The trigger now updates by `league_id`, `user_id`, and `phase_identifier`.

For existing databases, apply `database/migrations/fix_compliance_updated_at_trigger.sql`. The migration drops and recreates only this trigger and does not alter application data or table structure.
