import { BottomNavigation } from "@/components/BottomNavigation";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-paper">
      {children}
      <BottomNavigation />
    </div>
  );
}
