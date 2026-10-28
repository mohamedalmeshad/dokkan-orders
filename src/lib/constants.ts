// Available unit options for mini-market items
export const UNIT_OPTIONS = [
  'شيكارة',
  'صفيحة',
  'قالب',
  'علبة',
  'لفة',
  'كرتونة',
  'باكتة',
  'كيلو',
  'جوال',
  'كيس',
  'زجاجة',
  'عبوة',
  'طن',
  'قطعة',
  'درزن',
  'فرخ',
] as const;

export type UnitOption = (typeof UNIT_OPTIONS)[number];

// Arabic number formatter
export const toArabicNumeral = (num: number): string => {
  return num.toLocaleString('ar-EG');
};

// Format date in Arabic
export const formatArabicDate = (date: Date): string => {
  return date.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};
