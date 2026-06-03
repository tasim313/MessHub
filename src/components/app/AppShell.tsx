import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  Utensils,
  ShoppingBasket,
  Zap,
  Wallet,
  FileBarChart,
  UserPlus,
  BedDouble,
  UsersRound,
  LogOut,
  Moon,
  Sun,
  Menu,
  Home,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/firebase";

const nav: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["owner", "manager", "member"],
  },
  {
    to: "/meals",
    label: "Meals",
    icon: Utensils,
    roles: ["owner", "manager", "member"],
  },
  {
    to: "/bazar",
    label: "Bazar",
    icon: ShoppingBasket,
    roles: ["owner", "manager", "member"],
  },
  {
    to: "/utilities",
    label: "Utilities",
    icon: Zap,
    roles: ["owner", "manager", "member"],
  },
  {
    to: "/deposits",
    label: "Deposits",
    icon: Wallet,
    roles: ["owner", "manager", "member"],
  },
  {
    to: "/rooms",
    label: "Rooms & Beds",
    icon: BedDouble,
    roles: ["owner", "manager"],
  },
  {
    to: "/staff",
    label: "Staff",
    icon: UsersRound,
    roles: ["owner", "manager"],
  },
  {
    to: "/members",
    label: "Members",
    icon: Users,
    roles: ["owner", "manager"],
  },
  {
    to: "/reports",
    label: "Reports",
    icon: FileBarChart,
    roles: ["owner", "manager"],
  },
  { to: "/admin", label: "Users & Admin", icon: UserPlus, roles: ["owner"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const visible = nav.filter((n) => !profile || n.roles.includes(profile.role));

  const onLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Home className="h-5 w-5" />
        </div>
        <div>
          <div className="font-bold leading-tight">MessHub</div>
          <div className="text-xs text-muted-foreground">Dhaka edition</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {visible.map((item) => {
          const active =
            location.pathname === item.to ||
            location.pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3 space-y-2">
        {profile && (
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground font-semibold uppercase">
              {profile.name?.[0] ?? "U"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{profile.name}</div>
              <div className="text-xs text-muted-foreground capitalize">
                {profile.role}
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={toggle}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden md:block">{Sidebar}</div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative h-full w-64">
            {Sidebar}
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4 md:hidden">
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="font-semibold">MessHub</div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
