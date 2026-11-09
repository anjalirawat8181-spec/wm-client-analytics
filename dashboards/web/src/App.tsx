import { lazy } from "react";
import { FilterProvider, ThemeProvider } from "./components/Providers";
import { Shell } from "./components/Shell";
import { useHashRoute } from "./lib/router";

const Executive = lazy(() => import("./pages/Executive"));
const ClientHealth = lazy(() => import("./pages/ClientHealth"));
const Advisors = lazy(() => import("./pages/Advisors"));
const DataQuality = lazy(() => import("./pages/DataQuality"));
const Methodology = lazy(() => import("./pages/Methodology"));

function Routes() {
  const route = useHashRoute();
  switch (route) {
    case "/client-health":
      return <ClientHealth />;
    case "/advisors":
      return <Advisors />;
    case "/data-quality":
      return <DataQuality />;
    case "/methodology":
      return <Methodology />;
    default:
      return <Executive />;
  }
}

export default function App() {
  return (
    <ThemeProvider>
      <FilterProvider>
        <Shell>
          <Routes />
        </Shell>
      </FilterProvider>
    </ThemeProvider>
  );
}
