# LỘ TRÌNH PHÁT TRIỂN EM MÌ V2 (ROADMAP.MD)

---

### Giai Đoạn 1: Nền Tảng (Phase 1) — ĐÃ HOÀN THÀNH ✅
- [x] Khởi tạo dự án Next.js 16 App Router với TypeScript Strict và Tailwind CSS 4.
- [x] Thiết lập cấu trúc cơ sở dữ liệu Supabase, phân quyền RLS và Migration SQL.
- [x] Tạo giao diện Dashboard công khai và Admin Console.
- [x] Tích hợp Policy and Permission Gate (4 danh mục hành động) và Global Emergency Stop.

### Giai Đoạn 2: Lõi AI & Streaming (Phase 2) — ĐÃ HOÀN THÀNH ✅
- [x] Tích hợp Vercel AI SDK và Google Generative AI (Gemini).
- [x] Bộ định tuyến mô hình thông minh (Model Router) theo độ phức tạp và ngân sách.
- [x] Công nghệ Streaming Chat Realtime với phân tách Public / Admin.
- [x] Cơ chế ghi nhận và tối ưu hóa chi phí token với Prompt Caching.

### Giai Đoạn 3: Hệ Thống Tự Chủ (Phase 3) — ĐÃ HOÀN THÀNH ✅
- [x] Agent Planner tự động phân rã mục tiêu kinh doanh thành các bước JSON.
- [x] Hàng đợi tác vụ (Persistent Task Queue) với trạng thái và nhật ký thực thi Worker.
- [x] Research Engine nghiên cứu cơ hội kinh doanh kèm kiểm chứng nguồn trích dẫn.

### Giai Đoạn 4: Trung Tâm Học Tập (Learning Center & RAG) — TIẾP TỤC TRIỂN KHAI ⏳
- [ ] Xử lý tải lên tài liệu (PDF, DOCX, Markdown, Text).
- [ ] Phân đoạn văn bản (Chunking) và tạo vector embedding qua pgvector.
- [ ] Tìm kiếm lai (Hybrid Search: Full-text + Vector) cho kiến thức mở rộng.

### Giai Đoạn 5: Quản Trị Đa Nền Tảng (Phase 5) — TIẾP TỤC TRIỂN KHAI ⏳
- [ ] Hoàn thiện kết nối API các nền tảng: Stock Media, UGC, Digital Products.
- [ ] Quản lý tài sản nội dung (Media Library, Captions, Hashtags).
- [ ] Webhook tự động ghi nhận doanh thu từ bên thứ ba.

