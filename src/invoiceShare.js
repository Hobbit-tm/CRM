import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getSale } from './db';
import { invoiceHtml, INVOICE_PAGE } from './invoice';

// Накладная по номеру продажи: PDF и системное окно «поделиться / печать». Цены в ней видит только администратор.
export async function shareInvoice(saleId, withPrices) {
  const { sale, lines } = await getSale(saleId);
  const html = invoiceHtml({ sale, lines, withPrices });
  const { uri } = await Print.printToFileAsync({ html, width: INVOICE_PAGE.width, height: INVOICE_PAGE.height });
  if (!(await Sharing.isAvailableAsync())) throw new Error('На этом устройстве нельзя поделиться файлом');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Накладная № ${sale.number}` });
}

export async function printInvoice(saleId, withPrices) {
  const { sale, lines } = await getSale(saleId);
  await Print.printAsync({ html: invoiceHtml({ sale, lines, withPrices }), width: INVOICE_PAGE.width, height: INVOICE_PAGE.height });
}
