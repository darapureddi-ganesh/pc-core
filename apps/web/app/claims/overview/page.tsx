import { getClaimsOverview } from "../../actions";
import { inrShort } from "../format";

export const dynamic = "force-dynamic";

function Bars({ title, data, money }: { title: string; data: Record<string, number>; money?: boolean }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <section className="card">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <div className="placeholder">Nothing yet.</div>
      ) : (
        <table className="queue-table">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td style={{ width: "50%" }}>
                  <div className="workload-bar">
                    <div className="fill" style={{ width: `${(v / max) * 100}%` }} />
                  </div>
                </td>
                <td className="num">{money ? inrShort(v) : v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function ClaimsOverviewPage() {
  const o = await getClaimsOverview();
  return (
    <main className="wrap">
      <section className="card span-2">
        <span className="eyebrow">Reporting</span>
        <h2>Claims overview</h2>
        <div className="queue-summary">
          <div className="stat"><div className="n">{o.openClaims}</div><div className="lbl">Open claims</div></div>
          <div className="stat"><div className="n">{inrShort(o.paid)}</div><div className="lbl">Paid</div></div>
          <div className="stat"><div className="n">{inrShort(o.awaitingApproval)}</div><div className="lbl">Awaiting approval</div></div>
          <div className="stat"><div className="n">{inrShort(o.outstandingReserves)}</div><div className="lbl">Outstanding reserves</div></div>
          <div className="stat"><div className="n">{inrShort(o.recovered)}</div><div className="lbl">Recovered</div></div>
          <div className={`stat${o.irdaiOverdue ? " crit" : ""}`}><div className="n">{o.irdaiOverdue}</div><div className="lbl">Past IRDAI deadline</div></div>
        </div>
      </section>
      <Bars title="Claims by stage" data={o.byStage} />
      <Bars title="Paid by claim type" data={o.paidByClaimType} money />
      <Bars title="Paid by handler" data={o.paidByHandler} money />
    </main>
  );
}
