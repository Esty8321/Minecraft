// src/components/TopBar.tsx
import { authStorage } from "../utils/auth";

export default function TopBar() {
  const isAuthed = authStorage.isAuthenticated();

  const onLogout = () => {
    authStorage.clear();
    window.location.href = "/auth";
  };

  return (
    <div className="w-full border-b bg-white/70 backdrop-blur px-4 py-2 flex items-center justify-between">
      <div className="font-semibold">Voxel World</div>
      {isAuthed && (
        <button
          onClick={onLogout}
          className="px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition"
        >
          Logout
        </button>
      )}
    </div>
  );
}
