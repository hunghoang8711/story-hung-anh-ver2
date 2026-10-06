# Our Story — V2

Phiên bản mới của website nhật ký HUNG × ANH.

## Đã có trong bản đầu tiên
- giao diện mobile-first
- timeline responsive
- thêm story
- upload ảnh ở chế độ demo
- animation nhẹ
- không chứa secret/backend key

## Kiến trúc production
GitHub Pages → Supabase Auth → PostgreSQL → Storage → Realtime → server-side email.

Backend chưa được kích hoạt vì cần project Supabase của bạn. Xem supabase/schema.sql.

## Quan trọng
Không commit Supabase service-role key, Resend API key, SMTP password hoặc secret khác vào GitHub.
