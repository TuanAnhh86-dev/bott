# KIẾN TRÚC HỆ THỐNG EM MÌ V2 (ARCHITECTURE.MD)

---

## 1. TỔNG QUAN HỆ THỐNG

**EM MÌ V2** là một hệ thống Agent AI tự chủ (Autonomous AI Creator Business Agent) vận hành trên nền tảng web hiện đại (Next.js App Router), với mục tiêu đạt doanh thu tối thiểu 5,000,000 VNĐ/tháng từ các mô hình kinh doanh số hợp pháp.

```text
[ Người Dùng Công Khai ]          [ Quản Trị Viên (Admin) ]
          │                                  │
          ▼                                  ▼
   / (Public Portal)                  /admin (Admin Console)
   ├── Realtime Streaming Chat        ├── Private Executive Chat
   ├── Live Verified Revenue/KPI      ├── Emergency Stop / Worker Control
   └── Business Models Showcase       └── Autonomous Planner & Approvals
          │                                  │
          └────────────────┬─────────────────┘
                           ▼
                 [ Next.js API Routes ]
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   /api/chat/public   /api/agent/*     /api/chat/admin
          │                │                │
          ▼                ▼                ▼
   [ Model Router ]  [ Permission ]  [ Context Engine ]
          │           Gate (fail-closed)   │
          └───────────────┴───────────────┘
                           ▼
                    [ AI SDK Engine ]
                           │
                  [ Task Queue / Worker ]
          │                │                │
          └────────────────┼────────────────┘
                           ▼
              [ Supabase PostgreSQL + pgvector ]
              ├── Profiles & RLS Isolation
              ├── Public vs Admin Conversations
              ├── Immutable Audit Logs
              └── Revenue, KPI & Tasks State
```

---

## 2. NGUYÊN TẮC TỰ CHỦ VÀ BẢO MẬT (AUTONOMY ENGINE)

Hệ thống hoạt động với phân cấp quyền chặt chẽ gồm 4 danh mục:

1. **AUTO_EXECUTE**: Nghiên cứu web công khai, tính toán nội bộ, truy xuất kiến thức, tạo bản thảo nội dung, tổng hợp báo cáo KPI.
2. **AUTO_EXECUTE_WITH_LIMITS**: Xuất bản các nội dung đã được phê duyệt trước, gửi thông báo theo lịch, đồng bộ dữ liệu trong hạn mức.
3. **REQUIRE_APPROVAL**: Liên hệ khách hàng mới, nhận hợp đồng, điều chỉnh giá thương mại, chạy quảng cáo trả phí, các giao dịch tài chính.
4. **FORBIDDEN (CẤM TUYỆT ĐỐI)**: Truy cập trái phép, tự cấp quyền cho bản thân, nội dung nhạy cảm vi phạm pháp luật, vượt rào bảo mật nền tảng.

---

## 3. CÔNG TẮC DỪNG KHẨN CẤP (GLOBAL EMERGENCY STOP)

- Trạng thái được kiểm soát trực tiếp tại `app_settings` (`agent.emergency_stop`).
- Việc đổi trạng thái và ghi audit được thực hiện trong cùng database RPC transaction.
- Worker kiểm tra trạng thái trước khi nhận/tiếp tục tác vụ. Emergency Stop không hủy một yêu cầu provider đang chạy; Vercel worker state không được chia sẻ giữa các instances.

## 4. GIỚI HẠN HIỆN TẠI

- Model Router hiện chọn model theo quy tắc ứng dụng và có fallback qua danh sách provider models; không có bằng chứng về tier pricing, prompt caching hay mức tiết kiệm token 85%.
- Không có durable AI usage metering hoặc giới hạn chi tiêu VND được xác minh. Rate limit là process-local và không thay thế budget gate.
- Queue claims dùng RPC database atomic, nhưng state/runtime key pool và rate limits không chia sẻ giữa Vercel instances.
- Approval hiện không được ràng buộc với payload bất biến và người phê duyệt; các hành động external/publishing không được tích hợp và không nên bật.
- Không có upload route hoặc Storage adapter; không cấu hình bucket công khai.
- Public KPI API chỉ trả số liệu tổng hợp được chủ dự án cho phép hiển thị công khai; xác nhận lại quyết định này trước khi triển khai.
