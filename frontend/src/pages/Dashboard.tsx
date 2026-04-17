import { useEffect } from 'react';

const Dashboard = () => {
  useEffect(function setTitleEffect() {
    document.title = "saltsjobaden - dashboard";
  }, []);

  return (
    <main className="app-main">
      <div className="dashboard-empty-state">
        <h2>Dashboard</h2>
        <p>The maaaaap</p>
      </div>
    </main>
  );
};

export default Dashboard;
