import { formatArabicDate } from '@/lib/constants';

export type PDFOrderItem = {
  item_name: string;
  quantity: number;
  unit: string;
};

export async function generateDokkanPDF(params: {
  orderNumber?: number | string;
  merchantName?: string | null;
  createdAt?: string | Date;
  items: PDFOrderItem[];
}): Promise<void> {
  const { orderNumber, merchantName, createdAt, items } = params;
  if (!items || items.length === 0) return;

  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.default;

  const html2canvasModule = await import('html2canvas');
  const html2canvas = html2canvasModule.default;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const dateObj = createdAt ? new Date(createdAt) : new Date();
  const dateStr = formatArabicDate(dateObj);
  const storeName = merchantName ? merchantName.trim() : '';

  // Ensure fonts are ready
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
  }

  // Create temporary container
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: 794px;
    background: #ffffff;
    direction: rtl;
    font-family: 'Cairo', Arial, sans-serif;
    padding: 40px;
    color: #0f172a;
    z-index: -9999;
    visibility: visible;
    opacity: 1;
    pointer-events: none;
  `;

  container.innerHTML = `
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap">

    <style>
      * {
        font-family: 'Cairo', Arial, sans-serif !important;
        letter-spacing: normal !important;
        word-spacing: normal !important;
        box-sizing: border-box;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 24px;
        direction: rtl;
        table-layout: fixed;
      }

      th, td {
        vertical-align: middle;
      }

      .cell-flex {
        display: flex;
        align-items: center;
        min-height: 44px;
        width: 100%;
        line-height: normal;
      }

      .cell-center {
        justify-content: center;
        text-align: center;
      }

      .cell-right {
        justify-content: flex-start;
        text-align: right;
      }

      .order-row {
        height: 72px;
      }

      .order-row td {
        padding: 0 14px;
        vertical-align: middle;
      }

      .item-name {
        width: 100%;
        font-size: 15px;
        font-weight: 700;
        line-height: 1.5;
        color: #0f172a;
        overflow-wrap: anywhere;
        text-align: right;
      }
    </style>

    <!-- Header -->
    <div style="
      text-align: center;
      margin-bottom: 28px;
      direction: rtl;
    ">

      <!-- Order Title -->
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        background: #4f46e5;
        color: #ffffff;
        width: 205px;
        height: 82px;
        margin: 0 auto;
        border-radius: 15px;
        font-size: 26px;
        font-weight: 800;
        padding: 0;
        line-height: normal;
      ">
        <span style="
          display: block;
          line-height: 1;
          padding: 0;
          margin: 0;
          transform: translateY(-9px);
        ">قائمة المنتجات</span>
      </div>

      <!-- Order Information -->
      <div style="
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 12px 32px;
        margin-top: 14px;
        font-size: 14px;
        color: #475569;
        font-weight: 600;
        direction: rtl;
        text-align: center;
      ">

        <div>
          👤 التاجر:
          <strong style="color: #0f172a;">محمد حمادة</strong>
        </div>

        <div>
          📅 التاريخ:
          <strong style="color: #0f172a;">${dateStr}</strong>
        </div>

        <div>
          📦 عدد الأصناف:
          <strong style="color: #4f46e5;">${items.length} صنف</strong>
        </div>

        ${
          orderNumber
            ? `<div>
                🔢 رقم الطلب:
                <strong style="color: #4f46e5;">#${orderNumber}</strong>
              </div>`
            : ''
        }

        ${
          storeName && storeName !== 'محمد حمادة'
            ? `<div>
                🏪 المتجر:
                <strong style="color: #0f172a;">${storeName}</strong>
              </div>`
            : ''
        }

      </div>
    </div>

    <!-- Order Table -->
    <table>
      <colgroup>
        <col style="width: 70px;">
        <col>
        <col style="width: 150px;">
      </colgroup>

      <thead>
        <tr style="
          background: #4f46e5;
          color: #ffffff;
        ">
          <!-- Number Header -->
          <th style="
            padding: 10px 14px;
            text-align: center;
            vertical-align: middle;
            font-size: 14px;
            font-weight: 700;
            border-radius: 8px 0 0 0;
          ">
            <div class="cell-flex cell-center">
              #
            </div>
          </th>

          <!-- Product Name Header -->
          <th style="
            padding: 10px 18px;
            text-align: right;
            vertical-align: middle;
            font-size: 15px;
            font-weight: 700;
          ">
            <div class="cell-flex cell-right">
              اسم الصنف
            </div>
          </th>

          <!-- Quantity Header -->
          <th style="
            padding: 10px 12px;
            text-align: center;
            vertical-align: middle;
            font-size: 15px;
            font-weight: 700;
            border-radius: 0 8px 0 0;
          ">
            <div class="cell-flex cell-center">
              الكمية المطلوبة
            </div>
          </th>
        </tr>
      </thead>

      <tbody>
        ${items
          .map((oi, index) => {
            const unitPrefix = oi.unit ? `${oi.unit} ` : '';
            const itemFullName = `${unitPrefix}${oi.item_name}`;

            return `
              <tr
                class="order-row"
                style="
                  background: ${index % 2 === 0 ? '#f8fafc' : '#ffffff'};
                  border-bottom: 1px solid #e2e8f0;
                "
              >
                <!-- Item Number -->
                <td>
                  <div class="cell-flex cell-center" style="
                    font-size: 14px;
                    font-weight: 700;
                    color: #6366f1;
                  ">
                    ${index + 1}
                  </div>
                </td>

                <!-- Item Name -->
                <td style="
                  padding-right: 18px;
                  padding-left: 18px;
                ">
                  <div class="cell-flex cell-right">
                    <div class="item-name">
                      ${itemFullName}
                    </div>
                  </div>
                </td>

                <!-- Quantity -->
                <td>
                  <div class="cell-flex cell-center">
                    <span style="
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      background: #eef2ff;
                      color: #4338ca;
                      font-weight: 800;
                      font-size: 16px;
                      padding: 7px 14px;
                      line-height: 1.5;
                      border-radius: 8px;
                      border: 1px solid #c7d2fe;
                      min-width: 44px;
                      min-height: 40px;
                      text-align: center;
                      box-sizing: border-box;
                    ">
                      <span style="
                        display: block;
                        line-height: 1;
                        transform: translateY(-3px);
                      ">${oi.quantity}</span>
                    </span>
                  </div>
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>

    <!-- Footer Separator -->
    <div style="
      margin-top: 28px;
      padding-top: 16px;
      border-top: 2px dashed #cbd5e1;
      width: 100%;
    ">
    </div>
  `;

  document.body.appendChild(container);

  // Brief delay for styles and fonts to render
  await new Promise((resolve) => setTimeout(resolve, 150));

  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    width: 794,
    windowWidth: 794,
  });

  document.body.removeChild(container);

  const imgData = canvas.toDataURL('image/png');
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  // Handle multi-page if content is tall
  const pageHeight = doc.internal.pageSize.getHeight();
  let heightLeft = imgHeight;
  let position = 0;

  doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  // Save the PDF
  const numStr = orderNumber ? `طلب-${orderNumber}-` : 'طلب-جملة-';
  const fileName = `${numStr}${dateObj.toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
