import { voucherSide, voucherTotal } from '@/lib/books';
import type { AppData, Voucher } from '@/lib/types';
import { m2 } from '@/lib/utils';

export function VoucherTable({ d, list, onEdit, onDelete }: { d: AppData; list: Voucher[]; onEdit?: (v: Voucher) => void; onDelete?: (v: Voucher) => void }) {
  return (
    <table className="tbl mt-2">
      <thead>
        <tr><th>Date</th><th>Particulars</th><th>Vch type</th><th>Vch no.</th><th className="r">Amount (₹)</th>{(onEdit || onDelete) && <th />}</tr>
      </thead>
      <tbody>
        {list.map((v) => (
          <tr key={v.id}>
            <td className="whitespace-nowrap">{v.date}</td>
            <td>
              <b>{voucherSide(d, v, 'dr')}</b> <span className="text-mute">to</span> {voucherSide(d, v, 'cr')}
              {v.narr && <div className="text-mute">{v.narr}</div>}
            </td>
            <td>{v.type}</td><td>{v.no}</td><td className="r">{m2(voucherTotal(v))}</td>
            {(onEdit || onDelete) && (
              <td className="whitespace-nowrap">
                {onEdit && <button className="btn-ic" title="Alter" aria-label="Alter voucher" onClick={() => onEdit(v)}>✎</button>}
                {onDelete && <button className="btn-ic" title="Delete" aria-label="Delete voucher" onClick={() => onDelete(v)}>✕</button>}
              </td>
            )}
          </tr>
        ))}
        {!list.length && <tr><td colSpan={6} className="text-mute">No vouchers</td></tr>}
      </tbody>
    </table>
  );
}
