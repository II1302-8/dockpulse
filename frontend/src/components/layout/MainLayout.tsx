import { Outlet } from "react-router-dom";
import { Footer } from "./Footer";
import { Header } from "./Header";

function MainLayout() {
  return (
    <div className="bg-[#F4F9FF] duration-1000 font-body h-screen overflow-hidden relative transition-colors w-screen">
      <Header />
      <main className="absolute inset-0 z-0">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export { MainLayout };
