CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  keycloak_group_path TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO departments(code,name,keycloak_group_path) VALUES
 ('ICT','Institute of Computer Technology','/Departments/ICT'),
 ('ELEC','Electronics','/Departments/Electronics'),
 ('MECH','Mechanical','/Departments/Mechanical'),
 ('HR','Human Resources','/Departments/HR'),
 ('IT','Information Technology','/Departments/IT'),
 ('FIN','Finance','/Departments/Finance')
ON CONFLICT(code) DO NOTHING;
CREATE TABLE IF NOT EXISTS app_audit_events (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL CHECK (source = 'APP'),
  actor_sub TEXT NOT NULL,
  actor_username TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  department TEXT,
  outcome TEXT NOT NULL DEFAULT 'SUCCESS',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_audit_created ON app_audit_events(created_at DESC);
CREATE TABLE IF NOT EXISTS access_reviews (
  id BIGSERIAL PRIMARY KEY,
  subject_sub TEXT NOT NULL,
  subject_username TEXT NOT NULL,
  department TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE','REVOKE','INVESTIGATE')),
  rationale TEXT NOT NULL,
  reviewer_sub TEXT NOT NULL,
  reviewer_username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  message TEXT NOT NULL,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS remediation_actions (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('DISABLE_USER','ENABLE_USER')),
  target_sub TEXT NOT NULL,
  target_username TEXT NOT NULL,
  rationale TEXT NOT NULL,
  actor_sub TEXT NOT NULL,
  actor_username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
