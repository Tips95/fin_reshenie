import { ProtectedLayout } from "@/components/ProtectedLayout";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
