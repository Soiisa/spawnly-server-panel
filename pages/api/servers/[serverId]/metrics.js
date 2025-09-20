// pages/api/servers/[serverId]/metrics.js
export default async function handler(req, res) {
  const { serverId } = req.query;
  if (!serverId) {
    return res.status(400).json({ error: "Missing serverId" });
  }

  const token = process.env.HETZNER_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Hetzner API token not set" });
  }

  try {
    // Time window: last 5 minutes
    const end = new Date();
    const start = new Date(end.getTime() - 5 * 60 * 1000);

    const params = new URLSearchParams({
      type: "cpu,memory", // request both
      start: start.toISOString(),
      end: end.toISOString(),
      step: "60",
    });

    const url = `https://api.hetzner.cloud/v1/servers/${serverId}/metrics?${params}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(r.status).json({ error: "Hetzner API error", detail: txt });
    }

    const data = await r.json();

    // Extract the most recent values
    const cpuSeries = data.metrics.time_series.cpu || [];
    const memSeries = data.metrics.time_series.memory || [];

    const latestCpu = cpuSeries.length ? cpuSeries[cpuSeries.length - 1] : null;
    const latestMem = memSeries.length ? memSeries[memSeries.length - 1] : null;

    res.status(200).json({
      serverId,
      cpu: latestCpu ? { percent: Number(latestCpu.value) } : null,
      mem: latestMem
        ? { usedPct: Number(latestMem.value) }
        : null,
      raw: data.metrics.time_series, // keep full series for charts
    });
  } catch (err) {
    console.error("Hetzner metrics error:", err);
    res.status(500).json({ error: "Failed to fetch Hetzner metrics", detail: String(err) });
  }
}
