/** Referência comercial legível da fatura ("000123") — zero-padded a 6 dígitos, mesmo padrão do
 *  orçamento. Ponto único de formatação — toda tela que mostra o número da fatura ao usuário passa
 *  por aqui. */
export function formatInvoiceNumber(invoiceNumber: number): string {
  return String(invoiceNumber).padStart(6, '0');
}
