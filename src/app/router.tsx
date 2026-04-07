import { QueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { bootstrapQueryOptions } from "@/app/bootstrap-query";
import { ShellScaffold } from "@/components/chrome/shell-scaffold";

type RouterContext = {
  queryClient: QueryClient;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(bootstrapQueryOptions),
  component: DashboardRoute,
});

const routeTree = rootRoute.addChildren([dashboardRoute]);

export const router = createRouter({
  routeTree,
  context: {
    queryClient: undefined as never,
  },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function RootLayout() {
  return <Outlet />;
}

function DashboardRoute() {
  const { data } = useSuspenseQuery(bootstrapQueryOptions);

  return <ShellScaffold bootstrap={data} />;
}
