export type Kind = 'income' | 'expense';
export type Category = { id: string; name: string; kind: Kind; color: string; icon: string; archived: number };
export type Operation = { id: string; categoryId: string; kind: Kind; amount: number; date: string; comment: string };
export type Period = { start: string; end: string };
export function cents(value: string): number {
  const clean = value.trim().replace(',', '.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(clean)) throw new Error('Введите положительную сумму с точностью до копейки.');
  const [whole, fraction = ''] = clean.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Сумма должна быть больше нуля.');
  return result;
}
export function validDate(date: string): boolean { if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > '2200-12-31') return false; const d = new Date(date + 'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date; }
export function shift(date: string, days: number): string { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function daysIn(period: Period): number { return Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86400000) + 1; }
export function previous(period: Period): Period { const days = daysIn(period); return { start: shift(period.start, -days), end: shift(period.start, -1) }; }
export function within(ops: Operation[], period: Period, kind = 'all', category = 'all'): Operation[] { return ops.filter(o => o.date >= period.start && o.date <= period.end && (kind === 'all' || o.kind === kind) && (category === 'all' || o.categoryId === category)); }
export function totals(ops: Operation[], period: Period) {
  const items = within(ops, period); const income = items.filter(o => o.kind === 'income').reduce((a, o) => a + o.amount, 0); const expense = items.filter(o => o.kind === 'expense').reduce((a, o) => a + o.amount, 0);
  return { income, expense, result: income - expense, saved: income ? (income - expense) / income * 100 : null, daily: expense / daysIn(period), count: items.length };
}
export function breakdown(ops: Operation[], categories: Category[], kind: Kind) {
  const total = ops.filter(o => o.kind === kind).reduce((a, o) => a + o.amount, 0);
  return categories.filter(c => c.kind === kind).map(c => { const amount = ops.filter(o => o.categoryId === c.id).reduce((a, o) => a + o.amount, 0); return { ...c, amount, share: total ? amount / total * 100 : 0 }; }).filter(c => c.amount).sort((a, b) => b.amount - a.amount);
}
export function timeline(ops: Operation[], period: Period) {
  const days = daysIn(period); const step = days > 120 ? 'month' : days > 40 ? 'week' : 'day'; const buckets = new Map<string, { date: string; income: number; expense: number }>();
  for (let d = period.start; d <= period.end; d = shift(d, 1)) { const key = step === 'month' ? d.slice(0, 7) + '-01' : step === 'week' ? shift(period.start, Math.floor((Date.parse(d) - Date.parse(period.start)) / 86400000 / 7) * 7) : d; if (!buckets.has(key)) buckets.set(key, { date: key, income: 0, expense: 0 }); }
  within(ops, period).forEach(o => { const key = step === 'month' ? o.date.slice(0, 7) + '-01' : step === 'week' ? shift(period.start, Math.floor((Date.parse(o.date) - Date.parse(period.start)) / 86400000 / 7) * 7) : o.date; const b = buckets.get(key)!; b[o.kind] += o.amount; });
  return [...buckets.values()];
}
export const money = (n: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: n % 100 ? 2 : 0 }).format(n / 100);
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function preset(name: string, ops: Operation[] = []): Period { const end = today(); const startMonth = end.slice(0, 7) + '-01'; if (name === 'year') return { start: end.slice(0, 4) + '-01-01', end }; if (name === '30') return { start: shift(end, -29), end }; if (name === 'previous') { const e = shift(startMonth, -1); return { start: e.slice(0, 7) + '-01', end: e }; } if (name === 'all') { const dates = ops.map(o => o.date).sort(); return { start: dates[0] || startMonth, end: dates.at(-1) || end }; } const nextMonth = new Date(Date.UTC(Number(end.slice(0,4)), Number(end.slice(5,7)), 1)).toISOString().slice(0,10); return { start: startMonth, end: shift(nextMonth, -1) }; }
