import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import Login from "./pages/Login";
import Receptions from "./pages/Receptions";
import Saisie from "./pages/Saisie";
import Validation from "./pages/Validation";
import Admin from "./pages/Admin";

function PrivateRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/receptions" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/receptions"
          element={<PrivateRoute><Receptions /></PrivateRoute>}
        />
        <Route
          path="/receptions/:id/validation"
          element={
            <PrivateRoute roles={["responsable", "admin"]}>
              <Validation />
            </PrivateRoute>
          }
        />
        <Route
          path="/receptions/:id"
          element={<PrivateRoute><Saisie /></PrivateRoute>}
        />

        <Route
          path="/admin"
          element={
            <PrivateRoute roles={["admin"]}>
              <Admin />
            </PrivateRoute>
          }
        />

        <Route path="/" element={<Navigate to="/receptions" replace />} />
        <Route path="*" element={<Navigate to="/receptions" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
