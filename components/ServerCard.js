// components/ServerCard.js
export default function ServerCard({ server, onStart, onStop, onDelete }) {
  return (
    <div className="bg-white rounded-xl shadow p-5 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
      <div>
        <h3 className="text-lg font-semibold text-indigo-900">{server.name}</h3>
        <p className="text-sm text-neutral-600">RAM: <span className="font-medium">{server.ram} GB</span></p>
        <p className="text-sm text-neutral-600">Status: <span className={server.status === "running" ? "text-green-600 font-medium" : "text-orange-600 font-medium"}>{server.status}</span></p>
        <p className="text-sm text-neutral-500">IP: <span className="font-mono">{server.name + ".spawnly.net" || '—'}</span></p>
      </div>

      <div className="flex items-center space-x-3">
        {server.status !== "running" ? (
          <button onClick={() => onStart(server.id)} className="bg-teal-500 hover:bg-teal-400 text-white font-semibold py-2 px-4 rounded">
            Start
          </button>
        ) : (
          <button onClick={() => onStop(server.id)} className="bg-orange-500 hover:bg-orange-400 text-white font-semibold py-2 px-4 rounded">
            Stop
          </button>
        )}

        <button onClick={() => onDelete(server.id)} className="bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded">
          Delete
        </button>
      </div>
    </div>
  );
}
