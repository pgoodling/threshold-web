// Laying out one day of appointments in salon time.
//
// Shared by the calendar's time grid and the day shown while rebooking, so a
// client sits in the same place on both. Moved out of Calendar.tsx because the
// rebook form is imported BY the calendar and couldn't import back from it.

// minutes since midnight in the salon timezone
export function salonMinutes(iso: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === "hour")!.value);
  const m = Number(p.find((x) => x.type === "minute")!.value);
  return h * 60 + m;
}

// Appointments can now legitimately overlap — that's the whole point of
// processing time — so they need side-by-side lanes or the client filling a gap
// renders hidden underneath the colour client. Greedy first-fit within each
// CLUSTER of overlapping appointments.
//
// Lane width used to be one number for the whole day, which meant a single
// overlap anywhere shrank every block that day to half width. Re-time one
// appointment so it overlaps its neighbour and the entire day visibly reflows —
// which reads exactly like "it changed all my other appointments". Clustering
// keeps the narrowing local to the appointments actually sharing a window.
export type Placed<T> = {
  item: T;
  startMin: number;
  endMin: number;
  lane: number;
  laneCount: number;
};

export function layoutLanes<T extends { starts_at: string; ends_at: string }>(
  items: T[],
): Placed<T>[] {
  const rows = items
    .map((a) => ({
      item: a,
      startMin: salonMinutes(a.starts_at),
      endMin: salonMinutes(a.ends_at),
    }))
    .sort((x, y) => x.startMin - y.startMin || x.endMin - y.endMin);

  const out: Placed<T>[] = [];
  let cluster: typeof rows = [];
  let clusterEnd = -Infinity;

  // Assign lanes inside one cluster, then stamp them all with that cluster's
  // width so only these blocks get narrower.
  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const lanes = cluster.map((r) => {
      let lane = laneEnds.findIndex((end) => end <= r.startMin);
      if (lane === -1) {
        laneEnds.push(r.endMin);
        lane = laneEnds.length - 1;
      } else {
        laneEnds[lane] = r.endMin;
      }
      return lane;
    });
    const laneCount = Math.max(1, laneEnds.length);
    cluster.forEach((r, i) => out.push({ ...r, lane: lanes[i], laneCount }));
    cluster = [];
  };

  for (const r of rows) {
    // A gap with nothing running through it ends the cluster.
    if (cluster.length && r.startMin >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    cluster.push(r);
    clusterEnd = Math.max(clusterEnd, r.endMin);
  }
  flush();
  return out;
}
