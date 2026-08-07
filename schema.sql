CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email TEXT NOT NULL UNIQUE,

    password TEXT NOT NULL,

    role user_role NOT NULL DEFAULT 'JOB_SEEKER',

    status user_status NOT NULL DEFAULT 'ACTIVE',

    is_verified BOOLEAN DEFAULT FALSE,

    last_login TIMESTAMPTZ,

    refresh_token TEXT DEFAULT NULL,

    city TEXT DEFAULT '',

    state TEXT DEFAULT '',

    country TEXT DEFAULT '',

    postal_code TEXT DEFAULT '',

    latitude DOUBLE PRECISION DEFAULT 0,

    longitude DOUBLE PRECISION DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===========================
-- INDEXES
-- ===========================

CREATE UNIQUE INDEX users_email_idx
ON users(email);

CREATE INDEX users_role_idx
ON users(role);

CREATE INDEX users_status_idx
ON users(status);

CREATE INDEX users_location_idx
ON users(city, state, country); 





CREATE TABLE recruiter_profiles (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE CASCADE,

    company_id UUID
        REFERENCES companies(id)
        ON DELETE SET NULL,

    first_name TEXT NOT NULL,

    last_name TEXT NOT NULL,

    phone TEXT NOT NULL,

    designation TEXT NOT NULL,

    current_company TEXT DEFAULT '',

    experience INTEGER DEFAULT 0 CHECK (experience >= 0),

    current_location TEXT DEFAULT '',

    headline TEXT DEFAULT '',

    bio TEXT DEFAULT '',

    linkedin TEXT DEFAULT '',

    github TEXT DEFAULT '',

    portfolio TEXT DEFAULT '',

    profile_picture TEXT DEFAULT '',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- ===========================
-- INDEXES
-- ===========================

CREATE UNIQUE INDEX recruiter_profiles_user_idx
ON recruiter_profiles(user_id);

CREATE INDEX recruiter_profiles_company_idx
ON recruiter_profiles(company_id);

CREATE INDEX recruiter_profiles_name_idx
ON recruiter_profiles(first_name, last_name);

CREATE INDEX recruiter_profiles_designation_idx
ON recruiter_profiles(designation);


CREATE TABLE jobs (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title TEXT NOT NULL,

    description TEXT NOT NULL,

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    recruiter_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    location TEXT NOT NULL,

    salary_min NUMERIC NOT NULL,

    salary_max NUMERIC NOT NULL,

    employment_type employment_type NOT NULL,

    experience_level experience_level NOT NULL,

    skills TEXT[] DEFAULT '{}',

    vacancies INTEGER DEFAULT 1
        CHECK (vacancies >= 1),

    deadline TIMESTAMPTZ NOT NULL,

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (salary_min <= salary_max)
);

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX jobs_company_idx
ON jobs(company_id);

CREATE INDEX jobs_recruiter_idx
ON jobs(recruiter_id);

CREATE INDEX jobs_location_idx
ON jobs(location);

-- Full Text Search Index
CREATE INDEX jobs_search_idx
ON jobs
USING GIN (
    to_tsvector('english', title || ' ' || description)
);

-- Skills Index
CREATE INDEX jobs_skills_idx
ON jobs
USING GIN (skills);

-- Deadline Index
CREATE INDEX jobs_deadline_idx
ON jobs(deadline);

-- Active Jobs Index
CREATE INDEX jobs_active_idx
ON jobs(is_active);



CREATE TABLE companies (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    owner_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    company_name TEXT NOT NULL,

    tagline TEXT DEFAULT '',

    description TEXT DEFAULT '',

    mission TEXT DEFAULT '',

    vision TEXT DEFAULT '',

    industry TEXT NOT NULL,

    company_size TEXT NOT NULL,

    website TEXT DEFAULT '',

    email TEXT DEFAULT '',

    phone TEXT DEFAULT '',

    logo TEXT DEFAULT '',

    cover_image TEXT DEFAULT '',

    founded_year INTEGER,

    headquarters TEXT DEFAULT '',

    address TEXT DEFAULT '',

    city TEXT DEFAULT '',

    state TEXT DEFAULT '',

    country TEXT DEFAULT '',

    linkedin TEXT DEFAULT '',

    facebook TEXT DEFAULT '',

    twitter TEXT DEFAULT '',

    instagram TEXT DEFAULT '',

    github TEXT DEFAULT '',

    youtube TEXT DEFAULT '',

    office_images TEXT[] DEFAULT '{}',

    is_verified BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX companies_owner_idx
ON companies(owner_id);

CREATE INDEX companies_name_idx
ON companies(company_name);

CREATE INDEX companies_industry_idx
ON companies(industry);

CREATE INDEX companies_location_idx
ON companies(city, state, country);

CREATE INDEX companies_verified_idx
ON companies(is_verified);

-- Full Text Search Index
CREATE INDEX companies_search_idx
ON companies
USING GIN (
    to_tsvector(
        'english',
        company_name || ' ' ||
        COALESCE(tagline, '') || ' ' ||
        COALESCE(description, '') || ' ' ||
        COALESCE(industry, '')
    )
);



CREATE TABLE conversations (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    participants UUID[] NOT NULL,

    recruiter UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    job_seeker UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    job_id UUID NOT NULL
        REFERENCES jobs(id)
        ON DELETE CASCADE,

    last_message UUID
        REFERENCES messages(id)
        ON DELETE SET NULL,

    last_message_at TIMESTAMPTZ DEFAULT NOW(),

    job_seeker_unread INTEGER DEFAULT 0
        CHECK (job_seeker_unread >= 0),

    recruiter_unread INTEGER DEFAULT 0
        CHECK (recruiter_unread >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (recruiter, job_seeker, job_id)
);

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX conversations_recruiter_idx
ON conversations(recruiter);

CREATE INDEX conversations_job_seeker_idx
ON conversations(job_seeker);

CREATE INDEX conversations_job_idx
ON conversations(job_id);

CREATE INDEX conversations_updated_idx
ON conversations(updated_at DESC);

CREATE INDEX conversations_last_message_idx
ON conversations(last_message);

-- GIN index for UUID array
CREATE INDEX conversations_participants_idx
ON conversations
USING GIN (participants);


CREATE TABLE applications (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    job_id UUID NOT NULL
        REFERENCES jobs(id)
        ON DELETE CASCADE,

    applicant_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    resume TEXT NOT NULL,

    cover_letter TEXT DEFAULT '',

    status application_status NOT NULL
        DEFAULT 'APPLIED',

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    -- Prevent a user from applying to the same job twice
    UNIQUE (job_id, applicant_id)
);

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX applications_job_idx
ON applications(job_id);

CREATE INDEX applications_applicant_idx
ON applications(applicant_id);

CREATE INDEX applications_status_idx
ON applications(status);

CREATE INDEX applications_created_idx
ON applications(created_at DESC);

CREATE INDEX applications_job_status_idx
ON applications(job_id, status);




CREATE TABLE messages (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID NOT NULL
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    sender UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    receiver UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    message TEXT NOT NULL,

    message_type message_type NOT NULL
        DEFAULT 'text',

    attachments JSONB DEFAULT '[]',

    status message_status NOT NULL
        DEFAULT 'sent',

    sent_at TIMESTAMPTZ DEFAULT NOW(),

    read BOOLEAN DEFAULT FALSE,

    read_at TIMESTAMPTZ,

    seen_at TIMESTAMPTZ,

    delivered BOOLEAN DEFAULT FALSE,

    delivered_at TIMESTAMPTZ,

    reply_to UUID
        REFERENCES messages(id)
        ON DELETE SET NULL,

    is_edited BOOLEAN DEFAULT FALSE,

    is_deleted BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes

CREATE INDEX messages_conversation_idx
ON messages(conversation_id, created_at DESC);

CREATE INDEX messages_sender_idx
ON messages(sender);

CREATE INDEX messages_receiver_idx
ON messages(receiver);

CREATE INDEX messages_status_idx
ON messages(status);

CREATE INDEX messages_search_idx
ON messages
USING GIN (
    to_tsvector('english', message)
);

CREATE TABLE education (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    job_seeker_profile_id UUID NOT NULL
        REFERENCES job_seeker_profiles(id)
        ON DELETE CASCADE,

    institution TEXT,

    degree TEXT,

    field_of_study TEXT,

    start_date DATE,

    end_date DATE,

    currently_studying BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE TABLE experience (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    job_seeker_profile_id UUID NOT NULL
        REFERENCES job_seeker_profiles(id)
        ON DELETE CASCADE,

    company TEXT,

    designation TEXT,

    employment_type TEXT DEFAULT 'FULL_TIME',

    start_date DATE,

    end_date DATE,

    currently_working BOOLEAN DEFAULT FALSE,

    description TEXT DEFAULT '',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE TABLE job_seeker_profiles (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE CASCADE,

    first_name TEXT NOT NULL,

    last_name TEXT NOT NULL,

    phone TEXT NOT NULL,

    headline TEXT DEFAULT '',

    bio TEXT DEFAULT '',

    current_location TEXT DEFAULT '',

    years_of_experience INTEGER DEFAULT 0
        CHECK (years_of_experience >= 0),

    expected_salary NUMERIC,

    skills TEXT[] DEFAULT '{}',

    resume TEXT DEFAULT '',

    profile_picture TEXT DEFAULT '',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes

CREATE UNIQUE INDEX job_seeker_profile_user_idx
ON job_seeker_profiles(user_id);

CREATE INDEX job_seeker_profile_location_idx
ON job_seeker_profiles(current_location);

CREATE INDEX job_seeker_profile_skills_idx
ON job_seeker_profiles
USING GIN (skills);

CREATE INDEX job_seeker_profile_search_idx
ON job_seeker_profiles
USING GIN (
    to_tsvector(
        'english',
        COALESCE(first_name,'') || ' ' ||
        COALESCE(last_name,'') || ' ' ||
        COALESCE(headline,'') || ' ' ||
        COALESCE(bio,'')
    )
);

-- ==========================================
-- NOTIFICATIONS TABLE
-- ==========================================

CREATE TABLE notifications (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    recipient_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    sender_id UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    type TEXT NOT NULL,

    title TEXT NOT NULL,

    message TEXT NOT NULL,

    link TEXT DEFAULT '',

    is_read BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- INDEXES
-- ==========================================

-- Notifications for a specific user
CREATE INDEX notifications_recipient_idx
ON notifications(recipient_id);

-- Notifications sent by a user
CREATE INDEX notifications_sender_idx
ON notifications(sender_id);

-- Read/Unread notifications
CREATE INDEX notifications_read_idx
ON notifications(is_read);

-- Latest notifications first
CREATE INDEX notifications_created_idx
ON notifications(created_at DESC);

-- Fast lookup for unread notifications of a user
CREATE INDEX notifications_user_read_idx
ON notifications(recipient_id, is_read);

-- Full-text search on title & message
CREATE INDEX notifications_search_idx
ON notifications
USING GIN (
    to_tsvector(
        'english',
        title || ' ' || message
    )
);