import { lazy } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { FilterProvider, ThemeProvider } from "./components/Providers";
import { Shell } from "./components/Shell";

const Executive = lazy(() => import("./pages/Executive"));
const ClientHealth = lazy(() => import("./pages/ClientHealth"));
const Advisors = lazy(() => import("./pages/Advisors"));
const DataQuality = lazy(() => import("./pages/DataQuality"));
const Methodology = lazy(() => import("./pages/Methodology"));

export default function App() {
  return (
    <ThemeProvider>
      <FilterProvider>
        <HashRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Executive />} />
              <Route path="client-health" element={<ClientHealth />} />
              <Route path="advisors" element={<Advisors />} />
              <Route path="data-quality" element={<DataQuality />} />
              <Route path="methodology" element={<Methodology />} />
              <Route path="*" element={<Executive />} />
            </Route>
          </Routes>
        </HashRouter>
      </FilterProvider>
    </ThemeProvider>
  );
}
