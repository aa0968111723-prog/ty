-- Admin identity store. Separate from recruitment Google Sheets.
-- Google OAuth users, trusted devices, PIN hashes, WebAuthn public keys, sessions, challenges, audit.

create table if not exists admin_users (
  id text primary key,
  google_subject text not null unique,
  email text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create table if not exists admin_trusted_devices (
  id text primary key,
  user_id text not null references admin_users (id) on delete cascade,
  device_name text not null default '',
  pin_hash text,
  pin_enabled boolean not null default false,
  passkey_enabled boolean not null default false,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  pin_reauth_required boolean not null default false,
  setup_skipped boolean not null default false,
  last_method text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists admin_passkeys (
  id text primary key,
  user_id text not null references admin_users (id) on delete cascade,
  device_id text not null references admin_trusted_devices (id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text not null default '[]',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists admin_sessions (
  id text primary key,
  user_id text not null references admin_users (id) on delete cascade,
  device_id text references admin_trusted_devices (id) on delete set null,
  method text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists admin_auth_challenges (
  id text primary key,
  kind text not null,
  user_id text,
  device_id text,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists admin_auth_audit (
  id text primary key,
  user_id text,
  device_id text,
  method text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_trusted_devices_user_id_idx on admin_trusted_devices (user_id);
create index if not exists admin_passkeys_user_id_idx on admin_passkeys (user_id);
create index if not exists admin_passkeys_device_id_idx on admin_passkeys (device_id);
create index if not exists admin_sessions_user_id_idx on admin_sessions (user_id);
create index if not exists admin_sessions_device_id_idx on admin_sessions (device_id);
create index if not exists admin_auth_audit_user_id_idx on admin_auth_audit (user_id);
create index if not exists admin_auth_challenges_expires_idx on admin_auth_challenges (expires_at);
