-- 005: Add role column to sensors table
-- Allows users to assign a role (boiler, column, dephleg, output, ambient)
-- to each sensor. Only sensors with a role appear on dashboard pages.
-- NULL role = display-only (visible in Settings, not on dashboard).

ALTER TABLE sensors ADD COLUMN role TEXT DEFAULT NULL;

-- Partial unique index: one user cannot assign the same role to two sensors
CREATE UNIQUE INDEX IF NOT EXISTS idx_sensors_user_role
    ON sensors(user_id, role) WHERE role IS NOT NULL;
