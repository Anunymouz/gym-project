import Link from 'next/link';
import { Package, Plus } from '@phosphor-icons/react/ssr';
import { formatGhs, pesewas, type SellerProduct } from '@bgym/shared';
import { Badge } from '@/components/ui/badge';
import { mediaSrc } from '@/lib/media';
import { STATUS_BADGE } from './product-status';

/** A seller's products with status, price range and stock, each linking to its editor. */
export function ProductTable({ products, base }: { products: SellerProduct[]; base: string }) {
  if (products.length === 0) {
    return (
      <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
        <Package size={36} weight="duotone" className="text-violet" aria-hidden />
        <p className="mt-3 font-bold">No products yet</p>
        <Link href={`${base}/new`} className="mt-4 inline-flex h-11 items-center gap-2 rounded-control bg-flare px-5 text-sm font-bold text-white"><Plus size={18} weight="bold" aria-hidden /> Add your first product</Link>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-line text-xs text-mute uppercase">
          <tr><th className="px-5 py-3">Product</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Stock</th><th className="px-5 py-3">Sold</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {products.map((p) => {
            const live = p.variants.filter((v) => v.isActive);
            const prices = live.map((v) => v.pricePesewas);
            const stock = live.reduce((s, v) => s + v.stock - v.reserved, 0);
            const badge = STATUS_BADGE[p.status];
            return (
              <tr key={p.id} className="hover:bg-cloud/60">
                <td className="px-5 py-3">
                  <Link href={`${base}/${p.id}`} className="flex items-center gap-3 font-bold hover:text-flare">
                    {/* eslint-disable-next-line @next/next/no-img-element -- server-resized */}
                    {p.images[0] ? <img src={mediaSrc(p.images[0].thumbUrl)} alt="" className="size-12 rounded-lg object-cover" /> : <span className="grid size-12 place-items-center rounded-lg bg-cloud text-mute"><Package size={20} aria-hidden /></span>}
                    <span>{p.title}{p.brand && <span className="block text-xs font-normal text-mute">{p.brand}</span>}</span>
                  </Link>
                </td>
                <td className="px-5 py-3"><Badge tone={badge.tone}>{badge.label}</Badge>{p.reviewNote && p.status === 'draft' && <p className="mt-1 text-xs font-semibold text-flare">Changes requested</p>}</td>
                <td className="px-5 py-3 tabular-nums whitespace-nowrap">{prices.length ? (Math.min(...prices) === Math.max(...prices) ? formatGhs(pesewas(prices[0]!)) : `${formatGhs(pesewas(Math.min(...prices)))}–${formatGhs(pesewas(Math.max(...prices)))}`) : '—'}</td>
                <td className={`px-5 py-3 tabular-nums ${stock < 5 ? 'font-bold text-flare' : ''}`}>{stock}{live.length > 1 && <span className="font-normal text-mute"> · {live.length} options</span>}</td>
                <td className="px-5 py-3 tabular-nums">{p.sold}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
