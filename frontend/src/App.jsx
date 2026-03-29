import { Navigate, Route, Routes } from "react-router-dom";
import WorkspacePage from "./pages/WorkspacePage";
import DashboardPage from "./pages/DashboardPage";
import LiveResultsPage from "./pages/LiveResultsPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/live-results" element={<LiveResultsPage />} />
      <Route path="/dashboard/:sessionId" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
