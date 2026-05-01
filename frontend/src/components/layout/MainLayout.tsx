import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Footer } from "./Footer";
import { Header } from "./Header";

export type AuthUser = {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  boat_club?: string;
};

function MainLayout() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token"),
  );

  useEffect(() => {
    if (!token) return;

    fetch("/api/users/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Session expired");
        return res.json();
      })
      .then(setUser)
      .catch(() => {
        setUser(null);
        setToken(null);
        localStorage.removeItem("token");
      });
  }, [token]);

  const userInitials =
    user?.first_name && user?.last_name
      ? `${user.first_name[0]}${user.last_name[0]}`
      : user?.email?.slice(0, 2).toUpperCase();

  return (
    <div className="bg-transparent duration-1000 font-body h-screen overflow-hidden relative transition-colors w-screen">
      <Header
        isLoggedIn={Boolean(user)}
        userInitials={userInitials}
        onLoginClickCB={() => setIsLoginOpen(true)}
      />

      <main className="absolute inset-0 z-0">
        <Outlet
          context={{
            isLoginOpen,
            setIsLoginOpen,
            user,
            setUser,
            token,
            setToken,
          }}
        />
      </main>

      <Footer />
    </div>
  );
}

export { MainLayout };
