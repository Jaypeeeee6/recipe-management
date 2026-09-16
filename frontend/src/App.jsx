import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import AppLayout from "./layout/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Ingredients from "./pages/Ingredients";
import IngredientForm from "./pages/IngredientForm";
import { SupplierForm, SupplierList } from "./pages/Suppliers";
import { TrialDetail, TrialForm, TrialList } from "./pages/Trials";
import TrialCompare from "./pages/TrialCompare";
import { ProductArchives, ProductForm, ProductList } from "./pages/Products";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import AuditLogs from "./pages/AuditLogs";
import Committee from "./pages/Committee";

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="empty">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  const { user, ready } = useAuth();

  return (
    <Routes>
      <Route path="/evaluate/:trialId" element={<Committee />} />
      <Route
        path="/login"
        element={ready && user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/ingredients" element={<Protected><Ingredients /></Protected>} />
      <Route path="/ingredients/new" element={<Protected><IngredientForm /></Protected>} />
      <Route path="/ingredients/:id" element={<Protected><IngredientForm /></Protected>} />
      <Route path="/suppliers" element={<Protected><SupplierList /></Protected>} />
      <Route path="/suppliers/new" element={<Protected><SupplierForm /></Protected>} />
      <Route path="/suppliers/:id" element={<Protected><SupplierForm /></Protected>} />
      <Route path="/trials" element={<Protected><TrialList /></Protected>} />
      <Route path="/trials/new" element={<Protected><TrialForm /></Protected>} />
      <Route path="/trials/compare" element={<Protected><TrialCompare /></Protected>} />
      <Route path="/trials/:id/edit" element={<Protected><TrialForm /></Protected>} />
      <Route path="/trials/:id" element={<Protected><TrialDetail /></Protected>} />
      <Route path="/products" element={<Protected><ProductList /></Protected>} />
      <Route path="/products/archives" element={<Protected><ProductArchives /></Protected>} />
      <Route path="/products/new" element={<Protected><ProductForm /></Protected>} />
      <Route path="/products/:id" element={<Protected><ProductForm /></Protected>} />
      <Route path="/reports" element={<Protected><Reports /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/audit-logs" element={<Protected><AuditLogs /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
