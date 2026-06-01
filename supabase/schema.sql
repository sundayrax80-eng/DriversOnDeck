create extension if not exists pgcrypto;

create table if not exists public.driver_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  preferred_name text,
  phone text not null,
  email text not null,
  city text not null,
  state text not null,
  zip text not null,
  cdl_class text not null,
  cdl_state text not null,
  cdl_expiration_date date,
  medical_card_expiration_date date,
  endorsements text[] not null default '{}',
  years_experience text,
  equipment_experience text[] not null default '{}',
  transmission_restriction text,
  route_preference text,
  desired_pay text,
  desired_schedule text,
  availability_date date,
  accident_history_notes text,
  violation_history_notes text,
  employment_history_notes text,
  uploaded_cdl_url text,
  uploaded_medical_card_url text,
  uploaded_resume_url text,
  consent_to_share boolean not null default false,
  status text not null default 'new',
  internal_notes text not null default '',
  last_contacted_at date
);

create table if not exists public.carrier_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_legal_name text not null,
  dba_name text,
  contact_person text not null,
  contact_title text,
  phone text not null,
  email text not null,
  billing_address text,
  dot_number text,
  mc_number text,
  driver_type_needed text not null,
  route_type text not null,
  home_time text,
  number_of_openings integer,
  desired_start_date date,
  pay_structure text,
  estimated_pay_range text,
  employment_type text,
  equipment_type text,
  transmission_type text,
  required_endorsements text[] not null default '{}',
  minimum_years_experience text,
  acceptable_accident_violation_limits text,
  background_process_notes text,
  final_hiring_decision_person text,
  additional_job_details text,
  compliance_acknowledgment boolean not null default false,
  status text not null default 'new',
  internal_notes text not null default '',
  last_contacted_at date
);

create table if not exists public.job_orders (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid references public.carrier_leads(id) on delete set null,
  created_at timestamptz not null default now(),
  title text not null,
  driver_type_needed text,
  route_type text,
  equipment_type text,
  pay_range text,
  number_of_openings integer,
  required_endorsements text[] not null default '{}',
  minimum_experience text,
  start_date date,
  status text not null default 'open',
  internal_notes text not null default ''
);

create table if not exists public.placements (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.driver_leads(id) on delete set null,
  carrier_id uuid references public.carrier_leads(id) on delete set null,
  job_order_id uuid references public.job_orders(id) on delete set null,
  submitted_at timestamptz,
  interview_date date,
  offer_date date,
  start_date date,
  placement_fee numeric(10,2),
  invoice_status text not null default 'not_sent',
  placement_status text not null default 'submitted',
  guarantee_end_date date,
  internal_notes text not null default ''
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  related_type text not null,
  related_id uuid,
  title text not null,
  due_date date,
  status text not null default 'open',
  notes text
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  inquiry_type text,
  message text not null,
  status text not null default 'new',
  internal_notes text not null default ''
);

create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_name text not null,
  email text not null,
  invoice_reference text not null,
  amount numeric(10,2) not null,
  notes text,
  status text not null default 'checkout_started',
  provider text not null default 'stripe',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text
);

alter table public.driver_leads enable row level security;
alter table public.carrier_leads enable row level security;
alter table public.job_orders enable row level security;
alter table public.placements enable row level security;
alter table public.tasks enable row level security;
alter table public.contact_messages enable row level security;
alter table public.payment_records enable row level security;

-- Public users should not read or update CRM data directly.
-- Netlify Functions use SUPABASE_SERVICE_ROLE_KEY for controlled inserts/updates.
-- Admin access is enforced in serverless functions through Supabase Auth plus ADMIN_EMAILS.
