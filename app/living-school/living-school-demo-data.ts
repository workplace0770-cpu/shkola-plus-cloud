import type { SchoolEvent } from "./living-school-types";

// These events animate the scene only. All school metrics come from D1.
export const livingSchoolDemoEvents: SchoolEvent[] = [
  { id: "achievement", title: "Школа получила новое достижение" },
  { id: "olympiad", title: "Ученик победил в олимпиаде" },
  { id: "project", title: "Класс завершил большой проект" },
  { id: "birthday", title: "Сегодня день рождения ученика" },
  { id: "grades", title: "Ученики получили 100 хороших оценок" },
  { id: "tradition", title: "Открыта новая школьная традиция" },
];
