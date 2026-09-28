export function formatInvoiceNumber(invoiceNumber: number | null | undefined): string {
  if (!invoiceNumber && invoiceNumber !== 0) return '—';
  return String(invoiceNumber).padStart(6, '0');
}
