import { formatArabicDate } from '@/lib/constants';

export type PDFOrderItem = {
  item_name: string;
  quantity: number;
  unit: string;
};

// ---------------------------------------------------------------------------
// Font loading — Amiri is the ONLY font compatible with jsPDF's processArabic().
// processArabic() outputs Arabic Presentation Forms B (Unicode FE70–FEFF).
// Modern variable fonts like Cairo do NOT contain those glyphs, causing the
// "cut-off letter" rendering bug (e.g. "لكمية" loses the lam-alef ligature ﻻ).
// Amiri is a full-Unicode classical Arabic font with all Presentation Forms B.
// ---------------------------------------------------------------------------
let cachedAmiriRegular: string | null = null;
let cachedAmiriBold: string | null = null;

async function loadFontBinary(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading font: ${url}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Build binary string chunk-by-chunk to avoid call-stack overflow on large files
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return binary;
}

async function loadAmiriFonts(): Promise<{ regular: string; bold: string }> {
  try {
    if (!cachedAmiriRegular) {
      cachedAmiriRegular = await loadFontBinary('/fonts/Amiri-Regular.ttf');
    }
    if (!cachedAmiriBold) {
      cachedAmiriBold = await loadFontBinary('/fonts/Amiri-Bold.ttf');
    }
    return { regular: cachedAmiriRegular, bold: cachedAmiriBold };
  } catch (err) {
    console.error('Failed to load Amiri fonts:', err);
    throw new Error('تعذّر تحميل خط الطباعة العربي');
  }
}

// ---------------------------------------------------------------------------
// Shape & clip helper — wraps a string to fit maxWidth and returns shaped lines.
// jsPDF splitTextToSize doesn't handle shaped Arabic well; we do it manually.
// ---------------------------------------------------------------------------
function shapeArabic(doc: InstanceType<typeof import('jspdf').jsPDF>, text: string): string {
  // processArabic may not exist on all builds — guard gracefully
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = doc as any;
  if (typeof d.processArabic === 'function') {
    return d.processArabic(text) as string;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Main PDF generator
// ---------------------------------------------------------------------------

/**
 * Generates an ultra-lightweight (< 200 KB) native vector PDF for wholesale
 * supplier orders. Uses jsPDF vector text with embedded Amiri Arabic font.
 *
 * CRITICAL PRIVACY NOTE:
 * This generator NEVER includes cost or price information.
 * PDF contains ONLY: item name, unit, and quantity.
 */
export async function generateDokkanPDF(params: {
  orderNumber?: number | string;
  merchantName?: string | null;
  createdAt?: string | Date;
  items: PDFOrderItem[];
}): Promise<void> {
  const { orderNumber, merchantName, createdAt, items } = params;
  if (!items || items.length === 0) return;

  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.jsPDF ?? jsPDFModule.default;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  // Register Amiri Regular and Bold — separate files for correct bold weight.
  // DO NOT call doc.setR2L(true): it would reverse the already-shaped glyphs
  // that processArabic() outputs, producing backwards text.
  const { regular, bold } = await loadAmiriFonts();
  doc.addFileToVFS('Amiri-Regular.ttf', regular);
  doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
  doc.addFileToVFS('Amiri-Bold.ttf', bold);
  doc.addFont('Amiri-Bold.ttf', 'Amiri', 'bold');
  doc.setFont('Amiri', 'normal');

  // ---- Page geometry -------------------------------------------------------
  const pageW   = doc.internal.pageSize.getWidth();   // 210 mm (A4)
  const pageH   = doc.internal.pageSize.getHeight();  // 297 mm
  const margin  = 12;          // left & right margin
  const cw      = pageW - margin * 2; // usable content width ≈ 186 mm

  // Column layout — only 2 columns: [Quantity pill] | [Item name & unit]
  //  x positions (absolute from left edge):
  const colQtyLabelX  = margin + 22;   // center of qty column header
  const colName       = margin + cw - 6; // item text right-edge (right-aligned)
  const colNameLabelX = margin + cw - 6; // right edge of name column header

  // ---- Date / store --------------------------------------------------------
  const dateObj   = createdAt ? new Date(createdAt) : new Date();
  const dateStr   = formatArabicDate(dateObj);
  const storeName = merchantName?.trim() || 'محمد حمادة';
  const totalQty  = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);

  // ==========================================================================
  // Draw page header
  // ==========================================================================
  const drawPageHeader = (isFirst: boolean): number => {
    if (isFirst) {
      // ── Blue title badge ──────────────────────────────────────────────────
      const badgeW = 90;
      const badgeX = pageW / 2 - badgeW / 2;
      doc.setFillColor(79, 70, 229);
      doc.roundedRect(badgeX, 12, badgeW, 14, 3, 3, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('Amiri', 'bold');
      doc.setFontSize(17);
      doc.text(
        shapeArabic(doc, 'قائمة المنتجات'),
        pageW / 2, 21.5,
        { align: 'center' }
      );

      // ── Meta line ────────────────────────────────────────────────────────
      doc.setTextColor(71, 85, 105);
      doc.setFont('Amiri', 'normal');
      doc.setFontSize(11);

      const parts: string[] = [];
      parts.push(
        `التاجر: ${storeName}`,
        `التاريخ: ${dateStr}`,
        `الأصناف: ${items.length} صنف`,
      );
      // Render each meta part on one centred line, using bullet separator
      const metaLine = parts.join('   •   ');
      doc.text(
        shapeArabic(doc, metaLine),
        pageW / 2, 34,
        { align: 'center', maxWidth: cw - 4 }
      );

      return 44; // y after header

    } else {
      // ── Continuation header (smaller) ─────────────────────────────────────
      doc.setFont('Amiri', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      const contText = `تابع طلبية توريد — ${storeName}`;
      doc.text(shapeArabic(doc, contText), margin + cw, 13, { align: 'right' });
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(margin, 15.5, margin + cw, 15.5);
      return 19;
    }
  };

  // ==========================================================================
  // Draw table header row
  // ==========================================================================
  const drawTableHeader = (y: number): number => {
    const rh = 10; // header row height
    doc.setFillColor(79, 70, 229);
    doc.roundedRect(margin, y, cw, rh, 1.5, 1.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(11);

    // Quantity header — centered in qty column
    doc.text(
      shapeArabic(doc, 'الكمية المطلوبة'),
      colQtyLabelX, y + 6.7,
      { align: 'center' }
    );

    // Item name header — right-aligned
    doc.text(
      shapeArabic(doc, 'اسم الصنف والوحدة'),
      colNameLabelX, y + 6.7,
      { align: 'right' }
    );

    return y + rh;
  };

  // ==========================================================================
  // Render rows
  // ==========================================================================
  let page    = 1;
  let y       = drawPageHeader(true);
  y           = drawTableHeader(y);

  const rowH  = 11;  // slightly taller rows for comfortable Arabic text
  const footerReserve = 22; // mm reserved at bottom for footer

  for (let i = 0; i < items.length; i++) {
    // ── Page break ──────────────────────────────────────────────────────────
    if (y + rowH > pageH - footerReserve) {
      drawPageFooter(doc, page, pageW, pageH, margin, cw);
      doc.addPage();
      page++;
      y = drawPageHeader(false);
      y = drawTableHeader(y);
    }

    const item = items[i];

    // Alternating row background
    if (i % 2 === 0) {
      doc.setFillColor(247, 249, 252);
      doc.rect(margin, y, cw, rowH, 'F');
    }

    // Row separator
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.18);
    doc.line(margin, y + rowH, margin + cw, y + rowH);

    // ── 1. Quantity pill ────────────────────────────────────────────────────
    const pillX = margin + 8;
    const pillW = 28;
    doc.setFillColor(238, 242, 255);
    doc.setDrawColor(199, 210, 254);
    doc.setLineWidth(0.3);
    doc.roundedRect(pillX, y + 2, pillW, 7, 1.5, 1.5, 'FD');

    doc.setFont('Amiri', 'bold');
    doc.setTextColor(67, 56, 202);
    doc.setFontSize(11);
    doc.text(String(item.quantity), pillX + pillW / 2, y + 7.2, { align: 'center' });

    // ── 2. Item name & unit ─────────────────────────────────────────────────
    doc.setFont('Amiri', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11.5);

    const unitPart  = item.unit?.trim() ? `${item.unit.trim()} ` : '';
    const fullLabel = `${unitPart}${item.item_name}`;

    // maxWidth prevents text from overlapping qty pill
    const nameMaxW = cw - 46;
    doc.text(
      shapeArabic(doc, fullLabel),
      colName, y + 7.5,
      { align: 'right', maxWidth: nameMaxW }
    );

    y += rowH;
  }

  // ==========================================================================
  // Summary footer on last page
  // ==========================================================================
  y += 5;
  if (y + 14 > pageH - footerReserve + 8) {
    drawPageFooter(doc, page, pageW, pageH, margin, cw);
    doc.addPage();
    page++;
    y = 22;
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + cw, y);

  y += 7;
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    shapeArabic(doc, `إجمالي الأصناف: ${items.length} صنف    •    إجمالي الكميات: ${totalQty} وحدة`),
    margin + cw, y,
    { align: 'right', maxWidth: cw }
  );

  drawPageFooter(doc, page, pageW, pageH, margin, cw);

  // ── Save ────────────────────────────────────────────────────────────────────
  const prefix   = orderNumber ? `طلب-${orderNumber}-` : 'طلب-جملة-';
  const fileName = `${prefix}${dateObj.toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

// ==========================================================================
// Page-number footer helper (extracted so page-break code can call it too)
// ==========================================================================
function drawPageFooter(
  doc: InstanceType<typeof import('jspdf').jsPDF>,
  page: number,
  pageW: number,
  pageH: number,
  margin: number,
  cw: number
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = doc as any;
  const shape = (t: string) =>
    typeof d.processArabic === 'function' ? (d.processArabic(t) as string) : t;

  doc.setFont('Amiri', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);

  // Right: page number only
  doc.text(
    shape(`صفحة ${page}`),
    margin + cw / 2, pageH - 7,
    { align: 'center' }
  );
}
