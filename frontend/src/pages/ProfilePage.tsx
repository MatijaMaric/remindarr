import { Navigate } from "react-router";
import { useAuth } from "../context/AuthContext";

export default function ProfilePage() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/user/${user.username}`} replace />;
}
