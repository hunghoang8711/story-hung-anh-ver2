# Supabase setup

1. Create a Supabase project.
2. Run schema.sql in SQL Editor.
3. Create two Authentication accounts.
4. Create Storage bucket story-images and configure authenticated-user policies.
5. Enable Realtime for stories.
6. Add only the public anon key to browser configuration.
7. For email notifications, use a server-side Edge Function and an email provider such as Resend.

Never put service-role keys or email API secrets in client-side JavaScript.
