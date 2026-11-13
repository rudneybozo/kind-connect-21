import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouter,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Clock,
  RefreshCw,
  Trash2,
  History,
  BarChart3,
  AlertTriangle,
  ChevronDown,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FilterProvider,
  displayName,
  useMe,
  useStores,
  usePendingDeletionCount,
  useOpenAlertsCount,
} from "@/lib/crm";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const me = useMe();
  const stores = useStores();
  const adminOn = me.data?.role === "admin" && Boolean(me.data?.active);
  const pendingCount = usePendingDeletionCount(adminOn);
  const alertsCount = useOpenAlertsCount(adminOn);

  // Se a sessão expirar ou o usuário sair em outra aba, volta para o login
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        router.navigate({ to: "/auth", replace: true });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient, router]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  if (me.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (me.error || !me.data) {
    return (
      <CenteredMessage
        title="Não foi possível carregar seu perfil"
        text="Verifique a internet e tente de novo. Se continuar, confira se o banco de dados foi configurado (supabase/schema.sql)."
        onRetry={() => me.refetch()}
        onSignOut={handleSignOut}
      />
    );
  }

  if (!me.data.active) {
    return (
      <CenteredMessage
        icon={<Clock className="h-10 w-10 text-amber-500" />}
        title="Aguardando liberação"
        text={`Sua conta (${me.data.email}) foi criada. O administrador precisa liberar seu acesso e definir sua loja. Depois disso, é só tocar em "Verificar de novo".`}
        onRetry={() => me.refetch()}
        retryLabel="Verificar de novo"
        onSignOut={handleSignOut}
      />
    );
  }

  const isAdmin = me.data.role === "admin";
  const storeName = stores.data?.find((s) => s.id === me.data!.store_id)?.name;

  const mainItems = [
    { to: "/app", label: "Painel", icon: LayoutDashboard },
    { to: "/app/clientes", label: "Clientes", icon: Users },
    ...(isAdmin ? [{ to: "/app/relatorios", label: "Relatórios", icon: BarChart3 }] : []),
  ];
  const adminItems = isAdmin
    ? [
        { to: "/app/equipe", label: "Equipe e lojas", icon: ShieldCheck },
        { to: "/app/exclusoes", label: "Exclusões", icon: Trash2 },
        { to: "/app/alertas", label: "Alertas", icon: AlertTriangle },
        { to: "/app/historico", label: "Histórico", icon: History },
      ]
    : [];
  const navItems = [...mainItems, ...adminItems];
  const countFor = (to: string) =>
    to === "/app/exclusoes"
      ? (pendingCount.data ?? 0)
      : to === "/app/alertas"
        ? (alertsCount.data ?? 0)
        : 0;
  const adminCount = (pendingCount.data ?? 0) + (alertsCount.data ?? 0);
  const bubble = (n: number) =>
    n > 0 ? (
      <span className="ml-1 rounded-full bg-destructive px-1.5 text-[11px] leading-5 text-destructive-foreground">
        {n}
      </span>
    ) : null;
  const badgeFor = (to: string) => bubble(countFor(to));

  const isActive = (to: string) =>
    location.pathname === to || (to !== "/app" && location.pathname.startsWith(to));

  return (
    <FilterProvider>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link to="/app" className="flex items-center gap-2 font-bold text-lg">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                V
              </span>
              <span className="hidden sm:inline">Vendas CRM</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {mainItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive(item.to)
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {item.label}
                  </Link>
                );
              })}
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none ${
                      adminItems.some((i) => isActive(i.to))
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <Settings className="h-4 w-4" /> Administração
                    {bubble(adminCount)}
                    <ChevronDown className="h-3 w-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {adminItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem key={item.to} asChild>
                          <Link to={item.to} className="flex items-center gap-2 cursor-pointer">
                            <Icon className="h-4 w-4" /> {item.label}
                            <span className="ml-auto">{badgeFor(item.to)}</span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </nav>

            <div className="flex items-center gap-2 min-w-0">
              <div className="hidden xl:block text-right min-w-0">
                <div className="text-sm font-medium truncate">{displayName(me.data)}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {isAdmin ? "Administrador" : "Vendedor"}
                  {storeName && ` · ${storeName}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="hidden md:inline-flex"
              >
                <LogOut className="h-4 w-4 mr-2" /> Sair
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setOpen((v) => !v)}
                aria-label="Menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
          {open && (
            <div className="md:hidden border-t bg-background">
              <div className="mx-auto max-w-6xl px-4 py-2 flex flex-col">
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {displayName(me.data)} · {isAdmin ? "Administrador" : "Vendedor"}
                  {storeName && ` · ${storeName}`}
                </div>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
                    >
                      <Icon className="h-4 w-4" /> {item.label}
                      {badgeFor(item.to)}
                    </Link>
                  );
                })}
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent text-left"
                >
                  <LogOut className="h-4 w-4" /> Sair
                </button>
              </div>
            </div>
          )}
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </FilterProvider>
  );
}

function CenteredMessage({
  icon,
  title,
  text,
  onRetry,
  retryLabel = "Tentar de novo",
  onSignOut,
}: {
  icon?: React.ReactNode;
  title: string;
  text: string;
  onRetry: () => void;
  retryLabel?: string;
  onSignOut: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 text-center space-y-3">
          {icon && <div className="flex justify-center">{icon}</div>}
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{text}</p>
          <div className="flex justify-center gap-2 pt-2">
            <Button onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" /> {retryLabel}
            </Button>
            <Button variant="outline" onClick={onSignOut}>
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
