-- ============================================================
-- EM MÌ — Migration 002: Sửa lỗi Infinite Recursion trong RLS Policy
-- ============================================================

-- 1. Xóa các policy gây đệ quy trên bảng profiles
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;

-- 2. Tạo hàm kiểm tra quyền Admin với SECURITY DEFINER để phá vỡ vòng lặp đệ quy RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'super_admin') 
     FROM public.profiles 
     WHERE id = auth.uid()),
    FALSE
  );
$$;

-- 3. Cấp quyền thực thi hàm is_admin cho authenticated và anon
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- 4. Tạo lại policy cho bảng profiles không bị đệ quy
CREATE POLICY "profiles_self_read" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "profiles_admin_all" 
ON public.profiles 
FOR ALL 
USING (public.is_admin());

-- 5. Cho phép hệ thống server-side (Service Role / Anon Dev) đọc ghi tasks và conversations
DROP POLICY IF EXISTS "tasks_admin_only" ON public.tasks;
CREATE POLICY "tasks_access_policy" 
ON public.tasks 
FOR ALL 
USING (
  public.is_admin() 
  OR auth.uid() IS NULL -- Cho phép server-side route handlers khi dùng service key
);

DROP POLICY IF EXISTS "admin_conv_all" ON public.conversations;
CREATE POLICY "admin_conv_access_policy" 
ON public.conversations 
FOR ALL 
USING (
  type = 'public' 
  OR public.is_admin() 
  OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS "messages_via_conversation" ON public.messages;
CREATE POLICY "messages_access_policy" 
ON public.messages 
FOR ALL 
USING (TRUE);

DROP POLICY IF EXISTS "revenue_admin_only" ON public.revenue_records;
CREATE POLICY "revenue_access_policy" 
ON public.revenue_records 
FOR ALL 
USING (
  public.is_admin() 
  OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS "kpi_admin_all" ON public.monthly_kpis;
CREATE POLICY "kpi_access_policy" 
ON public.monthly_kpis 
FOR ALL 
USING (TRUE);

DROP POLICY IF EXISTS "plans_admin_only" ON public.agent_plans;
CREATE POLICY "plans_access_policy" 
ON public.agent_plans 
FOR ALL 
USING (
  public.is_admin() 
  OR auth.uid() IS NULL
);

