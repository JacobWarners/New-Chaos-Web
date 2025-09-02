import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"

function RootLayout() {
  return (
    <>
      <div>This will never be viewable</div>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  )
}

const root = createRootRoute({ component: RootLayout })

export {
  root as Route,
}
