'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Archive, ArrowCounterClockwise, CheckCircle, CircleNotch, ImageSquare, PaperPlaneTilt, Plus, Star, Trash, WarningCircle, X } from '@phosphor-icons/react';
import { MAX_PRODUCT_PHOTOS, type ProductInput, type SellerProduct, type StoreCategory } from '@bgym/shared';
import { productPhotoAction, productStatus, saveProduct, uploadProductPhoto } from '@/app/(dashboards)/store-actions';
import { Badge } from '@/components/ui/badge';
import { mediaSrc } from '@/lib/media';
import { preparePhoto } from '@/lib/prepare-photo';
import { STATUS_BADGE } from './product-status';

const field = 'h-11 w-full rounded-control border border-line bg-white px-3 outline-none focus:border-flare aria-[invalid=true]:border-danger';
const cell = 'h-10 w-full rounded-control border border-line bg-white px-2 outline-none focus:border-flare aria-[invalid=true]:border-danger';

type Row = { id?: string; name: string; sku: string; price: string; was: string; stock: string; weight: string; reserved: number };
const toRow = (v: SellerProduct['variants'][number]): Row => ({ id: v.id, name: v.name, sku: v.sku, price: String(v.pricePesewas / 100), was: v.compareAtPricePesewas ? String(v.compareAtPricePesewas / 100) : '', stock: String(v.stock), weight: v.weightGrams ? String(v.weightGrams) : '', reserved: v.reserved });
const cedis = (s: string) => Math.round(Number(s) * 100);


/**
 * Create or edit a product: details, options (price, stock), photos, then publish. Used by
 * partners (publishing sends it for review) and the BGYM team for BGYM's own store (live at once).
 */
export function ProductEditor({ scope, initial, categories, listHref }: { scope: 'partner' | 'own'; initial: SellerProduct | null; categories: StoreCategory[]; listHref: string }) {
  const router = useRouter();
  const [product, setProduct] = useState(initial);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [rows, setRows] = useState<Row[]>(initial?.variants.filter((v) => v.isActive).map(toRow) ?? [{ name: '', sku: '', price: '', was: '', stock: '0', weight: '', reserved: 0 }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const input = (): ProductInput => ({
    title,
    brand: brand || undefined,
    description: description || undefined,
    categoryId,
    variants: rows.map((r) => ({ ...(r.id && { id: r.id }), name: r.name, sku: r.sku, pricePesewas: cedis(r.price), compareAtPricePesewas: r.was ? cedis(r.was) : null, stock: Number(r.stock) || 0, weightGrams: r.weight ? Number(r.weight) : null })),
  });
  const update = (i: number, patch: Partial<Row>) => setRows((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const after = (res: { data?: SellerProduct; error?: string; fieldErrors?: Record<string, string> }, ok?: string) => {
    setErrors(res.fieldErrors ?? {});
    if (res.data) {
      setProduct(res.data);
      setRows(res.data.variants.filter((v) => v.isActive).map(toRow));
    }
    setMessage(res.error ? { error: res.error } : res.fieldErrors ? { error: 'Check the highlighted fields.' } : ok ? { ok } : {});
    return res;
  };

  const save = () =>
    start(async () => {
      const res = after(await saveProduct(scope, product?.id ?? null, input()), 'Saved.');
      if (res.data && !product) router.replace(`${listHref}/${res.data.id}`);
    });
  const status = (action: 'publish' | 'unpublish' | 'archive') =>
    start(async () => {
      after(await productStatus(scope, product!.id, action), action === 'publish' ? (scope === 'partner' ? 'Sent to the BGYM team for review.' : 'Live in the store.') : action === 'archive' ? 'Archived.' : 'Moved back to draft.');
    });
  const upload = (files: File[]) =>
    start(async () => {
      for (const f of files.slice(0, MAX_PRODUCT_PHOTOS - (product?.images.length ?? 0))) {
        const form = new FormData();
        form.append('photo', await preparePhoto(f, 1600), 'photo.jpg');
        const res = after(await uploadProductPhoto(scope, product!.id, form));
        if (res.error) break;
      }
      if (fileInput.current) fileInput.current.value = '';
    });

  const badge = product ? STATUS_BADGE[product.status] : null;

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-5 rounded-card border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">{product ? 'Details' : 'New product'}</h2>
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </div>
        {product?.reviewNote && (
          <p role="alert" className="flex gap-2 rounded-control bg-flare-50 p-3 text-sm"><WarningCircle size={20} className="shrink-0 text-flare" aria-hidden /><span><span className="font-bold">The BGYM team asked for changes:</span> {product.reviewNote}</span></p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="title" className="text-sm font-bold">Product name</label>
            <input id="title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} placeholder="Gold Standard 100% Whey" className={field} />
            {errors.title && <p className="text-sm font-semibold text-danger">{errors.title}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="brand" className="text-sm font-bold">Brand <span className="font-normal text-mute">(optional)</span></label>
            <input id="brand" value={brand} maxLength={60} onChange={(e) => setBrand(e.target.value)} className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category" className="text-sm font-bold">Category</label>
            <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-invalid={!!errors.categoryId} className={field}>
              <option value="">Choose…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="description" className="text-sm font-bold">Description</label>
            <textarea id="description" rows={5} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it is, who it's for, servings, ingredients, sizing…" className="rounded-control border border-line bg-white px-3 py-2.5 outline-none focus:border-flare" />
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Options, prices and stock</legend>
          <p className="-mt-1 text-xs text-mute">One row per size, flavour or colour. “Was” shows a sale price; leave it empty if not on sale.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs text-mute uppercase">
                <tr><th className="pb-1 font-semibold">Option</th><th className="pb-1 font-semibold">SKU</th><th className="pb-1 font-semibold">Price (GH₵)</th><th className="pb-1 font-semibold">Was</th><th className="pb-1 font-semibold">In stock</th><th className="pb-1 font-semibold">Weight (g)</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id ?? `new-${i}`} className="align-top">
                    <td className="py-1 pr-2"><input aria-label="Option name" value={r.name} placeholder="1 kg · Chocolate" onChange={(e) => update(i, { name: e.target.value })} aria-invalid={!!errors[`variants.${i}.name`]} className={cell} /></td>
                    <td className="py-1 pr-2"><input aria-label="SKU" value={r.sku} placeholder="WHEY-1KG-CHOC" onChange={(e) => update(i, { sku: e.target.value.toUpperCase() })} aria-invalid={!!errors[`variants.${i}.sku`]} className={`${cell} uppercase`} /></td>
                    <td className="w-28 py-1 pr-2"><input aria-label="Price" inputMode="decimal" value={r.price} onChange={(e) => update(i, { price: e.target.value.replace(/[^\d.]/g, '') })} aria-invalid={!!errors[`variants.${i}.pricePesewas`]} className={cell} /></td>
                    <td className="w-24 py-1 pr-2"><input aria-label="Was price" inputMode="decimal" value={r.was} onChange={(e) => update(i, { was: e.target.value.replace(/[^\d.]/g, '') })} aria-invalid={!!errors[`variants.${i}.compareAtPricePesewas`]} className={cell} /></td>
                    <td className="w-24 py-1 pr-2"><input aria-label="Stock" inputMode="numeric" value={r.stock} onChange={(e) => update(i, { stock: e.target.value.replace(/\D/g, '') })} className={cell} />{r.reserved > 0 && <p className="mt-0.5 text-[11px] text-mute">{r.reserved} held</p>}</td>
                    <td className="w-24 py-1 pr-2"><input aria-label="Weight in grams" inputMode="numeric" value={r.weight} onChange={(e) => update(i, { weight: e.target.value.replace(/\D/g, '') })} className={cell} /></td>
                    <td className="py-1"><button type="button" aria-label="Remove option" disabled={rows.length === 1} onClick={() => setRows((l) => l.filter((_, j) => j !== i))} className="grid size-10 place-items-center rounded-full text-mute hover:bg-danger-50 hover:text-danger disabled:opacity-30"><X size={16} aria-hidden /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.entries(errors).filter(([k]) => k.startsWith('variants')).slice(0, 2).map(([k, v]) => <p key={k} className="text-sm font-semibold text-danger">{v}</p>)}
          <button type="button" disabled={rows.length >= 20} onClick={() => setRows((l) => [...l, { name: '', sku: '', price: l.at(-1)?.price ?? '', was: '', stock: '0', weight: l.at(-1)?.weight ?? '', reserved: 0 }])} className="inline-flex h-9 items-center gap-1 self-start rounded-control px-2.5 text-sm font-bold text-flare hover:bg-flare-50"><Plus size={16} weight="bold" aria-hidden /> Add an option</button>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-control bg-midnight px-5 text-sm font-bold text-white hover:bg-indigo disabled:opacity-60">
            {pending && <CircleNotch size={18} className="animate-spin" aria-hidden />} {product ? 'Save changes' : 'Save and add photos'}
          </button>
          {message.ok && <p role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" aria-hidden /> {message.ok}</p>}
          {message.error && <p role="alert" className="text-sm font-semibold text-danger">{message.error}</p>}
        </div>
        {scope === 'partner' && product?.status === 'active' && <p className="text-xs text-mute">Changing the name, brand or description of a live product sends it back to the BGYM team for a quick check. Prices and stock change straight away.</p>}
      </form>

      <div className="grid gap-5 self-start md:grid-cols-2 2xl:grid-cols-1">
        <section className="rounded-card border border-line bg-white p-5">
          <h2 className="text-lg font-extrabold">Photos</h2>
          <p className="text-sm text-mute">Up to {MAX_PRODUCT_PHOTOS}. The first is shown in the store. Clear photos on a plain background sell best.</p>
          {!product ? (
            <p className="mt-3 rounded-control bg-cloud p-4 text-sm text-mute">Save the product first, then add photos.</p>
          ) : (
            <>
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {product.images.map((img, i) => (
                  <li key={img.id} className="group relative aspect-square overflow-hidden rounded-lg bg-cloud">
                    {/* eslint-disable-next-line @next/next/no-img-element -- server-resized */}
                    <img src={mediaSrc(img.thumbUrl)} alt="" className="size-full object-cover" />
                    {i === 0 && <span className="absolute top-1 left-1 rounded-full bg-midnight/80 px-2 py-0.5 text-[11px] font-bold text-white">Cover</span>}
                    <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                      {i > 0 && <button type="button" aria-label="Make cover photo" onClick={() => start(async () => { after(await productPhotoAction(scope, product.id, img.id, 'cover')); })} className="grid size-7 place-items-center rounded-full bg-white/90 text-midnight"><Star size={14} weight="fill" aria-hidden /></button>}
                      <button type="button" aria-label="Remove photo" onClick={() => start(async () => { after(await productPhotoAction(scope, product.id, img.id, 'remove')); })} className="grid size-7 place-items-center rounded-full bg-white/90 text-danger"><Trash size={14} aria-hidden /></button>
                    </div>
                  </li>
                ))}
                {product.images.length < MAX_PRODUCT_PHOTOS && (
                  <li>
                    <button type="button" disabled={pending} onClick={() => fileInput.current?.click()} className="grid aspect-square w-full place-items-center rounded-lg border-2 border-dashed border-[#C9CDE0] text-mute hover:border-flare hover:text-flare">
                      {pending ? <CircleNotch size={22} className="animate-spin" aria-hidden /> : <span className="flex flex-col items-center gap-1 text-xs font-bold"><ImageSquare size={24} aria-hidden /> Add</span>}
                    </button>
                  </li>
                )}
              </ul>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => upload([...(e.target.files ?? [])])} />
            </>
          )}
        </section>

        {product && (
          <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
            <h2 className="text-lg font-extrabold">In the store</h2>
            {product.status === 'active' && <p className="text-sm text-mute">Members can buy it now. {product.sold > 0 && `${product.sold} sold so far.`}</p>}
            {product.status === 'pending_review' && <p className="text-sm text-mute">The BGYM team is checking it. We’ll email you when it’s live (usually within a day).</p>}
            {product.status === 'draft' && <p className="text-sm text-mute">{scope === 'partner' ? 'When it’s ready, send it to the BGYM team. They check every new product before members see it.' : 'Publish it to put it in the store.'}</p>}
            {product.status === 'archived' && <p className="text-sm text-mute">Hidden from the store. Past orders keep their details.</p>}
            <div className="flex flex-wrap gap-2">
              {(product.status === 'draft' || product.status === 'archived') && (
                <button type="button" disabled={pending} onClick={() => status('publish')} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-60"><PaperPlaneTilt size={18} aria-hidden /> {scope === 'partner' ? 'Send for review' : 'Publish'}</button>
              )}
              {(product.status === 'active' || product.status === 'pending_review') && (
                <button type="button" disabled={pending} onClick={() => status('unpublish')} className="inline-flex h-11 items-center gap-2 rounded-control border-[1.5px] border-line px-4 text-sm font-bold hover:bg-cloud"><ArrowCounterClockwise size={18} aria-hidden /> Take out of the store</button>
              )}
              {product.status !== 'archived' && (
                <button type="button" disabled={pending} onClick={() => { if (confirm('Archive this product? It disappears from the store; you can bring it back later.')) status('archive'); }} className="inline-flex h-11 items-center gap-2 rounded-control px-3 text-sm font-bold text-danger hover:bg-danger-50"><Archive size={18} aria-hidden /> Archive</button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
