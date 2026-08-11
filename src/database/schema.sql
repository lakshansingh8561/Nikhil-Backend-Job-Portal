-- =============================================================================
-- Production-Level PostgreSQL Database Schema
-- Architecture: Production-Grade Normalized PostgreSQL SQL Schema
-- =============================================================================

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Define Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('JOB_SEEKER', 'RECRUITER', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE company_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE verification_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE company_member_role AS ENUM ('OWNER', 'RECRUITER', 'HR', 'HIRING_MANAGER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE workplace_type AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_type AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE application_status AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'INTERVIEW_SCHEDULED', 'OFFERED', 'REJECTED', 'WITHDRAWN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE conversation_type AS ENUM ('DIRECT', 'GROUP', 'SYSTEM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_type AS ENUM ('text', 'image', 'file', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM ('JOB_ALERT', 'APPLICATION_UPDATE', 'NEW_MESSAGE', 'SYSTEM_ALERT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING', 'PAST_DUE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'SUCCESS', 'FAILED', 'PAID', 'PAST_DUE', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_provider AS ENUM ('RAZORPAY', 'STRIPE', 'PAYPAL', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gender_type AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'UNSPECIFIED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Automatic updated_at Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Core Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email CITEXT NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'JOB_SEEKER',
    status user_status NOT NULL DEFAULT 'ACTIVE',
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login TIMESTAMPTZ,
    refresh_token TEXT DEFAULT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 2. User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    first_name VARCHAR(100) DEFAULT '',
    last_name VARCHAR(100) DEFAULT '',
    phone VARCHAR(30) DEFAULT '',
    headline VARCHAR(255) DEFAULT '',
    bio TEXT DEFAULT '',
    profile_picture_url TEXT DEFAULT '',
    skills TEXT[] DEFAULT '{}',
    gender gender_type NOT NULL DEFAULT 'UNSPECIFIED',
    date_of_birth DATE,
    location JSONB DEFAULT '{}'::jsonb,
    social_links JSONB DEFAULT '{}'::jsonb,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_profiles_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 3. Companies Table (company_members is single source of truth for ownership)
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    tagline TEXT DEFAULT '',
    description TEXT DEFAULT '',
    mission TEXT DEFAULT '',
    vision TEXT DEFAULT '',
    industry VARCHAR(100) DEFAULT '',
    company_size VARCHAR(50) DEFAULT '1-10',
    email VARCHAR(255) DEFAULT '',
    phone VARCHAR(30) DEFAULT '',
    website VARCHAR(255) DEFAULT '',
    logo_url TEXT DEFAULT '',
    cover_image_url TEXT DEFAULT '',
    founded_year INTEGER,
    headquarters TEXT DEFAULT '',
    office_images TEXT[] DEFAULT '{}',
    location JSONB DEFAULT '{}'::jsonb,
    social_links JSONB DEFAULT '{}'::jsonb,
    verification_status verification_status NOT NULL DEFAULT 'PENDING',
    status company_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_companies_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 4. Company Members Table
CREATE TABLE IF NOT EXISTS company_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    role company_member_role NOT NULL DEFAULT 'RECRUITER',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, user_id),
    CONSTRAINT chk_company_members_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 5. Job Seeker Profiles Table
CREATE TABLE IF NOT EXISTS job_seeker_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    resume_url TEXT DEFAULT '',
    headline TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    profile_picture TEXT DEFAULT '',
    years_of_experience NUMERIC(4, 1) DEFAULT 0 CHECK (years_of_experience >= 0),
    expected_salary NUMERIC(12, 2) DEFAULT 0 CHECK (expected_salary >= 0),
    notice_period_days INT DEFAULT 0 CHECK (notice_period_days >= 0),
    skills TEXT[] DEFAULT '{}',
    education JSONB DEFAULT '[]'::jsonb,
    experience JSONB DEFAULT '[]'::jsonb,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_job_seeker_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 6. Recruiter Profiles Table (DB-Enforced Composite Membership FK)
CREATE TABLE IF NOT EXISTS recruiter_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    first_name VARCHAR(100) DEFAULT '',
    last_name VARCHAR(100) DEFAULT '',
    phone VARCHAR(30) DEFAULT '',
    designation VARCHAR(150) DEFAULT 'Recruiter',
    department VARCHAR(100) DEFAULT '',
    current_company VARCHAR(255) DEFAULT '',
    headline TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    linkedin TEXT DEFAULT '',
    github TEXT DEFAULT '',
    portfolio TEXT DEFAULT '',
    profile_picture TEXT DEFAULT '',
    experience NUMERIC(4, 1) DEFAULT 0 CHECK (experience >= 0),
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL ON UPDATE CASCADE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_recruiter_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    ),
    CONSTRAINT fk_recruiter_company_membership FOREIGN KEY (company_id, user_id) REFERENCES company_members(company_id, user_id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 7. Jobs Table (DB-Enforced Composite Membership FK)
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT DEFAULT '',
    responsibilities TEXT DEFAULT '',
    workplace_type workplace_type NOT NULL DEFAULT 'ONSITE',
    job_type job_type NOT NULL DEFAULT 'FULL_TIME',
    status job_status NOT NULL DEFAULT 'ACTIVE',
    is_active BOOLEAN DEFAULT TRUE,
    location JSONB DEFAULT '{}'::jsonb,
    salary_min NUMERIC(12, 2) DEFAULT 0 CHECK (salary_min >= 0),
    salary_max NUMERIC(12, 2) DEFAULT 0 CHECK (salary_max >= 0),
    currency VARCHAR(10) DEFAULT 'USD' CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP')),
    skills TEXT[] DEFAULT '{}',
    experience_level VARCHAR(50) DEFAULT 'Mid-Level',
    vacancies INT DEFAULT 1 CHECK (vacancies >= 1),
    deadline TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_jobs_salary_range CHECK (salary_max >= salary_min),
    CONSTRAINT chk_jobs_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    ),
    CONSTRAINT fk_jobs_company_membership FOREIGN KEY (company_id, user_id) REFERENCES company_members(company_id, user_id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 8. Job Applications Table
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    resume_url TEXT NOT NULL,
    cover_letter TEXT DEFAULT '',
    status application_status NOT NULL DEFAULT 'SUBMITTED',
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, user_id),
    CONSTRAINT chk_applications_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 9. Application Status History Table
CREATE TABLE IF NOT EXISTS application_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE ON UPDATE CASCADE,
    old_status application_status,
    new_status application_status NOT NULL,
    changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    notes TEXT DEFAULT '',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_app_status_history_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 10. Education Table (Relational option alongside JSONB)
CREATE TABLE IF NOT EXISTS education (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_seeker_profile_id UUID NOT NULL REFERENCES job_seeker_profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    institution TEXT,
    degree TEXT,
    field_of_study TEXT,
    start_date DATE,
    end_date DATE,
    currently_studying BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_education_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 11. Experience Table (Relational option alongside JSONB)
CREATE TABLE IF NOT EXISTS experience (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_seeker_profile_id UUID NOT NULL REFERENCES job_seeker_profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    company TEXT,
    designation TEXT,
    employment_type TEXT DEFAULT 'FULL_TIME',
    start_date DATE,
    end_date DATE,
    currently_working BOOLEAN DEFAULT FALSE,
    description TEXT DEFAULT '',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_experience_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 12. Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type conversation_type NOT NULL DEFAULT 'DIRECT',
    title VARCHAR(255) DEFAULT '',
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL ON UPDATE CASCADE,
    last_message_id UUID,
    last_message_at TIMESTAMPTZ,
    job_seeker_unread INT DEFAULT 0 CHECK (job_seeker_unread >= 0),
    recruiter_unread INT DEFAULT 0 CHECK (recruiter_unread >= 0),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_conversations_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 13. Conversation Participants Table
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMPTZ,
    is_muted BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    UNIQUE(conversation_id, user_id),
    CONSTRAINT chk_conversation_participants_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 14. Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    message TEXT NOT NULL,
    message_type message_type NOT NULL DEFAULT 'text',
    attachments JSONB DEFAULT '[]'::jsonb,
    status message_status NOT NULL DEFAULT 'sent',
    sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    seen_at TIMESTAMPTZ,
    delivered BOOLEAN NOT NULL DEFAULT FALSE,
    delivered_at TIMESTAMPTZ,
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL ON UPDATE CASCADE,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_messages_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 15. Message Reads Table
CREATE TABLE IF NOT EXISTS message_reads (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (message_id, user_id),
    CONSTRAINT chk_message_reads_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 16. Notifications Table (recipient_id = receiver, sender_id = sender)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    link TEXT DEFAULT '',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_notifications_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 17. Memberships Table
CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'JOB_SEEKER',
    price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    currency VARCHAR(10) DEFAULT 'INR' CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP')),
    duration_in_days INT NOT NULL DEFAULT 30 CHECK (duration_in_days > 0),
    description TEXT DEFAULT '',
    features JSONB DEFAULT '[]'::jsonb,
    is_popular BOOLEAN NOT NULL DEFAULT FALSE,
    is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, role),
    CONSTRAINT chk_memberships_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 18. Subscriptions Table (Status Defaults to PENDING)
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE ON UPDATE CASCADE,
    role user_role NOT NULL DEFAULT 'JOB_SEEKER',
    plan_name VARCHAR(100) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    currency VARCHAR(10) DEFAULT 'INR' CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP')),
    start_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMPTZ NOT NULL,
    current_period_start TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMPTZ,
    razorpay_subscription_id VARCHAR(255) DEFAULT '',
    status subscription_status NOT NULL DEFAULT 'PENDING',
    payment_status payment_status NOT NULL DEFAULT 'PENDING',
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    cancelled_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_subscriptions_dates CHECK (end_date > start_date),
    CONSTRAINT chk_subscriptions_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- 19. Payments Table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL ON UPDATE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL ON UPDATE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP')),
    status payment_status NOT NULL DEFAULT 'PENDING',
    provider payment_provider NOT NULL DEFAULT 'RAZORPAY',
    razorpay_order_id VARCHAR(255),
    razorpay_payment_id VARCHAR(255),
    razorpay_signature VARCHAR(255),
    provider_payment_id VARCHAR(255),
    provider_order_id VARCHAR(255),
    method VARCHAR(100),
    failure_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    paid_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payments_soft_delete CHECK (
        (is_deleted = TRUE AND deleted_at IS NOT NULL) OR 
        (is_deleted = FALSE AND deleted_at IS NULL)
    )
);

-- Automatic Timestamps Triggers Assignment
CREATE OR REPLACE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_company_members_updated_at BEFORE UPDATE ON company_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_job_seeker_profiles_updated_at BEFORE UPDATE ON job_seeker_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_recruiter_profiles_updated_at BEFORE UPDATE ON recruiter_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_education_updated_at BEFORE UPDATE ON education FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_experience_updated_at BEFORE UPDATE ON experience FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Production Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active ON users (LOWER(email)) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_deleted ON users(is_deleted);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_skills ON user_profiles USING GIN (skills);
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug_active ON companies (LOWER(slug)) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_company_members_company ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_skills ON jobs USING GIN (skills);
CREATE INDEX IF NOT EXISTS idx_applications_job_status ON applications(job_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_user_status ON applications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_application_history_app ON application_status_history(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conv ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_msg ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications(recipient_id, is_read) WHERE is_read = FALSE;

-- Soft delete indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_company_members_is_deleted ON company_members(is_deleted);
CREATE INDEX IF NOT EXISTS idx_education_is_deleted ON education(is_deleted);
CREATE INDEX IF NOT EXISTS idx_experience_is_deleted ON experience(is_deleted);
CREATE INDEX IF NOT EXISTS idx_notifications_is_deleted ON notifications(is_deleted);
CREATE INDEX IF NOT EXISTS idx_memberships_is_deleted ON memberships(is_deleted);
CREATE INDEX IF NOT EXISTS idx_subscriptions_is_deleted ON subscriptions(is_deleted);
CREATE INDEX IF NOT EXISTS idx_payments_is_deleted ON payments(is_deleted);

-- One active subscription per user constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_subscription_per_user ON subscriptions(user_id) WHERE status = 'ACTIVE' AND is_deleted = FALSE;

-- One popular/recommended membership per role constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_popular_membership_per_role ON memberships(role) WHERE is_popular = TRUE AND is_active = TRUE AND is_deleted = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_recommended_membership_per_role ON memberships(role) WHERE is_recommended = TRUE AND is_active = TRUE AND is_deleted = FALSE;

-- Idempotency indexes for payment gateway
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL AND provider_payment_id != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_order_id ON payments(provider, provider_order_id) WHERE provider_order_id IS NOT NULL AND provider_order_id != '';

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_end_date ON subscriptions(user_id, end_date);
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_role_active ON memberships(role, is_active);
