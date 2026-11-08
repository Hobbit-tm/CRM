// Справочники для б/у запчастей (подсказки в форме; можно вписать и своё значение)
export const CATEGORIES = ['Двигатель', 'КПП', 'Раздатка', 'Навесное', 'Турбина', 'Электроника', 'Подвеска', 'Прочее'];
export const CONDITIONS = ['Отличное', 'Хорошее', 'Среднее', 'На запчасти'];
export const ORIGINS = ['Япония', 'Европа', 'Корея', 'США', 'Китай', 'Россия'];

// Цвет значка состояния: ключ = состояние в нижнем регистре
export const conditionTone = (c) => {
  const s = (c || '').toLowerCase();
  if (s.startsWith('отлич')) return 'success';
  if (s.startsWith('хорош')) return 'success';
  if (s.startsWith('средн')) return 'warn';
  if (s.startsWith('на зап')) return 'danger';
  return 'sub';
};
