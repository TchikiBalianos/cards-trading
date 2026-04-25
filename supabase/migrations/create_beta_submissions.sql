-- Create beta_submissions table for storing form submissions
CREATE TABLE IF NOT EXISTS beta_submissions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nom VARCHAR(255) NOT NULL,
  prenom VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  age VARCHAR(50),
  genre VARCHAR(50),
  tcgs TEXT,
  platform VARCHAR(255),
  profile VARCHAR(50),
  rgpd_accepted BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address VARCHAR(45),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_beta_submissions_email ON beta_submissions(email);
CREATE INDEX IF NOT EXISTS idx_beta_submissions_submitted_at ON beta_submissions(submitted_at DESC);

-- Add RLS policies
ALTER TABLE beta_submissions ENABLE ROW LEVEL SECURITY;

-- Allow INSERT for anonymous users (from the form)
CREATE POLICY "Allow anonymous INSERT" ON beta_submissions
  FOR INSERT
  WITH CHECK (true);

-- Allow SELECT only for authenticated admin users
CREATE POLICY "Allow authenticated admin SELECT" ON beta_submissions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Create a view for admin dashboard (optional)
CREATE OR REPLACE VIEW beta_submissions_count AS
SELECT
  COUNT(*) as total_submissions,
  COUNT(DISTINCT email) as unique_emails,
  MAX(submitted_at) as latest_submission,
  MIN(submitted_at) as first_submission
FROM beta_submissions;
